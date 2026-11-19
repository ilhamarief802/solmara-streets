// The city clock. It turns real seconds into Solmara minutes, names the phase of the day,
// and hands out a fully populated palette (sky, sun, ambient, fog, exposure, window glow,
// star opacity) for the sky and world to apply. Palettes are interpolated from
// hand-picked keyframes and cached per simulated minute, so a frame costs a lookup.

import { clamp, lerp, smoothstep, wrap } from './math.js';

export const DAY_HOURS = 24;
export const DEFAULT_MINUTES_PER_DAY = 1080; // 18 real minutes for a full day
export const DEFAULT_START_HOUR = 16.8;

/** Keyframes around the clock. Colours are sRGB hex, intensities are linear. */
const PALETTE_STOPS = [
  {
    at: 0,
    skyTop: 0x060a18, skyHorizon: 0x131c33, sunColor: 0x9fb6d8, sunIntensity: 0,
    moonIntensity: 0.72, ambientSky: 0x33405f, ambientGround: 0x0e1119, ambientIntensity: 0.78,
    fogColor: 0x0d1424, fogDensity: 0.00105, exposure: 1.35, starAlpha: 0.9, windowGlow: 1,
  },
  {
    at: 4.6,
    skyTop: 0x0a1024, skyHorizon: 0x2a2a45, sunColor: 0xb9b0d0, sunIntensity: 0,
    moonIntensity: 0.4, ambientSky: 0x2b3350, ambientGround: 0x141218, ambientIntensity: 0.6,
    fogColor: 0x1a1d2e, fogDensity: 0.00095, exposure: 1.3, starAlpha: 0.6, windowGlow: 0.9,
  },
  {
    at: 6.1,
    skyTop: 0x2c3f66, skyHorizon: 0xe39a86, sunColor: 0xffc49a, sunIntensity: 1.1,
    moonIntensity: 0.08, ambientSky: 0x6b7597, ambientGround: 0x39302c, ambientIntensity: 0.75,
    fogColor: 0xc79a8f, fogDensity: 0.00085, exposure: 1.1, starAlpha: 0.12, windowGlow: 0.45,
  },
  {
    at: 8,
    skyTop: 0x3f7bc4, skyHorizon: 0xc8d9e6, sunColor: 0xffe3bd, sunIntensity: 2.1,
    moonIntensity: 0, ambientSky: 0x9db8d6, ambientGround: 0x5b5646, ambientIntensity: 0.85,
    fogColor: 0xc4d2dc, fogDensity: 0.0004, exposure: 1, starAlpha: 0, windowGlow: 0.12,
  },
  {
    at: 12,
    skyTop: 0x2f6fbe, skyHorizon: 0xcfe2ee, sunColor: 0xfff4dc, sunIntensity: 2.6,
    moonIntensity: 0, ambientSky: 0xb4cce4, ambientGround: 0x6b6350, ambientIntensity: 0.95,
    fogColor: 0xd3e0e8, fogDensity: 0.00032, exposure: 0.95, starAlpha: 0, windowGlow: 0,
  },
  {
    at: 15.4,
    skyTop: 0x3778bd, skyHorizon: 0xe4dcc4, sunColor: 0xffe9c2, sunIntensity: 2.35,
    moonIntensity: 0, ambientSky: 0xb0c6d6, ambientGround: 0x6d6045, ambientIntensity: 0.9,
    fogColor: 0xdfdccb, fogDensity: 0.00035, exposure: 1, starAlpha: 0, windowGlow: 0.05,
  },
  {
    at: 17.6,
    skyTop: 0x2c4d80, skyHorizon: 0xf0a66a, sunColor: 0xffb066, sunIntensity: 2.3,
    moonIntensity: 0, ambientSky: 0xa8b8d0, ambientGround: 0x5c4e42, ambientIntensity: 1.15,
    fogColor: 0xd9b89e, fogDensity: 0.00045, exposure: 1.1, starAlpha: 0, windowGlow: 0.25,
  },
  {
    at: 19.1,
    skyTop: 0x243a63, skyHorizon: 0xc9715f, sunColor: 0xff8a4a, sunIntensity: 0.9,
    moonIntensity: 0.05, ambientSky: 0x7a86a0, ambientGround: 0x40343a, ambientIntensity: 0.95,
    fogColor: 0xb08072, fogDensity: 0.0006, exposure: 1.2, starAlpha: 0.1, windowGlow: 0.65,
  },
  {
    at: 20.6,
    skyTop: 0x0d1630, skyHorizon: 0x38334f, sunColor: 0xc98a73, sunIntensity: 0,
    moonIntensity: 0.48, ambientSky: 0x3d4668, ambientGround: 0x1a1824, ambientIntensity: 0.82,
    fogColor: 0x241f33, fogDensity: 0.00095, exposure: 1.3, starAlpha: 0.55, windowGlow: 0.95,
  },
  {
    at: 24,
    skyTop: 0x060a18, skyHorizon: 0x131c33, sunColor: 0x9fb6d8, sunIntensity: 0,
    moonIntensity: 0.72, ambientSky: 0x33405f, ambientGround: 0x0e1119, ambientIntensity: 0.78,
    fogColor: 0x0d1424, fogDensity: 0.00105, exposure: 1.35, starAlpha: 0.9, windowGlow: 1,
  },
];

