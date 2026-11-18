// Street furniture and scattered props: lamp posts with light pools, palms, benches,
// bins, hydrants, market stalls, crates and containers, parked cars, reeds, lifeguard
// towers, hoardings and the signs the building generator asked for.

import { CITY } from './cityplan.js';
import { districtById } from './districts.js';
import { TAU } from '../core/math.js';

const PAVEMENT_INSET = 25.6; // distance from a block centre to the pavement furniture line
const LAMP_SPACING = 54;

function addStreetlight({ groups, x, z, y, rotY, colour, rng }) {
  const height = 8.2;
  groups.cylinder('metalDark', {
    x,
    y: y + height / 2,
    z,
    radiusTop: 0.14,
    radiusBottom: 0.24,
    height,
    segments: 6,
    color: 0x3f4449,
    tint: rng.float(0.94, 1.06),
    uScale: 0.5,
    vScale: 0.4,
  });
  // A short arm leaning over the carriageway, then the lamp head.
  const armLength = 1.9;
  const armX = x + Math.sin(rotY) * armLength * 0.5;
  const armZ = z + Math.cos(rotY) * armLength * 0.5;
  groups.box('metalDark', {
    x: armX,
    y: y + height - 0.15,
    z: armZ,
    width: armLength,
    height: 0.22,
    depth: 0.26,
    rotation: { x: 0, y: rotY, z: 0 },
    color: 0x3f4449,
    uScale: 1,
    vScale: 1,
  });
  const headX = x + Math.sin(rotY) * armLength;
  const headZ = z + Math.cos(rotY) * armLength;
  groups.box('lamp', {
    x: headX,
    y: y + height - 0.45,
    z: headZ,
    width: 1.35,
    height: 0.42,
    depth: 0.72,
    rotation: { x: 0, y: rotY, z: 0 },
    color: colour,
    uScale: 0.6,
    vScale: 0.6,
  });
  // The pool of light on the ground, drawn additively and faded in at dusk.
  groups.ground('glow', {
    x: headX,
    y: y + 0.05,
    z: headZ,
    width: 19,
    depth: 19,
    uScale: 1 / 19,
    vScale: 1 / 19,
    color: 0xffe6bc,
  });
  return { x: headX, y: y + height, z: headZ };
}

function addPalm({ groups, x, z, y, height, rng }) {
  const lean = rng.float(-0.09, 0.09);
  const leanZ = rng.float(-0.09, 0.09);
  groups.cylinder('planks', {
    x,
    y: y + height / 2,
    z,
    radiusTop: 0.22,
    radiusBottom: 0.42,
    height,
    segments: 6,
    rotation: { x: lean, y: 0, z: leanZ },
    color: 0x8a6f4e,
    tint: rng.float(0.9, 1.08),
    uScale: 0.7,
    vScale: 0.34,
  });
  const fronds = rng.int(7, 10);
  const topY = y + height * 0.98;
  for (let i = 0; i < fronds; i += 1) {
    const angle = (i / fronds) * TAU + rng.float(-0.2, 0.2);
    const length = rng.float(2.6, 4.4);
    const droop = rng.float(0.34, 0.62);
    const cx = x + Math.cos(angle) * length * 0.45;
    const cz = z + Math.sin(angle) * length * 0.45;
    groups.box('foliage', {
      x: cx,
      y: topY - droop * length * 0.35,
      z: cz,
      width: length,
      height: 0.12,
      depth: 1.5,
      rotation: { x: 0, y: -angle, z: -droop },
      color: rng.chance(0.5) ? 0x4f7a3c : 0x5f8a44,
      tint: rng.float(0.86, 1.12),
      uScale: 0.4,
      vScale: 0.4,
      faces: ['py', 'pz', 'nz', 'px', 'nx'],
    });
  }
  groups.cylinder('foliage', {
    x,
    y: topY,
    z,
    radius: 0.5,
    height: 0.7,
    segments: 6,
    color: 0x6b8a44,
    uScale: 1,
    vScale: 1,
  });
}

