// The ground of Solmara: the gritty city base, the beach sand and boardwalk, the
// harbour quay, the marsh and runway of the airstrip, park lawns and the retaining walls
// that hold the channel and the shoreline. Flat quads in a handful of merged meshes, so
// the whole surface costs a few draws. Water is its own shader in water.js.

import { MeshBuilder, cityMaterial, colorTriple } from './geometry.js';
import { Random } from '../core/rng.js';
import { AIRSTRIP, BEACH, GRID, HARBOUR, WATER, isWaterAt } from './plan.js';
import { districtOf } from './districts.js';

const BASE_Y = -0.06;

/**
 * Builds every ground layer.
 * @returns {{group: THREE.Group, parkBlocks: Array<object>, materials: object}}
 */
export function buildTerrain(plan, textures, options = {}) {
  const group = new THREE.Group();
  group.name = 'terrain';
  const random = new Random(`${plan.seed}:terrain`);

  const base = new MeshBuilder('terrain-base');
  const sand = new MeshBuilder('beach-sand');
  const planks = new MeshBuilder('boardwalk');
  const concrete = new MeshBuilder('quay-concrete');
  const grass = new MeshBuilder('park-grass');
  const marsh = new MeshBuilder('marsh');
  const runway = new MeshBuilder('runway');
  const walls = new MeshBuilder('sea-walls');

  const land = colorTriple(0x8f8b80);

  // ---------------------------------------------------------------- land base
  // Two large pieces either side of the channel, plus the northern cap that bridges
  // the gap above the channel's head. This leaves the channel and the sea uncovered.
  const north = -975;
  const south = 638;
  const west = -876;
  const east = 1272;
  const ch0 = WATER.channelX0;
  const ch1 = WATER.channelX1;
  base.plane((west + ch0) / 2, (north + south) / 2, ch0 - west, south - north, BASE_Y, land, { uvScale: 18 });
  base.plane((ch1 + east) / 2, (north + south) / 2, east - ch1, south - north, BASE_Y, land, { uvScale: 18 });
  base.plane((ch0 + ch1) / 2, (north + WATER.channelZ0) / 2, ch1 - ch0, WATER.channelZ0 - north, BASE_Y, land, { uvScale: 18 });

  // ---------------------------------------------------------------- beach
  const beach = colorTriple(0xd7c299);
  sand.plane((BEACH.x0 + BEACH.x1) / 2, (BEACH.z0 + 20 + WATER.seaSouthZ) / 2, BEACH.x1 - BEACH.x0, WATER.seaSouthZ - BEACH.z0 - 20, 0.015, beach, { uvScale: 10 });
  // A wet strip at the waterline, darker and slightly lower.
  sand.plane((BEACH.x0 + BEACH.x1) / 2, WATER.seaSouthZ - 6, BEACH.x1 - BEACH.x0, 12, 0.004, colorTriple(0xb49d78), { uvScale: 8 });
  // The promenade and the boardwalk.
  concrete.plane((BEACH.x0 + BEACH.x1) / 2, (BEACH.z0 + BEACH.boardwalkZ - 14) / 2, BEACH.x1 - BEACH.x0, BEACH.boardwalkZ - 14 - BEACH.z0, 0.03, colorTriple(0xbfb7a6), { uvScale: 9 });
  planks.plane((BEACH.x0 + BEACH.x1) / 2, BEACH.boardwalkZ, BEACH.x1 - BEACH.x0, 14, 0.07, colorTriple(0xc2a274), { uvScale: 6, repeatX: (BEACH.x1 - BEACH.x0) / 16, repeatY: 1 });
  // Boardwalk edge beams.
  planks.beam(BEACH.x0, BEACH.boardwalkZ - 7.4, BEACH.x1, BEACH.boardwalkZ - 7.4, 1.6, 0.5, -0.1, colorTriple(0x6e5437), { uvScale: 4 });
  planks.beam(BEACH.x0, BEACH.boardwalkZ + 7.4, BEACH.x1, BEACH.boardwalkZ + 7.4, 1.6, 0.5, -0.1, colorTriple(0x6e5437), { uvScale: 4 });

  // ---------------------------------------------------------------- harbour quay
  concrete.plane((HARBOUR.x0 + HARBOUR.x1) / 2, (HARBOUR.z0 + HARBOUR.z1) / 2, HARBOUR.x1 - HARBOUR.x0, HARBOUR.z1 - HARBOUR.z0, 0.02, colorTriple(0xa5a096), { uvScale: 12 });
  // Painted lane down the container yard.
  concrete.plane((HARBOUR.x0 + HARBOUR.x1) / 2, 470, HARBOUR.x1 - HARBOUR.x0 - 30, 12, 0.03, colorTriple(0x8b877c), { uvScale: 6 });
  // Yellow quay edge.
  concrete.plane((HARBOUR.x0 + HARBOUR.x1) / 2, HARBOUR.quayZ + 18, HARBOUR.x1 - HARBOUR.x0, 1.6, 0.035, colorTriple(0xd8b24a), { uvScale: 2 });

  // ---------------------------------------------------------------- marsh + airstrip
  const marshColor = colorTriple(0x6f7356);
  marsh.plane((AIRSTRIP.x0 + AIRSTRIP.x1) / 2, (AIRSTRIP.z0 + AIRSTRIP.z1) / 2, AIRSTRIP.x1 - AIRSTRIP.x0, AIRSTRIP.z1 - AIRSTRIP.z0, 0.01, marshColor, { uvScale: 12 });
  // Reedy pools, a few dark quads, none of them navigable.
  const reeds = colorTriple(0x4f6247);
  for (let i = 0; i < 12; i += 1) {
    const x = random.range(AIRSTRIP.x0 + 20, AIRSTRIP.x1 - 20);
    const z = random.range(AIRSTRIP.z0 + 20, AIRSTRIP.z1 - 20);
    if (Math.abs(x - AIRSTRIP.runwayX) < 40) continue;
    const w = random.range(18, 60);
    const d = random.range(10, 34);
    marsh.plane(x, z, w, d, 0.02, reeds, { uvScale: 6, rotY: random.range(0, Math.PI) });
  }
  const asphalt = colorTriple(0x4a4844);
  runway.plane(AIRSTRIP.runwayX, (AIRSTRIP.runwayZ0 + AIRSTRIP.runwayZ1) / 2, AIRSTRIP.runwayWidth, AIRSTRIP.runwayZ1 - AIRSTRIP.runwayZ0, 0.03, asphalt, {
    uvScale: 8,
    repeatX: 1,
    repeatY: (AIRSTRIP.runwayZ1 - AIRSTRIP.runwayZ0) / 30,
  });
  // Threshold bars at both ends.
  const paint = colorTriple(0xe6e0c8);
  for (let i = -3; i <= 3; i += 1) {
    runway.plane(AIRSTRIP.runwayX + i * 4.2, AIRSTRIP.runwayZ0 + 12, 2.2, 20, 0.04, paint, { uvScale: 2 });
    runway.plane(AIRSTRIP.runwayX + i * 4.2, AIRSTRIP.runwayZ1 - 12, 2.2, 20, 0.04, paint, { uvScale: 2 });
  }
  concrete.plane(AIRSTRIP.runwayX + 46, -712, 88, 62, 0.025, colorTriple(0x8b877a), { uvScale: 8 });
  concrete.plane(AIRSTRIP.runwayX + 26, -744, 26, 120, 0.026, colorTriple(0x7e7a6e), { uvScale: 6 });

  // ---------------------------------------------------------------- parks
  const parkBlocks = plan.blocks.filter((block) => block.park);
  for (const block of parkBlocks) {
    const inner = block.inner;
    const w = inner.x1 - inner.x0;
    const d = inner.z1 - inner.z0;
    grass.plane(block.cx, block.cz, w, d, 0.012, colorTriple(0x6f8a4a), { uvScale: 7 });
    // A cross of paths.
    concrete.plane(block.cx, block.cz, w, 5, 0.02, colorTriple(0xbcb39e), { uvScale: 3 });
    concrete.plane(block.cx, block.cz, 5, d, 0.02, colorTriple(0xbcb39e), { uvScale: 3 });
  }

  // ---------------------------------------------------------------- shore walls
  const wallColor = colorTriple(0x77736a);
  const wallTop = 0.22;
  const wallBottom = -2.2;
  const wallHeight = wallTop - wallBottom;
  // Channel banks, both sides, from the harbour to the marsh.
  walls.box(WATER.channelX0 - 1.2, wallBottom, (WATER.channelZ0 + WATER.seaSouthZ) / 2, 2.4, wallHeight, WATER.seaSouthZ - WATER.channelZ0, wallColor, { uvScale: 6 });
  walls.box(WATER.channelX1 + 1.2, wallBottom, (WATER.channelZ0 + WATER.seaSouthZ) / 2, 2.4, wallHeight, WATER.seaSouthZ - WATER.channelZ0, wallColor, { uvScale: 6 });
  // The sea wall along the south shore, broken by the beach sand.
  walls.box((HARBOUR.x0 + BEACH.x0) / 2, wallBottom, WATER.seaSouthZ + 1.2, BEACH.x0 - HARBOUR.x0, wallHeight, 2.4, wallColor, { uvScale: 6 });
  // The west shore.
  walls.box(WATER.seaWestX - 1.2, wallBottom, (north + south) / 2, 2.4, wallHeight, south - north, wallColor, { uvScale: 6 });

  // ---------------------------------------------------------------- materials
  const materials = {
    base: cityMaterial(textures.terrainGrit(), { emissiveIntensity: 0 }),
    sand: cityMaterial(textures.sand()),
    planks: cityMaterial(textures.boardwalk()),
    concrete: cityMaterial(textures.concrete()),
    grass: cityMaterial(textures.grass()),
    marsh: cityMaterial(textures.grass(), { color: 0x9aa47a }),
    runway: cityMaterial(textures.runway()),
    walls: cityMaterial(textures.concrete(), { color: 0xb5b0a4 }),
  };

  base.attach(group, materials.base, 'ground-base');
  sand.attach(group, materials.sand, 'beach-sand');
  planks.attach(group, materials.planks, 'boardwalk');
  concrete.attach(group, materials.concrete, 'quay-concrete');
  grass.attach(group, materials.grass, 'park-lawns');
  marsh.attach(group, materials.marsh, 'marsh');
  runway.attach(group, materials.runway, 'runway');
  walls.attach(group, materials.walls, 'sea-walls');

  return {
    group,
    parkBlocks,
    materials,
    surfaces: {
      beach: { x0: BEACH.x0, x1: BEACH.x1, z0: BEACH.z0, z1: WATER.seaSouthZ },
      boardwalk: { x0: BEACH.x0, x1: BEACH.x1, z0: BEACH.boardwalkZ - 7, z1: BEACH.boardwalkZ + 7 },
      quay: { ...HARBOUR },
      runway: { x: AIRSTRIP.runwayX, z0: AIRSTRIP.runwayZ0, z1: AIRSTRIP.runwayZ1, width: AIRSTRIP.runwayWidth },
    },
    triangles: base.triangles + sand.triangles + planks.triangles + concrete.triangles + grass.triangles + marsh.triangles + runway.triangles + walls.triangles,
  };
}

export { BASE_Y };
