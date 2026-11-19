// The shot rig. A shot is a deterministic scenario: it sets the clock and weather, poses a
// camera along a short keyframe path, warms up, then raises window.__SHOT_READY and puts
// its short name in the title, so a capture script knows the frame is stable. With no
// ?shot= parameter the rig stays idle and the game boots normally.

import { Random } from '../core/rng.js';
import { easeInOutCubic, clamp01 } from '../core/math.js';
import { hideBootCard } from '../core/debug.js';
import cover from './cover.js';
import night from './night.js';
import drive from './drive.js';
import street from './street.js';
import chase from './chase.js';
import mission from './mission.js';
import shootout from './shootout.js';

export const SHOTS = { cover, night, drive, street, chase, mission, shootout };
/** Every registered shot name, in registry order, for the menus and the capture tools. */
export const SHOT_NAMES = Object.keys(SHOTS);

/** Reads ?shot=, ?seed= and ?capture=1 from a query string. */
export function parseShotParams(search = typeof location === 'undefined' ? '' : location.search) {
  const params = new URLSearchParams(search);
  const seedValue = params.get('seed') ?? '1';
  // Numeric seeds stay numbers, so a scenario can do arithmetic on them.
  const seed = /^-?\d+$/.test(seedValue) ? Number(seedValue) : seedValue;
  return { name: params.get('shot'), seed, capture: params.get('capture') === '1' };
}

export class ShotRig {
  constructor(game) {
    this.game = game;
    this.active = null;
    this.name = null;
    this.seed = 1;
    this.elapsed = 0;
    this.frames = 0;
    this.ready = false;
    this.random = new Random('shot');
    // A capture is only stable once the camera path has settled and a few frames are drawn.
    this.warmupSeconds = 2.2;
    this.warmupFrames = 6;
    this.startedAt = 0;
    /** A capture run hides the pointer and freezes the frame once warm. */
    this.capture = false;
    /** Exposure multiplier a scenario may set (dusk streets need a stop more light). */
    this.exposure = 1;
  }

  /** Starts a named shot. Returns false when the name is unknown. */
  start(name, seed = 1, { capture = false } = {}) {
    const scenario = SHOTS[name];
    if (!scenario) return false;

    this.name = name;
    this.seed = seed;
    this.capture = Boolean(capture);
    this.elapsed = 0;
    this.frames = 0;
    this.ready = false;
    this.startedAt = performance.now();
    this.active = scenario;
    this.exposure = 1;
    this.random = new Random(`${name}:${seed}:rig`);
    window.__SHOT_READY = false;
    document.title = `Solmara Streets · ${name}`;
    document.body.dataset.shot = name;
    document.body.classList.toggle('is-capture', this.capture);

    if (this.capture) {
      // No pointer, no menu, no focus ring: the page is a viewfinder.
      document.body.style.cursor = 'none';
      document.documentElement.style.cursor = 'none';
      window.__SHOT_CAPTURE = true;
    }

    this.context = {
      game: this.game,
      seed,
      random: this.random,
      clock: this.game.clock,
      weather: this.game.weather,
      camera: this.game.camera,
      world: this.game.world,
      renderer: this.game.renderer,
      rig: this,
    };
    // A scenario poses the world once at t=0, then again on every apply().
    scenario.setup(this.context);
    this.apply(0);
    hideBootCard();
    return true;
  }

  /** Poses the camera at a time (seconds) into the shot. */
  apply(elapsed) {
    if (this.active) this.active.update(this.context, elapsed);
  }

  /** Called once per rendered frame. Raises __SHOT_READY when warm. */
  update() {
    if (!this.active || this.ready) return;

    // Wall time, not the simulation step: a slow software renderer must still reach the end
    // of the warm-up, and the camera path must not depend on the frame rate.
    this.elapsed = (performance.now() - this.startedAt) / 1000;
    this.frames += 1;
    this.apply(Math.min(this.elapsed, this.warmupSeconds + 1));
    if (this.elapsed < this.warmupSeconds || this.frames < this.warmupFrames) return;

    // Hold the final pose and announce it.
    this.apply(this.warmupSeconds + 1);
    this.ready = true;
    window.__SHOT_READY = true;
    window.__SHOT_HOLD = this.capture;
    window.__SHOT_NAME = this.name;
    window.__SHOT_SEED = this.seed;
    document.title = `${this.active.short ?? this.name} · Solmara`;

    if (this.capture) {
      // The warm-up is over: freeze the simulation, so the frame the shutter sees is the
      // frame every other run sees. The loop keeps rendering, so the HUD stays live.
      this.game.loop?.setPaused?.(true);
      this.game.input.enabled = false;
    }
    this.game.bus?.emit?.('shot:ready', { name: this.name, seed: this.seed });
  }

  /** A plain description for the debug readout and the dossier. */
  describe() {
    if (!this.active) return 'free camera';
    return `${this.name} (seed ${this.seed}) · ${this.active.description ?? ''}`;
  }
}

/** Applies a two-point camera move with a look target, clamped to the shot's length. */
export function cameraMove(ctx, elapsed, from, to, lookFrom, lookTo, { duration = 8, fov = 60 } = {}) {
  const t = easeInOutCubic(clamp01(elapsed / duration));
  const camera = ctx.camera;
  camera.position.set(
    from.x + (to.x - from.x) * t,
    from.y + (to.y - from.y) * t,
    from.z + (to.z - from.z) * t,
  );
  camera.lookAt(
    lookFrom.x + (lookTo.x - lookFrom.x) * t,
    lookFrom.y + (lookTo.y - lookFrom.y) * t,
    lookFrom.z + (lookTo.z - lookFrom.z) * t,
  );
  // The lens is fixed for the whole move, so the projection is only rebuilt when it changes.
  if (camera.fov !== fov) {
    camera.fov = fov;
    camera.updateProjectionMatrix();
  }
}
