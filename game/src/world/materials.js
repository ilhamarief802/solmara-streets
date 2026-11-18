// Every material in the game, keyed by the geometry bucket it serves. Nine facade
// styles plus glass, metal, wood, asphalt, a set of neon signs and a set of posters.
// updateMaterials() is the night switch: it lifts window emission, turns on the
// lamps and fades the ground light pools in, which is what makes Solmara glow.

import { FACADE_VARIANTS } from './textures.js';

/** Bucket names, so the generator modules never disagree about a spelling. */
export const BUCKETS = Object.freeze({
  road: 'road',
  roadWide: 'roadWide',
  junction: 'junction',
  crossing: 'crossing',
  sidewalk: 'sidewalk',
  kerb: 'kerb',
  concrete: 'concrete',
  concreteDark: 'concreteDark',
  plaza: 'plaza',
  roof: 'roof',
  grass: 'grass',
  marsh: 'marsh',
  sand: 'sand',
  dirt: 'dirt',
  boardwalk: 'boardwalk',
  planks: 'planks',
  metal: 'metal',
  metalDark: 'metalDark',
  siding: 'siding',
  hangarSiding: 'hangarSiding',
  container: 'container',
  glass: 'glass',
  water: 'water',
  waterGlint: 'waterGlint',
  lamp: 'lamp',
  glow: 'glow',
  railing: 'railing',
  concreteRail: 'concreteRail',
  plazaStone: 'plazaStone',
  foliage: 'foliage',
  cityGround: 'cityGround',
  seafloor: 'seafloor',
});

/** The words the city paints on itself. Text is drawn by the bitmap font. */
export const SIGN_WORDS = [
  ['SOLMARA', 0xff6ba6],
  ['NEON', 0xff4f6a],
  ['HOTEL', 0x6bd0ff],
  ['CLUB', 0xc06bff],
  ['CAFE', 0xffc861],
  ['TACO', 0x6bffb0],
  ['MERCADO', 0xff9a4f],
  ['MOTEL', 0x8ab4ff],
  ['BANCO', 0x9ff06b],
  ['PIER', 0x5fe0d0],
  ['DOCKS', 0xffd05f],
  ['FUEL', 0xff7f4f],
  ['GARAGE', 0x9aa8ff],
  ['BEACH', 0x5fd8ff],
  ['AIRSTRIP', 0xdfe6ff],
];

export const BILLBOARDS = [
  ['VISIT SOLMARA', 'THE SUN NEVER SETS', 0x2f8fd0],
  ['MARINA YACHTS', 'MOORINGS FROM 40', 0x1f9f8f],
  ['VERANO GRILL', 'OPEN LATE EVERY NIGHT', 0xc2452a],
  ['VOLT COLA', 'COLD AND LOUD', 0x8a4fd0],
];

export const MURALS = 3;

function lambert(options) {
  return new THREE.MeshLambertMaterial({ vertexColors: true, ...options });
}

