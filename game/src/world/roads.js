// Streets: asphalt ribbons with lane paint, junction caps, zebra crossings, the raised
// pavements and kerbs around every block, and the elevated ring highway with its pillars
// and guard rails. Each surface class is merged into one mesh, so the whole street grid
// is a dozen draw calls rather than a thousand.

import { MeshBuilder, cityMaterial, colorTriple } from './geometry.js';
import { Random } from '../core/rng.js';
import { GRID, HIGHWAY, isWaterAt } from './plan.js';
import { districtOf } from './districts.js';

const ROAD_Y = 0.08;
const SIDEWALK_Y = 0.16;
const KERB_TOP = 0.22;

// The four approaches of a signalised junction, as (offset, strip rotation) pairs.
const CROSSING_ARMS = [
  { dx: 0, dz: -1, rot: 0 },
  { dx: 0, dz: 1, rot: 0 },
  { dx: -1, dz: 0, rot: Math.PI / 2 },
  { dx: 1, dz: 0, rot: Math.PI / 2 },
];

/**
 * Builds the street grid.
 * @returns {{group: THREE.Group, materials: object, triangles: number, crossings: number}}
 */
export function buildRoads(plan, textures, options = {}) {
  const group = new THREE.Group();
  group.name = 'roads';
  const random = new Random(`${plan.seed}:roads`);

  const asphalt = new MeshBuilder('road-asphalt');
  const crossings = new MeshBuilder('crossings');
  const pavements = new MeshBuilder('pavements');
  const kerbs = new MeshBuilder('kerbs');
  const white = colorTriple(0xffffff);
  let crossingCount = 0;

  for (const edge of plan.edges) {
    // Bridge decks belong to landmarks.js; water has no street to lay.
    if (edge.bridge) continue;
    if (isWaterAt((edge.ax + edge.bx) / 2, (edge.az + edge.bz) / 2)) continue;
    asphalt.plane(
      (edge.ax + edge.bx) / 2,
      (edge.az + edge.bz) / 2,
      edge.width,
      edge.length + 1,
      ROAD_Y,
      white,
      {
        rotY: Math.atan2(edge.bx - edge.ax, edge.bz - edge.az),
        uvScale: 12,
        repeatX: 1,
        repeatY: edge.length / 20,
      },
    );
  }

  // Junction caps hide the seams where four ribbons meet.
  for (const node of plan.nodes) {
    asphalt.plane(node.x, node.z, GRID.roadWidth + 2, GRID.roadWidth + 2, ROAD_Y + 0.002, white, { uvScale: 10 });
  }

  // Zebra crossings on the approaches of the busier junctions. The crossing texture is a
  // run of bars along U, so one 18 m strip reads as a zebra.
  for (const node of plan.nodes) {
    if (!node.signal) continue;
    for (const arm of CROSSING_ARMS) {
      const cx = node.x + arm.dx * 13;
      const cz = node.z + arm.dz * 13;
      if (isWaterAt(cx, cz)) continue;
      crossings.plane(cx, cz, GRID.roadWidth - 1, 4.6, ROAD_Y + 0.012, white, {
        rotY: arm.rot,
        uvScale: 4,
        repeatX: 1,
        repeatY: 1,
      });
      crossingCount += 1;
    }
  }

  // Pavement rings and kerbs around each block.
  const sidewalk = GRID.sidewalk;
  for (const block of plan.blocks) {
    const w = block.x1 - block.x0;
    const d = block.z1 - block.z0;
    if (w < sidewalk * 3 || d < sidewalk * 3) continue;
    // Each block gets a slightly different slab tone so the grid does not look stamped.
    const shade = colorTriple(districtOf(block.district).palette.ground, 0.95 + random.range(0, 0.08));

    // Four strips in a ring; they overlap at the corners, which is invisible.
    pavements.plane(block.cx, block.z0 + sidewalk / 2, w, sidewalk, SIDEWALK_Y, shade, {
      uvScale: 4,
      repeatX: w / 4,
      repeatY: 1,
    });
    pavements.plane(block.cx, block.z1 - sidewalk / 2, w, sidewalk, SIDEWALK_Y, shade, {
      uvScale: 4,
      repeatX: w / 4,
      repeatY: 1,
    });
    pavements.plane(block.x0 + sidewalk / 2, block.cz, sidewalk, d, SIDEWALK_Y, shade, {
      uvScale: 4,
      repeatX: 1,
      repeatY: d / 4,
    });
    pavements.plane(block.x1 - sidewalk / 2, block.cz, sidewalk, d, SIDEWALK_Y, shade, {
      uvScale: 4,
      repeatX: 1,
      repeatY: d / 4,
    });

    // Kerb faces along the four outside edges.
    kerbs.beam(block.x0, block.z0, block.x1, block.z0, 0.7, KERB_TOP, 0, white, { uvScale: 2 });
    kerbs.beam(block.x0, block.z1, block.x1, block.z1, 0.7, KERB_TOP, 0, white, { uvScale: 2 });
    kerbs.beam(block.x0, block.z0, block.x0, block.z1, 0.7, KERB_TOP, 0, white, { uvScale: 2 });
    kerbs.beam(block.x1, block.z0, block.x1, block.z1, 0.7, KERB_TOP, 0, white, { uvScale: 2 });
  }

  const materials = {
    asphalt: cityMaterial(textures.road()),
    crossings: cityMaterial(textures.crossing()),
    pavements: cityMaterial(textures.sidewalk()),
    kerbs: cityMaterial(textures.concrete(), { color: 0xcfc8b8 }),
  };

  asphalt.attach(group, materials.asphalt, 'asphalt');
  crossings.attach(group, materials.crossings, 'crossings');
  pavements.attach(group, materials.pavements, 'pavements');
  kerbs.attach(group, materials.kerbs, 'kerbs');

  return {
    group,
    materials,
    crossings: crossingCount,
    triangles: asphalt.triangles + crossings.triangles + pavements.triangles + kerbs.triangles,
  };
}