function addBench({ groups, x, z, y, rotY, rng }) {
  const wood = rng.pick([0x9a7b52, 0x8a6a44, 0xa8866a]);
  groups.box('planks', {
    x,
    y: y + 0.45,
    z,
    width: 1.8,
    height: 0.12,
    depth: 0.55,
    rotation: { x: 0, y: rotY, z: 0 },
    color: wood,
    uScale: 0.5,
    vScale: 0.5,
  });
  groups.box('planks', {
    x: x + Math.sin(rotY) * -0.24,
    y: y + 0.78,
    z: z + Math.cos(rotY) * -0.24,
    width: 1.8,
    height: 0.5,
    depth: 0.12,
    rotation: { x: 0, y: rotY, z: 0 },
    color: wood,
    tint: 0.94,
    uScale: 0.5,
    vScale: 0.5,
  });
  for (const side of [-0.7, 0.7]) {
    groups.box('metalDark', {
      x: x + Math.sin(rotY) * -side,
      y: y + 0.2,
      z: z + Math.cos(rotY) * -side,
      width: 0.14,
      height: 0.42,
      depth: 0.5,
      rotation: { x: 0, y: rotY, z: 0 },
      color: 0x3a3f44,
      uScale: 1,
      vScale: 1,
    });
  }
}

function addBin({ groups, x, z, y, rng }) {
  groups.cylinder('metalDark', {
    x,
    y: y + 0.45,
    z,
    radiusTop: 0.34,
    radiusBottom: 0.3,
    height: 0.9,
    segments: 7,
    color: rng.pick([0x3f5a44, 0x44506a, 0x5a4444]),
    uScale: 0.8,
    vScale: 0.5,
  });
}

function addHydrant({ groups, x, z, y }) {
  groups.cylinder('metalDark', {
    x,
    y: y + 0.42,
    z,
    radiusTop: 0.16,
    radiusBottom: 0.2,
    height: 0.84,
    segments: 6,
    color: 0xc2452a,
    uScale: 1,
    vScale: 1,
  });
}

function addStall({ groups, x, z, y, rotY, rng }) {
  const colour = rng.pick([0xc2452a, 0x2f7f8f, 0xd8a03c, 0x3f7a4a, 0xe0d8c0]);
  groups.box('planks', {
    x,
    y: y + 0.9,
    z,
    width: 2.6,
    height: 0.16,
    depth: 1.5,
    rotation: { x: 0, y: rotY, z: 0 },
    color: 0x9a7b52,
    uScale: 0.6,
    vScale: 0.6,
  });
  groups.box('planks', {
    x,
    y: y + 2.5,
    z,
    width: 3,
    height: 0.18,
    depth: 1.9,
    rotation: { x: 0, y: rotY, z: 0 },
    color: colour,
    tint: rng.float(0.94, 1.08),
    uScale: 0.5,
    vScale: 0.5,
  });
  for (const side of [-1, 1]) {
    groups.cylinder('metalDark', {
      x: x + Math.cos(rotY) * side * 1.4,
      y: y + 1.25,
      z: z - Math.sin(rotY) * side * 1.4,
      radius: 0.07,
      height: 2.5,
      segments: 4,
      color: 0x4a4f54,
      uScale: 1,
      vScale: 1,
    });
  }
  // Produce crates under the counter.
  for (let i = 0; i < 3; i += 1) {
    addCrate({
      groups,
      x: x + rng.float(-1, 1),
      y: y + 0.16,
      z: z + rng.float(-0.4, 0.4),
      size: rng.float(0.34, 0.5),
      rng,
    });
  }
}

function addCrate({ groups, x, z, y, size, rng }) {
  groups.box('planks', {
    x,
    y: y + size / 2,
    z,
    width: size * 2,
    height: size,
    depth: size * 2,
    rotation: { x: 0, y: rng.float(0, TAU), z: 0 },
    color: rng.pick([0xb08a5a, 0x9a7450, 0xc4a070]),
    tint: rng.float(0.9, 1.08),
    uScale: 0.6,
    vScale: 0.6,
  });
}

