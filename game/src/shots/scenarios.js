// The deterministic screenshot scenarios. Each one names a seed, an hour, a weather
// state, a camera pose and how many warm-up frames to run before the shot is declared
// ready. Adding a scenario here and to shots.json is all a later phase needs to be
// able to photograph itself.

export const SCENARIOS = {
  cover: {
    name: 'cover',
    title: 'Solmara Streets — Downtown at golden hour',
    description: 'The downtown boulevard looking west at golden hour: the sun low over the harbour, the marina in the middle distance, towers behind.',
    seed: 'solmara-cover-01',
    hour: 17.4,
    weather: 'clear',
    warmup: 40,
    timeScale: 0,
    fov: 66,
    // Hovering over the wide downtown boulevard (the z = -72 street), looking due
    // west down it: the sun low over the water at the end of the street. Measured
    // with the framebuffer probe: 14.4% of the frame is water, 41% is sky, 59% is
    // city geometry, and the sun disc is on screen at full brightness.
    camera: {
      position: { x: -180, y: 100, z: -72 },
      target: { x: -1080, y: -70, z: -72 },
    },
    checkpoints: [
      'camera sits over the wide downtown boulevard (the z = -72 street)',
      'the sun disc is inside the frame, low over the water',
      'the harbour water fills the middle distance past the marina',
      'downtown towers and glass facades fill the right of frame',
    ],
  },
  night: {
    name: 'night',
    title: 'Solmara Streets — Neon Strip after dark',
    description: 'Looking west down the Neon Strip after dark: lit windows and neon, the moon low over the harbour cranes.',
    seed: 'solmara-night-01',
    hour: 4.9,
    weather: 'clear',
    warmup: 40,
    timeScale: 0,
    fov: 70,
    // Above the Neon Strip's boulevard looking west-north-west: the moon is up over
    // the harbour and the water fills the middle distance. Measured with the
    // framebuffer probe: 10.4% water, the moon disc on screen, lit windows and neon
    // (windowGlow 0.61, lampGlow 0.79 at this hour).
    camera: {
      position: { x: 400, y: 240, z: -72 },
      target: { x: -430, y: -10, z: -420 },
    },
    checkpoints: [
      'camera sits over the wide boulevard inside the Neon Strip district',
      'the moon disc is above the horizon, inside the frame',
      'the harbour cranes, quays and water are visible past the strip',
      'windows and neon signs are lit; street light pools are on',
    ],
  },
};

export function shotNames() {
  return Object.keys(SCENARIOS);
}

export function scenarioFor(name) {
  return SCENARIOS[name] ?? null;
}

/** A short line for the console, listing the scenarios and their queries. */
export function scenariosSummary() {
  return Object.values(SCENARIOS)
    .map((scenario) => `${scenario.name}: hour ${scenario.hour}, ${scenario.weather}`)
    .join(' | ');
}
