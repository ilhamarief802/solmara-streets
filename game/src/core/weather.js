// Weather and wind: a small state machine over five presets that eases cloudiness,
// haze and wetness, and drifts a wind vector with gusts. The water plane's ripple
// speed, the amount of fog and the sky palette all read from this.

import { damp, clamp01, TAU } from './math.js';

export const WEATHER_KINDS = [
  { id: 'clear', label: 'Clear', cloudiness: 0.06, haze: 0.04, wetness: 0, wind: 3.5 },
  { id: 'hazy', label: 'Hazy', cloudiness: 0.22, haze: 0.66, wetness: 0, wind: 2.2 },
  { id: 'breezy', label: 'Breezy', cloudiness: 0.34, haze: 0.08, wetness: 0, wind: 8.5 },
  { id: 'overcast', label: 'Overcast', cloudiness: 0.82, haze: 0.3, wetness: 0.25, wind: 6 },
  { id: 'storm', label: 'Storm', cloudiness: 0.97, haze: 0.42, wetness: 0.9, wind: 14 },
];

export function weatherKind(id) {
  return WEATHER_KINDS.find((kind) => kind.id === id) ?? WEATHER_KINDS[0];
}

export class Weather {
  constructor(options = {}) {
    this.order = options.order ?? WEATHER_KINDS.map((kind) => kind.id);
    this.kind = options.kind ?? 'clear';
    this.autoCycle = options.autoCycle ?? false;
    this.cycleSeconds = options.cycleSeconds ?? 150;
    this.transition = options.transition ?? 0.45;
    this.elapsed = 0;
    this.timeInKind = 0;
    this.gust = 0;

    const start = weatherKind(this.kind);
    this.cloudiness = start.cloudiness;
    this.haze = start.haze;
    this.wetness = start.wetness;
    this.windStrength = start.wind;
    // Wind blows roughly from the sea (+Z) towards the city, with a random lean.
    this.windDirection = options.windDirection ?? -0.35;
    this.wind = { x: 0, z: 0 };
    this._phase = options.phase ?? 0.7;
    this.recomputeWind();
  }

  set(kind) {
    if (!WEATHER_KINDS.some((entry) => entry.id === kind)) return this.kind;
    this.kind = kind;
    this.timeInKind = 0;
    return this.kind;
  }

  /** Steps to the next preset in the cycle order. */
  cycle(step = 1) {
    const index = this.order.indexOf(this.kind);
    const next = this.order[(index + step + this.order.length) % this.order.length];
    return this.set(next);
  }

  recomputeWind() {
    this.wind.x = Math.sin(this.windDirection) * this.windStrength;
    this.wind.z = Math.cos(this.windDirection) * this.windStrength;
  }

  update(dt) {
    const target = weatherKind(this.kind);
    const lambda = 1 / Math.max(0.05, this.transition);
    this.cloudiness = damp(this.cloudiness, target.cloudiness, lambda, dt);
    this.haze = damp(this.haze, target.haze, lambda, dt);
    this.wetness = damp(this.wetness, target.wetness, lambda, dt);
    this.windStrength = damp(this.windStrength, target.wind, lambda * 0.6, dt);

    // Slow directional drift so the palms never sway in lockstep.
    this.windDirection += Math.sin(this.elapsed * 0.07 + this._phase) * 0.02 * dt;
    this._phase += dt * 0.11;
    this.gust = 0.5 + 0.5 * Math.sin(this._phase * 1.7) * Math.sin(this._phase * 0.63 + 1.2);
    this.recomputeWind();

    this.elapsed += dt;
    this.timeInKind += dt;
    if (this.autoCycle && this.timeInKind >= this.cycleSeconds) this.cycle(1);
    return this;
  }

  /** 0..1 scalar for how hard the wind is blowing right now, gusts included. */
  get strength01() {
    return clamp01(this.windStrength / 16 + this.gust * 0.12);
  }

  /** Multiplier for the water ripple animation. */
  get rippleRate() {
    return 0.35 + this.strength01 * 1.5;
  }

  /** A compact summary for the debug overlay. */
  describe() {
    return `${this.kind} wind ${this.windStrength.toFixed(1)} cloud ${(this.cloudiness * 100) | 0}%`;
  }

  /** Wind as a unit-ish vector, for pollen-free sway animations. */
  windVector(out = { x: 0, z: 0 }) {
    out.x = this.wind.x;
    out.z = this.wind.z;
    return out;
  }

  /** A gentle breeze phase for prop sway: sin around the wind direction. */
  swayPhase() {
    return this._phase % TAU;
  }
}

export function createWeather(options) {
  return new Weather(options);
}
