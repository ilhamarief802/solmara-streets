// The story, as data. Five jobs in order, each a list of steps the mission system knows
// how to run: reach a place (on foot or by car), catch a stolen car, clear a warehouse,
// pass five checkpoints against the clock, and finish the boss on the Neon Strip. All of
// the writing lives here so the runtime stays a small machine that reads it.
//
// Step types:
//   goto        reach `marker` within `radius` (optionally by car)
//   chase       catch the car spawned at `spawn` (radius metres between bumpers)
//   killAll     clear every thug spawned from `spawns` with this step's tag
//   checkpoints pass `points` in order, against one clock
//   escape      be clean (wanted 0) after the heat this step stirs up

export const MISSIONS = [
  {
    id: 'dock-run',
    title: 'Dock Run',
    district: 'marina',
    start: { x: 352, z: 96 },
    startPrompt: 'Rosa has a crate that needs moving',
    brief: 'Rosa pays cash for a quiet delivery. Take a car to the marina market and do not open the boot.',
    reward: 900,
    dialogue: [
      { who: 'Rosa', line: 'You look like a driver. There is a crate at the marina with my name on it.' },
      { who: 'You', line: 'And if the police ask?' },
      { who: 'Rosa', line: 'Then you were already gone. Go on — the market closes at eight.' },
    ],
    steps: [
      {
        type: 'goto',
        text: 'Drive to the marina fish market',
        marker: { x: -360, z: 60 },
        radius: 9,
        byCar: true,
        time: 165,
        hint: 'By car',
      },
    ],
  },
  {
    id: 'stolen-wheels',
    title: 'Stolen Wheels',
    district: 'downtown',
    start: { x: -360, z: 60 },
    startPrompt: 'Rosa wants her coupe back',
    brief: 'A kid took Rosa\'s red coupe from the marina. Catch it before it reaches the bridges.',
    reward: 1200,
    dialogue: [
      { who: 'Rosa', line: 'The red coupe. Gone. Some kid drove it off the lot ten minutes ago.' },
      { who: 'You', line: 'Downtown?' },
      { who: 'Rosa', line: 'Downtown. Bring it back with the paint still on it.' },
    ],
    steps: [
      {
        type: 'chase',
        text: 'Catch the stolen coupe',
        spawn: { x: 340, z: 80, heading: 0, color: 0x9a2028 },
        radius: 7,
        time: 170,
        hint: 'Ram it or pull alongside',
      },
    ],
  },
  {
    id: 'harbour-heat',
    title: 'Harbour Heat',
    district: 'harbour',
    start: { x: -360, z: 60 },
    startPrompt: 'Rosa has a warehouse problem',
    brief: 'Four of Voss\'s men are sitting on Rosa\'s crate at the harbour. Clear the warehouse.',
    reward: 1800,
    dialogue: [
      { who: 'Rosa', line: 'They found the crate. Four men, harbour warehouses, Pier 9 side.' },
      { who: 'You', line: 'Four is a lot of paperwork.' },
      { who: 'Rosa', line: 'Then do not fill any out. Bring a gun.' },
    ],
    steps: [
      {
        type: 'goto',
        text: 'Get to the harbour warehouses',
        marker: { x: -640, z: 520 },
        radius: 10,
        time: 150,
        hint: 'Pier 9, south-west',
      },
      {
        type: 'killAll',
        text: 'Clear the warehouse',
        spawns: [
          { x: -664, z: 504 },
          { x: -618, z: 508 },
          { x: -676, z: 518 },
          { x: -636, z: 536, boss: true, health: 120 },
        ],
        time: 120,
        hint: 'Four hostiles',
      },
    ],
  },
  {
    id: 'ring-run',
    title: 'Ring Run',
    district: 'downtown',
    start: { x: -520, z: 470 },
    startPrompt: 'A driver needs a pace car',
    brief: 'Five checkpoints under the elevated ring, one clock, no police. Rosa put money on you.',
    reward: 2200,
    dialogue: [
      { who: 'Rosa', line: 'There is a race tonight under the ring. Five gates, one lap.' },
      { who: 'You', line: 'What is the buy-in?' },
      { who: 'Rosa', line: 'Your name. Do not lose it.' },
    ],
    steps: [
      {
        type: 'checkpoints',
        text: 'Pass the five checkpoints',
        points: [
          { x: 340, z: 80 },
          { x: 340, z: -180 },
          { x: 80, z: -440 },
          { x: -180, z: -180 },
          { x: 80, z: 210 },
        ],
        radius: 11,
        time: 200,
        byCar: true,
        hint: 'Under the ring road',
      },
    ],
  },
  {
    id: 'neon-reckoning',
    title: 'Neon Reckoning',
    district: 'neon',
    start: { x: 160, z: -700 },
    startPrompt: 'Voss is at the Neon Strip club',
    brief: 'Voss has been leaning on Rosa all week. He is at the Neon Strip tonight. End it, then lose the police.',
    reward: 5000,
    dialogue: [
      { who: 'Rosa', line: 'Voss is at the Strip. Corner booth, two men, one bad temper.' },
      { who: 'You', line: 'And after?' },
      { who: 'Rosa', line: 'After, you drive. Do not look back, and do not stop for the lights.' },
    ],
    steps: [
      {
        type: 'goto',
        text: 'Reach the Neon Strip club',
        marker: { x: 168, z: -658 },
        radius: 9,
        time: 170,
        hint: 'North end of the Strip',
      },
      {
        type: 'killAll',
        text: 'Take out Voss and his crew',
        spawns: [
          { x: 150, z: -640 },
          { x: 182, z: -648 },
          { x: 164, z: -622, boss: true, health: 150 },
        ],
        time: 150,
        hint: 'Three hostiles',
      },
      {
        type: 'escape',
        text: 'Lose the police',
        heat: 3,
        time: 180,
        hint: 'Break line of sight',
      },
    ],
  },
];

/** The shop on the Avenida, a short walk from the spawn. */
export const SHOP = {
  x: 328,
  z: 54,
  name: 'Solmara Motors',
};

/** Story order, and the reward a first clean completion pays. */
export const MISSION_ORDER = MISSIONS.map((mission) => mission.id);
