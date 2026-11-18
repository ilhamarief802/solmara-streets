// Weather and wind. Weather is a slow state machine over four coastal conditions; wind is a
// direction with a gusting speed. Both are read by the sky (cloud haze), the water (swell), the
// palms (lean) and the later tyre smoke. Deterministic: it advances from the seed and dt only.

import { clamp, damp, lerp } from './math.js';
import { Random } from './rng.js';

/** Each condition changes fog, haze colour, wind and how much sun reaches the ground. */
export const WEATHER_TYPES = {
  clear: {
    label: 'Clear',
    fogScale: 1.0,
    haze: 0.0,
    sunScale: 1.0,
    windBase: 2.2,
    gust: 1.8,
    cloud: 0.12,
  },
  seabreeze: {
    label: 'Sea breeze',
    fogScale: 1.16,
    haze: 0.22,
    sunScale: 0.96,
    windBase: 5.5,
    gust: 3.4,
    cloud: 0.34,
  },
  overcast: {
    label: 'Overcast',
    fogScale: 1.42,
    haze: 0.5,
    sunScale: 0.66,
    windBase: 4.1,
    gust: 2.6,
    cloud: 0.78,
  },
  squall: {
    label: 'Squall',
    fogScale: 1.9,
    haze: 0.72,
    sunScale: 0.4,
    windBase: 9.0,
    gust: 6.0,
    cloud: 0.92,
  },
};

const ORDER = ['clear', 'seabreeze', 'overcast', 'squall'];
const TRANSITIONS = {
  clear: [['seabreeze', 0.62], ['overcast', 0.3], ['squall', 0.08]],
  seabreeze: [['clear', 0.5], ['overcast', 0.4], ['squall', 0.1]],
  overcast: [['seabreeze', 0.44], ['clear', 0.3], ['squall', 0.26]],
  squall: [['overcast', 0.62], ['seabreeze', 0.3], ['clear', 0.08]],
};

export class Weather {
  /** @param {number|string} seed */
  constructor(seed = 7) {
    this.random = new Random(`weather:${seed}`);
    this.type = 'clear';
    this.previousType = 'clear';
    this.blend = 1;
    this.hold = this.random.range(90, 210);
    this.windAngle = this.random.range(0, Math.PI * 2);
    this.windTarget = this.windAngle;
    this.windSpeed = WEATHER_TYPES.clear.windBase;
    this.gust = 0;
    this.gustPhase = this.random.range(0, Math.PI * 2);
    this.values = this._values();
  }

  /** Current condition id, for the HUD and the shot rig. */
  get label() {
    return WEATHER_TYPES[this.type].label;
  }

  /** Forces a condition, for shots and debugging. */
  set(type) {
    if (!WEATHER_TYPES[type]) return;
    this.previousType = type;
    this.type = type;
    this.blend = 1;
    this.hold = 120;
    this.values = this._values();
  }

  _values() {
    const a = WEATHER_TYPES[this.previousType];
    const b = WEATHER_TYPES[this.type];
    const t = clamp(this.blend, 0, 1);
    return {
      fogScale: lerp(a.fogScale, b.fogScale, t),
      haze: lerp(a.haze, b.haze, t),
      sunScale: lerp(a.sunScale, b.sunScale, t),
      cloud: lerp(a.cloud, b.cloud, t),
      windBase: lerp(a.windBase, b.windBase, t),
      gustAmount: lerp(a.gust, b.gust, t),
      label: t > 0.5 ? b.label : a.label,
    };
  }

  /** Advances the state machine. */
  update(dt) {
    this.hold -= dt;
    if (this.hold <= 0 && this.blend >= 1) {
      const table = TRANSITIONS[this.type] ?? TRANSITIONS.clear;
      let roll = this.random.float();
      let next = 'clear';
      for (const [id, chance] of table) {
        roll -= chance;
        if (roll <= 0) {
          next = id;
          break;
        }
      }
      this.previousType = this.type;
      this.type = next;
      this.blend = 0;
      this.hold = this.random.range(110, 260);
      this.windTarget = this.random.range(0, Math.PI * 2);
    }
    if (this.blend < 1) this.blend = Math.min(1, this.blend + dt / 22);

    this.windAngle += Math.sin(this.windAngle) * 0.0001 + (this.windTarget - this.windAngle) * dt * 0.01;
    this.gustPhase += dt * 0.9;
    const v = this._values();
    const gustWave = (Math.sin(this.gustPhase) * 0.5 + Math.sin(this.gustPhase * 2.7 + 1.3) * 0.5) * 0.5 + 0.5;
    this.gust = gustWave * v.gustAmount;
    this.windSpeed = damp(this.windSpeed, v.windBase + this.gust, 1.6, dt);
    this.values = v;
  }

  /** Wind as a unit direction on the ground plane. */
  get windVector() {
    return [Math.cos(this.windAngle), Math.sin(this.windAngle)];
  }

  /** 0..1 how rough the sea is, from wind and rain. */
  get seaRoughness() {
    return clamp((this.windSpeed - 1) / 13, 0.05, 1);
  }
}

/** The one weather state the game shares; main.js hands its seed in. */
export function createWeather(seed) {
  return new Weather(seed);
}

export { ORDER };
