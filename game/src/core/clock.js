// The in-game clock and the lighting profile that follows it. A day runs in `minutesPerDay` real
// minutes (24 by default), and the hour drives everything the sky does: sun elevation and azimuth,
// sun and ambient colour, fog, sky gradient, star opacity, and how much the street lamps stand out.
// The keyframes below are the game's art direction in numbers.

import { clamp, lerp, sampleStops, smoothstep } from './math.js';

/** Hours of a game day, and how long one takes. */
export const DAY_HOURS = 24;
export const DEFAULT_MINUTES_PER_DAY = 24;

/** The clock starts mid-afternoon so a fresh boot opens in warm light. */
export const DEFAULT_START_HOUR = 16.6;

const KEYS = [
  'sunElevation', 'sunAzimuth', 'sunColor', 'sunIntensity',
  'hemiSky', 'hemiGround', 'hemiIntensity',
  'fogColor', 'fogDensity',
  'skyTop', 'skyHorizon', 'skyGlow',
  'exposure', 'stars', 'lampBoost', 'ambientTint',
];

const hex = (value) => [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];

/** Night-to-night keyframes. at is the hour; the 24 hour repeats the 0 hour to close the loop. */
const PALETTE = [
  {
    at: 0, sunElevation: -46, sunAzimuth: 210, sunColor: 0x8fa8d8, sunIntensity: 0.28,
    hemiSky: 0x223452, hemiGround: 0x0b1018, hemiIntensity: 0.34,
    fogColor: 0x0b1320, fogDensity: 0.0024,
    skyTop: 0x04060d, skyHorizon: 0x111d2d, skyGlow: 0x1d2b40,
    exposure: 1.18, stars: 1, lampBoost: 1, ambientTint: 0.6,
  },
  {
    at: 4.4, sunElevation: -22, sunAzimuth: 96, sunColor: 0x7e8fc4, sunIntensity: 0.3,
    hemiSky: 0x2a3350, hemiGround: 0x0c1119, hemiIntensity: 0.38,
    fogColor: 0x14202f, fogDensity: 0.0026,
    skyTop: 0x0a1024, skyHorizon: 0x2a2740, skyGlow: 0x4a3a52,
    exposure: 1.1, stars: 0.62, lampBoost: 0.9, ambientTint: 0.66,
  },
  {
    at: 5.5, sunElevation: -1, sunAzimuth: 88, sunColor: 0xff9a63, sunIntensity: 0.75,
    hemiSky: 0x5d6f92, hemiGround: 0x2a2230, hemiIntensity: 0.62,
    fogColor: 0x8a7a86, fogDensity: 0.0028,
    skyTop: 0x2a3f66, skyHorizon: 0xffb385, skyGlow: 0xff9a66,
    exposure: 1.06, stars: 0.12, lampBoost: 0.55, ambientTint: 0.8,
  },
  {
    at: 6.9, sunElevation: 12, sunAzimuth: 82, sunColor: 0xffd9b0, sunIntensity: 2.1,
    hemiSky: 0x9dc1d9, hemiGround: 0x7a6a55, hemiIntensity: 0.95,
    fogColor: 0xd6d3c6, fogDensity: 0.0022,
    skyTop: 0x2f6ea8, skyHorizon: 0xdfe8e8, skyGlow: 0xffe2b8,
    exposure: 0.98, stars: 0, lampBoost: 0.06, ambientTint: 1,
  },
  {
    at: 10, sunElevation: 44, sunAzimuth: 62, sunColor: 0xfff3e2, sunIntensity: 2.85,
    hemiSky: 0xa8cfe8, hemiGround: 0x93836b, hemiIntensity: 1.05,
    fogColor: 0xcfe0e6, fogDensity: 0.0017,
    skyTop: 0x2672b4, skyHorizon: 0xc6dce8, skyGlow: 0xfff1d0,
    exposure: 0.92, stars: 0, lampBoost: 0, ambientTint: 1,
  },
  {
    at: 13.5, sunElevation: 72, sunAzimuth: 340, sunColor: 0xfff8ee, sunIntensity: 3.0,
    hemiSky: 0xb2d5ea, hemiGround: 0x9c8a70, hemiIntensity: 1.1,
    fogColor: 0xcfdfe7, fogDensity: 0.0015,
    skyTop: 0x1f6cb0, skyHorizon: 0xc2d9e6, skyGlow: 0xfff6e2,
    exposure: 0.9, stars: 0, lampBoost: 0, ambientTint: 1,
  },
  {
    at: 16.4, sunElevation: 40, sunAzimuth: 296, sunColor: 0xffe6bd, sunIntensity: 2.7,
    hemiSky: 0xa9c6dd, hemiGround: 0x9c8564, hemiIntensity: 1.0,
    fogColor: 0xe2d6bf, fogDensity: 0.0017,
    skyTop: 0x2b6fa8, skyHorizon: 0xe6dcc6, skyGlow: 0xffe0a8,
    exposure: 0.94, stars: 0, lampBoost: 0, ambientTint: 1,
  },
  {
    at: 18.3, sunElevation: 11, sunAzimuth: 285, sunColor: 0xffb066, sunIntensity: 2.3,
    hemiSky: 0x8fb4d0, hemiGround: 0x8d6448, hemiIntensity: 0.9,
    fogColor: 0xf0c48f, fogDensity: 0.0021,
    skyTop: 0x3a6fa4, skyHorizon: 0xffc684, skyGlow: 0xffb466,
    exposure: 1.0, stars: 0, lampBoost: 0.12, ambientTint: 1.05,
  },
  {
    at: 19.4, sunElevation: -1.5, sunAzimuth: 280, sunColor: 0xff7d4d, sunIntensity: 0.9,
    hemiSky: 0x6a6f96, hemiGround: 0x4a3038, hemiIntensity: 0.66,
    fogColor: 0xc98a7c, fogDensity: 0.0024,
    skyTop: 0x2a3d6e, skyHorizon: 0xff8a5c, skyGlow: 0xff6f3c,
    exposure: 1.06, stars: 0.2, lampBoost: 0.5, ambientTint: 0.92,
  },
  {
    at: 20.5, sunElevation: -10, sunAzimuth: 274, sunColor: 0x5f6fa8, sunIntensity: 0.34,
    hemiSky: 0x2f3a63, hemiGround: 0x1d1626, hemiIntensity: 0.44,
    fogColor: 0x2a3048, fogDensity: 0.0026,
    skyTop: 0x101a38, skyHorizon: 0x584566, skyGlow: 0x8a4c68,
    exposure: 1.1, stars: 0.7, lampBoost: 0.9, ambientTint: 0.7,
  },
  {
    at: 22, sunElevation: -34, sunAzimuth: 240, sunColor: 0x8fa8d8, sunIntensity: 0.3,
    hemiSky: 0x1e2c48, hemiGround: 0x0b0f16, hemiIntensity: 0.34,
    fogColor: 0x0d1524, fogDensity: 0.0024,
    skyTop: 0x050810, skyHorizon: 0x16202f, skyGlow: 0x22303f,
    exposure: 1.16, stars: 0.94, lampBoost: 1, ambientTint: 0.62,
  },
  {
    at: 24, sunElevation: -46, sunAzimuth: 210, sunColor: 0x8fa8d8, sunIntensity: 0.28,
    hemiSky: 0x223452, hemiGround: 0x0b1018, hemiIntensity: 0.34,
    fogColor: 0x0b1320, fogDensity: 0.0024,
    skyTop: 0x04060d, skyHorizon: 0x111d2d, skyGlow: 0x1d2b40,
    exposure: 1.18, stars: 1, lampBoost: 1, ambientTint: 0.6,
  },
];

