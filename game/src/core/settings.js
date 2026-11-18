// Settings: the handful of knobs the game, the shot rig and the later menus share, with defaults,
// a typed get/set, and change notification. Kept deliberately tiny and plain: the game reads
// these every frame, so lookups must be cheap and allocation-free.

const DEFAULTS = {
  /** Renderer */
  antialias: true,
  pixelRatioCap: 1.5,
  /** Scene */
  fogNear: 90,
  fogFar: 900,
  maxDrawDistance: 1100,
  /** World */
  citySeed: 'solmara-01',
  buildingDetail: 1,
  streetProps: 1,
  /** Play */
  invertY: false,
  mouseSensitivity: 0.0024,
  cameraFov: 62,
  cameraDistance: 5.4,
  /** Debug */
  showPerf: false,
  showColliders: false,
  /** Filled in by the renderer on resize. */
  viewport: { width: 1280, height: 720, ratio: 1, aspect: 16 / 9 },
};

export class Settings {
  constructor(overrides = {}) {
    this.values = { ...DEFAULTS, ...overrides };
    this.listeners = new Map();
    this.changed = new Set();
  }

  get(key) {
    return this.values[key];
  }

  set(key, value) {
    if (this.values[key] === value) return;
    this.values[key] = value;
    this.changed.add(key);
    const set = this.listeners.get(key);
    if (set) for (const handler of Array.from(set)) handler(value, key);
  }

  /** Subscribes to one key; returns an unsubscribe. */
  on(key, handler) {
    let set = this.listeners.get(key);
    if (!set) {
      set = new Set();
      this.listeners.set(key, set);
    }
    set.add(handler);
    return () => set.delete(handler);
  }

  /** The keys that changed since the last call, then they clear. */
  takeChanged() {
    const out = Array.from(this.changed);
    this.changed.clear();
    return out;
  }

  toJSON() {
    return { ...this.values };
  }
}

/** The game's one settings object. */
export const settings = new Settings();
