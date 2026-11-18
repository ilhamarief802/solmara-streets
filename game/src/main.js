// Solmara Streets: the entry module. Reads the URL settings, installs the one error
// overlay before anything else can fail, builds the renderer, sky and city, puts the
// player on the Avenida Sol with a third-person camera, starts the fixed-step loop and
// exposes window.__GAME for inspection and for the shot rig. Traffic, pedestrians and
// the kerbside cars are all seeded from the same world seed, so a reload is a replay.

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
import { Player } from './player/player.js';
import { OrbitCamera } from './camera/orbit.js';
import { VehicleSystem } from './vehicles/vehicles.js';
import { TrafficSystem } from './traffic/traffic.js';
import { PedestrianSystem } from './pedestrians/pedestrians.js';
import { createHud } from './hud/hud.js';

installErrorOverlay();
window.__SHOT_READY = false;
window.__SOLMARA_VERSION = '0.2.0-streets';

bootStatus('Waking Solmara…');

const canvas = document.getElementById('viewport');
const renderer = createRenderer(canvas, settings);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(settings.fov, window.innerWidth / window.innerHeight, 0.35, renderer.userData.software ? 3000 : 4600);
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

// ---------------------------------------------------------------- the player
// Spawn on the pavement of the Avenida Sol, a few steps from the downtown junction:
// road and traffic to the east, towers to the west, a coupe parked at the kerb.
const spawn = world.spawnById('downtown-boulevard') ?? { x: 340, z: 80, heading: 0 };
const player = new Player({
  world,
  scene,
  spawn: { x: spawn.x - 10.8, z: spawn.z - 20, heading: 0 },
});

const vehicles = new VehicleSystem({ world, scene, player, seed: world.seed });
const traffic = new TrafficSystem({ world, seed: world.seed, player, vehicles, count: 30 });
vehicles.setTraffic(traffic);
const pedestrians = new PedestrianSystem({ world, scene, seed: world.seed, player, traffic, vehicles, count: 32 });
player.vehicles = vehicles;

const cameraRig = new OrbitCamera({ camera, world, input, player, vehicles });
cameraRig.yaw = player.heading;
cameraRig.anchor.x = player.position.x;
cameraRig.anchor.y = player.position.y + 1.45;
cameraRig.anchor.z = player.position.z;

const hud = createHud();
const shots = new ShotRig({
  renderer,
  scene,
  camera,
  world,
  clock,
  weather,
  settings,
  input,
  loop,
  bus,
  player,
  vehicles,
  traffic,
  pedestrians,
  cameraRig,
  hud,
});

// ---------------------------------------------------------------- clock + weather
clock.update(0);
weather.update(0);

// ---------------------------------------------------------------- loop
let firstFrame = true;
let hudClock = 0;
let lastPrompt = '';

/** The HUD is read from the same state everything else writes, at most six times a second. */
function refreshHud() {
  const prompt = vehicles.prompt();
  if (prompt !== lastPrompt) {
    lastPrompt = prompt;
    world.state.prompt = prompt;
  }
  hud.update({
    districtName: world.districts[world.state.district]?.name ?? 'Solmara',
    hour: clock.hour,
    mode: vehicles.activeCar ? 'driving' : 'foot',
    vehicle: vehicles.activeCar?.name,
    speed: Math.abs(vehicles.activeCar?.speed ?? 0) * 3.6,
    prompt,
  });
}

function onUpdate(dt) {
  if (loop.paused) return;
  clock.update(dt);
  weather.update(dt);
  const palette = clock.palette();
  world.update(dt, { palette, weather, camera });

  // Order matters: the driven car moves, then the body follows (or walks), then the
  // actors that react to both, then the instanced fleet is rebuilt from the result.
  vehicles.update(dt, input);
  player.update(dt, { input, cameraYaw: cameraRig.yaw });
  traffic.update(dt);
  pedestrians.update(dt);
  vehicles.paint();

  world.state.district = world.districtAt(player.position.x, player.position.z);
  world.state.hour = clock.hour;
  world.state.nearbyTraffic = traffic.cars.filter((car) => Math.hypot(car.x - player.position.x, car.z - player.position.z) < 90).length;
  world.state.nearbyPeds = pedestrians.peds.filter((ped) => Math.hypot(ped.x - player.position.x, ped.z - player.position.z) < 60).length;
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
  if (!shots.active) {
    if (input.keyPressed('KeyF') || input.keyPressed('KeyE')) {
      const stolen = vehicles.tryEnter(player);
      if (player.car) cameraRig.timeSinceLook = 0;
      refreshHud();
      bus.emit('game:interact', { driving: Boolean(player.car), stolen });
    }
    if (input.keyPressed('KeyV')) {
      cameraRig.toggleMode();
      bus.emit('camera:mode', { firstPerson: cameraRig.firstPerson });
    }
  }

  const palette = clock.palette();
  scene.fog.color.setRGB(...palette.fogColor);
  scene.fog.density = palette.fogDensity * weather.fogMultiplier;
  setExposure(renderer, palette.exposure * weather.exposureBias * (shots.active ? shots.exposure : 1));
  sky.setPalette(palette, weather);

  if (shots.active) {
    shots.update(frameSeconds);
  } else {
    cameraRig.update(Math.min(frameSeconds, 0.1), { car: vehicles.activeCar });
  }

  hudClock += frameSeconds;
  if (hudClock >= 1 / 6) {
    hudClock = 0;
    refreshHud();
  }

  perf.update(frameSeconds, {
    phase: `${palette.label} ${palette.phase}`,
    district: world.districtAt(camera.position.x, camera.position.z),
    seed: world.seed,
    paused: loop.paused ? 'yes' : 'no',
    traffic: `${traffic.cars.length} cars`,
    peds: `${pedestrians.peds.length} peds`,
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
  player,
  cameraRig,
  rig: cameraRig,
  vehicles,
  traffic,
  pedestrians,
  hud,
  stats: world.stats,
  state: world.state,
  counts: () => ({
    traffic: traffic.cars.length,
    peds: pedestrians.peds.length,
    parked: vehicles.visibleParked.length,
    fleet: vehicles.fleet.drawn,
  }),
};

// F3 toggles the frame readout from anywhere, even while paused.
window.addEventListener('keydown', (event) => {
  if (event.code === 'F3') {
    event.preventDefault();
    perf.toggle();
  }
});

bootStatus(
  `${world.stats.buildings} buildings · ${traffic.cars.length} cars · ${pedestrians.peds.length} people — press F3 for frames`,
);
