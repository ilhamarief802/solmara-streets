// Weather and wind. Solmara is coastal: most days are clear and hazy, some are overcast,
// and the sea breeze turns through the afternoon. The weather owns a small state machine
// that changes on its own clock, and the wind vector drives the palms, the flags and the
// water shader's swell direction.

import { Random } from './rng.js';
import { clamp, lerp, wrap } from './math.js';
import { bus } from './events.js';

export const WEATHER_TYPES = {
  clear: {
    id: 'clear',
    label: 'Clear',
    fogMultiplier: 0.85,
    sunMultiplier: 1,
    haze: 0.15,
    cloud: 0.08,
    exposure: 1,
  },
  hazy: {
    id: 'hazy',
    label: 'Coastal haze',
    fogMultiplier: 1.15,
    sunMultiplier: 0.82,
    haze: 0.55,
    cloud: 0.25,
    exposure: 1.02,
  },
  overcast: {
    id: 'overcast',
    label: 'Overcast',
    fogMultiplier: 1.6,
    sunMultiplier: 0.45,
    haze: 0.7,
    cloud: 0.85,
    exposure: 1.06,
  },
  rain: {
    id: 'rain',
    label: 'Rain',
    fogMultiplier: 1.45,
    sunMultiplier: 0.4,
    haze: 0.7,
    cloud: 0.92,
    exposure: 0.96,
  },
  storm: {
    id: 'storm',
    label: 'Squall',
    fogMultiplier: 1.9,
    sunMultiplier: 0.3,
    haze: 0.85,
    cloud: 1,
    exposure: 1.08,
  },
};

// Weighted by repetition: most rolls land on clear, haze is common, rain is rare.
const ORDER = ['clear', 'clear', 'clear', 'hazy', 'hazy', 'overcast', 'rain'];

const TRANSITION_SECONDS = 14;

export class Weather {
  constructor(seed = 'solmara-weather') {
    this.random = new Random(seed);
    this.current = WEATHER_TYPES.clear;
    this.target = WEATHER_TYPES.clear;
    this.blend = 1;
    this.transitionTime = 0;
    this.nextChange = this.random.range(80, 160);
    this.elapsed = 0;
    this.wind = { x: 0.7, z: -0.3, speed: 3.4, gust: 0 };
    this.windAngle = -0.4;
    this.fogMultiplier = this.current.fogMultiplier;
    this.sunMultiplier = this.current.sunMultiplier;
    this.haze = this.current.haze;
    this.cloud = this.current.cloud;
    this.exposureBias = this.current.exposure;
  }

  /** Switches immediately, with no fade. Shots use this before their warm-up. */
  set(typeId) {
    // An unknown id falls back to clear rather than leaving the weather undefined.
    const type = WEATHER_TYPES[typeId] ?? WEATHER_TYPES.clear;
    this.current = type;
    this.target = type;
    this.blend = 1;
    this.transitionTime = 0;
    this._apply();
    bus.emit('weather:change', { id: type.id, label: type.label });
    return type;
  }

  setImmediate(typeId) {
    return this.set(typeId);
  }

  update(dt) {
    this.elapsed += dt;
    this.nextChange -= dt;
    if (this.nextChange <= 0 && this.blend >= 1) {
      // Never pick the type already showing: a no-op transition would read as a flicker.
      const options = ORDER.filter((id) => id !== this.current.id);
      this.target = WEATHER_TYPES[this.random.pick(options)];
      this.transitionTime = 0;
      this.blend = 0;
      this.nextChange = this.random.range(90, 210);
      bus.emit('weather:changing', { from: this.current.id, to: this.target.id });
    }

    if (this.blend < 1) {
      this.transitionTime += dt;
      this.blend = clamp(this.transitionTime / TRANSITION_SECONDS, 0, 1);
      if (this.blend >= 1) {
        this.current = this.target;
        bus.emit('weather:change', { id: this.current.id, label: this.current.label });
      }
      this._apply();
    }

    // The sea breeze turns slowly and gusts on a short cycle.
    this.windAngle = wrap(this.windAngle + Math.sin(this.elapsed * 0.021) * dt * 0.02, Math.PI * 2);
    const baseSpeed = 2.6 + this.cloud * 3.4;
    const gust = Math.sin(this.elapsed * 0.7) * 0.5 + Math.sin(this.elapsed * 1.9 + 1.3) * 0.3;
    this.wind.gust = lerp(this.wind.gust, gust, 1 - Math.exp(-2 * dt));
    this.wind.speed = clamp(baseSpeed + this.wind.gust, 0.4, 12);
    this.wind.x = Math.cos(this.windAngle) * this.wind.speed;
    this.wind.z = Math.sin(this.windAngle) * this.wind.speed;
  }

  /** Blends the derived multipliers from `current` towards `target` by `blend`. */
  _apply() {
    const t = this.blend;
    const a = this.current;
    const b = this.target;
    this.fogMultiplier = lerp(a.fogMultiplier, b.fogMultiplier, t);
    this.sunMultiplier = lerp(a.sunMultiplier, b.sunMultiplier, t);
    this.haze = lerp(a.haze, b.haze, t);
    this.cloud = lerp(a.cloud, b.cloud, t);
    this.exposureBias = lerp(a.exposure, b.exposure, t);
  }

  get label() {
    return this.current.label;
  }
}

export function createWeather(seed) {
  return new Weather(`${seed}:weather`);
}

export { ORDER as WEATHER_ORDER };
