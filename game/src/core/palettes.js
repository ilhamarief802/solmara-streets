// The look of Solmara over 24 hours: sky gradient colours, light intensities and
// the two glow channels that make the city read as alive after dark (lit windows
// and street lamps). Weather desaturates the palette, lifts the fog and dims the
// stars, so the same clock hour can look clear or overcast.

const KEYFRAMES = [
  {
    hour: 0,
    phase: 'night',
    skyTop: 0x05070f,
    skyHorizon: 0x111a2c,
    skyGround: 0x080a12,
    sun: 0x51608a,
    moon: 0xbfd4ff,
    sunIntensity: 0,
    moonIntensity: 0.42,
    ambientSky: 0x1b2740,
    ambientGround: 0x0a0e17,
    ambientIntensity: 0.34,
    fog: 0x0d1420,
    fogFar: 980,
    windowGlow: 0.85,
    lampGlow: 1,
    starOpacity: 1,
  },
  {
    hour: 4.6,
    phase: 'predawn',
    skyTop: 0x0b1224,
    skyHorizon: 0x2c3c5e,
    skyGround: 0x10141d,
    sun: 0x6a7aa6,
    moon: 0x9fb6e8,
    sunIntensity: 0.06,
    moonIntensity: 0.24,
    ambientSky: 0x25314f,
    ambientGround: 0x121722,
    ambientIntensity: 0.4,
    fog: 0x1b2436,
    fogFar: 820,
    windowGlow: 0.68,
    lampGlow: 0.86,
    starOpacity: 0.55,
  },
  {
    hour: 6,
    phase: 'dawn',
    skyTop: 0x2a4676,
    skyHorizon: 0xd98a6a,
    skyGround: 0x2b2a33,
    sun: 0xff9a5c,
    moon: 0x8fa6d8,
    sunIntensity: 0.85,
    moonIntensity: 0.05,
    ambientSky: 0x4a5a7a,
    ambientGround: 0x2a2a30,
    ambientIntensity: 0.6,
    fog: 0xc78a72,
    fogFar: 1000,
    windowGlow: 0.3,
    lampGlow: 0.5,
    starOpacity: 0.12,
  },
  {
    hour: 7.6,
    phase: 'morning',
    skyTop: 0x3f7fd0,
    skyHorizon: 0xbcd6ee,
    skyGround: 0x53616f,
    sun: 0xfff0d8,
    moon: 0x6a7aa6,
    sunIntensity: 1.5,
    moonIntensity: 0,
    ambientSky: 0x8ab0dd,
    ambientGround: 0x4a4a44,
    ambientIntensity: 0.8,
    fog: 0xc6d8ea,
    fogFar: 1420,
    windowGlow: 0.05,
    lampGlow: 0.08,
    starOpacity: 0,
  },
  {
    hour: 12,
    phase: 'midday',
    skyTop: 0x2f74c8,
    skyHorizon: 0xcfe3f5,
    skyGround: 0x6a7a86,
    sun: 0xfffaf0,
    moon: 0x6a7aa6,
    sunIntensity: 1.9,
    moonIntensity: 0,
    ambientSky: 0x9cc0e8,
    ambientGround: 0x585448,
    ambientIntensity: 0.95,
    fog: 0xd3e4f2,
    fogFar: 1650,
    windowGlow: 0,
    lampGlow: 0,
    starOpacity: 0,
  },
  {
    hour: 16.4,
    phase: 'afternoon',
    skyTop: 0x3577bf,
    skyHorizon: 0xdbe0d4,
    skyGround: 0x6b6f6a,
    sun: 0xffeccb,
    moon: 0x6a7aa6,
    sunIntensity: 1.6,
    moonIntensity: 0,
    ambientSky: 0x9bb6d4,
    ambientGround: 0x5c5848,
    ambientIntensity: 0.85,
    fog: 0xd6dfe0,
    fogFar: 1450,
    windowGlow: 0.06,
    lampGlow: 0.16,
    starOpacity: 0,
  },
  {
    hour: 17.9,
    phase: 'golden',
    skyTop: 0x3a5f9c,
    skyHorizon: 0xf6b06a,
    skyGround: 0x6b5a48,
    sun: 0xffb066,
    moon: 0x6a7aa6,
    sunIntensity: 1.28,
    moonIntensity: 0,
    ambientSky: 0x8f9dc0,
    ambientGround: 0x5a4a3a,
    ambientIntensity: 0.7,
    fog: 0xe6a878,
    fogFar: 1250,
    windowGlow: 0.28,
    lampGlow: 0.55,
    starOpacity: 0.04,
  },
  {
    hour: 18.7,
    phase: 'sunset',
    skyTop: 0x2c3f74,
    skyHorizon: 0xf07a4a,
    skyGround: 0x4a3c3c,
    sun: 0xff7a3c,
    moon: 0x8fa6d8,
    sunIntensity: 0.7,
    moonIntensity: 0.06,
    ambientSky: 0x6b6f96,
    ambientGround: 0x3c3038,
    ambientIntensity: 0.55,
    fog: 0xc86a48,
    fogFar: 1080,
    windowGlow: 0.55,
    lampGlow: 0.85,
    starOpacity: 0.18,
  },
  {
    hour: 19.8,
    phase: 'dusk',
    skyTop: 0x131f3e,
    skyHorizon: 0x8a4a5c,
    skyGround: 0x1e1c26,
    sun: 0x4a3560,
    moon: 0xa8bcea,
    sunIntensity: 0.22,
    moonIntensity: 0.2,
    ambientSky: 0x3a3f62,
    ambientGround: 0x181a24,
    ambientIntensity: 0.45,
    fog: 0x54384a,
    fogFar: 1000,
    windowGlow: 0.78,
    lampGlow: 1,
    starOpacity: 0.55,
  },
  {
    hour: 21.5,
    phase: 'night',
    skyTop: 0x05070f,
    skyHorizon: 0x111a2c,
    skyGround: 0x080a12,
    sun: 0x51608a,
    moon: 0xbfd4ff,
    sunIntensity: 0,
    moonIntensity: 0.42,
    ambientSky: 0x1b2740,
    ambientGround: 0x0a0e17,
    ambientIntensity: 0.34,
    fog: 0x0d1420,
    fogFar: 980,
    windowGlow: 0.85,
    lampGlow: 1,
    starOpacity: 1,
  },
  {
    hour: 24,
    phase: 'night',
    skyTop: 0x05070f,
    skyHorizon: 0x111a2c,
    skyGround: 0x080a12,
    sun: 0x51608a,
    moon: 0xbfd4ff,
    sunIntensity: 0,
    moonIntensity: 0.42,
    ambientSky: 0x1b2740,
    ambientGround: 0x0a0e17,
    ambientIntensity: 0.34,
    fog: 0x0d1420,
    fogFar: 980,
    windowGlow: 0.85,
    lampGlow: 1,
    starOpacity: 1,
  },
];

