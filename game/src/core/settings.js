// Runtime settings, as plain data. Expensive things (shadow maps, post processing,
// a higher device pixel ratio) are off by default so a headless browser holds its
// frame rate, and everything is overridable from the URL for later phases.

export const DEFAULT_SETTINGS = Object.freeze({
  // Rendering
  antialias: false,
  shadows: false,
  postProcessing: false,
  pixelRatioCap: 1,
  fov: 62,
  near: 0.35,
  far: 4200,
  exposure: 1.05,

  // Atmosphere
  fogNear: 90,
  fogFar: 1250,
  fogStrength: 1,

  // World generation
  seed: 'solmara-01',
  propDensity: 1,
  buildingDetail: 1,
  terrainSegments: 120,
  waterSize: 2600,

  // Debug
  showDebug: false,
  debugCamera: true,
  freeCameraSpeed: 46,
  pauseOnBlur: true,
});

const BOOLEAN_KEYS = new Set(['antialias', 'shadows', 'postProcessing', 'showDebug', 'debugCamera', 'pauseOnBlur']);
const NUMBER_KEYS = new Set([
  'pixelRatioCap',
  'fov',
  'near',
  'far',
  'exposure',
  'fogNear',
  'fogFar',
  'fogStrength',
  'propDensity',
  'buildingDetail',
  'terrainSegments',
  'waterSize',
  'freeCameraSpeed',
]);

function coerce(key, raw) {
  if (BOOLEAN_KEYS.has(key)) {
    if (typeof raw === 'boolean') return raw;
    return !/^(0|false|off|no)$/i.test(String(raw));
  }
  if (NUMBER_KEYS.has(key)) {
    const value = Number(raw);
    return Number.isFinite(value) ? value : undefined;
  }
  return String(raw);
}

/** Builds a settings object from defaults, then a flat record of overrides. */
export function createSettings(overrides = {}) {
  const settings = { ...DEFAULT_SETTINGS };
  for (const [key, raw] of Object.entries(overrides)) {
    if (!(key in DEFAULT_SETTINGS)) continue;
    const value = coerce(key, raw);
    if (value !== undefined) settings[key] = value;
  }
  return settings;
}

/** Reads the settings-ish keys of a location.search string ("?seed=x&shadows=1"). */
export function settingsFromQuery(search) {
  const params = new URLSearchParams(search ?? '');
  const overrides = {};
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    if (params.has(key)) overrides[key] = params.get(key);
  }
  return createSettings(overrides);
}

/** A one line summary for the build log and the debug overlay. */
export function describeSettings(settings) {
  const flags = [];
  if (settings.shadows) flags.push('shadows');
  if (settings.postProcessing) flags.push('post');
  if (settings.antialias) flags.push('aa');
  return `seed=${settings.seed} fov=${settings.fov} px=${settings.pixelRatioCap}${flags.length ? ` +${flags.join(',')}` : ''}`;
}
