// The frame loop: a fixed simulation step (60 Hz) with an accumulator, and a render every frame
// with the interpolation alpha between the last two steps. A pause switch keeps rendering (so a
// paused game still shows the city) while freezing the simulation, which is what the shot rig and
// the later pause menu both need.

export class GameLoop {
  /**
   * @param {object} options
   * @param {(step:number, stepIndex:number)=>void} options.update fixed-step simulation
   * @param {(alpha:number, frameDt:number)=>void} options.render once per animation frame
   * @param {number} [options.step] simulation step in seconds
   * @param {number} [options.maxSteps] most steps a single frame may run (spiral-of-death guard)
   */
  constructor({ update, render, step = 1 / 60, maxSteps = 5 }) {
    this.update = update;
    this.render = render;
    this.step = step;
    this.maxSteps = maxSteps;
    this.paused = false;
    this.running = false;
    this.accumulator = 0;
    this.simTime = 0;
    this.frameIndex = 0;
    this.stats = {
      fps: 0,
      frameMs: 0,
      updateMs: 0,
      renderMs: 0,
      steps: 0,
      simTime: 0,
      frames: 0,
    };
    this._last = 0;
    this._raf = 0;
    this._fpsWindow = [];
    this._tick = this._tick.bind(this);
  }

  start() {
    if (this.running) return this;
    this.running = true;
    this._last = performance.now();
    this._raf = requestAnimationFrame(this._tick);
    return this;
  }

  stop() {
    this.running = false;
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = 0;
  }

  setPaused(paused) {
    this.paused = Boolean(paused);
    // Dropping the accumulator stops a long pause from becoming a burst of catch-up steps.
    this.accumulator = 0;
  }

  togglePaused() {
    this.setPaused(!this.paused);
    return this.paused;
  }

  _tick(now) {
    if (!this.running) return;
    this._raf = requestAnimationFrame(this._tick);
    const frameStart = now;
    let frameDt = (now - this._last) / 1000;
    this._last = now;
    if (frameDt > 0.25) frameDt = 0.25;
    if (frameDt <= 0) frameDt = 1 / 60;
    this.frameIndex++;
    this.stats.frames++;
    this.stats.frameMs = frameDt * 1000;
    this._fpsWindow.push(frameDt);
    if (this._fpsWindow.length > 45) this._fpsWindow.shift();
    let sum = 0;
    for (const dt of this._fpsWindow) sum += dt;
    this.stats.fps = sum > 0 ? this._fpsWindow.length / sum : 0;

    let steps = 0;
    const updateStart = performance.now();
    if (!this.paused) {
      this.accumulator += frameDt;
      while (this.accumulator >= this.step && steps < this.maxSteps) {
        this.update(this.step, this.simTime);
        this.simTime += this.step;
        this.accumulator -= this.step;
        steps++;
      }
      if (steps === this.maxSteps) this.accumulator = 0;
    }
    this.stats.updateMs = performance.now() - updateStart;
    this.stats.steps = steps;
    this.stats.simTime = this.simTime;

    const alpha = this.paused ? 1 : this.accumulator / this.step;
    const renderStart = performance.now();
    this.render(alpha, frameDt);
    this.stats.renderMs = performance.now() - renderStart;

    if (typeof this.onFrame === 'function') this.onFrame(frameStart, this.stats);
  }
}

/** Waits for the next real animation frame: one draw worth of progress for warm-up loops. */
export function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}