function addContainer({ groups, x, z, y, rotY, rng }) {
  groups.box('container', {
    x,
    y: y + 1.3,
    z,
    width: 6.1,
    height: 2.6,
    depth: 2.44,
    rotation: { x: 0, y: rotY, z: 0 },
    color: rng.pick([0xb1452f, 0x2f6f8f, 0xc78a2a, 0x3f7a4a, 0x8a3f6a, 0x6d7076]),
    tint: rng.float(0.9, 1.1),
    uScale: 1 / 6,
    vScale: 1 / 2.6,
  });
}

/** A blocky parked car: body, cabin, glass, wheels and lights. */
function addCar({ groups, x, z, y, rotY, rng, colliders }) {
  const body = rng.pick([0xd8d8d0, 0x2f3a48, 0x8a2f2f, 0x2f5a8a, 0x4a4a4a, 0xd8b04a, 0x3f7a5a]);
  const length = rng.float(4.1, 4.9);
  const width = rng.float(1.72, 1.95);
  groups.box('metal', {
    x,
    y: y + 0.62,
    z,
    width: length,
    height: 0.82,
    depth: width,
    rotation: { x: 0, y: rotY, z: 0 },
    color: body,
    tint: rng.float(0.9, 1.1),
    uScale: 0.3,
    vScale: 0.3,
  });
  groups.box('glass', {
    x: x - Math.sin(rotY) * 0.25,
    y: y + 1.26,
    z: z - Math.cos(rotY) * 0.25,
    width: length * 0.48,
    height: 0.6,
    depth: width * 0.86,
    rotation: { x: 0, y: rotY, z: 0 },
    color: 0x22303a,
    uScale: 0.4,
    vScale: 0.4,
  });
  for (const along of [-1.35, 1.35]) {
    for (const across of [-0.78, 0.78]) {
      const wx = x + Math.cos(rotY) * along + Math.sin(rotY) * across;
      const wz = z - Math.sin(rotY) * along + Math.cos(rotY) * across;
      groups.cylinder('metalDark', {
        x: wx,
        y: y + 0.34,
        z: wz,
        radius: 0.34,
        height: 0.22,
        segments: 7,
        rotation: { x: Math.PI / 2, y: rotY, z: 0 },
        color: 0x1e2124,
        uScale: 1,
        vScale: 0.6,
      });
    }
  }
  if (colliders) {
    colliders.addBox({
      x,
      y: y + 0.7,
      z,
      width: Math.abs(Math.cos(rotY)) * length + Math.abs(Math.sin(rotY)) * width,
      height: 1.4,
      depth: Math.abs(Math.cos(rotY)) * width + Math.abs(Math.sin(rotY)) * length,
      kind: 'parked-car',
    });
  }
}

function addReed({ groups, x, z, y, rng }) {
  const height = rng.float(1.1, 2.3);
  groups.box('foliage', {
    x,
    y: y + height / 2,
    z,
    width: rng.float(0.5, 1.2),
    height,
    depth: 0.12,
    rotation: { x: rng.float(-0.12, 0.12), y: rng.float(0, TAU), z: rng.float(-0.12, 0.12) },
    color: rng.pick([0x8a8f5a, 0x7a8250, 0x9a9a68]),
    uScale: 1,
    vScale: 0.6,
    faces: ['py', 'pz', 'nz', 'px', 'nx'],
  });
}

