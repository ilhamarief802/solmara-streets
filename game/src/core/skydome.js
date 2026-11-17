// Sky: a gradient dome drawn with a hand written shader (horizon band, sun glow,
// moon glow), a sun disc, a moon disc and a field of stars that only shows after
// dark. The shader does its own ACES tone map and sRGB encode so the sky matches
// the tone mapped city underneath it instead of glowing past it.

const VERTEX_SHADER = `
varying vec3 vDirection;
void main() {
  vDirection = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FRAGMENT_SHADER = `
precision highp float;
uniform vec3 uTop;
uniform vec3 uHorizon;
uniform vec3 uGround;
uniform vec3 uSunColor;
uniform vec3 uMoonColor;
uniform vec3 uSunDirection;
uniform vec3 uMoonDirection;
uniform float uSunGlow;
uniform float uMoonGlow;
uniform float uHaze;
uniform float uGroundBlend;
varying vec3 vDirection;

vec3 acesFilm(vec3 x) {
  const float a = 2.51;
  const float b = 0.03;
  const float c = 2.43;
  const float d = 0.59;
  const float e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

vec3 linearToSRGB(vec3 value) {
  vec3 low = value * 12.92;
  vec3 high = 1.055 * pow(max(value, vec3(0.0001)), vec3(1.0 / 2.4)) - 0.055;
  return mix(low, high, step(vec3(0.0031308), value));
}

void main() {
  vec3 dir = normalize(vDirection);

  // Three stop vertical gradient: ground haze below the horizon, the horizon
  // colour at it, zenith above it.
  vec3 colour = mix(uGround, uHorizon, smoothstep(-0.32, 0.015, dir.y));
  colour = mix(colour, uTop, smoothstep(0.0, 0.62, dir.y));

  // Extra band of horizon light, thicker when the air is hazy.
  float band = exp(-abs(dir.y) * 7.5);
  colour += uHorizon * band * uHaze * 0.4;

  // Sun: a tight core, a broad glow and a low warm wash hugging the horizon.
  float sunDot = max(dot(dir, uSunDirection), 0.0);
  colour += uSunColor * pow(sunDot, 480.0) * uSunGlow * 3.2;
  colour += uSunColor * pow(sunDot, 9.0) * uSunGlow * 0.34;
  colour += uSunColor * pow(sunDot, 2.0) * uSunGlow * uHaze * 0.22;

  // Moon: small core with a cool halo.
  float moonDot = max(dot(dir, uMoonDirection), 0.0);
  colour += uMoonColor * pow(moonDot, 2200.0) * uMoonGlow * 1.6;
  colour += uMoonColor * pow(moonDot, 40.0) * uMoonGlow * 0.1;

  // Slight vertical fall off on the ground half so the sea and terrain never
  // fight the dome for brightness.
  colour *= mix(1.0, 0.72, smoothstep(-0.02, -0.6, dir.y) * uGroundBlend);

  gl_FragColor = vec4(linearToSRGB(acesFilm(colour)), 1.0);
}
`;

export class SkyDome {
  constructor(options = {}) {
    const radius = options.radius ?? 2400;
    this.radius = radius;
    this.rng = options.rng ?? null;

    this.group = new THREE.Group();
    this.group.name = 'sky';

    this.uniforms = {
      uTop: { value: new THREE.Color(0x2f74c8) },
      uHorizon: { value: new THREE.Color(0xcfe3f5) },
      uGround: { value: new THREE.Color(0x6a7a86) },
      uSunColor: { value: new THREE.Color(0xfff0d0) },
      uMoonColor: { value: new THREE.Color(0xbfd4ff) },
      uSunDirection: { value: new THREE.Vector3(0, 1, 0) },
      uMoonDirection: { value: new THREE.Vector3(0, -1, 0) },
      uSunGlow: { value: 1 },
      uMoonGlow: { value: 0 },
      uHaze: { value: 0.4 },
      uGroundBlend: { value: 1 },
    };

    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      fog: false,
    });

    this.dome = new THREE.Mesh(new THREE.SphereGeometry(radius, 32, 18), this.material);
    this.dome.name = 'sky-dome';
    this.dome.frustumCulled = false;
    this.dome.renderOrder = -100;
    this.group.add(this.dome);

    this.stars = this.createStars(radius * 0.97);
    this.group.add(this.stars.points);

    this.sunDisc = new THREE.Mesh(
      new THREE.SphereGeometry(radius * 0.022, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0xfff2d8, fog: false }),
    );
    this.sunDisc.name = 'sun-disc';
    this.sunDisc.frustumCulled = false;
    this.group.add(this.sunDisc);

    this.moonDisc = new THREE.Mesh(
      new THREE.SphereGeometry(radius * 0.016, 16, 12),
      new THREE.MeshBasicMaterial({
        color: 0xdfe8ff,
        map: options.textures?.moon?.() ?? null,
        fog: false,
      }),
    );
    this.moonDisc.name = 'moon-disc';
    this.moonDisc.frustumCulled = false;
    this.group.add(this.moonDisc);
  }

  /** Points on a ball, above the horizon only, with per star size and warmth. */
  createStars(radius) {
    const rng = this.rng;
    const count = 1500;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    for (let i = 0; i < count; i += 1) {
      let x = 0;
      let y = -1;
      let z = 0;
      let length = 0;
      while (length < 0.2 || y < -0.04) {
        x = rng ? rng.float(-1, 1) : Math.random() * 2 - 1;
        y = rng ? rng.float(-0.05, 1) : Math.random();
        z = rng ? rng.float(-1, 1) : Math.random() * 2 - 1;
        length = Math.hypot(x, y, z);
      }
      const scale = radius / length;
      positions[i * 3] = x * scale;
      positions[i * 3 + 1] = y * scale;
      positions[i * 3 + 2] = z * scale;
      const warmth = rng ? rng.next() : 0.5;
      colors[i * 3] = 0.78 + warmth * 0.22;
      colors[i * 3 + 1] = 0.8 + warmth * 0.16;
      colors[i * 3 + 2] = 0.86 + warmth * 0.14;
      sizes[i] = rng ? rng.float(1.4, 5.4) : 2;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const material = new THREE.PointsMaterial({
      size: 4.6,
      sizeAttenuation: false,
      vertexColors: true,
      transparent: true,
      opacity: 1,
      depthWrite: false,
      fog: false,
      toneMapped: false,
      map: null,
    });
    const points = new THREE.Points(geometry, material);
    points.name = 'stars';
    points.frustumCulled = false;
    points.renderOrder = -99;
    return { points, material, sizes };
  }

  /** Pushes a sampled palette and the two celestial directions into the shader. */
  update({ palette, sunDirection, moonDirection, starOpacity = 0, camera, hour = 12 }) {
    const u = this.uniforms;
    u.uTop.value.setHex(palette.skyTop);
    u.uHorizon.value.setHex(palette.skyHorizon);
    u.uGround.value.setHex(palette.skyGround);
    u.uSunColor.value.setHex(palette.sun);
    u.uMoonColor.value.setHex(palette.moon);
    u.uSunDirection.value.copy(sunDirection);
    u.uMoonDirection.value.copy(moonDirection);
    u.uSunGlow.value = palette.sunIntensity * 0.9 + 0.06;
    u.uMoonGlow.value = palette.moonIntensity * 1.2;
    u.uHaze.value = 0.25 + (palette.weather === 'hazy' ? 0.5 : 0.12);

    this.stars.material.opacity = Math.max(0, Math.min(1, starOpacity));
    this.stars.points.visible = this.stars.material.opacity > 0.01;
    // Sidereal drift: the star ball counter-rotates against the sun's arc.
    const phase = ((hour - 6) / 24) * Math.PI * 2;
    this.stars.points.rotation.x = phase * 0.35;
    this.stars.points.rotation.z = phase * 0.12;

    const sunDistance = this.radius * 0.9;
    this.sunDisc.position.copy(sunDirection).multiplyScalar(sunDistance);
    this.moonDisc.position.copy(moonDirection).multiplyScalar(sunDistance);
    this.sunDisc.visible = sunDirection.y > -0.16;
    this.moonDisc.visible = moonDirection.y > -0.16;
    const sunHeat = Math.max(0.35, Math.min(1.6, 0.4 + palette.sunIntensity * 0.7));
    this.sunDisc.material.color.setHex(palette.sun);
    this.sunDisc.material.color.multiplyScalar(sunHeat);
    this.moonDisc.material.color.setHex(palette.moon);
    this.moonDisc.material.color.multiplyScalar(Math.max(0.45, palette.moonIntensity + 0.35));

    if (camera) this.group.position.set(camera.position.x, 0, camera.position.z);
    return this;
  }

  dispose() {
    this.dome.geometry.dispose();
    this.material.dispose();
    this.stars.points.geometry.dispose();
    this.stars.material.dispose();
    this.sunDisc.geometry.dispose();
    this.sunDisc.material.dispose();
    this.moonDisc.geometry.dispose();
    this.moonDisc.material.dispose();
  }
}

export function createSkyDome(options) {
  return new SkyDome(options);
}
