// The ground of Solmara: the gritty city base, the beach sand and boardwalk, the harbour
// quay, the marsh and runway of the airstrip, park lawns and the retaining walls that
// hold the channel and the shoreline. Flat quads in a handful of merged meshes, so the
// whole surface costs a few draws. Water is its own shader in water.js.

import { MeshBuilder, cityMaterial, colorTriple } from './geometry.js';
import { Random } from '../core/rng.js';
import { AIRSTRIP, BEACH, HARBOUR, WATER } from './plan.js';

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
  // Two large pieces either side of the channel, plus the northern cap over the channel's
  // head, leaves the channel and the sea uncovered.
  // The land rectangle, inset from the plan bounds so the sea shows at every edge.
  const north = -975;
  const south = 638;
  const west = -876;
  const east = 1272;
  const channelWest = WATER.channelX0;
  const channelEast = WATER.channelX1;
  const midZ = (north + south) / 2;
  base.plane((west + channelWest) / 2, midZ, channelWest - west, south - north, BASE_Y, land, { uvScale: 18 });
  base.plane((channelEast + east) / 2, midZ, east - channelEast, south - north, BASE_Y, land, { uvScale: 18 });
  base.plane(
    (channelWest + channelEast) / 2,
    (north + WATER.channelZ0) / 2,
    channelEast - channelWest,
    WATER.channelZ0 - north,
    BASE_Y,
    land,
    { uvScale: 18 },
  );

  // ---------------------------------------------------------------- beach
  const beachWidth = BEACH.x1 - BEACH.x0;
  const beachMidX = (BEACH.x0 + BEACH.x1) / 2;
  sand.plane(beachMidX, (BEACH.z0 + 20 + WATER.seaSouthZ) / 2, beachWidth, WATER.seaSouthZ - BEACH.z0 - 20, 0.015, colorTriple(0xd7c299), {
    uvScale: 10,
  });
  // A wet strip at the waterline, darker and slightly lower.
  sand.plane(beachMidX, WATER.seaSouthZ - 6, beachWidth, 12, 0.004, colorTriple(0xb49d78), { uvScale: 8 });
  // The promenade and the boardwalk.
  concrete.plane(
    beachMidX,
    (BEACH.z0 + BEACH.boardwalkZ - 14) / 2,
    beachWidth,
    BEACH.boardwalkZ - 14 - BEACH.z0,
    0.03,
    colorTriple(0xbfb7a6),
    { uvScale: 9 },
  );
  planks.plane(beachMidX, BEACH.boardwalkZ, beachWidth, 14, 0.07, colorTriple(0xc2a274), {
    uvScale: 6,
    repeatX: beachWidth / 16,
    repeatY: 1,
  });
  // Boardwalk edge beams.
  for (const edgeZ of [BEACH.boardwalkZ - 7.4, BEACH.boardwalkZ + 7.4]) {
    planks.beam(BEACH.x0, edgeZ, BEACH.x1, edgeZ, 1.6, 0.5, -0.1, colorTriple(0x6e5437), { uvScale: 4 });
  }

  // ---------------------------------------------------------------- harbour quay
  const harbourWidth = HARBOUR.x1 - HARBOUR.x0;
  const harbourMidX = (HARBOUR.x0 + HARBOUR.x1) / 2;
  concrete.plane(harbourMidX, (HARBOUR.z0 + HARBOUR.z1) / 2, harbourWidth, HARBOUR.z1 - HARBOUR.z0, 0.02, colorTriple(0xa5a096), {
    uvScale: 12,
  });
  // A painted lane down the container yard, and the yellow quay edge.
  concrete.plane(harbourMidX, 470, harbourWidth - 30, 12, 0.03, colorTriple(0x8b877c), { uvScale: 6 });
  concrete.plane(harbourMidX, HARBOUR.quayZ + 18, harbourWidth, 1.6, 0.035, colorTriple(0xd8b24a), { uvScale: 2 });

  // ---------------------------------------------------------------- marsh + airstrip
  marsh.plane(
    (AIRSTRIP.x0 + AIRSTRIP.x1) / 2,
    (AIRSTRIP.z0 + AIRSTRIP.z1) / 2,
    AIRSTRIP.x1 - AIRSTRIP.x0,
    AIRSTRIP.z1 - AIRSTRIP.z0,
    0.01,
    colorTriple(0x6f7356),
    { uvScale: 12 },
  );
  // Reedy pools: dark quads, none of them navigable, none on the runway line.
  const reeds = colorTriple(0x4f6247);
  for (let i = 0; i < 12; i += 1) {
    const x = random.range(AIRSTRIP.x0 + 20, AIRSTRIP.x1 - 20);
    const z = random.range(AIRSTRIP.z0 + 20, AIRSTRIP.z1 - 20);
    if (Math.abs(x - AIRSTRIP.runwayX) < 40) continue;
    marsh.plane(x, z, random.range(18, 60), random.range(10, 34), 0.02, reeds, {
      uvScale: 6,
      rotY: random.range(0, Math.PI),
    });
  }

  const runwayLength = AIRSTRIP.runwayZ1 - AIRSTRIP.runwayZ0;
  runway.plane(AIRSTRIP.runwayX, (AIRSTRIP.runwayZ0 + AIRSTRIP.runwayZ1) / 2, AIRSTRIP.runwayWidth, runwayLength, 0.03, colorTriple(0x4a4844), {
    uvScale: 8,
    repeatX: 1,
    repeatY: runwayLength / 30,
  });
  // Threshold bars at both ends.
  const paint = colorTriple(0xe6e0c8);
  for (let i = -3; i <= 3; i += 1) {
    runway.plane(AIRSTRIP.runwayX + i * 4.2, AIRSTRIP.runwayZ0 + 12, 2.2, 20, 0.04, paint, { uvScale: 2 });
    runway.plane(AIRSTRIP.runwayX + i * 4.2, AIRSTRIP.runwayZ1 - 12, 2.2, 20, 0.04, paint, { uvScale: 2 });
  }
  // The apron and its taxying lane.
  concrete.plane(AIRSTRIP.runwayX + 46, -712, 88, 62, 0.025, colorTriple(0x8b877a), { uvScale: 8 });
  concrete.plane(AIRSTRIP.runwayX + 26, -744, 26, 120, 0.026, colorTriple(0x7e7a6e), { uvScale: 6 });

  // ---------------------------------------------------------------- parks
  const parkBlocks = plan.blocks.filter((block) => block.park);
  for (const block of parkBlocks) {
    const { inner } = block;
    const w = inner.x1 - inner.x0;
    const d = inner.z1 - inner.z0;
    grass.plane(block.cx, block.cz, w, d, 0.012, colorTriple(0x6f8a4a), { uvScale: 7 });
    // A cross of paths, one north-south and one east-west.
    concrete.plane(block.cx, block.cz, w, 5, 0.02, colorTriple(0xbcb39e), { uvScale: 3 });
    concrete.plane(block.cx, block.cz, 5, d, 0.02, colorTriple(0xbcb39e), { uvScale: 3 });
  }

  // ---------------------------------------------------------------- shore walls
  const wallColor = colorTriple(0x77736a);
  const wallBottom = -2.2;
  const wallHeight = 0.22 - wallBottom;
  const channelSpan = (WATER.channelZ0 + WATER.seaSouthZ) / 2;
  const channelLength = WATER.seaSouthZ - WATER.channelZ0;
  // Channel banks, both sides, from the harbour to the marsh.
  walls.box(WATER.channelX0 - 1.2, wallBottom, channelSpan, 2.4, wallHeight, channelLength, wallColor, { uvScale: 6 });
  walls.box(WATER.channelX1 + 1.2, wallBottom, channelSpan, 2.4, wallHeight, channelLength, wallColor, { uvScale: 6 });
  // The sea wall along the south shore, broken by the beach sand, and the west shore.
  walls.box((HARBOUR.x0 + BEACH.x0) / 2, wallBottom, WATER.seaSouthZ + 1.2, BEACH.x0 - HARBOUR.x0, wallHeight, 2.4, wallColor, {
    uvScale: 6,
  });
  walls.box(WATER.seaWestX - 1.2, wallBottom, midZ, 2.4, wallHeight, south - north, wallColor, { uvScale: 6 });

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
    triangles:
      base.triangles +
      sand.triangles +
      planks.triangles +
      concrete.triangles +
      grass.triangles +
      marsh.triangles +
      runway.triangles +
      walls.triangles,
  };
}

export { BASE_Y };