function addLifeguardTower({ groups, x, z, y, rng }) {
  const hue = rng.pick([0xd8d8d0, 0xe0c060, 0x2f7f8f]);
  const deckY = y + 2.3;
  for (const dx of [-1.5, 1.5]) {
    for (const dz of [-1.4, 1.4]) {
      groups.cylinder('planks', {
        x: x + dx,
        y: y + deckY / 2 + 0.5,
        z: z + dz,
        radius: 0.16,
        height: deckY,
        segments: 5,
        color: 0x8a6a44,
        uScale: 1,
        vScale: 0.5,
      });
    }
  }
  groups.box('planks', {
    x,
    y: deckY + 0.15,
    z,
    width: 3.6,
    height: 0.3,
    depth: 3.2,
    color: 0x9a7b52,
    uScale: 0.4,
    vScale: 0.4,
  });
  groups.box('planks', {
    x,
    y: deckY + 1.5,
    z: z + 1.5,
    width: 3.6,
    height: 2.4,
    depth: 0.2,
    color: hue,
    uScale: 0.4,
    vScale: 0.4,
  });
  groups.roof('planks', {
    x,
    y: deckY + 2.0,
    z,
    width: 4.2,
    depth: 3.8,
    height: 1.1,
    axis: 'x',
    color: hue,
    tint: 1.06,
    uScale: 0.4,
    vScale: 0.4,
  });
  // A ramp up to the deck and a flag mast.
  groups.box('planks', {
    x: x - 2.6,
    y: deckY * 0.6,
    z,
    width: 3.4,
    height: 0.24,
    depth: 1.2,
    rotation: { x: 0, y: 0, z: 0.62 },
    color: 0x9a7b52,
    uScale: 0.5,
    vScale: 0.5,
  });
  groups.cylinder('metalDark', {
    x: x + 2.2,
    y: deckY + 1.6,
    z,
    radius: 0.07,
    height: 3.4,
    segments: 4,
    color: 0x50565c,
    uScale: 1,
    vScale: 1,
  });
}

/** A hoarding on two legs: used for the strip's advertising boards. */
function addBillboard({ groups, materials, request, rng }) {
  const entry = materials.billboards[request.index % materials.billboards.length];
  const height = 4.6;
  const width = height * entry.aspect;
  const y = request.y + height / 2 + 1.2;
  groups.box(entry.bucket, {
    x: request.x,
    y,
    z: request.z,
    width: request.facing === 'x' ? 0.3 : width,
    height,
    depth: request.facing === 'x' ? width : 0.3,
    color: 0xffffff,
    uScale: 1 / width,
    vScale: 1 / height,
  });
  for (const side of [-1, 1]) {
    groups.box('metalDark', {
      x: request.x + (request.facing === 'x' ? 0 : side * width * 0.3),
      y: request.y + 0.6,
      z: request.z + (request.facing === 'x' ? side * width * 0.3 : 0),
      width: 0.3,
      height: 1.6,
      depth: 0.3,
      color: 0x3a3f44,
      uScale: 1,
      vScale: 1,
    });
  }
}

/** A wall or roof sign frame carrying one of the neon materials. */
function addSign({ groups, materials, request, rng }) {
  const entry = materials.neon[rng.int(0, materials.neon.length - 1)];
  const height = request.low ? 1.5 : 2.4;
  const width = Math.min(request.width, height * entry.aspect * 1.5);
  const alongX = request.facing === 'z';
  groups.box(entry.bucket, {
    x: request.x,
    y: request.y,
    z: request.z,
    width: alongX ? width : 0.3,
    height,
    depth: alongX ? 0.3 : width,
    color: 0xffffff,
    uScale: 1 / width,
    vScale: 1 / height,
  });
}

/** Lamp posts along every street, alternating sides. */
function buildLampPosts({ plan, groups, rng, colliders }) {
  let count = 0;
  const grids = [
    { xLines: plan.xLines, zLines: plan.zLines },
    { xLines: plan.beachXLines, zLines: plan.beachZLines },
  ];
  for (const grid of grids) {
    for (const line of grid.xLines) {
      const zMin = grid.zLines[0].z;
      const zMax = grid.zLines[grid.zLines.length - 1].z;
      let side = rng.chance(0.5) ? 1 : -1;
      for (let z = zMin + 18; z < zMax; z += LAMP_SPACING) {
        const x = line.x + side * (CITY.roadWidth / 2 + 1.7);
        addStreetlight({
          groups,
          x,
          z,
          y: CITY.sidewalkHeight,
          rotY: side > 0 ? Math.PI : 0,
          colour: 0xffffff,
          rng,
        });
        if (colliders) colliders.addBox({ x, y: CITY.sidewalkHeight + 4, z, width: 0.5, height: 8, depth: 0.5, kind: 'lamp-post' });
        side *= -1;
        count += 1;
      }
    }
    for (const line of grid.zLines) {
      const xMin = grid.xLines[0].x;
      const xMax = grid.xLines[grid.xLines.length - 1].x;
      let side = rng.chance(0.5) ? 1 : -1;
      for (let x = xMin + 18; x < xMax; x += LAMP_SPACING) {
        const z = line.z + side * (CITY.roadWidth / 2 + 1.7);
        addStreetlight({
          groups,
          x,
          z,
          y: CITY.sidewalkHeight,
          rotY: side > 0 ? Math.PI / 2 : -Math.PI / 2,
          colour: 0xffffff,
          rng,
        });
        if (colliders) colliders.addBox({ x, y: CITY.sidewalkHeight + 4, z, width: 0.5, height: 8, depth: 0.5, kind: 'lamp-post' });
        side *= -1;
        count += 1;
      }
    }
  }
  return count;
}

