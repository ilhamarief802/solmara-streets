// Street geometry: the asphalt ribbon of every avenue, the sidewalks and kerbs that hem it in,
// the zebra crossings at junctions, the two channel bridges and the elevated ring highway above
// the whole city. Every quad here is placed from the plan's graph, so a street the traffic layer
// later drives is exactly the street the player sees.

import { MeshBuilder, colorTriple, cityMaterial } from './geometry.js';
import { GRID, HIGHWAY, WATER, isWaterAt } from './plan.js';
import { clamp } from '../core/math.js';

/** Half a street, in metres, for laying road quads over the graph's centrelines. */
const ROAD_HALF = GRID.streetWidth / 2;
const SIDEWALK_WIDTH = 5;

/** A dark seam line under the kerb, so streets read as cut into the block rather than laid on it. */
const KERB_HEIGHT = 0.17;

/**
 * Builds the road surface, sidewalks, crossings and junctions.
 * @param {object} plan
 * @param {object} textures TextureLibrary
 * @returns {{group: THREE.Group, colliders: Array<object>}}
 */
export function buildRoads(plan, textures) {
  const group = new THREE.Group();
  group.name = 'roads';

  const asphalt = new MeshBuilder('asphalt');
  const markings = new MeshBuilder('road-markings');
  const sidewalk = new MeshBuilder('sidewalks');
  const crossings = new MeshBuilder('crossings');

  const { xs, zs } = GRID;

  // ---------------------------------------------------------------- asphalt
  // One long quad per street between two junctions, sized to the junction so corners meet clean.
  for (let j = 0; j < zs.length; j++) {
    const z = zs[j];
    asphalt.quad((xs[0] + xs[xs.length - 1]) / 2, 0.01, z, xs[xs.length - 1] - xs[0] + GRID.streetWidth, GRID.streetWidth, {
      color: [1, 1, 1], uvScale: 14,
    });
  }
  for (let i = 0; i < xs.length; i++) {
    const x = xs[i];
    const z0 = zs[0];
    const z1 = zs[zs.length - 1];
    // Only the stretch of avenue that is on land: the bay's edge stops at the boardwalk.
    asphalt.quad(x, 0.012, (z0 + z1) / 2, GRID.streetWidth, z1 - z0 + GRID.streetWidth, {
      color: [1, 1, 1], uvScale: 14,
    });
  }

  // ---------------------------------------------------------------- sidewalks
  // A pavement ring inside each block's own bounds: the building lot sits inset from it, so the
  // kerb line is where the block starts and the street stays clear of geometry.
  for (const block of plan.blocks) {
    const { x0, x1, z0, z1 } = block;
    const tint = colorTriple(block.district.palette.pavement, 0.94);
    const band = SIDEWALK_WIDTH;
    sidewalk.quad((x0 + x1) / 2, KERB_HEIGHT, z0 + band / 2, x1 - x0, band, { color: tint, uvScale: 8 });
    sidewalk.quad((x0 + x1) / 2, KERB_HEIGHT, z1 - band / 2, x1 - x0, band, { color: tint, uvScale: 8 });
    sidewalk.quad(x0 + band / 2, KERB_HEIGHT, (z0 + z1) / 2, band, z1 - z0 - band * 2, { color: tint, uvScale: 8 });
    sidewalk.quad(x1 - band / 2, KERB_HEIGHT, (z0 + z1) / 2, band, z1 - z0 - band * 2, { color: tint, uvScale: 8 });
  }

  // ---------------------------------------------------------------- crossings
  // Zebra crossings on all four arms of every inner junction: short bars, cheap, and they make
  // a junction read as a junction from above.
  for (let j = 1; j < zs.length - 1; j++) {
    for (let i = 1; i < xs.length - 1; i++) {
      const x = xs[i];
      const z = zs[j];
      if (isWaterAt(x, z)) continue;
      const across = GRID.streetWidth - 2;
      const barCount = 6;
      for (let b = 0; b < barCount; b++) {
        const offset = (b / (barCount - 1) - 0.5) * (across - 2);
        // North and south arms: bars running across the avenue.
        crossings.quad(x + offset, 0.03, z - ROAD_HALF - 1.6, 1.05, 3.0, { color: [0.92, 0.9, 0.84], uvScale: 4 });
        crossings.quad(x + offset, 0.03, z + ROAD_HALF + 1.6, 1.05, 3.0, { color: [0.92, 0.9, 0.84], uvScale: 4 });
        // East and west arms: bars running across the cross street.
        crossings.quad(x - ROAD_HALF - 1.6, 0.031, z + offset, 3.0, 1.05, { color: [0.92, 0.9, 0.84], uvScale: 4 });
        crossings.quad(x + ROAD_HALF + 1.6, 0.031, z + offset, 3.0, 1.05, { color: [0.92, 0.9, 0.84], uvScale: 4 });
      }
    }
  }

  // A brighter stop bar at each crossing's approach, on the right-hand lane.
  for (const edge of plan.edges) {
    if (edge.kind !== 'avenue') continue;
    const start = new THREE.Vector2(edge.ax, edge.az);
    const dir = new THREE.Vector2(edge.dx, edge.dz);
    const normal = new THREE.Vector2(-dir.y, dir.x);
    const at = start.clone().addScaledVector(dir, 10);
    // Only on the segment's first ten metres, where the junction's stop line sits.
    markings.quad(at.x + normal.x * 2.4, 0.032, at.y + normal.y * 2.4, 0.55, 5.2, {
      color: [0.9, 0.88, 0.8], uvScale: 4,
    });
  }

  const asphaltMaterial = cityMaterial(textures.asphalt, { roughness: 0.94, metalness: 0.0 });
  asphalt.build(asphaltMaterial, group, { receiveShadow: true });
  const sidewalkMaterial = cityMaterial(textures.pavement, { roughness: 0.9 });
  sidewalk.build(sidewalkMaterial, group, { receiveShadow: true });
  const crossingMaterial = cityMaterial(null, { roughness: 0.7 });
  crossings.build(crossingMaterial, group, { receiveShadow: true });
  markings.build(cityMaterial(null, { roughness: 0.6 }), group);

  // ---------------------------------------------------------------- bridges
  const bridges = buildBridges(plan, textures);
  group.add(bridges.group);

  return { group, bridges: bridges.decks };
}

