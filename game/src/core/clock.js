// The in-game clock and the celestial geometry it drives. One hour of game time is
// one minute by default, so a full day passes in 24 real minutes; the sun travels a
// tilted arc that rises in the east, peaks just past 52 degrees and sets over the
// western sea, and the moon is always its antipode, which is why the night shot can
// frame both the strip and the moon.

import { sampleSky, phaseAt } from './palettes.js';
import { clamp, TAU } from './math.js';

export const DEFAULT_MINUTES_PER_DAY = 24;

/** How far the sun's arc leans towards +Z (the southern sea) at its highest. */
const ARC_TILT = 0.55;
const ARC_HEIGHT = 0.72;

export class GameClock {
  constructor(options = {}) {
    this.hour = Number.isFinite(options.hour) ? options.hour : 8.5;
    this.minutesPerDay = options.minutesPerDay ?? DEFAULT_MINUTES_PER_DAY;
    this.timeScale = options.timeScale ?? 1;
    this.day = 0;
    this.elapsedHours = 0;
    this.sunDirection = new THREE.Vector3(0, 1, 0);
    this.moonDirection = new THREE.Vector3(0, -1, 0);
    this.palette = {};
    this._sunAngle = 0;
    this.recompute();
  }

  /** Game hours advanced per real second. */
  get hoursPerSecond() {
    return (24 / (this.minutesPerDay * 60)) * this.timeScale;
  }

  setHour(hour) {
    this.hour = ((hour % 24) + 24) % 24;
    this.recompute();
    return this.hour;
  }

  setTimeScale(scale) {
    this.timeScale = clamp(scale, 0, 400);
    return this.timeScale;
  }

  advance(hours) {
    const total = this.hour + hours;
    this.day += Math.floor(total / 24);
    this.hour = ((total % 24) + 24) % 24;
    this.recompute();
    return this.hour;
  }

  /** Advances the clock and refreshes the palette (with weather if given). */
  update(dt, weather = null) {
    const total = this.hour + dt * this.hoursPerSecond;
    this.day += Math.floor(total / 24);
    this.hour = ((total % 24) + 24) % 24;
    this.recompute(weather);
    return this.hour;
  }

  /** Recomputes the sun/moon vectors, phase and palette for the current hour. */
  recompute(weather = null) {
    const a = ((this.hour - 6) / 12) * Math.PI;
    const cx = Math.cos(a);
    const cy = Math.sin(a) * ARC_HEIGHT;
    const cz = ARC_TILT;
    const length = Math.hypot(cx, cy, cz) || 1;
    this._sunAngle = a;
    this.sunDirection.set(cx / length, cy / length, cz / length);
    this.moonDirection.set(-this.sunDirection.x, -this.sunDirection.y, -this.sunDirection.z);
    this.phase = phaseAt(this.hour);
    this.palette = sampleSky(this.hour, this.palette, weather);
    this.sunElevation = Math.asin(clamp(this.sunDirection.y, -1, 1));
    this.daylight = clamp(this.sunDirection.y / 0.35, 0, 1);
    this.night = clamp(-this.sunDirection.y / 0.2, 0, 1);
    return this.palette;
  }

  /** The palette for the current hour, refreshed with the live weather. */
  sample(weather) {
    return this.recompute(weather);
  }

  get isNight() {
    return this.phase === 'night' || this.phase === 'dusk' || this.phase === 'predawn';
  }

  get sunElevationDegrees() {
    return (this.sunElevation * 180) / Math.PI;
  }

  /** The world azimuth of the sun in radians, measured from +X towards +Z. */
  get sunAzimuth() {
    return Math.atan2(this.sunDirection.z, this.sunDirection.x);
  }

  /** Normalised 0..1 fraction of the 24 hour cycle, handy for star rotation. */
  get dayFraction() {
    return this.hour / 24;
  }

  format() {
    const totalMinutes = Math.floor(this.hour * 60);
    const hh = String(Math.floor(totalMinutes / 60)).padStart(2, '0');
    const mm = String(totalMinutes % 60).padStart(2, '0');
    return `${hh}:${mm}`;
  }

  /** Where the sun sits on its arc, for the sky shader's horizon glow. */
  arcAngle() {
    return this._sunAngle % TAU;
  }
}

export function createClock(options) {
  return new GameClock(options);
}
