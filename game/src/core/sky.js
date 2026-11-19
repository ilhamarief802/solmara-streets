// Atmosphere: the gradient sky dome, the sun and moon lights, the hemisphere fill and the
// stars. The dome is a single shader sphere that follows the camera, so the horizon never
// shows an edge; the stars fade in from the same palette the sky is tinted with.

import { Random } from './rng.js';
import { clamp } from './math.js';

const SKY_VERTEX = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vDir = normalize(world.xyz - cameraPosition);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const SKY_FRAGMENT = /* glsl */ `
  uniform vec3 uTop;
  uniform vec3 uHorizon;
  uniform vec3 uGround;
  uniform vec3 uSunColor;
  uniform vec3 uSunDir;
  uniform float uGlow;
  uniform float uHaze;
  varying vec3 vDir;

  void main() {
    vec3 dir = normalize(vDir);
    float up = clamp(dir.y, -0.15, 1.0);
    float horizonMix = pow(1.0 - clamp(up, 0.0, 1.0), 4.2);
    vec3 sky = mix(uTop, uHorizon, horizonMix);
    sky = mix(sky, uGround, smoothstep(0.0, -0.12, dir.y));

    float sunDot = max(dot(dir, normalize(uSunDir)), 0.0);
    float disc = pow(sunDot, 1400.0);
    float halo = pow(sunDot, 22.0) * 0.35 + pow(sunDot, 5.0) * 0.08;
    sky += uSunColor * (disc * 2.6 + halo) * uGlow;

    // A little warm haze right above the horizon, strongest where the sun is.
    sky += uSunColor * uHaze * 0.14 * horizonMix * (0.35 + sunDot * 0.9);
    gl_FragColor = vec4(sky, 1.0);
  }
`;

/**
 * Builds the sky, lights and stars, and returns a small controller the main loop drives.
 * `setPalette` takes the clock palette plus the weather's multipliers.
 */
export function createAtmosphere(scene, { radius = 2600, starCount = 900, segments = 24 } = {}) {
  const group = new THREE.Group();
  group.name = 'atmosphere';

  const uniforms = {
    uTop: { value: new THREE.Color(0x2f6fbe) },
    uHorizon: { value: new THREE.Color(0xcfe2ee) },
    uGround: { value: new THREE.Color(0x14161c) },
    uSunColor: { value: new THREE.Color(0xfff4dc) },
    uSunDir: { value: new THREE.Vector3(0.2, 0.8, 0.5) },
    uGlow: { value: 1 },
    uHaze: { value: 0.15 },
  };

  const domeMaterial = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: SKY_VERTEX,
    fragmentShader: SKY_FRAGMENT,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  // Fewer rings than segments: the dome only has to carry a vertical gradient.
  const rings = Math.max(10, Math.round(segments * 0.55));
  const dome = new THREE.Mesh(new THREE.SphereGeometry(radius, segments, rings), domeMaterial);
  dome.name = 'sky-dome';
  dome.frustumCulled = false;
  dome.renderOrder = -100;
  group.add(dome);

  // Stars: a sparse upper hemisphere. They hang off their own group so drifting them is
  // one rotation instead of rewriting the buffer.
  const random = new Random('solmara-stars');
  const starPositions = new Float32Array(starCount * 3);
  const starSizes = new Float32Array(starCount);
  for (let i = 0; i < starCount; i += 1) {
    const azimuth = random.range(0, Math.PI * 2);
    // asin of a uniform height keeps the stars evenly spread over the dome's area.
    const elevation = Math.asin(random.range(0.06, 0.98));
    const r = radius * 0.94;
    const cosElevation = Math.cos(elevation);
    starPositions[i * 3] = Math.cos(azimuth) * cosElevation * r;
    starPositions[i * 3 + 1] = Math.sin(elevation) * r;
    starPositions[i * 3 + 2] = Math.sin(azimuth) * cosElevation * r;
    starSizes[i] = random.range(0.7, 2.1);
  }
  const starGeometry = new THREE.BufferGeometry();
  starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
  starGeometry.setAttribute('size', new THREE.BufferAttribute(starSizes, 1));
  const starMaterial = new THREE.PointsMaterial({
    color: 0xdfe8ff,
    size: 2.6,
    sizeAttenuation: false,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    fog: false,
    blending: THREE.AdditiveBlending,
  });
  const stars = new THREE.Points(starGeometry, starMaterial);
  stars.name = 'stars';
  stars.frustumCulled = false;
  stars.renderOrder = -90;
  const starSpin = new THREE.Group();
  starSpin.add(stars);
  group.add(starSpin);

  // Lights: a warm sun, a cool moon, and a two-colour hemisphere fill.
  const sun = new THREE.DirectionalLight(0xffe7c2, 2.2);
  sun.name = 'sun';
  sun.position.set(420, 500, 260);
  sun.castShadow = false;
  group.add(sun, sun.target);

  const moon = new THREE.DirectionalLight(0x9fb6e8, 0);
  moon.name = 'moon';
  moon.position.set(-420, 480, -260);
  moon.castShadow = false;
  group.add(moon, moon.target);

  const hemi = new THREE.HemisphereLight(0xb4cce4, 0x6b6350, 0.9);
  hemi.name = 'ambient';
  group.add(hemi);

  scene.add(group);

  /**
   * Applies a clock palette. `weather` is optional; its multipliers soften the sun and
   * thicken the haze without changing the time of day.
   */
  function setPalette(palette, weather = null) {
    const sunScale = weather ? weather.sunMultiplier : 1;
    const haze = weather ? weather.haze : 0.15;

    uniforms.uTop.value.setRGB(...palette.skyTop);
    uniforms.uHorizon.value.setRGB(...palette.skyHorizon);
    uniforms.uSunColor.value.setRGB(...palette.sunColor);
    uniforms.uSunDir.value.copy(palette.sunDir);
    uniforms.uGlow.value = clamp(palette.sunIntensity * 0.5 + 0.1, 0, 1.6);
    uniforms.uHaze.value = haze;

    sun.color.setRGB(...palette.sunColor);
    sun.intensity = palette.sunIntensity * sunScale;
    sun.position.copy(palette.sunDir).multiplyScalar(900);

    moon.intensity = palette.moonIntensity;
    moon.position.copy(palette.moonDir).multiplyScalar(900);

    hemi.color.setRGB(...palette.ambientSky);
    hemi.groundColor.setRGB(...palette.ambientGround);
    hemi.intensity = palette.ambientIntensity * (0.85 + haze * 0.2);

    // Cloud cover is what hides the stars, not the hour alone.
    starMaterial.opacity = palette.starAlpha * (1 - (weather?.cloud ?? 0) * 0.7);
    stars.visible = starMaterial.opacity > 0.01;
  }

  /** Keeps the dome and the stars centred on the camera; drifts the star field slowly. */
  function update(dt, camera) {
    dome.position.copy(camera.position);
    starSpin.position.copy(camera.position);
    starSpin.rotation.y += dt * 0.0035;
  }

  return { group, dome, stars, sun, moon, hemi, uniforms, setPalette, update };
}
