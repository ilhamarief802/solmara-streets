// Solmara Streets: the entry module. Reads the URL settings, installs the one error overlay
// before anything else can fail, builds the renderer, sky and city, puts the player on the
// Avenida Sol with a third-person camera, starts the fixed-step loop and exposes
// window.__GAME for inspection and for the shot rig. Traffic, pedestrians and the kerbside
// cars are all seeded from the same world seed, so a reload is a replay.

import { settings } from './core/settings.js';
import { installErrorOverlay, PerfOverlay, bootStatus, hideBootCard } from './core/debug.js';
import { createRenderer, setExposure } from './core/renderer.js';
import { GameLoop } from './core/loop.js';
import { createInput } from './core/input.js';
import { GameClock } from './core/clock.js';
import { createWeather } from './core/weather.js';
import { createRain } from './core/rain.js';
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
import { Combat } from './combat/combat.js';
import { PoliceSystem } from './police/police.js';
import { MissionSystem } from './missions/missions.js';
import { createAudio } from './audio/audio.js';
import { createMenus } from './menus/menu.js';
import { applySettings, loadSave, snapshotGame, writeSave } from './state/save.js';

/** How often the HUD is refreshed, in seconds. */
const HUD_INTERVAL = 1 / 6;
/** How often an autosave is written while playing, in seconds. */
const AUTOSAVE_INTERVAL = 10;
/** Night for the page's own ink, in hours. */
const NIGHT = { from: 19.6, to: 6.4 };

// A save written by an earlier run shapes the boot: settings first (the renderer reads
// them at construction), then the story is restored later, after the systems exist.
const bootSave = loadSave();
if (bootSave) applySettings(bootSave, settings);

installErrorOverlay();
window.__SHOT_READY = false;
window.__SOLMARA_VERSION = '0.3.0-streets';

bootStatus('Waking Solmara…');

const canvas = document.getElementById('viewport');
const renderer = createRenderer(canvas, settings);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(settings.fov, window.innerWidth / window.innerHeight, 0.35, settings.drawDistance);
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
    // A software rasteriser gets the cheap pass unless a shot needs the detail.
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
// Spawn on the pavement of the Avenida Sol, a few steps from the downtown junction: road
// and traffic to the east, towers to the west, a coupe parked at the kerb.
const spawn = world.spawnById('downtown-boulevard') ?? { x: 340, z: 80, heading: 0 };
const player = new Player({ world, scene, spawn: { x: spawn.x - 10.8, z: spawn.z - 20, heading: 0 } });

const vehicles = new VehicleSystem({ world, scene, player, seed: world.seed });
const traffic = new TrafficSystem({ world, seed: world.seed, player, vehicles, count: settings.trafficCount });
vehicles.setTraffic(traffic);
const pedestrians = new PedestrianSystem({
  world,
  scene,
  seed: world.seed,
  player,
  traffic,
  vehicles,
  count: settings.pedestrianCount,
});
player.vehicles = vehicles;

const rain = createRain(scene, { seed: 11 });
rain.setWeather(weather.current.id);

const cameraRig = new OrbitCamera({ camera, world, input, player, vehicles });
cameraRig.yaw = player.heading;
cameraRig.anchor.x = player.position.x;
cameraRig.anchor.y = player.position.y + 1.45;
cameraRig.anchor.z = player.position.z;

const hud = createHud(world);

// The fighting layer, the police response and the story, in that order: each one hands the
// next its public surface, and all of them talk through the bus.
const combat = new Combat({ scene, camera, world, player, pedestrians, vehicles, cameraRig, hud });
const police = new PoliceSystem({
  world,
  scene,
  player,
  vehicles,
  traffic,
  pedestrians,
  combat,
  cameraRig,
  hud,
  seed: world.seed,
});
combat.setPolice(police);
const missions = new MissionSystem({ world, scene, player, vehicles, police, combat, hud, seed: world.seed });
combat.resolveDown = () => (police.isBustedNearby() ? 'busted' : 'wasted');
combat.effects.setCamera(camera);

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
  combat,
  police,
  missions,
});

// ---------------------------------------------------------------- front end + sound
// One plain object is the game both the menus and window.__GAME see. Sound is created
// silent and only starts its context on the first gesture; the menus own the pause state.
const game = {
  renderer,
  scene,
  camera,
  world,
  clock,
  weather,
  sky,
  settings,
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
  combat,
  police,
  missions,
  rain,
  audio: null,
  menus: null,
  save: null,
};
const audio = createAudio({ settings, bus });
game.audio = audio;
const menus = createMenus({ game, settings, audio, perf, onSaved: () => {} });
game.menus = menus;
game.save = {
  snapshot: () => snapshotGame(game),
  write: (extra) => writeSave({ ...snapshotGame(game), ...extra }),
};

// The persisted knobs that are not renderer construction: shadow maps, post layer, input
// speed and the frame readout.
renderer.shadowMap.enabled = Boolean(settings.shadows);
document.body.classList.toggle('post-on', Boolean(settings.postProcessing));
input.pointerSensitivity = 0.0022 * settings.cameraSensitivity;
if (settings.showFps) perf.toggle(true);

