// Diagnostics: one global error overlay so a broken frame is visible instead of a
// black canvas, and a frame time overlay you can toggle with F3 while exploring.

const MAX_REPORTED = 12;

/**
 * Adopts the early overlay element from index.html and keeps it up to date for the
 * rest of the session. Returns a small controller the game exposes for its own
 * non fatal warnings.
 */
export function installErrorOverlay() {
  const element = document.getElementById('error-overlay');
  const seen = new Set();
  const messages = [];

  const render = () => {
    if (!element) return;
    element.hidden = messages.length === 0;
    element.textContent = '';
    for (const entry of messages) {
      const pre = document.createElement('pre');
      pre.textContent = entry.label ? `[${entry.label}] ${entry.message}` : entry.message;
      element.appendChild(pre);
    }
  };

  const report = (message, label = 'error') => {
    const text = String(message ?? 'unknown error');
    const key = `${label}:${text}`;
    if (seen.has(key)) return false;
    seen.add(key);
    messages.push({ label, message: text });
    while (messages.length > MAX_REPORTED) {
      const dropped = messages.shift();
      seen.delete(`${dropped.label}:${dropped.message}`);
    }
    render();
    return true;
  };

  // Anything the early inline handler caught before this module ran.
  const early = window.__EARLY_ERRORS;
  if (Array.isArray(early)) {
    for (const entry of early) report(entry, 'boot');
    early.length = 0;
  }

  window.addEventListener('error', (event) => {
    if (!event) return;
    const where = event.filename ? ` at ${event.filename}:${event.lineno ?? 0}:${event.colno ?? 0}` : '';
    report(`${event.message ?? 'window error'}${where}`, 'error');
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event?.reason;
    const text = (reason && (reason.stack || reason.message)) || String(reason);
    report(text, 'promise');
  });

  const controller = {
    element,
    messages,
    report,
    warn: (message) => report(message, 'warn'),
    clear: () => {
      messages.length = 0;
      seen.clear();
      render();
    },
  };
  window.__REPORT_ERROR = controller.report;
  return controller;
}

export class DebugOverlay {
  constructor(options = {}) {
    this.element = document.getElementById('debug-overlay');
    this.settings = options.settings ?? null;
    this.loop = options.loop ?? null;
    this.clock = options.clock ?? null;
    this.weather = options.weather ?? null;
    this.renderer = options.renderer ?? null;
    this.camera = options.camera ?? null;
    this.world = options.world ?? null;
    this.shot = null;
    this.visible = options.visible === true;
    this.accumulator = 0;
    this.interval = options.interval ?? 0.25;
    this.fpsSamples = [];
    this.stats = { fps: 0, frameMs: 0, updateMs: 0, renderMs: 0, frame: 0, elapsed: 0 };
    this.extraLines = [];
    this.applyVisibility();
  }

  setVisible(visible) {
    this.visible = visible === true;
    this.applyVisibility();
    return this.visible;
  }

  toggle() {
    return this.setVisible(!this.visible);
  }

  applyVisibility() {
    if (!this.element) return;
    this.element.hidden = !this.visible;
    if (this.visible) this.accumulator = this.interval;
  }

  setShotInfo(text) {
    this.shot = text;
  }

  addLine(textOrFn) {
    this.extraLines.push(textOrFn);
    return this;
  }

  /** Called every rendered frame from the loop's stats hook. */
  update(stats) {
    if (stats) this.stats = stats;
    if (!this.visible || !this.element) return;
    this.fpsSamples.push(this.stats.fps);
    if (this.fpsSamples.length > 30) this.fpsSamples.shift();
    this.accumulator += this.stats.frameMs / 1000;
    if (this.accumulator < this.interval) return;
    this.accumulator = 0;
    this.element.textContent = this.compose();
  }

  compose() {
    const average = this.fpsSamples.length
      ? this.fpsSamples.reduce((sum, value) => sum + value, 0) / this.fpsSamples.length
      : 0;
    const camera = this.camera;
    const info = this.renderer?.info;
    const lines = [];
    lines.push(`Solmara Streets  ${average.toFixed(0).padStart(3)} fps`);
    lines.push(`frame ${this.stats.frameMs.toFixed(1)}ms  update ${this.stats.updateMs.toFixed(1)}  render ${this.stats.renderMs.toFixed(1)}`);
    if (info) {
      lines.push(`tris ${info.render.triangles.toLocaleString()}  calls ${info.render.calls}  geo ${info.memory.geometries}  tex ${info.memory.textures}`);
    }
    if (camera) {
      lines.push(`cam ${camera.position.x.toFixed(0)}, ${camera.position.y.toFixed(0)}, ${camera.position.z.toFixed(0)}  yaw ${(THREE.MathUtils.radToDeg(camera.rotation.y)).toFixed(0)}deg`);
      if (this.world?.districtAt) {
        const district = this.world.districtAt(camera.position.x, camera.position.z);
        lines.push(`district ${district ? district.name : 'offshore'}`);
      }
    }
    if (this.clock) {
      lines.push(`clock ${this.clock.format()}  ${this.clock.phase}  sun ${this.clock.sunElevationDegrees.toFixed(0)}deg`);
    }
    if (this.weather) lines.push(`weather ${this.weather.describe()}`);
    if (this.shot) lines.push(`shot ${this.shot}`);
    for (const line of this.extraLines) lines.push(typeof line === 'function' ? line() : line);
    lines.push('WASD move  Space/C up-down  Shift fast  click to look  F3 hide');
    return lines.join('\n');
  }
}

export function createDebug(options) {
  return new DebugOverlay(options);
}
