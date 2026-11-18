// Solmara Streets: the entry module. It installs the error surface first, reads the
// URL, builds the renderer, the scene and the city, wires the clock, weather and
// input together, starts the fixed step loop and exposes one window.__GAME object so
// the whole world can be inspected from the browser console.

import { installErrorOverlay, createDebug, createFramebufferProbe } from './core/debug.js';
import { createSettings, settingsFromQuery, describeSettings } from './core/settings.js';
import { createRenderer, Viewport } from './core/renderer.js';
import { createScene, updateAtmosphere } from './core/scene.js';
import { createInput } from './core/input.js';
import { createFreeCamera } from './core/freecamera.js';
import { createLoop, FIXED_STEP } from './core/loop.js';
import { createClock } from './core/clock.js';
import { createWeather } from './core/weather.js';
import { Rng } from './core/random.js';
import { createTextureFactory } from './world/textures.js';
import { createWorld } from './world/world.js';
import { readShotParams, createShotRig, scenarioFor, shotNames, scenariosSummary } from './shots/index.js';

/** Everything the game needs, in one object, so the console can reach it all. */
const game = {
  version: 'phase-one',
  name: 'Solmara Streets',
  ready: false,
};

function boot() {
  game.report = installErrorOverlay();

  if (typeof THREE !== 'object') {
    game.report('three.js did not load: game/vendor/three.min.js is missing or broken.', 'fatal');
    return null;
  }

  const params = readShotParams(window.location.search);
  const scenario = params.shot ? scenarioFor(params.shot) : null;
  const settings = settingsFromQuery(window.location.search);
  const seed = params.seed ?? scenario?.seed ?? settings.seed;
  const log = [];

  const canvas = document.getElementById('viewport');
  const renderer = createRenderer({ canvas, settings });

  // One texture factory for the whole game: the sky needs it for the moon, the city
  // needs it for everything else, and sharing it keeps a single cache of canvases.
  const rng = new Rng(seed);
  const textures = createTextureFactory({ seed: `${seed}-textures`, rng: rng.fork('textures') });
  textures.setAnisotropy(Math.min(4, renderer.capabilities.getMaxAnisotropy()));

  const sceneRoot = createScene(settings, { textures, rng: rng.fork('sky') });
  const { scene, camera, sun, moon, hemi, sky, fog } = sceneRoot;

  const viewport = new Viewport({ canvas, renderer, camera, settings });
  viewport.attach();

  const clock = createClock({ hour: scenario?.hour ?? 8.6, minutesPerDay: 24 });
  const weather = createWeather({ kind: scenario?.weather ?? 'clear' });

  const world = createWorld({
    seed,
    settings,
    textures,
    parent: sceneRoot.group,
  });

  const input = createInput({ element: canvas });
  const freeCamera = createFreeCamera({ camera, input, settings, enabled: !scenario });

  const debug = createDebug({
    settings,
    loop: null,
    clock,
    weather,
    renderer,
    camera,
    world,
    visible: settings.showDebug === true,
  });
  debug.addLine(() => `world ${world.stats.triangles.toLocaleString()} tris  ${world.stats.colliderBoxes} colliders`);

  const shot = createShotRig({ params, camera, clock, weather, world, debug, freeCamera, viewport });
  // The shot rig may have moved the clock and the weather; make sure the atmosphere
  // the first frame draws already reflects that.
  clock.recompute(weather);

  // Pointer lock on click, the usual way to look around an open world.
  canvas.addEventListener('click', () => {
    if (!shot.active) input.requestPointerLock();
  });

  const loop = createLoop({
    step: FIXED_STEP,
    update: (dt) => update(dt),
    render: (alpha, frameTime) => render(alpha, frameTime),
    onStats: (stats) => debug.update(stats),
  });
  debug.loop = loop;

  // The clock writes its blended palette into one object that it reuses every frame;
  // the atmosphere reads that same object, so nothing has to be copied per frame.
  const palette = clock.palette;
  const atmosphereState = {
    palette,
    sunDirection: clock.sunDirection,
    moonDirection: clock.moonDirection,
    camera,
    settings,
    hour: clock.hour,
  };

  let spawnCursor = 0;
  let firstFrame = true;

  function handleKeys() {
    if (input.pressed('F3') || input.pressed('Backquote')) debug.toggle();
    if (input.pressed('KeyP')) {
      const paused = loop.togglePause();
      setStatus(paused ? 'Paused' : 'Running');
    }
    if (input.pressed('KeyN')) {
      // Cycle the debug camera through the named spawn points.
      const spawn = world.spawnPoints[spawnCursor % world.spawnPoints.length];
      spawnCursor += 1;
      freeCamera.enabled = true;
      camera.position.set(spawn.x, spawn.y + 1.7, spawn.z);
      freeCamera.setYawPitch(spawn.yaw, 0);
      setStatus(`Moved to ${spawn.label}`);
    }
    if (input.pressed('KeyL')) {
      settings.shadows = !settings.shadows;
      renderer.shadowMap.enabled = settings.shadows;
      sun.castShadow = settings.shadows;
      setStatus(`Shadows ${settings.shadows ? 'on' : 'off'}`);
    }
    if (input.pressed('KeyK')) {
      weather.cycle(1);
      setStatus(`Weather ${weather.kind}`);
    }
    if (input.pressed('BracketRight')) clock.setTimeScale(Math.min(400, clock.timeScale * 4 || 4));
    if (input.pressed('BracketLeft')) clock.setTimeScale(Math.max(0, (clock.timeScale || 4) / 4));
  }

  function update(dt) {
    handleKeys();
    clock.update(dt, weather);
    weather.update(dt);
    clock.recompute(weather);
    world.update(dt, { clock, weather, palette });
    if (!scenario) freeCamera.update(dt);
    input.endFrame();
  }

  function render() {
    atmosphereState.hour = clock.hour;
    updateAtmosphere(sceneRoot, atmosphereState);
    renderer.setClearColor(atmosphereState.palette.fog ?? 0x0d1420, 1);
    renderer.render(scene, camera);
    shot.update();
    if (firstFrame) {
      firstFrame = false;
      onFirstFrame();
    }
  }

  function onFirstFrame() {
    const boot = document.getElementById('boot');
    if (boot) {
      boot.textContent = `${game.name} ready — ${world.stats.buildings} buildings, ${world.roadGraph.nodes.length} road nodes`;
      boot.classList.add('done');
    }
    setStatus(`${game.name} ready`);
    game.ready = true;
  }

  function setStatus(text) {
    const element = document.getElementById('status');
    if (element) element.textContent = text;
  }

  // Pausing when the window loses focus keeps a headless run from spinning, and it is
  // what a player expects when they tab away. A shot run is exempt: it has a fixed
  // number of warm-up frames to render and must never stall behind a focus event.
  window.addEventListener('blur', () => {
    if (settings.pauseOnBlur && !shot.active) loop.setPaused(true);
  });
  window.addEventListener('focus', () => {
    if (settings.pauseOnBlur && !shot.active) loop.setPaused(false);
  });

  Object.assign(game, {
    THREE,
    renderer,
    scene,
    camera,
    viewport,
    sceneRoot,
    sun,
    moon,
    hemi,
    sky,
    fog,
    clock,
    weather,
    world,
    input,
    freeCamera,
    debug,
    shot,
    loop,
    settings,
    params,
    seed,
    textures,
    palette,
    spawns: world.spawnPoints,
    spawnNames: world.spawnPoints.map((spawn) => spawn.name),
    /** Runs fixed steps without rendering: handy from the console and for checks. */
    advance(seconds = 1, step = FIXED_STEP) {
      let t = 0;
      while (t < seconds) {
        update(step);
        t += step;
      }
      return { simulated: t, hour: clock.hour };
    },
    goTo(name) {
      const spawn = world.spawn(name);
      camera.position.set(spawn.x, spawn.y + 1.7, spawn.z);
      freeCamera.enabled = true;
      freeCamera.setYawPitch(spawn.yaw, 0);
      return spawn;
    },
    setHour(hour) {
      clock.setHour(hour);
      clock.recompute(weather);
      return clock.hour;
    },
    buildSummary: () => world.summary(),
    /** An ASCII readback of the framebuffer, for checking shots without eyes. */
    preview: createFramebufferProbe(renderer, scene, camera),
    report: game.report,
  });

  window.__GAME = game;
  window.__SHOT_READY = false;
  window.__THREE = THREE;

  loop.start();
  setStatus(`${game.name} loading`);

  log.push(`seed=${seed}`);
  log.push(describeSettings(settings));
  log.push(world.summary());
  log.push(`shots: ${scenariosSummary()}`);
  if (scenario) log.push(`shot: ${scenario.name} — ${scenario.description}`);
  else log.push(`shot rig idle; scenarios available: ${shotNames().join(', ')}`);
  console.info(`[${game.name}] ${log.join('\n')}`);
  return game;
}

// Boot is wrapped so a failure anywhere still shows readable text instead of a black
// canvas: the overlay installed above is already listening.
const started = boot();
if (started) started.bootLog = 'ok';

export default game;