// Browsers only allow audio after the player has touched the page.
const unlockAudio = () => audio.unlock();
window.addEventListener('pointerdown', unlockAudio, { once: true });
window.addEventListener('keydown', unlockAudio, { once: true });

// Impacts shake the camera; the audio system hears the same events for its own thumps.
bus.on('vehicle:crash', ({ impact }) => cameraRig.kick(Math.min(0.42, 0.055 + (impact ?? 4) * 0.045)));
bus.on('police:ram', () => cameraRig.kick(0.22));

// ---------------------------------------------------------------- clock + weather
clock.update(0);
weather.update(0);

// ---------------------------------------------------------------- loop
let firstFrame = true;
let hudClock = 0;
let saveClock = 0;
let lastPrompt = '';

/** The one prompt line: the mission's wins over the car's, and it is written once. */
function currentPrompt() {
  const prompt = missions.prompt() || vehicles.prompt();
  if (prompt !== lastPrompt) {
    lastPrompt = prompt;
    world.state.prompt = prompt;
  }
  return prompt;
}

/** The HUD is read from the same state everything else writes, six times a second. */
function refreshHud() {
  const driving = Boolean(vehicles.activeCar);
  hud.update({
    districtName: world.districts[world.state.district]?.name ?? 'Solmara',
    hour: clock.hour,
    mode: driving ? 'driving' : 'foot',
    vehicle: vehicles.activeCar?.name,
    speed: Math.abs(vehicles.activeCar?.speed ?? 0) * 3.6,
    prompt: currentPrompt(),
    money: missions.money,
    health: combat.health,
    armour: combat.armour,
    wanted: police.wanted,
    weapon: combat.weaponInfo,
    mission: missions.objective,
    down: combat.downKind,
    firing: combat.firingNow,
  });

  // Mirror the same numbers into the world's shared play state, for the systems that
  // cannot import the HUD's inputs.
  world.state.money = missions.money;
  world.state.health = Math.round(combat.health);
  world.state.armour = Math.round(combat.armour);
  world.state.wanted = police.wanted;
  world.state.mission = missions.active?.def.id ?? null;
  world.state.weapon = combat.weaponId;
}

/** Steps whatever the player asked for this frame: car, camera, shop, trigger. */
function handlePlayerActions() {
  if (shots.active || menus.screen) return;

  // The shop owns the number keys while it is open; no shooting through the menu.
  if (missions.shopOpen) {
    combat.suspended = true;
    if (input.keyPressed('Digit1')) missions.buy(1);
    if (input.keyPressed('Digit2')) missions.buy(2);
    if (input.keyPressed('Digit3')) missions.buy(3);
    if (input.keyPressed('Digit4')) missions.buy(4);
    if (input.keyPressed('Escape') || input.keyPressed('KeyE')) missions.closeShop();
    return;
  }

  combat.suspended = false;
  combat.handleInput(input);

  if (input.keyPressed('KeyE') && missions.interact()) return;
  // E and F both reach for the nearest car; F is the one the HUD names.
  if (input.keyPressed('KeyE') || input.keyPressed('KeyF')) enterOrLeaveCar();
  if (input.keyPressed('KeyV')) {
    cameraRig.toggleMode();
    bus.emit('camera:mode', { firstPerson: cameraRig.firstPerson });
  }
}

function enterOrLeaveCar() {
  const stolen = vehicles.tryEnter(player);
  if (player.car) cameraRig.timeSinceLook = 0;
  if (stolen) police.onCarjack(player.position.x, player.position.z);
  refreshHud();
  bus.emit('game:interact', { driving: Boolean(player.car), stolen });
}

function onUpdate(dt) {
  if (loop.paused) return;

  clock.update(dt);
  weather.update(dt);
  const palette = clock.palette();
  world.update(dt, { palette, weather, camera });

  // Order matters: the driven car moves, then the body follows (or walks), then the actors
  // that react to both, then fighting, the response and the story, then the instanced fleet
  // is rebuilt from the result. While the player is down the body and car are left where
  // they fell; everything else keeps living.
  if (!combat.isDown) {
    vehicles.update(dt, input);
    player.update(dt, { input, cameraYaw: cameraRig.yaw });
  }
  traffic.update(dt);
  pedestrians.update(dt);
  combat.update(dt, { input });
  police.update(dt);
  missions.update(dt);
  vehicles.paint();

  const { x, z } = player.position;
  world.state.district = world.districtAt(x, z);
  world.state.hour = clock.hour;
  world.state.nearbyTraffic = traffic.cars.filter((car) => Math.hypot(car.x - x, car.z - z) < 90).length;
  world.state.nearbyPeds = pedestrians.peds.filter((ped) => Math.hypot(ped.x - x, ped.z - z) < 60).length;

  rain.setWeather(weather.current.id);
  rain.update(dt, camera);
  sky.update(dt, camera);

  // A quiet autosave while playing. Shots never write: their posed world is not a save.
  if (!shots.active && !menus.screen) {
    saveClock += dt;
    if (saveClock >= AUTOSAVE_INTERVAL) {
      saveClock = 0;
      writeSave(snapshotGame(game));
    }
  }
}

