// Solmara Streets: the entry module. Reads the URL settings, installs the one error
// overlay before anything else can fail, builds the renderer, sky and city, starts the
// fixed-step loop, and exposes window.__GAME for inspection. With ?shot= it hands the
// camera to the shot rig; without it, an observation camera starts on the Avenida Sol.

import { settings } from './core/settings.js';
import { installErrorOverlay, PerfOverlay, bootStatus, hideBootCard } from './core/debug.js';
import { createRenderer, setExposure } from './core/renderer.js';
import { GameLoop } from './core/loop.js';
import { createInput } from './core/input.js';
import { GameClock } from './core/clock.js';
import { createWeather } from './core/weather.js';
import { createAtmosphere } from './core/sky.js';
import { createWorld } from './world/world.js';
import { bus } from './core/events.js';
import { ShotRig, parseShotParams, SHOTS } from './shots/rig.js';
import { clamp, damp } from './core/math.js';

installErrorOverlay();
window.__SHOT_READY = false;
window.__SOLMARA_VERSION = '0.1.0-world';

bootStatus('Waking Solmara…');

const canvas = document.getElementById('viewport');
const renderer = createRenderer(canvas, settings);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(settings.fov, window.innerWidth / window.innerHeight, 0.6, renderer.userData.software ? 3000 : 4600);
camera.rotation.order = 'YXZ';
renderer.userData.camera = camera;

scene.fog = new THREE.FogExp2(0xc4d2dc, 0.00065);

const clock = new GameClock({ startHour: 17.1 });
const weather = createWeather(settings.seed);
const sky = createAtmosphere(scene, { segments: settings.skySegments });

bootStatus('Laying out the seven districts…');
let world;
try {
  world = createWorld({
    seed: settings.seed,
    renderer,
    settings,
    lite: renderer.userData.software && !settings.shot,
    onStage: (stage) => bootStatus(`${stage[0].toUpperCase()}${stage.slice(1)}…`),
  });
} catch (error) {
  bootStatus('The city failed to build — see the error panel.');
  throw error;
}
scene.add(world.group);

const input = createInput(canvas);
const loop = new GameLoop({ fixedStep: 1 / 60 });
const perf = new PerfOverlay(document.getElementById('perf'), renderer);
const shots = new ShotRig({ renderer, scene, camera, world, clock, weather, settings, input, loop, bus });

// ---------------------------------------------------------------- observation camera
// Until the player session lands, the world is looked at with a simple fly camera:
// WASD to move, mouse (pointer lock) or arrows to look, Space/Ctrl to rise and sink.
const spawn = world.spawnById('downtown-boulevard');
const fly = {
  x: spawn ? spawn.x : 300,
  y: 6.0,
  z: spawn ? spawn.z : 100,
  yaw: spawn ? spawn.heading + Math.PI / 2 : -2.2,
  pitch: -0.1,
  speed: 18,
};
camera.position.set(fly.x, fly.y, fly.z);
camera.rotation.set(fly.pitch, fly.yaw, 0);

function updateFlyCamera(dt) {
  if (shots.active) return;
  const look = input.consumeMouseDelta();
  fly.yaw -= look.x;
  fly.pitch = clamp(fly.pitch - look.y, -1.32, 1.32);
  if (input.isDown('cameraLeft')) fly.yaw += dt * 1.7;
  if (input.isDown('cameraRight')) fly.yaw -= dt * 1.7;
  if (input.isDown('lookUp')) fly.pitch = clamp(fly.pitch + dt * 1.2, -1.32, 1.32);
  if (input.isDown('lookDown')) fly.pitch = clamp(fly.pitch - dt * 1.2, -1.32, 1.32);

  const boost = input.isDown('sprint') ? 3.2 : 1;
  const forward = input.isDown('forward') ? 1 : 0;
  const back = input.isDown('back') ? 1 : 0;
  const left = input.isDown('left') ? 1 : 0;
  const right = input.isDown('right') ? 1 : 0;
  const moveForward = (forward - back) * fly.speed * boost * dt;
  const moveSide = (right - left) * fly.speed * boost * dt;
  fly.x += -Math.sin(fly.yaw) * moveForward + Math.cos(fly.yaw) * moveSide;
  fly.z += -Math.cos(fly.yaw) * moveForward - Math.sin(fly.yaw) * moveSide;
  if (input.isDown('jump')) fly.y += fly.speed * boost * dt;
  if (input.isDown('crouch')) fly.y -= fly.speed * boost * dt;
  fly.y = clamp(fly.y, 1.2, 220);
  fly.x = clamp(fly.x, -900, 1240);
  fly.z = clamp(fly.z, -950, 650);

  camera.position.set(fly.x, fly.y, fly.z);
  camera.rotation.set(fly.pitch, fly.yaw, 0);
}

// ---------------------------------------------------------------- clock + weather
clock.update(0);
weather.update(0);

// ---------------------------------------------------------------- loop
let firstFrame = true;

function onUpdate(dt) {
  if (loop.paused) return;
  clock.update(dt);
  weather.update(dt);
  const palette = clock.palette();
  world.update(dt, { palette, weather, camera });
  sky.update(dt, camera);
}

function onRender(frameSeconds) {
  // Keys are read here, once per frame, so pause and time-skip work even while the
  // fixed-step simulation is stopped.
  if (input.keyPressed('KeyP')) {
    loop.togglePaused();
    bus.emit('game:pause', { paused: loop.paused });
  }
  if (input.keyPressed('KeyT')) {
    clock.advance(1);
    bus.emit('game:timeskip', { hour: clock.hour });
  }

  const palette = clock.palette();
  scene.fog.color.setRGB(...palette.fogColor);
  scene.fog.density = palette.fogDensity * weather.fogMultiplier;
  setExposure(renderer, palette.exposure * weather.exposureBias);
  sky.setPalette(palette, weather);
  if (shots.active) {
    shots.update(frameSeconds);
  } else {
    updateFlyCamera(Math.min(frameSeconds, 0.1));
  }
  perf.update(frameSeconds, {
    phase: `${palette.label} ${palette.phase}`,
    district: world.districtAt(camera.position.x, camera.position.z),
    seed: world.seed,
    paused: loop.paused ? 'yes' : 'no',
  });
  renderer.render(scene, camera);
  input.resetFrame();
  if (firstFrame) {
    firstFrame = false;
    hideBootCard();
    bootStatus('Solmara is open.');
  }
}

loop.onUpdate = onUpdate;
loop.onRender = onRender;
if (settings.paused) loop.setPaused(true);
loop.start();

// ---------------------------------------------------------------- shot boot
const shotParams = parseShotParams();
if (shotParams.name) {
  if (!shots.start(shotParams.name, shotParams.seed)) {
    console.warn(`[solmara] unknown shot "${shotParams.name}"; known: ${Object.keys(SHOTS).join(', ')}`);
  }
} else {
  document.title = 'Solmara Streets';
}

// ---------------------------------------------------------------- inspection surface
window.__GAME = {
  version: window.__SOLMARA_VERSION,
  renderer,
  scene,
  camera,
  world,
  clock,
  weather,
  sky,
  settings: settings.snapshot(),
  input,
  loop,
  bus,
  shots,
  fly,
  stats: world.stats,
};

// F3 toggles the frame readout from anywhere, even while paused.
window.addEventListener('keydown', (event) => {
  if (event.code === 'F3') {
    event.preventDefault();
    perf.toggle();
  }
});

bootStatus(
  `${world.stats.buildings} buildings · ${world.stats.props} props · ${world.stats.nodes} junctions — press F3 for frames`,
);