/**
 * The two channel crossings. Each is a deck slab with parapets and piers, and the old rail
 * bridge gets truss work above its deck so it reads as the older structure.
 */
function buildBridgeGeometry(bridge, textures) {
  const deck = new MeshBuilder(`bridge-${bridge.rail ? 'rail' : 'road'}`);
  const steel = new MeshBuilder(`bridge-steel-${bridge.rail ? 'rail' : 'road'}`);
  const x0 = bridge.x0 - GRID.streetWidth / 2;
  const x1 = bridge.x1 + 6;
  const length = x1 - x0;
  const cx = (x0 + x1) / 2;
  const width = bridge.width;
  const deckTop = 2.4;
  const deckColor = colorTriple(bridge.rail ? 0x8a7f6a : 0x9a9a96);
  const steelColor = colorTriple(bridge.rail ? 0x6a5a4a : 0x8a8f94);

  // Deck, and the underside beam that gives it thickness from the water.
  deck.box(cx, deckTop - 0.45, bridge.z, length, 0.9, width, { color: deckColor, uvScale: 10 });
  // Parapets.
  for (const side of [-1, 1]) {
    steel.block(cx, bridge.z + side * (width / 2 - 0.35), length, 1.0, 0.7, deckTop - 0.1, { color: steelColor, uvScale: 8 });
  }

  if (bridge.rail) {
    // Truss: verticals every 12 m with a top chord and diagonal lacing.
    const bays = Math.floor(length / 12);
    for (const side of [-1, 1]) {
      const z = bridge.z + side * (width / 2 - 0.6);
      for (let b = 0; b <= bays; b++) {
        const x = x0 + (b / bays) * length;
        steel.box(x, deckTop + 3.4, z, 0.5, 6.8, 0.5, { color: steelColor, uvScale: 6 });
        if (b < bays) {
          steel.box(x + length / bays / 2, deckTop + 5.4, z, length / bays, 0.4, 0.4, { color: steelColor, uvScale: 6 });
          // The diagonal: a rotated thin box would need a transform, so a stepped one stands in.
          steel.box(x + length / bays / 2, deckTop + 2.6, z, length / bays * 0.8, 0.35, 0.35, { color: steelColor, uvScale: 6 });
        }
      }
    }
    // Overhead cross beams joining the trusses.
    for (let b = 0; b <= bays; b += 2) {
      const x = x0 + (b / bays) * length;
      steel.box(x, deckTop + 6.6, bridge.z, 0.45, 0.45, width, { color: steelColor, uvScale: 6 });
    }
  } else {
    // A road bridge: lamp posts along the parapets.
    for (let d = 8; d < length; d += 22) {
      for (const side of [-1, 1]) {
        steel.box(x0 + d, deckTop + 4.2, bridge.z + side * (width / 2 - 0.5), 0.28, 8.4, 0.28, { color: steelColor, uvScale: 4 });
        steel.box(x0 + d, deckTop + 8.4, bridge.z + side * (width / 2 - 1.4), 0.22, 0.22, 2.0, { color: steelColor, uvScale: 4 });
      }
    }
  }

  // Piers in the channel: two per bridge, thick enough to read from the harbour.
  const piers = bridge.rail ? 2 : 3;
  for (let p = 1; p <= piers; p++) {
    const x = x0 + (length * p) / (piers + 1);
    deck.box(x, deckTop / 2 - 0.3, bridge.z, 3.2, deckTop, width * 0.7, { color: colorTriple(0x8f8b82), uvScale: 8 });
  }

  return { deck, steel };
}

