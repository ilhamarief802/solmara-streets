// The frame loop: a fixed-step simulation (60 Hz) with one render per animation frame.
// A pause switch stops the simulation but keeps drawing, so the city can be inspected
// while frozen. Stats are kept for the perf overlay and for the shots' warm-up check.

import { clamp } from './math.js';

export class GameLoop {
  constructor({ fixedStep = 1 / 60, maxFrameSeconds = 0.1, maxUpdatesPerFrame = 5 } = {}) {
    this.fixedStep = fixedStep;
    this.maxFrameSeconds = maxFrameSeconds;
    this.maxUpdatesPerFrame = maxUpdatesPerFrame;
    this.accumulator = 0;
    this.paused = false;
    this.running = false;
    this.time = 0;
    this.frames = 0;
    this.updates = 0;
    this.fps = 60;
    this.frameMs = 16.7;
    this._smoothedMs = 16.7;
    this._last = 0;
    this._raf = 0;
    this._secondClock = 0;
    this._tick = this._tick.bind(this);
    this.onUpdate = null;
    this.onRender = null;
    this.onSecond = null;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this._last = performance.now();
    this._raf = requestAnimationFrame(this._tick);
  }

  stop() {
    this.running = false;
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = 0;
  }

  setPaused(paused) {
    this.paused = Boolean(paused);
    // Dropping the backlog keeps the first frame after a resume from double-stepping.
    this.accumulator = 0;
  }

  togglePaused() {
    this.setPaused(!this.paused);
    return this.paused;
  }

  _tick(now) {
    if (!this.running) return;
    this._raf = requestAnimationFrame(this._tick);
    const raw = (now - this._last) / 1000;
    this._last = now;
    const frameSeconds = clamp(raw, 0.0005, this.maxFrameSeconds);
    this.frameMs = frameSeconds * 1000;
    this._smoothedMs += (this.frameMs - this._smoothedMs) * 0.08;
    this.fps = 1000 / Math.max(1e-3, this._smoothedMs);
    this.frames += 1;

    if (!this.paused) this._simulate(frameSeconds);
    if (this.onRender) this.onRender(frameSeconds, this.time);

    this._secondClock += frameSeconds;
    if (this._secondClock >= 1) {
      this._secondClock %= 1;
      if (this.onSecond) this.onSecond(this.fps);
    }
  }

  _simulate(frameSeconds) {
    this.accumulator += frameSeconds;
    let steps = 0;
    while (this.accumulator >= this.fixedStep && steps < this.maxUpdatesPerFrame) {
      this.time += this.fixedStep;
      this.updates += 1;
      this.accumulator -= this.fixedStep;
      steps += 1;
      if (this.onUpdate) this.onUpdate(this.fixedStep, this.time);
    }
    // A long stall (a backgrounded tab) drops its backlog instead of spiralling.
    if (steps === this.maxUpdatesPerFrame) this.accumulator = 0;
  }
}

/** Resolves on the browser's next animation frame. Used by the shot rig. */
export function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(resolve));
}

/** Waits for `count` animation frames, optionally with a callback between them. */
export async function frames(count, between = null) {
  for (let i = 0; i < count; i += 1) {
    await nextFrame();
    if (between) between(i);
  }
}
