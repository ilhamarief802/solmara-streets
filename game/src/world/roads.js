// Streets: carriageways with lane paint, junction pads, crosswalk stripes along the
// pavement edge, raised sidewalks under every block, and the elevated highway ring
// with its pillars, parapets and ramps. The block grid is tiled exactly once, with
// no overlapping quads, so nothing z-fights.

import { CITY } from './cityplan.js';
import { TAU } from '../core/math.js';

const ROAD_HALF = CITY.roadWidth / 2;
const SEGMENT_UV = 1 / 12; // lane paint tiles every 12 m along the street
const WIDTH_UV = 1 / CITY.roadWidth; // one texture tile across the carriageway

/** Emits one carriageway strip between two junction edges. */
function strip(groups, { x, z, length, axis, wide }) {
  const bucket = wide ? 'roadWide' : 'road';
  if (axis === 'z') {
    // A north-south street: local +X runs along +Z, so the UV repeat follows the road.
    groups.ground(bucket, {
      x,
      z,
      y: 0,
      width: length,
      depth: CITY.roadWidth,
      rotY: Math.PI / 2,
      uScale: SEGMENT_UV,
      vScale: WIDTH_UV,
      color: 0xffffff,
    });
  } else {
    groups.ground(bucket, {
      x,
      z,
      y: 0,
      width: length,
      depth: CITY.roadWidth,
      rotY: 0,
      uScale: SEGMENT_UV,
      vScale: WIDTH_UV,
      color: 0xffffff,
    });
  }
}

function junctionPad(groups, x, z, wide) {
  groups.ground(wide ? 'roadWide' : 'junction', {
    x,
    z,
    y: 0.004,
    width: CITY.roadWidth,
    depth: CITY.roadWidth,
    uScale: 1 / CITY.roadWidth,
    vScale: 1 / CITY.roadWidth,
    color: wide ? 0xf6f6f6 : 0xffffff,
  });
}

function crosswalk(groups, x, z, axis) {
  // axis is the direction of travel across the crossing, so the stripes run across it.
  const rotY = axis === 'x' ? Math.PI / 2 : 0;
  groups.ground('crossing', {
    x,
    z,
    y: 0.02,
    width: CITY.roadWidth,
    depth: 3,
    rotY,
    uScale: 1 / 2,
    vScale: 1 / 3,
    color: 0xffffff,
  });
}

export function buildRoadNetwork({ plan, groups, rng, colliders, heightField }) {
  const lines = [
    { xLines: plan.xLines, zLines: plan.zLines, island: 'mainland' },
    { xLines: plan.beachXLines, zLines: plan.beachZLines, island: 'beach' },
  ];

  let strips = 0;
  let pads = 0;
  let crossings = 0;

  for (const grid of lines) {
    // Carriageways between junctions.
    for (const line of grid.xLines) {
      for (let k = 0; k < grid.zLines.length - 1; k += 1) {
        const zA = grid.zLines[k].z + ROAD_HALF;
        const zB = grid.zLines[k + 1].z - ROAD_HALF;
        if (zB - zA < 2) continue;
        strip(groups, { x: line.x, z: (zA + zB) / 2, length: zB - zA, axis: 'z', wide: line.boulevard });
        strips += 1;
      }
    }
    for (const line of grid.zLines) {
      for (let k = 0; k < grid.xLines.length - 1; k += 1) {
        const xA = grid.xLines[k].x + ROAD_HALF;
        const xB = grid.xLines[k + 1].x - ROAD_HALF;
        if (xB - xA < 2) continue;
        strip(groups, { x: (xA + xB) / 2, z: line.z, length: xB - xA, axis: 'x', wide: line.boulevard });
        strips += 1;
      }
    }
    // Junction pads and their crossings.
    for (const line of grid.xLines) {
      for (const cross of grid.zLines) {
        junctionPad(groups, line.x, cross.z, line.boulevard || cross.boulevard);
        pads += 1;
        const signals = plan.nodes.find((node) => node.x === line.x && node.z === cross.z)?.signals;
        const decorate = signals || rng.chance(0.35);
        if (!decorate) continue;
        crosswalk(groups, line.x, cross.z - ROAD_HALF - 1.8, 'z');
        crosswalk(groups, line.x, cross.z + ROAD_HALF + 1.8, 'z');
        crosswalk(groups, line.x - ROAD_HALF - 1.8, cross.z, 'x');
        crosswalk(groups, line.x + ROAD_HALF + 1.8, cross.z, 'x');
        crossings += 4;
      }
    }
  }

  const sidewalks = buildSidewalks({ plan, groups, rng, colliders, heightField });
  const highway = buildHighway({ plan, groups, rng, heightField, colliders });

  return { strips, pads, crossings, sidewalks, highway };
}