/**
 * The elevated ring highway: a closed deck with guard rails, lantern posts and support
 * pillars, plus two stepped ramps down to street level.
 */
export function buildHighway(plan, textures, colliders, options = {}) {
  const group = new THREE.Group();
  group.name = 'highway';
  const deck = new MeshBuilder('highway-deck');
  const rails = new MeshBuilder('highway-rails');
  const pillars = new MeshBuilder('highway-pillars');
  const lampHeads = [];

  const height = HIGHWAY.height;
  const width = HIGHWAY.width;
  const deckColor = colorTriple(0xffffff);
  const railColor = colorTriple(0xbfc4c6);
  const pillarColor = colorTriple(0x9a9790);

  for (const segment of plan.highway.segments) {
    deck.beam(segment.ax, segment.az, segment.bx, segment.bz, width, 1.1, height - 1.1, deckColor, { uvScale: 8 });

    // Guard rails sit a little inside the deck edge, one on each side.
    const nx = -segment.dirZ;
    const nz = segment.dirX;
    const inset = width / 2 - 0.6;
    for (const side of [1, -1]) {
      rails.beam(
        segment.ax + nx * inset * side,
        segment.az + nz * inset * side,
        segment.bx + nx * inset * side,
        segment.bz + nz * inset * side,
        0.7,
        1.1,
        height,
        railColor,
        { uvScale: 4 },
      );
    }

    // Pillars every ~46 m; the deck reads as a viaduct from the street below.
    const count = Math.max(1, Math.round(segment.length / 46));
    for (let i = 0; i < count; i += 1) {
      const t = (i + 0.5) / count;
      const x = segment.ax + (segment.bx - segment.ax) * t;
      const z = segment.az + (segment.bz - segment.az) * t;
      // A pillar in the channel or through a building is simply skipped: the deck spans.
      if (isWaterAt(x, z)) continue;
      if (colliders.blockedAt(x, z, 2)) continue;

      pillars.box(x, 0, z, 3.2, height - 1.1, 3.2, pillarColor, { uvScale: 6 });
      pillars.box(x, height - 1.5, z, 5.2, 0.5, 5.2, pillarColor, { uvScale: 4 });
      colliders.addBoxAt(x, z, 1.7, 1.7, height - 1.1, 'highway-pillar', { x, z });

      // A lantern post on the rail every other pillar.
      if (i % 2 === 0) {
        const lampX = x + nx * inset;
        const lampZ = z + nz * inset;
        lampHeads.push({ x: lampX, z: lampZ, y: height + 1.1 });
        rails.box(lampX, height, lampZ, 0.32, 5.6, 0.32, railColor, { uvScale: 3 });
      }
    }
  }

  // Two ramps, one east and one west, each a walk of sloped deck quads down to the street.
  const makeRamp = (x0, z0, x1, z1, fromY, toY) => {
    const steps = 10;
    const dirX = (x1 - x0) / steps;
    const dirZ = (z1 - z0) / steps;
    // The half-width offset, perpendicular to the ramp direction.
    const nx = -(z1 - z0);
    const nz = x1 - x0;
    const length = Math.hypot(nx, nz) || 1;
    const halfX = (nx / length) * (width / 2);
    const halfZ = (nz / length) * (width / 2);

    for (let i = 0; i < steps; i += 1) {
      const ax = x0 + dirX * i;
      const az = z0 + dirZ * i;
      const bx = x0 + dirX * (i + 1);
      const bz = z0 + dirZ * (i + 1);
      const ay = fromY + ((toY - fromY) * i) / steps;
      const by = fromY + ((toY - fromY) * (i + 1)) / steps;

      deck.quad(
        [ax + halfX, ay, az + halfZ],
        [bx + halfX, by, bz + halfZ],
        [bx - halfX, by, bz - halfZ],
        [ax - halfX, ay, az - halfZ],
        [0, 1, 0],
        deckColor,
        [[0, 0], [1, 0], [1, 1], [0, 1]],
      );
      rails.beam(ax + halfX, az + halfZ, bx + halfX, bz + halfZ, 0.6, 1, ay, railColor, { uvScale: 4 });
      rails.beam(ax - halfX, az - halfZ, bx - halfX, bz - halfZ, 0.6, 1, ay, railColor, { uvScale: 4 });
    }
  };
  makeRamp(676, 300, 760, 210, HIGHWAY.height, 0.1);
  makeRamp(-176, 300, -90, 220, HIGHWAY.height, 0.1);

  const materials = {
    deck: cityMaterial(textures.asphalt(), { color: 0xa8a8a8 }),
    rails: cityMaterial(textures.concrete(), { color: 0xd0d3d2 }),
    pillars: cityMaterial(textures.concrete(), { color: 0xb9b6ad }),
  };
  deck.attach(group, materials.deck, 'highway-deck');
  rails.attach(group, materials.rails, 'highway-rails');
  pillars.attach(group, materials.pillars, 'highway-pillars');

  return {
    group,
    materials,
    lampHeads,
    triangles: deck.triangles + rails.triangles + pillars.triangles,
  };
}