/** Furniture along the four pavement edges of every block. */
function decorateBlocks({ plan, groups, rng, colliders, materials }) {
  const stats = { benches: 0, bins: 0, hydrants: 0, stalls: 0, palms: 0, signs: 0, crates: 0, containers: 0, cars: 0, towers: 0, billboards: 0 };
  for (const block of plan.blocks) {
    const district = districtById(block.districtId);
    const mix = district.props;
    if (!mix || Object.keys(mix).length === 0) continue;
    const blockRng = rng.fork(`props:${block.i}:${block.j}`);
    const edges = [
      { axis: 'z', sign: -1 },
      { axis: 'z', sign: 1 },
      { axis: 'x', sign: -1 },
      { axis: 'x', sign: 1 },
    ];
    for (const edge of edges) {
      const along = blockRng.float(0, 1);
      const place = (t) => {
        const offset = edge.sign * PAVEMENT_INSET;
        return edge.axis === 'z'
          ? { x: block.cx + offset, z: block.cz + (t - 0.5) * (block.size - 6) }
          : { x: block.cx + (t - 0.5) * (block.size - 6), z: block.cz + offset };
      };
      const facing = edge.axis === 'z'
        ? (edge.sign > 0 ? Math.PI / 2 : -Math.PI / 2)
        : (edge.sign > 0 ? 0 : Math.PI);

      if (blockRng.chance(mix.palm ?? 0)) {
        const at = place(along);
        addPalm({ groups, x: at.x, z: at.z, y: CITY.sidewalkHeight, height: blockRng.float(6, 10.5), rng: blockRng });
        if (colliders) colliders.addBox({ x: at.x, y: CITY.sidewalkHeight + 3, z: at.z, width: 0.9, height: 6, depth: 0.9, kind: 'palm' });
        stats.palms += 1;
      }
      if (blockRng.chance((mix.bench ?? 0) / 3)) {
        const at = place(blockRng.float(0.15, 0.85));
        addBench({ groups, x: at.x, z: at.z, y: CITY.sidewalkHeight, rotY: facing, rng: blockRng });
        stats.benches += 1;
      }
      if (blockRng.chance((mix.bin ?? 0) / 2)) {
        const at = place(blockRng.float(0.1, 0.9));
        addBin({ groups, x: at.x, z: at.z, y: CITY.sidewalkHeight, rng: blockRng });
        stats.bins += 1;
      }
      if (blockRng.chance((mix.hydrant ?? 0) / 2)) {
        const at = place(blockRng.float(0.1, 0.9));
        addHydrant({ groups, x: at.x, z: at.z, y: CITY.sidewalkHeight });
        stats.hydrants += 1;
      }
      if (blockRng.chance((mix.stall ?? 0) / 2.6)) {
        const at = place(blockRng.float(0.2, 0.8));
        addStall({ groups, x: at.x, z: at.z, y: CITY.sidewalkHeight, rotY: facing, rng: blockRng });
        stats.stalls += 1;
      }
      if (blockRng.chance((mix.crate ?? 0) / 2)) {
        const at = place(blockRng.float(0.1, 0.9));
        addCrate({ groups, x: at.x, z: at.z, y: CITY.sidewalkHeight, size: blockRng.float(0.4, 0.7), rng: blockRng });
        stats.crates += 1;
      }
      if (blockRng.chance((mix.container ?? 0) / 3.4)) {
        const at = place(blockRng.float(0.1, 0.9));
        addContainer({ groups, x: at.x, z: at.z, y: CITY.sidewalkHeight, rotY: facing + (blockRng.chance(0.3) ? Math.PI / 2 : 0), rng: blockRng });
        if (colliders) colliders.addBox({ x: at.x, y: CITY.sidewalkHeight + 1.3, z: at.z, width: 6.2, height: 2.6, depth: 2.6, kind: 'container' });
        stats.containers += 1;
      }
      if (blockRng.chance((mix.billboard ?? 0.02))) {
        const at = place(blockRng.float(0.2, 0.8));
        stats.billboards += 1;
        addBillboard({
          groups,
          materials,
          request: { x: at.x, y: CITY.sidewalkHeight, z: at.z, index: stats.billboards, facing: edge.axis === 'z' ? 'z' : 'x' },
          rng: blockRng,
        });
      }
      // Parked cars sit on the carriageway beside the kerb, not on the pavement.
      if (blockRng.chance((mix.parkedCar ?? 0) / 3)) {
        const t = blockRng.float(0.1, 0.9);
        // Parked cars hug the kerb: the block edge plus the carriageway half width.
        const kerbOffset = edge.sign * (block.size / 2 + CITY.roadWidth / 2 - 2.1);
        const at = edge.axis === 'z'
          ? { x: block.cx + kerbOffset, z: block.cz + (t - 0.5) * (block.size - 8) }
          : { x: block.cx + (t - 0.5) * (block.size - 8), z: block.cz + kerbOffset };
        const alongX = edge.axis === 'z' ? false : true;
        addCar({
          groups,
          x: at.x,
          z: at.z,
          y: 0.02,
          rotY: alongX ? 0 : Math.PI / 2,
          rng: blockRng,
          colliders,
        });
        stats.cars += 1;
      }
    }
  }
  return stats;
}

