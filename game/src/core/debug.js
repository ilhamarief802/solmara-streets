// Debug surfaces: the frame-time overlay (F3) and the one global error overlay. The error overlay
// is installed before anything else loads, so a syntax or boot fault in the game's own modules is
// visible in the page instead of only in a console nobody is watching.

const ERROR_MAX_LINES = 24;

/** Formats anything thrown into a few readable lines. */
function describe(reason) {
  if (reason instanceof Error) {
    const where = reason.stack ? reason.stack.split('\n').slice(0, 8).join('\n') : '';
    return `${reason.name}: ${reason.message}${where ? `\n${where}` : ''}`;
  }
  if (typeof reason === 'string') return reason;
  try {
    return JSON.stringify(reason);
  } catch {
    return String(reason);
  }
}

/**
 * Installs a window error + unhandledrejection handler that fills #error-overlay.
 * @returns {{report:(label:string, reason:unknown)=>void, errors:string[], root:HTMLElement|null}}
 */
export function installErrorOverlay() {
  const root = document.getElementById('error-overlay');
  const body = document.getElementById('error-body');
  const errors = [];
  let shown = 0;

  function report(label, reason) {
    const line = `[${label}] ${describe(reason)}`;
    errors.push(line);
    console.error(line);
    if (!root || !body) return;
    if (shown >= ERROR_MAX_LINES) return;
    shown++;
    root.hidden = false;
    body.textContent = errors.join('\n\n');
    root.dataset.errorCount = String(errors.length);
    // A shot in progress must never hang on a broken frame: release the rig, and say it failed.
    if (!window.__SHOT_READY) {
      window.__SHOT_ERROR = line;
      window.__SHOT_READY = true;
      document.title = 'shot:error';
    }
  }

  window.addEventListener('error', (event) => {
    if (event.error) report('error', event.error);
    else report('error', event.message || 'unknown error');
  });
  window.addEventListener('unhandledrejection', (event) => {
    report('unhandled rejection', event.reason);
  });

  window.__ERRORS = errors;
  return { report, errors, root };
}

/**
 * The frame-time overlay. Hidden until settings.showPerf, toggled with F3; shows fps, frame and
 * render milliseconds, draw calls, triangles and the world's loaded counts.
 */
export class PerfOverlay {
  constructor({ settings, loop, renderer }) {
    this.settings = settings;
    this.loop = loop;
    this.renderer = renderer;
    this.element = document.getElementById('perf');
    this.unsubscribe = settings.on('showPerf', (value) => this.setVisible(value));
    this.setVisible(Boolean(settings.get('showPerf')));
    this.world = null;
    this._accum = 0;
  }

  setVisible(visible) {
    if (this.element) this.element.hidden = !visible;
    this.visible = visible;
  }

  toggle() {
    const next = !this.settings.get('showPerf');
    this.settings.set('showPerf', next);
    return next;
  }

  /** Rebuilt at most eight times a second: text updates are not free. */
  update(dt) {
    if (!this.visible || !this.element) return;
    this._accum += dt;
    if (this._accum < 0.125) return;
    this._accum = 0;
    const s = this.loop.stats;
    const info = this.renderer.info.render;
    const w = this.world;
    const lines = [
      `fps       ${s.fps.toFixed(0).padStart(3)}   frame ${s.frameMs.toFixed(1)}ms`,
      `update    ${s.updateMs.toFixed(2)}ms  (${s.steps} step${s.steps === 1 ? '' : 's'})`,
      `render    ${s.renderMs.toFixed(2)}ms`,
      `draws     ${info.calls}   tris ${info.triangles.toLocaleString('en-US')}`,
    ];
    if (w) {
      lines.push(`objects   ${w.stats.objects}   colliders ${w.stats.colliders}`);
      lines.push(`roads     ${w.roadGraph.nodes.length} nodes  ${w.roadGraph.edges.length} edges`);
      lines.push(`props     ${w.stats.props}   buildings ${w.stats.buildings}`);
    }
    this.element.textContent = lines.join('\n');
  }

  dispose() {
    if (this.unsubscribe) this.unsubscribe();
  }
}

/** Small helper for the boot card: sets its status line, and hides it when the first frame is up. */
export function bootStatus(text) {
  const element = document.getElementById('boot-status');
  if (element) element.textContent = text;
}

export function hideBootCard() {
  const element = document.getElementById('boot');
  if (element && !element.classList.contains('is-gone')) element.classList.add('is-gone');
}