/** A raised paved square under every block, its surface depending on the block kind. */
function buildSidewalks({ plan, groups, rng, heightField }) {
  let count = 0;
  for (const block of plan.blocks) {
    const surface = surfaceForBlock(block);
    const size = block.size;
    const top = CITY.sidewalkHeight;
    const base = -0.5;
    groups.box(surface.bucket, {
      x: block.cx,
      y: (top + base) / 2,
      z: block.cz,
      width: size,
      height: top - base,
      depth: size,
      color: surface.colour,
      tint: rng.float(0.94, 1.05),
      uScale: surface.uv,
      vScale: surface.uv,
      faces: ['py', 'px', 'nx', 'pz', 'nz'],
    });
    count += 1;
    block.surface = surface.bucket;
    block.surfaceHeight = top;

    // A painted kerb line every few blocks keeps the pavements from reading as one
    // grey mass: a thin darker strip along the two street sides.
    if (block.kind === 'buildings' && rng.chance(0.5)) {
      const colour = 0xd8d4c8;
      groups.box('kerb', {
        x: block.cx,
        y: top + 0.06,
        z: block.cz - size / 2 + 0.6,
        width: size,
        height: 0.12,
        depth: 1.2,
        color: colour,
        uScale: 0.2,
        vScale: 0.2,
      });
      groups.box('kerb', {
        x: block.cx - size / 2 + 0.6,
        y: top + 0.06,
        z: block.cz,
        width: 1.2,
        height: 0.12,
        depth: size,
        color: colour,
        uScale: 0.2,
        vScale: 0.2,
      });
    }
  }
  return count;
}

function surfaceForBlock(block) {
  switch (block.kind) {
    case 'plaza':
      return { bucket: 'plazaStone', colour: 0xd8d2c2, uv: 1 / 8 };
    case 'park':
      return { bucket: 'grass', colour: 0xa8b892, uv: 1 / 10 };
    case 'boardwalk':
      return { bucket: 'boardwalk', colour: 0xd8c49c, uv: 1 / 4 };
    case 'docks':
      return { bucket: 'concrete', colour: 0xa8a49c, uv: 1 / 6 };
    case 'airstrip':
    case 'marsh-scrub':
      return { bucket: 'marsh', colour: 0xb8bb92, uv: 1 / 12 };
    case 'stadium':
      return { bucket: 'plaza', colour: 0xcfcab8, uv: 1 / 6 };
    default:
      return { bucket: 'sidewalk', colour: 0xffffff, uv: 1 / 6 };
  }
}