function onRender(frameSeconds) {
  // Keys are read here, once per frame, so pause and time-skip work even while the
  // fixed-step simulation is stopped. The menu owns P and Escape when it is open.
  if (input.keyPressed('KeyP') && !shots.active) {
    if (menus.screen) menus.resume();
    else menus.pause();
  }
  if (input.keyPressed('KeyT') && !menus.screen && !shots.active) {
    clock.advance(1);
    bus.emit('game:timeskip', { hour: clock.hour });
  }
  handlePlayerActions();

  const palette = clock.palette();
  scene.fog.color.setRGB(...palette.fogColor);
  scene.fog.density = palette.fogDensity * weather.fogMultiplier;
  setExposure(renderer, palette.exposure * weather.exposureBias * (shots.active ? shots.exposure : 1));
  sky.setPalette(palette, weather);

  // The page itself reacts to the hour and the weather: night HUD ink, the wet tint and the
  // windscreen streaks all read these classes.
  const night = clock.hour >= NIGHT.from || clock.hour < NIGHT.to;
  document.body.classList.toggle('is-night', night);
  document.body.classList.toggle('is-rain', rain.isRaining);
  document.body.classList.toggle('is-driving', Boolean(vehicles.activeCar));

  menus.update(frameSeconds);
  audio.update(frameSeconds, {
    car: vehicles.activeCar,
    wanted: police.wanted,
    district: world.districtAt(player.position.x, player.position.z),
    hour: clock.hour,
    raining: rain.isRaining,
  });

  if (shots.active) shots.update(frameSeconds);
  else cameraRig.update(Math.min(frameSeconds, 0.1), { car: vehicles.activeCar });

  hudClock += frameSeconds;
  if (hudClock >= HUD_INTERVAL) {
    hudClock = 0;
    refreshHud();
  }

  const dots = police.mapDots;
  hud.frame(frameSeconds, {
    x: player.position.x,
    z: player.position.z,
    heading: player.heading,
    traffic: traffic.cars,
    cruisers: dots.cruisers,
    cops: dots.cops,
    markers: missions.markers,
  });

  perf.update(frameSeconds, {
    phase: `${palette.label} ${palette.phase}`,
    district: world.districtAt(camera.position.x, camera.position.z),
    seed: world.seed,
    paused: loop.paused ? 'yes' : 'no',
    traffic: `${traffic.cars.length} cars`,
    peds: `${pedestrians.peds.length} peds`,
    wanted: `${police.wanted} stars · ${police.cruisers.length} cruisers · ${police.cops.length} cops`,
    money: `$${missions.money}`,
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

// The two page-level atmosphere layers and the loading fade. They are plain divs so the
// canvas and the HUD keep their own draw order.
for (const id of ['post-layer', 'weather-layer']) {
  const layer = document.createElement('div');
  layer.id = id;
  document.body.append(layer);
}

const fadeLayer = document.createElement('div');
fadeLayer.id = 'fade-layer';
fadeLayer.className = 'is-booting';
document.body.append(fadeLayer);
// Two frames, so the first city frame is behind the fade before it lifts.
requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    fadeLayer.classList.add('is-faded');
    setTimeout(() => fadeLayer.remove(), 1000);
  });
});

// ---------------------------------------------------------------- shot boot
// A capture run starts in the rig, not in the menus: ?shot=<name>&seed=<n>&capture=1.
const shotParams = parseShotParams();
if (shotParams.name) {
  if (!shots.start(shotParams.name, shotParams.seed, { capture: shotParams.capture })) {
    console.warn(`[solmara] unknown shot "${shotParams.name}"; known: ${Object.keys(SHOTS).join(', ')}`);
  }
} else {
  document.title = 'Solmara Streets';
  menus.boot();
  if (bootSave) {
    // Continue is one click away, but the story is not applied until the player chooses:
    // Play resets, Continue restores.
    bootStatus(`Solmara is open · save from ${new Date(bootSave.savedAt || Date.now()).toLocaleDateString('en-US')}`);
  }
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
  combat,
  police,
  missions,
  rain,
  audio,
  menus,
  stats: world.stats,
  state: world.state,
  counts: () => ({
    traffic: traffic.cars.length,
    peds: pedestrians.peds.length,
    parked: vehicles.visibleParked.length,
    fleet: vehicles.fleet.drawn,
    cruisers: police.cruisers.length,
    cops: police.cops.length,
    thugs: combat.thugs.length,
  }),
};

// F3 toggles the frame readout from anywhere, even while paused.
window.addEventListener('keydown', (event) => {
  if (event.code !== 'F3') return;
  event.preventDefault();
  perf.toggle();
});

window.__MENU = menus;
window.__SOLMARA_SAVE = () => snapshotGame(game);

bootStatus(
  `${world.stats.buildings} buildings · ${traffic.cars.length} cars · ${pedestrians.peds.length} people — press F3 for frames`,
);
