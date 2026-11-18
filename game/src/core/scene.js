// Scene assembly: the camera, the two directional lights that stand in for sun and
// moon, the hemisphere light that fakes sky bounce, fog, and the sky dome with its
// stars. updateAtmosphere() is the single place that turns a sampled palette into
// everything the renderer can see, so day, night, weather and the shot scenarios
// all share one code path.

import { SkyDome } from './skydome.js';

/**
 * three.js r155 and later use physically correct light units: the Lambert diffuse
 * response divides irradiance by PI. Without this the whole city renders about three
 * times too dark, so every light intensity below is multiplied by PI.
 */
export const LIGHT_SCALE = Math.PI;

export function createScene(settings, options = {}) {
  const scene = new THREE.Scene();
  scene.name = 'SolmaraStreets';
  scene.fog = new THREE.Fog(0xcfe3f5, settings.fogNear, settings.fogFar);
  scene.background = null;

  const camera = new THREE.PerspectiveCamera(
    settings.fov,
    16 / 9,
    settings.near,
    settings.far,
  );
  camera.name = 'debug-camera';
  camera.position.set(0, 14, 120);

  const sun = new THREE.DirectionalLight(0xfff0d0, 1.4);
  sun.name = 'sun';
  sun.position.set(-600, 400, 320);
  sun.castShadow = settings.shadows === true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0007;
  sun.shadow.normalBias = 0.6;
  const shadowCamera = sun.shadow.camera;
  shadowCamera.left = -170;
  shadowCamera.right = 170;
  shadowCamera.top = 170;
  shadowCamera.bottom = -170;
  shadowCamera.near = 60;
  shadowCamera.far = 1500;
  shadowCamera.updateProjectionMatrix();
  scene.add(sun);
  scene.add(sun.target);

  const moon = new THREE.DirectionalLight(0xbfd4ff, 0.4);
  moon.name = 'moon';
  moon.position.set(600, -400, -320);
  scene.add(moon);
  scene.add(moon.target);

  const hemi = new THREE.HemisphereLight(0x9cc0e8, 0x585448, 0.9);
  hemi.name = 'sky-bounce';
  scene.add(hemi);

  const sky = new SkyDome({
    radius: Math.min(2400, settings.far * 0.6),
    rng: options.rng ?? null,
    textures: options.textures ?? null,
  });
  scene.add(sky.group);

  const root = {
    scene,
    camera,
    sun,
    moon,
    hemi,
    sky,
    fog: scene.fog,
    group: new THREE.Group(),
  };
  root.group.name = 'world';
  scene.add(root.group);

  return root;
}

/**
 * Applies a sampled palette (see core/palettes.js) to the lights, the fog and the
 * sky dome. `state` carries the clock's directions and the current weather.
 */
export function updateAtmosphere(root, state) {
  const { palette, sunDirection, moonDirection, camera, settings, hour } = state;
  const { sun, moon, hemi, fog, sky } = root;

  sun.color.setHex(palette.sun);
  sun.intensity = palette.sunIntensity * LIGHT_SCALE;
  sun.position.copy(sunDirection).multiplyScalar(900);
  sun.target.position.set(0, 0, 0);
  sun.target.updateMatrixWorld();
  sun.visible = palette.sunIntensity > 0.001;

  moon.color.setHex(palette.moon);
  moon.intensity = palette.moonIntensity * LIGHT_SCALE;
  moon.position.copy(moonDirection).multiplyScalar(900);
  moon.target.position.set(0, 0, 0);
  moon.target.updateMatrixWorld();
  moon.visible = palette.moonIntensity > 0.001;

  hemi.color.setHex(palette.ambientSky);
  hemi.groundColor.setHex(palette.ambientGround);
  hemi.intensity = palette.ambientIntensity * LIGHT_SCALE;

  fog.color.setHex(palette.fog);
  fog.near = settings.fogNear;
  fog.far = Math.max(fog.near + 60, palette.fogFar * settings.fogStrength);

  sky.update({
    palette,
    sunDirection,
    moonDirection,
    starOpacity: palette.starOpacity,
    camera,
    hour: hour ?? 12,
  });

  return { fogColorHex: palette.fog, fogNear: fog.near, fogFar: fog.far };
}

/** Deep sky / deep fog clear colour, so nothing ever flashes black between frames. */
export function clearColourOf(palette) {
  return palette.fog ?? 0x0d1420;
}