export function createMaterials(textures, settings = {}) {
  const facadeTiles = { u: 1 / 12.8, v: 1 / 13.6 };
  const buckets = {};
  const facadeMaterials = [];
  const neonEntries = [];
  const billboardEntries = [];
  const muralMaterials = [];
  const glows = [];
  const trackables = [];

  // --- ground and structure -------------------------------------------------
  buckets[BUCKETS.road] = lambert({ map: textures.road() });
  buckets[BUCKETS.roadWide] = lambert({ map: textures.road({ wide: true }) });
  buckets[BUCKETS.junction] = lambert({ map: textures.junction() });
  buckets[BUCKETS.crossing] = new THREE.MeshLambertMaterial({
    map: textures.zebra(),
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  buckets[BUCKETS.sidewalk] = lambert({ map: textures.sidewalk() });
  buckets[BUCKETS.plaza] = lambert({ map: textures.plaza() });
  buckets[BUCKETS.plazaStone] = lambert({ map: textures.concrete(0xb9b4a6) });
  buckets[BUCKETS.kerb] = lambert({ map: textures.concrete(0x8e8c86) });
  buckets[BUCKETS.concrete] = lambert({ map: textures.concrete(0x9d9c96) });
  buckets[BUCKETS.concreteDark] = lambert({ map: textures.concrete(0x6f6f6a) });
  buckets[BUCKETS.concreteRail] = lambert({ map: textures.concrete(0xb0aea6) });
  buckets[BUCKETS.roof] = lambert({ map: textures.roof() });
  // Foliage is double sided because palm fronds and reeds are single quads.
  buckets[BUCKETS.foliage] = lambert({ map: textures.grass(), side: THREE.DoubleSide });
  buckets[BUCKETS.grass] = lambert({ map: textures.grass() });
  buckets[BUCKETS.marsh] = lambert({ map: textures.marsh() });
  buckets[BUCKETS.sand] = lambert({ map: textures.sand() });
  buckets[BUCKETS.cityGround] = lambert({ map: textures.concrete(0x8f8b84) });
  buckets[BUCKETS.seafloor] = lambert({ map: textures.sand() });
  buckets[BUCKETS.dirt] = lambert({ map: textures.dirt() });
  buckets[BUCKETS.boardwalk] = lambert({ map: textures.boardwalk() });
  buckets[BUCKETS.planks] = lambert({ map: textures.planks(0x8a6a44) });
  buckets[BUCKETS.metal] = lambert({ map: textures.metal(0x6d7378) });
  buckets[BUCKETS.metalDark] = lambert({ map: textures.metal(0x474d52) });
  buckets[BUCKETS.railing] = lambert({ map: textures.metal(0x8a9096) });
  buckets[BUCKETS.siding] = lambert({ map: textures.siding(0x7d8388) });
  buckets[BUCKETS.hangarSiding] = lambert({ map: textures.siding(0x9aa0a4) });
  buckets[BUCKETS.container] = lambert({ map: textures.container(0) });

  // --- water ---------------------------------------------------------------
  buckets[BUCKETS.water] = new THREE.MeshStandardMaterial({
    map: textures.water(),
    color: 0xffffff,
    roughness: 0.22,
    metalness: 0.12,
    vertexColors: true,
  });
  buckets[BUCKETS.waterGlint] = new THREE.MeshBasicMaterial({
    map: textures.waterGlint(),
    transparent: true,
    opacity: 0.4,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    vertexColors: true,
    toneMapped: false,
  });

  // --- facades -------------------------------------------------------------
  for (const variant of FACADE_VARIANTS) {
    const entry = textures.facade(variant);
    const material = lambert({
      map: entry.map,
      emissive: 0xffeedd,
      emissiveMap: entry.emissive,
      emissiveIntensity: 0,
    });
    material.name = `facade:${variant}`;
    buckets[`facade:${variant}`] = material;
    facadeMaterials.push(material);
  }

  const glassEntry = textures.glass();
  const glassMaterial = lambert({
    map: glassEntry.map,
    emissive: 0xfff0d8,
    emissiveMap: glassEntry.emissive,
    emissiveIntensity: 0,
  });
  glassMaterial.name = 'glass-curtain';
  buckets[BUCKETS.glass] = glassMaterial;
  facadeMaterials.push(glassMaterial);
  trackables.push(glassMaterial);

  // --- street lamps --------------------------------------------------------
  const lampMaterial = lambert({ map: textures.metal(0x53585c), emissive: 0xffe2a8, emissiveIntensity: 0.1 });
  lampMaterial.name = 'lamp-head';
  buckets[BUCKETS.lamp] = lampMaterial;

  const glowMaterial = new THREE.MeshBasicMaterial({
    map: textures.lampGlow(),
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    vertexColors: true,
    toneMapped: false,
  });
  glowMaterial.name = 'lamp-pool';
  buckets[BUCKETS.glow] = glowMaterial;
  glows.push(glowMaterial);

  // --- signage -------------------------------------------------------------
  SIGN_WORDS.forEach(([word, hue], index) => {
    const entry = textures.sign(word, hue);
    const material = lambert({
      map: entry.map,
      emissive: 0xffffff,
      emissiveMap: entry.emissive,
      emissiveIntensity: 0.4,
    });
    material.name = `neon:${word}`;
    const bucket = `neon:${index}`;
    buckets[bucket] = material;
    neonEntries.push({ word, hue, bucket, material, aspect: entry.aspect });
  });

  BILLBOARDS.forEach(([headline, sub, hue], index) => {
    const texture = textures.billboard(headline, sub, hue);
    const material = lambert({ map: texture, emissive: 0xffffff, emissiveMap: texture, emissiveIntensity: 0 });
    material.name = `billboard:${headline}`;
    const bucket = `billboard:${index}`;
    buckets[bucket] = material;
    billboardEntries.push({ headline, sub, bucket, material, aspect: 2 });
  });

  for (let index = 0; index < MURALS; index += 1) {
    const material = lambert({ map: textures.mural(index) });
    material.name = `mural:${index}`;
    const bucket = `mural:${index}`;
    buckets[bucket] = material;
    muralMaterials.push(material);
  }

  buckets.default = buckets[BUCKETS.concrete];

  /** Applies the day/night palette to the glow channels. */
  function update(palette) {
    const windows = palette.windowGlow ?? 0;
    const lamps = palette.lampGlow ?? 0;
    const facadeEmission = windows * 1.15;
    for (const material of facadeMaterials) material.emissiveIntensity = facadeEmission;
    for (const material of muralMaterials) material.emissiveIntensity = 0;
    for (const entry of neonEntries) entry.material.emissiveIntensity = 0.35 + lamps * 1.7;
    for (const entry of billboardEntries) entry.material.emissiveIntensity = windows * 0.5;
    lampMaterial.emissiveIntensity = 0.1 + lamps * 2.5;
    for (const material of glows) {
      material.opacity = lamps * 0.72;
      material.visible = material.opacity > 0.015;
    }
  }

  return {
    buckets,
    facadeMaterials,
    facadeTiles,
    neon: neonEntries,
    billboards: billboardEntries,
    murals: muralMaterials,
    glows,
    lampMaterial,
    update,
    counts: {
      materials: Object.keys(buckets).length,
      facades: facadeMaterials.length,
      signs: neonEntries.length,
    },
    dispose() {
      for (const material of Object.values(buckets)) material.dispose?.();
    },
  };
}
