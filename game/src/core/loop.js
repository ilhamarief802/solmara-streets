// The frame pump: a fixed step simulation (so physics and traffic lights advance
// identically on any machine) with a variable rate render that gets the leftover
// fraction as its interpolation alpha. The pause switch freezes time while the
// renderer keeps drawing, which is what the shot rig needs while it warms up.

export const FIXED_STEP = 1 / 60;

export class Loop {
  constructor(options = {}) {
    this.update = options.update ?? (() => {});
    this.render = options.render ?? (() => {});
    this.step = options.step ?? FIXED_STEP;
    this.maxSubSteps = options.maxSubSteps ?? 6;
    this.maxFrameTime = options.maxFrameTime ?? 0.25;
    this.timeScale = options.timeScale ?? 1;
    this.onStats = options.onStats ?? null;

    this.running = false;
    this.paused = false;
    this.frame = 0;
    this.elapsed = 0;
    this.simulated = 0;
    this.accumulator = 0;
    this.lastTime = 0;
    this.alpha = 0;
    this.fps = 0;
    this.frameMs = 0;
    this.slowFrames = 0;
    this._raf = 0;
    this._boundTick = (time) => this.tick(time);
  }

  start() {
    if (this.running) return this;
    this.running = true;
    this.lastTime = 0;
    this.accumulator = 0;
    this._raf = requestAnimationFrame(this._boundTick);
    return this;
  }

  stop() {
    this.running = false;
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = 0;
    return this;
  }

  setPaused(paused) {
    this.paused = paused === true;
    return this.paused;
  }

  togglePause() {
    return this.setPaused(!this.paused);
  }

  /** Advances the simulation exactly once, for inspecting a single frame. */
  stepOnce() {
    this.elapsed += this.step;
    this.simulated += this.step;
    this.update(this.step, this.elapsed);
    this.accumulator = 0;
  }

  tick(now) {
    if (!this.running) return;
    this._raf = requestAnimationFrame(this._boundTick);

    const seconds = now / 1000;
    if (this.lastTime === 0) this.lastTime = seconds;
    let frameTime = seconds - this.lastTime;
    this.lastTime = seconds;
    if (!Number.isFinite(frameTime) || frameTime < 0) frameTime = this.step;
    if (frameTime > this.maxFrameTime) {
      // A long stall (tab switch, shader compile) must not become a burst of steps.
      frameTime = this.maxFrameTime;
      this.slowFrames += 1;
    }

    this.frame += 1;
    this.fps = frameTime > 0 ? 1 / frameTime : 0;
    this.frameMs = frameTime * 1000;

    const started = performance.now();
    if (!this.paused) {
      this.accumulator += frameTime * this.timeScale;
      let steps = 0;
      while (this.accumulator >= this.step && steps < this.maxSubSteps) {
        this.accumulator -= this.step;
        this.simulated += this.step;
        this.update(this.step, this.simulated);
        steps += 1;
      }
      if (steps >= this.maxSubSteps) {
        // Give up on the backlog rather than spiral: time is only ever lost.
        this.accumulator = 0;
      }
      this.elapsed += frameTime * this.timeScale;
    }
    this.alpha = this.accumulator / this.step;
    const updateMs = performance.now() - started;

    const renderStarted = performance.now();
    this.render(this.alpha, frameTime);
    const renderMs = performance.now() - renderStarted;

    if (this.onStats) {
      this.onStats({
        fps: this.fps,
        frameMs: this.frameMs,
        updateMs,
        renderMs,
        frame: this.frame,
        elapsed: this.elapsed,
      });
    }
  }
}

export function createLoop(options) {
  return new Loop(options);
}