/** Named bands, used by the debug readout and by the shot scenarios. */
export const PHASE_BANDS = [
  { id: 'night', from: 21.2, to: 4.6 },
  { id: 'predawn', from: 4.6, to: 6 },
  { id: 'dawn', from: 6, to: 7.4 },
  { id: 'morning', from: 7.4, to: 10.5 },
  { id: 'midday', from: 10.5, to: 15.2 },
  { id: 'afternoon', from: 15.2, to: 17.2 },
  { id: 'golden', from: 17.2, to: 18.3 },
  { id: 'sunset', from: 18.3, to: 19.4 },
  { id: 'dusk', from: 19.4, to: 21.2 },
];

const COLOUR_KEYS = ['skyTop', 'skyHorizon', 'skyGround', 'sun', 'moon', 'ambientSky', 'ambientGround', 'fog'];
const NUMBER_KEYS = [
  'sunIntensity',
  'moonIntensity',
  'ambientIntensity',
  'fogFar',
  'windowGlow',
  'lampGlow',
  'starOpacity',
];

function mixHex(a, b, t) {
  const ar = (a >> 16) & 255;
  const ag = (a >> 8) & 255;
  const ab = a & 255;
  const br = (b >> 16) & 255;
  const bg = (b >> 8) & 255;
  const bb = b & 255;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (g << 8) | bl;
}

