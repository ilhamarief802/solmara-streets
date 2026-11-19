// Visible failure and cheap instrumentation. The error overlay is installed before any
// other module does work, so a bad import or a throw during world generation is shown
// on screen instead of leaving a black canvas. The perf overlay is the F3 readout.

import { bus } from './events.js';

/** Installs the one global error surface. Idempotent; returns a disposer. */
export function installErrorOverlay(doc = document) {
  const root = doc.getElementById('error-overlay');
  const body = doc.getElementById('error-body');
  const errors = [];
  // The browser check reads this array, so a swallowed fault is still countable.
  window.__SOLMARA_ERRORS = errors;

  const show = (kind, detail) => {
    errors.push({ kind, detail, at: Date.now() });
    if (body) body.textContent = detail;
    if (root) root.hidden = false;
    if (doc.body) doc.body.classList.add('has-error');
    console.error(`[solmara] ${kind}: ${detail}`);
  };

  const onError = (event) => {
    const detail = event.error?.stack ?? `${event.message} (${event.filename}:${event.lineno}:${event.colno})`;
    show('error', detail);
  };

  const onRejection = (event) => {
    show('unhandled rejection', event.reason?.stack ?? String(event.reason));
  };

  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);

  return () => {
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onRejection);
  };
}

/** A compact frame readout: fps, frame time, draw calls, triangles. */
export class PerfOverlay {
  constructor(element = document.getElementById('perf'), renderer = null) {
    this.el = element;
    this.renderer = renderer;
    this.visible = false;
    this.accumulator = 0;
    this.frames = 0;
    this.worstMs = 0;
    this.averageMs = 16.7;
    if (this.el) this.el.hidden = true;
  }

  setRenderer(renderer) {
    this.renderer = renderer;
  }

  toggle(force = null) {
    this.visible = force ?? !this.visible;
    if (this.el) this.el.hidden = !this.visible;
    return this.visible;
  }

  update(dt, extra = {}) {
    this.frames += 1;
    this.accumulator += dt;
    this.worstMs = Math.max(this.worstMs, dt * 1000);
    this.averageMs += (dt * 1000 - this.averageMs) * 0.06;
    // Four updates a second is enough to read and cheap enough to leave on.
    if (!this.visible || !this.el || this.accumulator < 0.25) return;
    const fps = this.frames / this.accumulator;
    const info = this.renderer?.info;
    const lines = [
      `fps ${fps.toFixed(0)}   frame ${this.averageMs.toFixed(1)} ms (peak ${this.worstMs.toFixed(1)})`,
      `draws ${info?.render?.calls ?? 0}   tris ${(info?.render?.triangles ?? 0).toLocaleString('en-US')}`,
      `geometries ${info?.memory?.geometries ?? 0}   textures ${info?.memory?.textures ?? 0}`,
    ];
    for (const key of Object.keys(extra)) lines.push(`${key}: ${extra[key]}`);
    this.el.textContent = lines.join('\n');
    this.accumulator = 0;
    this.frames = 0;
    this.worstMs = 0;
  }
}

export function bootStatus(text) {
  const el = document.getElementById('boot-status');
  if (el) el.textContent = text;
  bus.emit('boot:status', { text });
}

export function hideBootCard() {
  const boot = document.getElementById('boot');
  if (!boot) return;
  boot.classList.add('is-hidden');
  // `hidden` only after the fade, so the card cannot flash back into the layout.
  setTimeout(() => {
    boot.hidden = true;
  }, 900);
}

/** A plain text block in the corner, for the debug camera and shot labels. */
export class DebugReadout {
  constructor(element = document.getElementById('debug-readout')) {
    this.el = element;
  }

  set(text) {
    if (!this.el) return;
    this.el.textContent = text;
    this.el.hidden = !text;
  }
}