// Colors are converted once at load: keyframes keep numeric triples so lerping is plain arithmetic.
const COLOR_KEYS = new Set(['sunColor', 'hemiSky', 'hemiGround', 'fogColor', 'skyTop', 'skyHorizon', 'skyGlow']);

const STOPS = PALETTE.map((stop) => {
  const out = { at: stop.at };
  for (const key of KEYS) {
    out[key] = COLOR_KEYS.has(key) ? hex(stop[key]) : stop[key];
  }
  return out;
});

/** The day/night phase of an hour, with a label the HUD can show. */
export function phaseOfHour(hour) {
  const h = ((hour % 24) + 24) % 24;
  if (h < 4.6) return { id: 'night', label: 'night' };
  if (h < 6.6) return { id: 'dawn', label: 'dawn' };
  if (h < 10.5) return { id: 'morning', label: 'morning' };
  if (h < 15.8) return { id: 'day', label: 'day' };
  if (h < 18.6) return { id: 'golden', label: 'golden hour' };
  if (h < 19.9) return { id: 'sunset', label: 'sunset' };
  if (h < 21.6) return { id: 'dusk', label: 'dusk' };
  return { id: 'night', label: 'night' };
}

/** "18:42" for 18.7. */
export function formatHour(hour) {
  const h = ((hour % 24) + 24) % 24;
  const hh = Math.floor(h);
  const mm = Math.floor((h - hh) * 60);
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

export class GameClock {
  /**
   * @param {object} [options]
   * @param {number} [options.hour] starting hour
   * @param {number} [options.minutesPerDay] real minutes one game day takes
   */
  constructor({ hour = DEFAULT_START_HOUR, minutesPerDay = DEFAULT_MINUTES_PER_DAY } = {}) {
    this.hour = ((hour % 24) + 24) % 24;
    this.day = 1;
    this.minutesPerDay = minutesPerDay;
    this.paused = false;
    this.listeners = new Set();
    this.phase = phaseOfHour(this.hour);
    this.profile = this.sample();
  }

  /** Game seconds per real second. */
  get timeScale() {
    return (DAY_HOURS * 3600) / (this.minutesPerDay * 60);
  }

  setMinutesPerDay(minutes) {
    this.minutesPerDay = clamp(minutes, 1, 240);
  }

  setHour(hour) {
    this.hour = ((hour % 24) + 24) % 24;
    this._refresh();
  }

  /** Moves the clock by dt real seconds. */
  advance(dt) {
    if (this.paused) return;
    this.hour += (dt * this.timeScale) / 3600;
    while (this.hour >= 24) {
      this.hour -= 24;
      this.day++;
    }
    this._refresh();
  }

  _refresh() {
    this.phase = phaseOfHour(this.hour);
    this.profile = this.sample();
    for (const listener of this.listeners) listener(this.profile, this);
  }

  /** The interpolated lighting profile for the current hour (cyclically sampled). */
  sample(hour = this.hour) {
    // Sampling across midnight: an hour before the first stop belongs to the end of the day.
    const samples = STOPS;
    const h = ((hour % 24) + 24) % 24;
    const stop = sampleStops(samples, h, KEYS);
    return {
      ...stop,
      hour: h,
      phase: this.phase.id,
      // The night profile's "sun" is the moon: the scene flips it to the opposite azimuth.
      isNight: h < 6.1 || h > 19.2,
      daylight: smoothstep(-2, 14, stop.sunElevation),
      lampGlow: clamp(stop.lampBoost, 0, 1),
    };
  }

  onProfile(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** A stable 0..1 "how dark is it" for window lights and neon. */
  get darkness() {
    return 1 - smoothstep(-4, 12, this.profile.sunElevation);
  }
}

/** Helper for tests and the HUD: the sun's direction for a profile, as a unit vec3-like triple. */
export function sunDirection(profile) {
  const elev = (profile.sunElevation * Math.PI) / 180;
  const azim = (profile.sunAzimuth * Math.PI) / 180;
  return [
    Math.cos(elev) * Math.sin(azim),
    Math.sin(elev),
    Math.cos(elev) * Math.cos(azim),
  ];
}

/** Three-friendly color helper: [r,g,b] floats to a THREE.Color, reused to avoid garbage. */
export function applyTriple(color, triple) {
  color.setRGB(triple[0], triple[1], triple[2], THREE.SRGBColorSpace);
  return color;
}

export { lerp };