function desaturate(hex, amount) {
  const r = (hex >> 16) & 255;
  const g = (hex >> 8) & 255;
  const b = hex & 255;
  const grey = 0.299 * r + 0.587 * g + 0.114 * b;
  return (
    (Math.round(r + (grey - r) * amount) << 16) |
    (Math.round(g + (grey - g) * amount) << 8) |
    Math.round(b + (grey - b) * amount)
  );
}

function scaleHex(hex, factor) {
  const r = Math.min(255, Math.round(((hex >> 16) & 255) * factor));
  const g = Math.min(255, Math.round(((hex >> 8) & 255) * factor));
  const b = Math.min(255, Math.round((hex & 255) * factor));
  return (r << 16) | (g << 8) | b;
}

/** Which named band an hour falls in. */
export function phaseAt(hour) {
  const h = ((hour % 24) + 24) % 24;
  for (const band of PHASE_BANDS) {
    if (band.from < band.to) {
      if (h >= band.from && h < band.to) return band.id;
    } else if (h >= band.from || h < band.to) {
      return band.id;
    }
  }
  return 'midday';
}

/**
 * Blends the keyframes around `hour` into `out` (reused to avoid per frame
 * allocation) and applies the weather's desaturation, haze and dimming.
 */
export function sampleSky(hour, out = {}, weather = null) {
  const h = ((hour % 24) + 24) % 24;
  let lower = KEYFRAMES[0];
  let upper = KEYFRAMES[KEYFRAMES.length - 1];
  for (let i = 0; i < KEYFRAMES.length - 1; i += 1) {
    if (h >= KEYFRAMES[i].hour && h <= KEYFRAMES[i + 1].hour) {
      lower = KEYFRAMES[i];
      upper = KEYFRAMES[i + 1];
      break;
    }
  }
  const span = upper.hour - lower.hour || 1;
  const t = Math.max(0, Math.min(1, (h - lower.hour) / span));

  for (const key of COLOUR_KEYS) out[key] = mixHex(lower[key], upper[key], t);
  for (const key of NUMBER_KEYS) out[key] = lower[key] + (upper[key] - lower[key]) * t;

  const daylight = Math.max(0, 1 - Math.abs(1 - (out.sunIntensity / 1.6)));
  out.daylight = Math.min(1, daylight);
  out.hour = h;
  out.phase = phaseAt(h);

  if (weather) {
    const cloud = weather.cloudiness ?? 0;
    const wet = weather.wetness ?? 0;
    const haze = weather.haze ?? 0;
    const desat = Math.min(0.72, cloud * 0.55 + haze * 0.3);
    const dim = 1 - cloud * 0.42 - haze * 0.12;

    for (const key of ['skyTop', 'skyHorizon', 'skyGround', 'sun', 'ambientSky', 'ambientGround']) {
      out[key] = desaturate(scaleHex(out[key], dim < 0.5 ? 0.5 + dim * 0.5 : dim), desat);
    }
    out.fog = mixHex(desaturate(out.fog, desat * 0.7), mixHex(out.skyHorizon, 0xffffff, 0.12), cloud * 0.4);
    out.sunIntensity *= 1 - cloud * 0.62 - haze * 0.22;
    out.moonIntensity *= 1 - cloud * 0.55;
    out.ambientIntensity *= 1 + cloud * 0.22 + wet * 0.1;
    out.fogFar *= 1 - cloud * 0.34 - haze * 0.24;
    out.windowGlow = Math.min(1, out.windowGlow * (1 + cloud * 0.3));
    out.lampGlow = Math.min(1, out.lampGlow * (1 + cloud * 0.2));
    out.starOpacity *= 1 - cloud * 0.9 - haze * 0.5;
    out.weather = weather.kind;
  } else {
    out.weather = 'clear';
  }

  out.starOpacity = Math.max(0, out.starOpacity);
  return out;
}

export { mixHex, desaturate, scaleHex };
