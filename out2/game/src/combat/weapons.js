// The weapon table. Fists, a pistol and a shotgun: one record each for damage, reach,
// cadence, magazine and reserve, so the combat system has no special cases beyond melee.
// Nothing here touches the scene or the DOM.

export const WEAPONS = {
  // Fists carry an infinite clip and reserve, so the reload path never applies to them.
  fists: {
    id: 'fists',
    name: 'Fists',
    slot: 0,
    melee: true,
    damage: 24,
    range: 2.4,
    arc: 0.7,
    rate: 0.38,
    clip: Infinity,
    clipSize: Infinity,
    reserve: Infinity,
    spread: 0,
    pellets: 1,
    recoil: 0,
  },
  pistol: {
    id: 'pistol',
    name: 'Pistol',
    slot: 1,
    melee: false,
    damage: 34,
    range: 62,
    rate: 0.26,
    clip: 12,
    clipSize: 12,
    reserve: 60,
    spread: 0.008,
    pellets: 1,
    recoil: 0.09,
    tracer: 0xffd9a0,
  },
  shotgun: {
    id: 'shotgun',
    name: 'Shotgun',
    slot: 2,
    melee: false,
    damage: 13,
    range: 28,
    rate: 0.82,
    clip: 6,
    clipSize: 6,
    reserve: 24,
    spread: 0.075,
    pellets: 7,
    recoil: 0.24,
    tracer: 0xffbf7a,
  },
};

/** Slot order for the 1/2/3 keys. */
export const WEAPON_ORDER = ['fists', 'pistol', 'shotgun'];