/** Marsh reeds and beach dressing, placed on the open ground rather than pavements. */
function scatterOutdoor({ plan, groups, rng, heightField }) {
  const stats = { reeds: 0, towers: 0 };
  for (let i = 0; i < 260; i += 1) {
    const x = rng.float(-560, 560);
    const z = rng.float(-480, 300);
    const kind = plan.landKindAt(x, z);
    if (kind !== 'marsh') continue;
    const y = heightField(x, z);
    if (y < CITY.seaLevel + 0.2) continue;
    addReed({ groups, x, z, y, rng });
    stats.reeds += 1;
  }
  return stats;
}

export function buildProps({ plan, groups, rng, colliders, materials, heightField, signRequests = [] }) {
  const lampCount = buildLampPosts({ plan, groups, rng, colliders });
  const furniture = decorateBlocks({ plan, groups, rng, colliders, materials });
  const outdoor = scatterOutdoor({ plan, groups, rng, heightField });

  // Signs the buildings asked for, plus the pier and boardwalk lifeguard towers.
  let signCount = 0;
  for (const request of signRequests) {
    addSign({ groups, materials, request, rng });
    signCount += 1;
  }

  const towers = [];
  for (let i = 0; i < 4; i += 1) {
    const x = -120 + i * 108;
    const z = 452 + rng.float(-6, 6);
    const y = heightField(x, z);
    if (y < CITY.seaLevel + 0.2) continue;
    addLifeguardTower({ groups, x, z, y, rng });
    towers.push({ x, z });
  }

  // A few hoardings along the strip and the boulevard, where ads belong.
  const hoardings = [
    { x: 180, z: -108, index: 0, facing: 'x' },
    { x: -36, z: -180, index: 1, facing: 'z' },
    { x: 252, z: 108, index: 2, facing: 'z' },
    { x: -180, z: 108, index: 3, facing: 'x' },
  ];
  for (const hoarding of hoardings) {
    addBillboard({
      groups,
      materials,
      request: { ...hoarding, y: CITY.sidewalkHeight },
      rng,
    });
  }

  return {
    lamps: lampCount,
    signs: signCount,
    towers,
    ...furniture,
    ...outdoor,
  };
}
