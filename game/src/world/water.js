// The sea and the channel, as one animated fragment shader on a single large plane.
// Two crossing swells, a fresnel lift at glancing angles, a sun path that follows the
// clock's sun, and manual exponential fog so the far water dissolves into the same haze
// as the sky. No reflection pass, no normal map: cheap enough for every frame.

import { WATER } from './plan.js';

const VERTEX = /* glsl */ `
  varying vec3 vWorld;
  varying vec3 vView;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    vec4 mv = viewMatrix * world;
    vView = -mv.xyz;
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform vec3 uDeep;
  uniform vec3 uShallow;
  uniform vec3 uHorizon;
  uniform vec3 uSunColor;
  uniform vec3 uSunDir;
  uniform vec3 uFogColor;
  uniform float uFogDensity;
  uniform float uHaze;
  varying vec3 vWorld;
  varying vec3 vView;

  void main() {
    vec3 view = normalize(vView);
    float dist = length(vView);

    // Two crossing swells plus a fine chop; the analytic derivatives give a cheap normal.
    vec2 p = vWorld.xz;
    float s1 = p.x * 0.055 + uTime * 0.85;
    float s2 = p.y * 0.041 - uTime * 0.62 + p.x * 0.02;
    float s3 = (p.x + p.y) * 0.11 + uTime * 1.4;
    float wave = sin(s1) * 0.55 + sin(s2) * 0.5 + sin(s3) * 0.18;

    float dx = cos(s1) * 0.055 * 0.55 + cos(s3) * 0.11 * 0.18;
    float dz = cos(s2) * 0.041 * 0.5 + cos(s3) * 0.11 * 0.18;
    vec3 normal = normalize(vec3(-dx, 1.0, -dz));

    float facing = clamp(dot(view, normal), 0.0, 1.0);
    float fresnel = pow(1.0 - facing, 3.0);
    vec3 water = mix(uDeep, uShallow, 0.35 + wave * 0.16);
    vec3 skyTint = mix(uHorizon, uDeep, 0.25);
    water = mix(water, skyTint, fresnel * 0.6);

    // Sun glitter: a tight specular lobe plus a broad warm sheen.
    vec3 halfDir = normalize(normalize(uSunDir) + view);
    float spec = pow(max(dot(normal, halfDir), 0.0), 220.0);
    float sheen = pow(max(dot(normal, normalize(uSunDir)), 0.0), 8.0);
    water += uSunColor * (spec * 1.8 + sheen * 0.12);

    // Foam flecks on the crests, stronger in haze.
    float foam = smoothstep(0.72, 1.05, wave) * 0.09;
    water += vec3(foam) * (0.6 + uHaze * 0.5);

    // Manual fog, matched to the scene's exponential-squared fog.
    float fogFactor = 1.0 - exp(-uFogDensity * uFogDensity * dist * dist);
    water = mix(water, uFogColor, clamp(fogFactor, 0.0, 1.0));

    gl_FragColor = vec4(water, 1.0);
  }
`;

/**
 * Creates the water plane. `update` feeds it time, the clock palette and the weather.
 */
export function createWater(plan, options = {}) {
  const uniforms = {
    uTime: { value: 0 },
    uDeep: { value: new THREE.Color(0x0e2f3c) },
    uShallow: { value: new THREE.Color(0x2f6f78) },
    uHorizon: { value: new THREE.Color(0xcfe2ee) },
    uSunColor: { value: new THREE.Color(0xfff0d0) },
    uSunDir: { value: new THREE.Vector3(0.2, 0.8, 0.5) },
    uFogColor: { value: new THREE.Color(0xc4d2dc) },
    uFogDensity: { value: 0.0007 },
    uHaze: { value: 0.2 },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    transparent: false,
    depthWrite: true,
    fog: false,
  });
  // One quad: the shader does all the work, so there is nothing to tessellate.
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000, 1, 1), material);
  mesh.name = 'water';
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(160, WATER.level, -100);
  mesh.receiveShadow = false;
  mesh.renderOrder = 1;

  let time = 0;

  function update(dt, palette, weather = null) {
    time += dt;
    uniforms.uTime.value = time;
    if (!palette) return;

    uniforms.uSunColor.value.setRGB(...palette.sunColor);
    uniforms.uSunDir.value.copy(palette.sunDir);
    uniforms.uHorizon.value.setRGB(...palette.skyHorizon);
    uniforms.uFogColor.value.setRGB(...palette.fogColor);
    uniforms.uFogDensity.value = palette.fogDensity * (weather?.fogMultiplier ?? 1);
    uniforms.uHaze.value = weather?.haze ?? 0.2;

    // Night water loses its colour rather than its contrast, hence the small offsets.
    const night = palette.night ?? 0;
    uniforms.uDeep.value.setRGB(0.05 + night * 0.01, 0.18 - night * 0.09, 0.24 - night * 0.12);
    uniforms.uShallow.value.setRGB(0.18 - night * 0.1, 0.44 - night * 0.26, 0.47 - night * 0.28);
  }

  return {
    mesh,
    material,
    uniforms,
    update,
    get time() {
      return time;
    },
  };
}
