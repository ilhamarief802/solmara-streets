// The sky, the lights and the atmosphere, driven by the clock's profile. A painted dome carries a
// three-band gradient (zenith, horizon, and a warm glow pooled around the sun) plus a sun/moon
// disc, and a field of stars fades in after dusk. Lighting is a directional sun (or moon) with a
// hemisphere fill: no shadow maps, which keeps a whole city inside a headless frame budget.

import { clamp, DEG, lerp, smoothstep } from './math.js';
import { applyTriple, sunDirection } from './clock.js';
import { Random } from './rng.js';

const DOME_RADIUS = 2400;

const DOME_VERTEX = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    // Keep the dome pinned to the far plane so it never clips through the city.
    gl_Position.z = gl_Position.w;
  }
`;

const DOME_FRAGMENT = /* glsl */ `
  uniform vec3 topColor;
  uniform vec3 horizonColor;
  uniform vec3 glowColor;
  uniform vec3 sunColor;
  uniform vec3 sunDir;
  uniform float glowStrength;
  uniform float sunSharpness;
  uniform float haze;
  varying vec3 vDir;

  void main() {
    vec3 dir = normalize(vDir);
    float h = clamp(dir.y, -1.0, 1.0);

    // A horizon band that compresses just below the eyeline, then the zenith above it.
    float up = pow(clamp(h, 0.0, 1.0), 0.55);
    vec3 sky = mix(horizonColor, topColor, up);

    // Warm pool around the sun, wider near the horizon.
    float cosAngle = max(dot(dir, normalize(sunDir)), 0.0);
    float lowSun = 1.0 - clamp(abs(sunDir.y) * 2.2, 0.0, 1.0);
    float halo = pow(cosAngle, mix(6.0, 2.0, lowSun)) * glowStrength;
    sky = mix(sky, glowColor, clamp(halo, 0.0, 1.0) * 0.85);

    // The disc itself, tight and bright, hidden below the horizon.
    float disc = smoothstep(sunSharpness, sunSharpness + 0.0009, cosAngle);
    disc *= step(-0.03, sunDir.y);
    sky = mix(sky, sunColor, disc);

    // A haze lift right at the horizon: the sea and the far towers dissolve into it.
    float band = exp(-abs(h) * 26.0) * haze;
    sky = mix(sky, horizonColor * 1.06, clamp(band, 0.0, 1.0));

    // Below the horizon: the water's own reflection of the horizon colour, so the dome never
    // shows a hard seam where the sea plane ends.
    if (h < 0.0) {
      vec3 below = mix(horizonColor * 0.72, horizonColor * 0.34, clamp(-h * 3.2, 0.0, 1.0));
      sky = mix(sky, below, clamp(-h * 8.0, 0.0, 1.0));
    }

    gl_FragColor = vec4(sky, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const STAR_VERTEX = /* glsl */ `
  attribute float magnitude;
  varying float vMagnitude;
  void main() {
    vMagnitude = magnitude;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_Position.z = gl_Position.w;
    gl_PointSize = mix(1.2, 3.0, magnitude);
  }
`;

const STAR_FRAGMENT = /* glsl */ `
  uniform float opacity;
  varying float vMagnitude;
  void main() {
    vec2 d = gl_PointCoord - 0.5;
    float r = length(d) * 2.0;
    if (r > 1.0) discard;
    float core = pow(1.0 - r, 2.6);
    gl_FragColor = vec4(vec3(mix(0.72, 1.0, vMagnitude)), core * opacity);
  }
`;

/** Builds the star field on a sphere shell: fixed pattern, no per-frame work. */
function buildStars(count, random) {
  const positions = new Float32Array(count * 3);
  const magnitudes = new Float32Array(count);
  const radius = DOME_RADIUS * 0.94;
  for (let i = 0; i < count; i++) {
    // Uniform on the upper hemisphere only: below the horizon the dome covers them anyway.
    const u = random.float();
    const y = 0.02 + u * 0.98;
    const phi = random.float() * Math.PI * 2;
    const r = Math.sqrt(1 - y * y);
    positions[i * 3] = Math.cos(phi) * r * radius;
    positions[i * 3 + 1] = y * radius;
    positions[i * 3 + 2] = Math.sin(phi) * r * radius;
    magnitudes[i] = Math.pow(random.float(), 2.4);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('magnitude', new THREE.BufferAttribute(magnitudes, 1));
  return geometry;
}

/**
 * The scene's sky and light rig.
 * @param {THREE.Scene} scene
 * @param {{fogNear:number, fogFar:number}} options
 */
export function createAtmosphere(scene, options = {}) {
  const fogNear = options.fogNear ?? 90;
  const fogFar = options.fogFar ?? 900;
  const color = new THREE.Color(0x0b1320);
  scene.fog = new THREE.FogExp2(0x0b1320, 0.0024);
  scene.background = color;

  // ---------------------------------------------------------------- dome
  const domeUniforms = {
    topColor: { value: new THREE.Color(0x2672b4) },
    horizonColor: { value: new THREE.Color(0xc6dce8) },
    glowColor: { value: new THREE.Color(0xffe2b8) },
    sunColor: { value: new THREE.Color(0xfff3d6) },
    sunDir: { value: new THREE.Vector3(0.3, 0.8, 0.5) },
    glowStrength: { value: 1 },
    sunSharpness: { value: 0.9994 },
    haze: { value: 0.2 },
  };
  const domeMaterial = new THREE.ShaderMaterial({
    uniforms: domeUniforms,
    vertexShader: DOME_VERTEX,
    fragmentShader: DOME_FRAGMENT,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    fog: false,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(DOME_RADIUS, 32, 20), domeMaterial);
  dome.name = 'sky-dome';
  dome.renderOrder = -100;
  dome.frustumCulled = false;
  scene.add(dome);

  // ---------------------------------------------------------------- stars
  const starGeometry = buildStars(1100, options.random ?? new Random('stars'));
  const starUniforms = { opacity: { value: 0 } };
  const starMaterial = new THREE.ShaderMaterial({
    uniforms: starUniforms,
    vertexShader: STAR_VERTEX,
    fragmentShader: STAR_FRAGMENT,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
    fog: false,
  });
  const stars = new THREE.Points(starGeometry, starMaterial);
  stars.name = 'stars';
  stars.renderOrder = -99;
  stars.frustumCulled = false;
  scene.add(stars);

  // ---------------------------------------------------------------- lights
  const sun = new THREE.DirectionalLight(0xfff3e2, 2.8);
  sun.name = 'sun';
  sun.position.set(120, 260, 80);
  scene.add(sun);
  scene.add(sun.target);

  const moon = new THREE.DirectionalLight(0x9fb6dd, 0.0);
  moon.name = 'moon';
  moon.position.set(-220, 180, -160);
  scene.add(moon);
  scene.add(moon.target);

  const hemisphere = new THREE.HemisphereLight(0xb2d5ea, 0x9c8a70, 1.05);
  hemisphere.name = 'hemisphere';
  scene.add(hemisphere);

  // A weak fill from the harbour side keeps backlit facades from going pure black at golden hour.
  const fill = new THREE.DirectionalLight(0xffd9b0, 0.18);
  fill.name = 'fill';
  fill.position.set(-180, 90, -240);
  scene.add(fill);
  scene.add(fill.target);

  const state = {
    sun,
    moon,
    hemisphere,
    fill,
    dome,
    stars,
    /** 0 by day, 1 by night: how dark the sky is */
    darkness: 0,
  };

  const sunColor = new THREE.Color();
  const hemiSky = new THREE.Color();
  const hemiGround = new THREE.Color();

  /** Applies a clock profile to every light and the dome. Cheap enough to call each frame. */
  function applyProfile(profile, weather) {
    const weatherScale = weather ? weather.sunScale : 1;
    const [dx, dy, dz] = sunDirection(profile);
    const sunDir = new THREE.Vector3(dx, dy, dz).normalize();
    // The moon rides opposite the sun, so a night scene is still shaped rather than flat.
    const moonDir = sunDir.clone().multiplyScalar(-1);

    domeUniforms.topColor.value.setRGB(...profile.skyTop, THREE.SRGBColorSpace);
    domeUniforms.horizonColor.value.setRGB(...profile.skyHorizon, THREE.SRGBColorSpace);
    domeUniforms.glowColor.value.setRGB(...profile.skyGlow, THREE.SRGBColorSpace);
    domeUniforms.sunColor.value.setRGB(...profile.sunColor, THREE.SRGBColorSpace);
    domeUniforms.sunDir.value.copy(sunDir);
    domeUniforms.glowStrength.value = lerp(0.55, 1.25, clamp(1 - profile.sunElevation / 60, 0, 1));
    domeUniforms.haze.value = clamp((weather ? weather.haze : 0.1) + 0.08, 0, 1);

    const clearAmount = weather ? clamp(weather.values?.haze ?? weather.haze, 0, 1) : 0;
    const sunIntensity = profile.sunIntensity * weatherScale * (1 - clearAmount * 0.35);
    sun.intensity = Math.max(0, sunIntensity);
    sun.color.setRGB(...profile.sunColor, THREE.SRGBColorSpace);
    sun.position.copy(sunDir).multiplyScalar(320).add(new THREE.Vector3(0, 0, 0));

    const night = profile.isNight;
    // The moon only lights the city once the sun is genuinely gone.
    const nightAmount = smoothstep(6, -6, profile.sunElevation);
    moon.intensity = night ? 0.5 * nightAmount + 0.08 : 0.0;
    moon.position.copy(moonDir).multiplyScalar(300);
    moon.color.setHex(0x9fb6dd);
    domeUniforms.sunDir.value.copy(night && dy < -0.02 ? moonDir : sunDir);
    domeUniforms.sunColor.value.setHex(night ? 0xdfe8ff : 0xfff3d6);
    domeUniforms.sunSharpness.value = night ? 0.99975 : 0.99935;

    hemisphere.intensity = profile.hemiIntensity;
    hemiSky.setRGB(...profile.hemiSky, THREE.SRGBColorSpace);
    hemiGround.setRGB(...profile.hemiGround, THREE.SRGBColorSpace);
    hemisphere.color.copy(hemiSky);
    hemisphere.groundColor.copy(hemiGround);

    fill.intensity = 0.14 + profile.lampBoost * 0.05;
    fill.color.setRGB(...profile.skyHorizon, THREE.SRGBColorSpace);

    starUniforms.opacity.value = profile.stars;

    // Fog: the horizon colour, scaled by the weather, at the clock's own density.
    const fogColor = new THREE.Color().setRGB(...profile.fogColor, THREE.SRGBColorSpace);
    if (weather && weather.values && weather.values.haze > 0.01) {
      const horizon = new THREE.Color().setRGB(...profile.skyHorizon, THREE.SRGBColorSpace);
      fogColor.lerp(horizon, weather.values.haze * 0.55);
    }
    scene.fog.color.copy(fogColor);
    scene.fog.density = profile.fogDensity * (weather ? weather.fogScale : 1);
    scene.background.copy(fogColor);
    state.darkness = 1 - smoothstep(-4, 12, profile.sunElevation);
  }

  /** Slow drift of the dome with the player, so the horizon never runs out. */
  function follow(position) {
    dome.position.set(position.x, 0, position.z);
    stars.position.set(position.x, 0, position.z);
  }

  return {
    ...state,
    domeUniforms,
    starUniforms,
    applyProfile,
    follow,
    /** The direction the sun is in, for the water's specular and the shadows-free look. */
    get lightDirection() {
      return sun.position.clone().normalize();
    },
  };
}

/** Useful for the water and the beach: a colour from a hex, already in the working space. */
export function srgb(hex) {
  return new THREE.Color().setHex(hex, THREE.SRGBColorSpace);
}

export { applyTriple, DEG, smoothstep };