/** The elevated ring road: deck, parapets, pillars and four ramps. */
function buildHighway({ plan, groups, rng, heightField, colliders }) {
  const { loop, height, width } = plan.highway;
  const deckThickness = 1.3;
  let pillars = 0;

  const deckTop = height + deckThickness / 2;

  for (let i = 0; i < loop.length; i += 1) {
    const a = loop[i];
    const b = loop[(i + 1) % loop.length];
    const alongX = Math.abs(b.x - a.x) > Math.abs(b.z - a.z);
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    const cx = (a.x + b.x) / 2;
    const cz = (a.z + b.z) / 2;
    const rotation = alongX ? { x: 0, y: 0, z: 0 } : { x: 0, y: Math.PI / 2, z: 0 };

    groups.builder('concrete').addBox({
      x: cx,
      y: height,
      z: cz,
      width: length,
      height: deckThickness,
      depth: width,
      rotation,
      color: 0xa8a49c,
      uScale: 1 / 8,
      vScale: 1 / 8,
      faces: ['py', 'px', 'nx', 'pz', 'nz'],
    });

    // Wearing course on the deck.
    groups.ground('roadWide', {
      x: cx,
      z: cz,
      y: deckTop + 0.01,
      width: length - 0.4,
      depth: width - 1.2,
      rotY: alongX ? 0 : Math.PI / 2,
      uScale: SEGMENT_UV,
      vScale: 1 / (width - 1.2),
    });

    // Parapets either side. The box's local X always runs along the span.
    const offset = width / 2 - 0.4;
    for (const side of [-1, 1]) {
      const railX = alongX ? cx : cx + side * offset;
      const railZ = alongX ? cz + side * offset : cz;
      groups.box('concreteRail', {
        x: railX,
        y: deckTop + 0.55,
        z: railZ,
        width: length,
        height: 1.1,
        depth: 0.8,
        rotation,
        color: 0xc8c4ba,
        uScale: 1 / 4,
        vScale: 1 / 4,
      });
      // A metal rail on top of the concrete parapet.
      groups.box('railing', {
        x: railX,
        y: deckTop + 1.35,
        z: railZ,
        width: length,
        height: 0.5,
        depth: 0.25,
        rotation,
        color: 0x9aa2a8,
        uScale: 0.6,
        vScale: 0.6,
      });
    }

    // Pillars every 24 m, standing on whatever ground is below.
    const steps = Math.max(2, Math.round(length / 24));
    for (let s = 1; s < steps; s += 1) {
      const t = s / steps;
      const px = a.x + (b.x - a.x) * t;
      const pz = a.z + (b.z - a.z) * t;
      const ground = heightField ? heightField(px, pz) : 0;
      const base = Math.max(ground, CITY.seaLevel) - 0.5;
      const pillarHeight = height - deckThickness / 2 - base;
      if (pillarHeight < 2) continue;
      groups.box('concrete', {
        x: px,
        y: base + pillarHeight / 2,
        z: pz,
        width: 2.6,
        height: pillarHeight,
        depth: 2.6,
        color: 0x9d9c96,
        tint: rng.float(0.94, 1.04),
        uScale: 1 / 6,
        vScale: 1 / 6,
        faces: ['py', 'px', 'nx', 'pz', 'nz'],
      });
      if (colliders) colliders.addBox({ x: px, y: base + pillarHeight / 2, z: pz, width: 3, height: pillarHeight, depth: 3, kind: 'pillar' });
      pillars += 1;
    }
  }

  // Ramps: a sloped slab with walls, one per side of the ring.
  let ramps = 0;
  for (const ramp of plan.highway.ramps) {
    const rise = height - deckThickness / 2;
    const angle = Math.atan2(rise, ramp.length);
    const alongX = ramp.axis === 'x';
    // The slab's local X is the span: tilt about Z to rise along +X, or turn the
    // slab a quarter turn and tilt about Z again to rise along +Z.
    const rotation = alongX
      ? { x: 0, y: 0, z: angle }
      : { x: 0, y: -Math.PI / 2, z: angle };
    const cx = ramp.x + (alongX ? ramp.length / 2 : 0);
    const cz = ramp.z + (alongX ? 0 : ramp.length / 2);
    groups.box('concrete', {
      x: cx,
      y: rise / 2,
      z: cz,
      width: ramp.length,
      height: 1.2,
      depth: 16,
      rotation,
      color: 0xa8a49c,
      uScale: 1 / 8,
      vScale: 1 / 8,
      faces: ['py', 'px', 'nx', 'pz', 'nz'],
    });
    // Wearing course as its own slab so the paint follows the slope.
    groups.box('roadWide', {
      x: cx,
      y: rise / 2 + 0.75,
      z: cz,
      width: ramp.length,
      height: 0.3,
      depth: 14,
      rotation,
      color: 0xffffff,
      uScale: SEGMENT_UV,
      vScale: 1 / 14,
      faces: ['py'],
    });
    for (const side of [-1, 1]) {
      const railX = alongX ? cx : cx + side * 7.6;
      const railZ = alongX ? cz + side * 7.6 : cz;
      groups.box('railing', {
        x: railX,
        y: rise / 2 + 1.1,
        z: railZ,
        width: ramp.length,
        height: 0.9,
        depth: 0.3,
        rotation,
        color: 0xb0b6ba,
        uScale: 0.5,
        vScale: 0.5,
      });
    }
    ramps += 1;
  }

  return { pillars, ramps, length: loop.reduce((sum, point, index) => {
    const next = loop[(index + 1) % loop.length];
    return sum + Math.hypot(next.x - point.x, next.z - point.z);
  }, 0) };
}

export { ROAD_HALF, surfaceForBlock, TAU };