const PHASE_TABLE = [
  { until: 5.2, id: 'night', label: 'Night' },
  { until: 7.2, id: 'dawn', label: 'Dawn' },
  { until: 11, id: 'morning', label: 'Morning' },
  { until: 14.5, id: 'noon', label: 'Midday' },
  { until: 17, id: 'afternoon', label: 'Afternoon' },
  { until: 19.2, id: 'golden', label: 'Golden hour' },
  { until: 20.8, id: 'dusk', label: 'Dusk' },
  { until: 24.1, id: 'night', label: 'Night' },
];

// Palette channels that are sRGB hex rather than plain scalars.
const COLOR_KEYS = new Set(['skyTop', 'skyHorizon', 'sunColor', 'ambientSky', 'ambientGround', 'fogColor']);

function rgbTriple(hex) {
  return [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
}

function interpolateStops(hour) {
  let a = PALETTE_STOPS[0];
  let b = PALETTE_STOPS[1];
  for (let i = 0; i < PALETTE_STOPS.length - 1; i += 1) {
    if (hour >= PALETTE_STOPS[i].at && hour <= PALETTE_STOPS[i + 1].at) {
      a = PALETTE_STOPS[i];
      b = PALETTE_STOPS[i + 1];
      break;
    }
  }
  // smoothstep rather than a linear ramp: the dawn and dusk bands read as a slow change.
  const t = b.at === a.at ? 0 : smoothstep(0, 1, (hour - a.at) / (b.at - a.at));
  const out = {};
  for (const key of Object.keys(a)) {
    if (key === 'at') continue;
    const av = a[key];
    const bv = b[key];
    if (COLOR_KEYS.has(key)) {
      const from = rgbTriple(av);
      const to = rgbTriple(bv);
      out[key] = [lerp(from[0], to[0], t), lerp(from[1], to[1], t), lerp(from[2], to[2], t)];
    } else {
      out[key] = av === bv ? av : lerp(av, bv, t);
    }
  }
  return out;
}

export function phaseOfHour(hour) {
  const wrapped = wrap(hour, 24);
  return PHASE_TABLE.find((entry) => wrapped < entry.until) ?? PHASE_TABLE[PHASE_TABLE.length - 1];
}

export function formatHour(hour) {
  const wrapped = wrap(hour, 24);
  const h = Math.floor(wrapped);
  const m = Math.floor((wrapped - h) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** The direction from the city towards the sun, in three.js space. */
export function sunDirection(hour, out = new THREE.Vector3()) {
  const wrapped = wrap(hour, 24);
  // The sun rises at 06:00, crosses at noon and sets at 18:00; +Z keeps the light
  // slightly behind the downtown grid so the boulevards catch a long shadow.
  const arc = ((wrapped - 6) / 12) * Math.PI;
  const x = Math.cos(arc);
  const y = Math.sin(arc) * 0.94;
  return out.set(x, y, 0.52).normalize();
}

export class GameClock {
  constructor({ startHour = DEFAULT_START_HOUR, minutesPerDay = DEFAULT_MINUTES_PER_DAY, fixed = false } = {}) {
    this.minutesPerDay = minutesPerDay;
    this.fixed = fixed;
    this.minutes = wrap(startHour, 24) * 60;
    this.day = 1;
    this.timeScale = 1;
    this._lastKey = -1;
    this._palette = null;
    this._sun = new THREE.Vector3(0.3, 0.6, 0.5);
    this._moon = new THREE.Vector3();
  }

  get hour() {
    return this.minutes / 60;
  }

  get minute() {
    return Math.floor(this.minutes % 60);
  }

  get phase() {
    return phaseOfHour(this.hour);
  }

  get label() {
    return formatHour(this.hour);
  }

  get night() {
    return this.phase.id === 'night' || this.phase.id === 'dusk';
  }

  update(dt) {
    if (this.fixed || dt <= 0) return;
    const gameMinutesPerSecond = (DAY_HOURS * 60) / this.minutesPerDay;
    this.minutes += dt * gameMinutesPerSecond * this.timeScale;
    while (this.minutes >= DAY_HOURS * 60) {
      this.minutes -= DAY_HOURS * 60;
      this.day += 1;
    }
  }

  setHour(hour) {
    this.minutes = wrap(hour, 24) * 60;
    this._lastKey = -1;
  }

  setMinutes(minutes) {
    this.minutes = wrap(minutes, 24 * 60);
    this._lastKey = -1;
  }

  advance(hours) {
    this.setMinutes(this.minutes + hours * 60);
  }

  setTimeScale(scale) {
    this.timeScale = clamp(Number.isFinite(scale) ? scale : 0, 0, 60);
  }

  /** A palette for the current minute, cached and shared. */
  palette() {
    // One cache key per two simulated minutes: the interpolation is slower than that.
    const key = Math.floor(this.minutes / 2);
    if (key === this._lastKey && this._palette) return this._palette;

    const palette = interpolateStops(this.hour);
    // How dark it is overall, 0 at noon and 1 at midnight — the stars and the window
    // glow both ride on it.
    palette.night = clamp(
      1 - smoothstep(5.2, 7.1, this.hour) + smoothstep(19.4, 20.8, this.hour),
      0,
      1,
    );
    palette.sunElevation = sunDirection(this.hour, this._sun).y;
    palette.sunDir = this._sun;
    palette.moonDir = this._moon.copy(this._sun).multiplyScalar(-1);
    palette.hour = this.hour;
    palette.phase = this.phase.id;
    palette.label = this.label;
    this._palette = palette;
    this._lastKey = key;
    return palette;
  }
}