function buildBridges(plan, textures) {
  const group = new THREE.Group();
  group.name = 'bridges';
  const decks = [];
  const deckMaterial = cityMaterial(textures.concrete, { roughness: 0.92 });
  const steelMaterial = cityMaterial(null, { roughness: 0.62, metalness: 0.35 });
  for (const bridge of plan.bridges) {
    const { deck, steel } = buildBridgeGeometry(bridge, textures);
    const deckMesh = deck.build(deckMaterial, group, { receiveShadow: true });
    deckMesh.name = `bridge-deck-${bridge.rail ? 'rail' : 'road'}`;
    steel.build(steelMaterial, group);
    decks.push({
      name: bridge.name,
      bridge,
      walkable: {
        minX: bridge.x0 - GRID.streetWidth / 2,
        maxX: bridge.x1 + 6,
        minZ: bridge.z - bridge.width / 2,
        maxZ: bridge.z + bridge.width / 2,
        top: 2.4,
        walkable: true,
        kind: 'bridge',
      },
    });
  }
  return { group, decks };
}

/**
 * The elevated ring highway: a deck 17 m over the outermost boulevard, with piers down to the
 * ground every 96 m and a guard rail. It is scenery and a landmark from below.
 */
export function buildHighway(plan, textures) {
  const group = new THREE.Group();
  group.name = 'highway';
  const deck = new MeshBuilder('highway-deck');
  const piers = new MeshBuilder('highway-piers');
  const rails = new MeshBuilder('highway-rails');
  const deckColor = colorTriple(0x9a9a96);
  const pierColor = colorTriple(0x8a8a86);
  const railColor = colorTriple(0x7a8088);

  const { x0, x1, z0, z1, height, deckWidth, pierEvery } = HIGHWAY;
  const y = height;

  const spans = [
    { horizontal: true, fixed: z0, from: x0, to: x1 },
    { horizontal: true, fixed: z1, from: x0, to: x1 },
    { horizontal: false, fixed: x0, from: z0, to: z1 },
    { horizontal: false, fixed: x1, from: z0, to: z1 },
  ];

  for (const span of spans) {
    const length = span.to - span.from;
    const mid = (span.from + span.to) / 2;
    if (span.horizontal) {
      deck.box(mid, y - 0.6, span.fixed, length, 1.2, deckWidth, { color: deckColor, uvScale: 12 });
      // Guard rails on both sides.
      for (const side of [-1, 1]) {
        rails.block(mid, span.fixed + side * (deckWidth / 2 - 0.4), length, 1.1, 0.55, y, { color: railColor, uvScale: 8 });
      }
    } else {
      deck.box(span.fixed, y - 0.6, mid, deckWidth, 1.2, length, { color: deckColor, uvScale: 12 });
      for (const side of [-1, 1]) {
        rails.block(span.fixed + side * (deckWidth / 2 - 0.4), mid, 1.1, 0.55, length, y, { color: railColor, uvScale: 8 });
      }
    }
    // Piers: a pair of columns every pierEvery metres, with a cap beam.
    const count = Math.max(2, Math.round(length / pierEvery));
    for (let p = 0; p <= count; p++) {
      const t = p / count;
      const along = span.from + length * t;
      const capY = y - 1.2;
      for (const side of [-1, 1]) {
        const px = span.horizontal ? along : span.fixed + side * (deckWidth / 2 - 2.2);
        const pz = span.horizontal ? span.fixed + side * (deckWidth / 2 - 2.2) : along;
        // Column, wider at the base, reading as concrete without a cylinder mesh.
        piers.box(px, capY / 2, pz, 2.0, capY, 2.0, { color: pierColor, uvScale: 8 });
        piers.box(px, 0.5, pz, 3.0, 1.0, 3.0, { color: pierColor, uvScale: 8 });
      }
      // The cap that carries the deck.
      if (span.horizontal) {
        piers.box(along, capY - 0.4, span.fixed, 1.6, 1.4, deckWidth - 1, { color: pierColor, uvScale: 8 });
      } else {
        piers.box(span.fixed, capY - 0.4, along, deckWidth - 1, 1.4, 1.6, { color: pierColor, uvScale: 8 });
      }
    }
  }

  const concreteMaterial = cityMaterial(textures.concrete, { roughness: 0.9 });
  deck.build(concreteMaterial, group);
  piers.build(concreteMaterial, group);
  rails.build(cityMaterial(null, { roughness: 0.55, metalness: 0.4 }), group);

  // The deck's walkable surfaces, so a fall from it lands on it rather than in the street.
  const walkables = spans.map((span) => ({
    name: 'highway-deck',
    walkable: {
      minX: span.horizontal ? span.from : span.fixed - deckWidth / 2,
      maxX: span.horizontal ? span.to : span.fixed + deckWidth / 2,
      minZ: span.horizontal ? span.fixed - deckWidth / 2 : span.from,
      maxZ: span.horizontal ? span.fixed + deckWidth / 2 : span.to,
      top: y,
      walkable: true,
      kind: 'highway',
    },
  }));

  return { group, walkables, deck };
}

/** Sidewalk kerb boxes: low, walkable, so a body steps up onto the pavement. */
export function buildKerbs(plan, colliders) {
  for (const block of plan.blocks) {
    const band = SIDEWALK_WIDTH;
    const walkable = true;
    colliders.addBox(block.x0, block.z0, block.x1, block.z0 + band, KERB_HEIGHT, 'kerb', { walkable });
    colliders.addBox(block.x0, block.z1 - band, block.x1, block.z1, KERB_HEIGHT, 'kerb', { walkable });
    colliders.addBox(block.x0, block.z0 + band, block.x0 + band, block.z1 - band, KERB_HEIGHT, 'kerb', { walkable });
    colliders.addBox(block.x1 - band, block.z0 + band, block.x1, block.z1 - band, KERB_HEIGHT, 'kerb', { walkable });
  }
}

export { clamp };
