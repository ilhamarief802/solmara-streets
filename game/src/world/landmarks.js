// The landmarks: the pieces that are placed by hand rather than by rule, so the city
// has somewhere to look at. The Solmara Tower, the plaza and its fountain, the Verano
// stadium, the harbour docks and cranes, the marina pier with its yachts, the two
// bridges across the channel and the marsh airstrip.

import { CITY } from './cityplan.js';
import { TAU } from '../core/math.js';

const SIDEWALK = CITY.sidewalkHeight;

/** A box stretched between two points, for cables, braces and gantries. */
function strut(groups, options) {
  const { from, to, thickness = 0.3, bucket = 'metalDark', color = 0x4a5056 } = options;
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const dz = to[2] - from[2];
  const length = Math.hypot(dx, dy, dz);
  if (length < 0.001) return;
  const cx = (from[0] + to[0]) / 2;
  const cy = (from[1] + to[1]) / 2;
  const cz = (from[2] + to[2]) / 2;
  const alongZ = Math.abs(dz) >= Math.abs(dx);
  const rotation = alongZ
    ? { x: -Math.atan2(dy, dz), y: 0, z: 0 }
    : { x: 0, y: 0, z: Math.atan2(dy, dx) };
  groups.box(bucket, {
    x: cx,
    y: cy,
    z: cz,
    width: alongZ ? thickness : length,
    height: thickness,
    depth: alongZ ? length : thickness,
    rotation,
    color,
    uScale: 1,
    vScale: 1,
  });
}

/** The downtown supertall: three stepped glass volumes and a mast. */
function solmaraTower({ groups, rng, colliders }) {
  const x = 1.5 * CITY.pitch;
  const z = -3.5 * CITY.pitch;
  const base = SIDEWALK;
  const tiers = [
    { width: 44, depth: 44, height: 96 },
    { width: 34, depth: 36, height: 62, offset: [-2, 1] },
    { width: 24, depth: 26, height: 48, offset: [1, -2] },
  ];
  let top = base;
  for (const tier of tiers) {
    const tx = x + (tier.offset?.[0] ?? 0);
    const tz = z + (tier.offset?.[1] ?? 0);
    groups.builder('glass').addBox({
      x: tx,
      y: top + tier.height / 2,
      z: tz,
      width: tier.width,
      height: tier.height,
      depth: tier.depth,
      color: 0x9fc4e0,
      tint: rng.float(0.94, 1.06),
      uScale: 1 / 12.8,
      vScale: 1 / 13.6,
      faces: ['px', 'nx', 'pz', 'nz', 'py'],
    });
    if (colliders) colliders.addBox({ x: tx, y: top + tier.height / 2, z: tz, width: tier.width, height: tier.height, depth: tier.depth, kind: 'landmark', landmark: 'solmara-tower' });
    // Floor slab bands so the tower reads as storeys at a distance.
    groups.box('concrete', {
      x: tx,
      y: top + 0.2,
      z: tz,
      width: tier.width + 0.8,
      height: 0.4,
      depth: tier.depth + 0.8,
      color: 0xc8ccd0,
      uScale: 1 / 6,
      vScale: 1 / 6,
    });
    top += tier.height;
  }
  // Crown and mast.
  groups.box('metal', {
    x,
    y: top + 2,
    z,
    width: 18,
    height: 4,
    depth: 18,
    color: 0xb8bec4,
    uScale: 0.3,
    vScale: 0.3,
  });
  groups.cylinder('metalDark', {
    x,
    y: top + 4 + 22,
    z,
    radiusTop: 0.3,
    radiusBottom: 1.1,
    height: 44,
    segments: 6,
    color: 0x4a5056,
    uScale: 0.5,
    vScale: 0.2,
  });
  groups.box('lamp', {
    x,
    y: top + 44,
    z,
    width: 2.6,
    height: 1.2,
    depth: 2.6,
    color: 0xff6b5c,
    uScale: 0.5,
    vScale: 0.5,
  });
  return { name: 'solmara-tower', x, z, y: base, height: top - base + 48, kind: 'tower' };
}

/** The plaza: paving, fountain, obelisk, planters and palms. */
function solmaraPlaza({ groups, rng, colliders, heightField }) {
  const x = 0.5 * CITY.pitch;
  const z = 0.5 * CITY.pitch;
  const yard = 34;
  const y = SIDEWALK;
  groups.ground('plaza', {
    x,
    z,
    y: y + 0.01,
    width: yard,
    depth: yard,
    uScale: 1 / 8,
    vScale: 1 / 8,
    color: 0xe8e2d2,
  });
  // Fountain: two basins and a centre column.
  groups.ring('concrete', { x, z, y: y + 0.4, inner: 0, outer: 5.4, segments: 18, color: 0xbfbcb2, uScale: 0.25, vScale: 0.25 });
  groups.ring('concreteDark', { x, z, y: y + 0.85, inner: 4.6, outer: 5.4, segments: 18, color: 0x8f8c84, uScale: 0.4, vScale: 0.4 });
  groups.box('water', {
    x,
    y: y + 0.4,
    z,
    width: 9.2,
    height: 0.2,
    depth: 9.2,
    color: 0x6fd0e8,
    uScale: 1 / 8,
    vScale: 1 / 8,
  });
  groups.cylinder('concrete', {
    x,
    y: y + 1.6,
    z,
    radiusTop: 0.5,
    radiusBottom: 1.2,
    height: 2.4,
    segments: 10,
    color: 0xc8c4ba,
    uScale: 0.6,
    vScale: 0.6,
  });
  groups.cylinder('metal', {
    x,
    y: y + 3.6,
    z,
    radiusTop: 0.9,
    radiusBottom: 0.3,
    height: 1.8,
    segments: 10,
    color: 0x8f9499,
    uScale: 0.6,
    vScale: 0.6,
  });
  // Obelisk on the north side.
  groups.box('plazaStone', {
    x,
    y: y + 7,
    z: z - 12,
    width: 3.4,
    height: 14,
    depth: 3.4,
    color: 0xd9d4c6,
    uScale: 0.3,
    vScale: 0.3,
  });
  groups.box('plazaStone', {
    x,
    y: y + 0.6,
    z: z - 12,
    width: 5.2,
    height: 1.2,
    depth: 5.2,
    color: 0xcfcaba,
    uScale: 0.4,
    vScale: 0.4,
  });
  if (colliders) {
    colliders.addBox({ x, y: y + 1.2, z, width: 11, height: 2.4, depth: 11, kind: 'landmark', landmark: 'plaza-fountain' });
    colliders.addBox({ x, y: y + 7, z: z - 12, width: 4, height: 15, depth: 4, kind: 'landmark', landmark: 'plaza-obelisk' });
  }
  // Planters with palms in the four corners.
  const corners = [
    [-12, -12],
    [12, -12],
    [-12, 12],
    [12, 12],
  ];
  let palms = 0;
  for (const [ox, oz] of corners) {
    groups.box('plazaStone', {
      x: x + ox,
      y: y + 0.7,
      z: z + oz,
      width: 7,
      height: 1.4,
      depth: 7,
      color: 0xc4bfae,
      uScale: 0.4,
      vScale: 0.4,
    });
    groups.box('grass', {
      x: x + ox,
      y: y + 1.5,
      z: z + oz,
      width: 6.2,
      height: 0.3,
      depth: 6.2,
      color: 0x93a878,
      uScale: 0.5,
      vScale: 0.5,
    });
    for (let i = 0; i < 3; i += 1) {
      const px = x + ox + rng.float(-1.8, 1.8);
      const pz = z + oz + rng.float(-1.8, 1.8);
      const h = rng.float(7, 10);
      groups.cylinder('planks', {
        x: px,
        y: y + 1.6 + h / 2,
        z: pz,
        radiusTop: 0.2,
        radiusBottom: 0.36,
        height: h,
        segments: 5,
        color: 0x8a6f4e,
        uScale: 0.6,
        vScale: 0.3,
      });
      for (let f = 0; f < 6; f += 1) {
        const angle = (f / 6) * TAU;
        groups.box('foliage', {
          x: px + Math.cos(angle) * 1.6,
          y: y + 1.6 + h - 0.5,
          z: pz + Math.sin(angle) * 1.6,
          width: 3.4,
          height: 0.12,
          depth: 1.3,
          rotation: { x: 0, y: -angle, z: -0.45 },
          color: 0x5f8a44,
          uScale: 0.4,
          vScale: 0.4,
          faces: ['py', 'pz', 'nz', 'px', 'nx'],
        });
      }
      palms += 1;
    }
  }
  return { name: 'solmara-plaza', x, z, y, palms, kind: 'plaza' };
}

/** The stadium: an oval bowl of seats, a roof ring, floodlights and a pitch. */
function veranoStadium({ groups, rng, colliders }) {
  const x = -2.5 * CITY.pitch;
  const z = 2.5 * CITY.pitch;
  const y = SIDEWALK;
  const outerRadius = 52;
  const innerRadius = 30;
  const segments = 20;
  const standHeight = 22;
  const standDepth = (outerRadius - innerRadius) / 3;

  // Three tiers of terracing, each ring stepping up and inwards.
  for (let ring = 0; ring < 3; ring += 1) {
    const r = outerRadius - standDepth * (ring + 0.5);
    groups.ring('concrete', {
      x,
      z,
      y: y + 0.5 + ring * 6,
      inner: r - standDepth * 0.5,
      outer: r + standDepth * 0.5,
      segments,
      color: 0xd6d2c4,
      tint: ring === 0 ? 0.9 : 1,
      uScale: 0.25,
      vScale: 0.25,
    });
  }
  void standHeight;

  // Outer wall with pilasters and a roof ring above it.
  for (let i = 0; i < segments; i += 1) {
    const angle = (i / segments) * TAU;
    const px = x + Math.cos(angle) * (outerRadius + 1.5);
    const pz = z + Math.sin(angle) * (outerRadius + 1.5);
    const rotY = -angle;
    groups.box('plaza', {
      x: px,
      y: y + 5,
      z: pz,
      width: outerRadius * 0.34,
      height: 10,
      depth: 3,
      rotation: { x: 0, y: rotY, z: 0 },
      color: 0xd0cbbd,
      tint: rng.float(0.94, 1.04),
      uScale: 0.2,
      vScale: 0.2,
    });
    if (i % 2 === 0) {
      groups.box('plaza', {
        x,
        y: y + 4,
        z,
        width: outerRadius * 0.36,
        height: 8,
        depth: 2,
        rotation: { x: 0, y: rotY, z: 0 },
        color: 0xe0dccb,
        uScale: 0.3,
        vScale: 0.3,
      });
    }
    // Roof ring segment, tilted outwards.
    groups.box('metal', {
      x: x + Math.cos(angle) * (outerRadius + 3),
      y: y + 21,
      z: z + Math.sin(angle) * (outerRadius + 3),
      width: 13,
      height: 0.8,
      depth: outerRadius * 0.42,
      rotation: { x: -0.16, y: rotY, z: 0 },
      color: 0xb8bec4,
      tint: rng.float(0.94, 1.04),
      uScale: 0.2,
      vScale: 0.2,
    });
  }

  // The pitch: striped grass inside the stands.
  groups.ring('grass', { x, z, y: y + 0.4, inner: 0, outer: innerRadius - 3, segments: 22, color: 0x6f8f4a, uScale: 0.05, vScale: 0.05 });
  for (let i = -6; i <= 6; i += 1) {
    groups.ground('grass', {
      x,
      z: z + i * 4.4,
      y: y + 0.45,
      width: innerRadius * 1.3,
      depth: 2.2,
      uScale: 0.1,
      vScale: 0.1,
      color: i % 2 === 0 ? 0x8fae5c : 0x7fa050,
    });
  }
  groups.ground('kerb', { x, z, y: y + 0.5, width: 4, depth: innerRadius * 1.1, uScale: 0.1, vScale: 0.1, color: 0xf0f0e6 });
  groups.ring('kerb', { x, z, y: y + 0.5, inner: 9, outer: 9.4, segments: 20, color: 0xf0f0e6, uScale: 0.2, vScale: 0.2 });

  // Floodlight masts in the four corners.
  for (const [ox, oz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const mx = x + ox * (outerRadius - 4);
    const mz = z + oz * (outerRadius - 4);
    groups.cylinder('metalDark', {
      x: mx,
      y: y + 17,
      z: mz,
      radiusTop: 0.6,
      radiusBottom: 1.4,
      height: 34,
      segments: 6,
      color: 0x4a5056,
      uScale: 0.4,
      vScale: 0.2,
    });
    groups.box('lamp', { x: mx, y: y + 35, z: mz, width: 6, height: 2.4, depth: 1.4, color: 0xf4f4e2, uScale: 0.4, vScale: 0.4 });
    if (colliders) colliders.addBox({ x: mx, y: y + 17, z: mz, width: 3, height: 34, depth: 3, kind: 'landmark', landmark: 'stadium-mast' });
  }

  if (colliders) {
    // The bowl as a ring of wall colliders, so later phases can walk around it.
    for (let i = 0; i < 12; i += 1) {
      const angle = (i / 12) * TAU;
      colliders.addBox({
        x: x + Math.cos(angle) * outerRadius,
        y: y + 8,
        z: z + Math.sin(angle) * outerRadius,
        width: 26,
        height: 16,
        depth: 16,
        rotationY: -angle,
        kind: 'landmark',
        landmark: 'stadium-bowl',
      });
    }
  }
  return { name: 'verano-stadium', x, z, y, radius: outerRadius, kind: 'stadium' };
}

/** Harbour: quay aprons, gantry cranes, bollards and a transit warehouse. */
function harbourDocks({ groups, rng, colliders, heightField }) {
  const x = -5.5 * CITY.pitch;
  const z = -1.5 * CITY.pitch;
  const quayY = 1.4;
  const stats = { cranes: 0 };
  // Apron running north-south along the west coast, reaching into the water.
  groups.box('concrete', {
    x: x - 14,
    y: quayY / 2,
    z,
    width: 60,
    height: quayY * 2,
    depth: 220,
    color: 0xa5a29a,
    uScale: 1 / 8,
    vScale: 1 / 8,
    faces: ['py', 'px', 'nx', 'pz', 'nz'],
  });
  if (colliders) colliders.addBox({ x: x - 14, y: quayY, z, width: 60, height: quayY * 2, depth: 220, kind: 'quay' });

  // Gantry cranes straddling the apron.
  for (let i = 0; i < 3; i += 1) {
    const cz = z - 70 + i * 68;
    const width = 34;
    const legHeight = 26;
    const legT = 1.4;
    for (const [ox, oz] of [
      [-width / 2, -4],
      [width / 2, -4],
      [-width / 2, 4],
      [width / 2, 4],
    ]) {
      const lx = x - 14 + ox;
      const lz = cz + oz;
      strut(groups, {
        from: [lx, quayY, lz],
        to: [lx, quayY + legHeight, lz],
        thickness: legT,
        bucket: 'metalDark',
        color: 0xc4553a,
      });
      if (colliders) colliders.addBox({ x: lx, y: quayY + legHeight / 2, z: lz, width: legT, height: legHeight, depth: legT, kind: 'crane-leg' });
    }
    // Top girders, the boom and the counterweight.
    strut(groups, { from: [x - 14 - width / 2, quayY + legHeight, cz - 4], to: [x - 14 + width / 2, quayY + legHeight, cz - 4], thickness: 1.2, bucket: 'metalDark', color: 0xc4553a });
    strut(groups, { from: [x - 14 - width / 2, quayY + legHeight, cz + 4], to: [x - 14 + width / 2, quayY + legHeight, cz + 4], thickness: 1.2, bucket: 'metalDark', color: 0xc4553a });
    strut(groups, { from: [x - 14, quayY + legHeight, cz], to: [x - 44, quayY + legHeight + 5, cz], thickness: 2, bucket: 'metalDark', color: 0xd8d8d0 });
    strut(groups, { from: [x - 14, quayY + legHeight, cz], to: [x + 2, quayY + legHeight + 3, cz], thickness: 2.4, bucket: 'metalDark', color: 0xc4553a });
    strut(groups, { from: [x - 44, quayY + legHeight + 5, cz], to: [x - 52, quayY + legHeight - 6, cz], thickness: 0.6, bucket: 'metalDark', color: 0x8f9499 });
    groups.box('metalDark', {
      x: x - 44,
      y: quayY + legHeight + 6,
      z: cz,
      width: 4,
      height: 2,
      depth: 2,
      color: 0xd8c04a,
      uScale: 0.4,
      vScale: 0.4,
    });
    stats.cranes += 1;
  }

  // Transit sheds and a fuel farm behind the apron.
  for (let i = 0; i < 2; i += 1) {
    const sz = z - 60 + i * 130;
    const sx = x + 34;
    groups.box('siding', {
      x: sx,
      y: quayY + 6,
      z: sz,
      width: 26,
      height: 12,
      depth: 54,
      color: 0x8a8f8c,
      tint: rng.float(0.94, 1.06),
      uScale: 1 / 4,
      vScale: 1 / 4,
    });
    groups.roof('metal', {
      x: sx,
      y: quayY + 12,
      z: sz,
      width: 28,
      depth: 56,
      height: 4,
      axis: 'z',
      color: 0xb0b4b8,
      uScale: 1 / 4,
      vScale: 1 / 4,
    });
    if (colliders) colliders.addBox({ x: sx, y: quayY + 6, z: sz, width: 26, height: 12, depth: 54, kind: 'warehouse' });
  }
  for (let i = 0; i < 3; i += 1) {
    groups.cylinder('metal', {
      x: x + 22 + i * 9,
      y: quayY + 3,
      z: z + 88,
      radius: 3.4,
      height: 6,
      segments: 10,
      color: 0xd8d8d0,
      uScale: 0.3,
      vScale: 0.3,
    });
  }
  // Bollards along the quay edge.
  for (let i = 0; i < 18; i += 1) {
    groups.cylinder('metalDark', {
      x: x - 42,
      y: quayY + 0.35,
      z: z - 100 + i * 12,
      radiusTop: 0.28,
      radiusBottom: 0.42,
      height: 0.9,
      segments: 6,
      color: 0x3f4449,
      uScale: 0.8,
      vScale: 0.6,
    });
  }
  void heightField;
  return { name: 'harbour-docks', x, z, y: quayY, ...stats, kind: 'docks' };
}

/** Marina pier: a timber pier on piles with moored yachts. */
function marinaPier({ groups, rng, colliders, heightField }) {
  const startX = -520;
  const z = 150;
  const length = 190;
  const deckY = 2.6;
  const width = 12;
  const steps = Math.round(length / 12);
  for (let i = 0; i < steps; i += 1) {
    const px = startX - i * 12;
    groups.box('boardwalk', {
      x: px,
      y: deckY,
      z,
      width: 12.2,
      height: 0.5,
      depth: width,
      color: 0xb08a5a,
      tint: rng.float(0.92, 1.06),
      uScale: 1 / 4,
      vScale: 1 / 4,
    });
    // Piles either side, dropping to the sea bed.
    for (const side of [-1, 1]) {
      const pileZ = z + side * (width / 2 - 0.8);
      const bed = heightField ? Math.min(heightField(px, pileZ), CITY.seaLevel - 0.6) : -2;
      const height = deckY - bed;
      groups.cylinder('planks', {
        x: px,
        y: bed + height / 2,
        z: pileZ,
        radius: 0.36,
        height,
        segments: 6,
        color: 0x7a5f40,
        tint: rng.float(0.9, 1.05),
        uScale: 0.6,
        vScale: 0.3,
      });
    }
  }
  // A pavilion at the seaward end.
  groups.box('planks', {
    x: startX - length + 4,
    y: deckY + 3,
    z,
    width: 14,
    height: 6,
    depth: 14,
    color: 0xd8c8a8,
    uScale: 0.4,
    vScale: 0.4,
  });
  groups.roof('metal', {
    x: startX - length + 4,
    y: deckY + 6,
    z,
    width: 16,
    depth: 16,
    height: 3,
    axis: 'x',
    color: 0x2f7f8f,
    uScale: 0.3,
    vScale: 0.3,
  });
  if (colliders) colliders.addBox({ x: startX - length + 4, y: deckY + 3, z, width: 14, height: 6, depth: 14, kind: 'pier-pavilion' });

  // Yachts moored alongside.
  const yachts = [];
  for (let i = 0; i < 6; i += 1) {
    const bx = startX - 20 - i * 26;
    const side = i % 2 === 0 ? -1 : 1;
    const bz = z + side * 13;
    const hullLength = rng.float(7, 13);
    const rotY = side > 0 ? 0.06 : Math.PI - 0.06;
    groups.box('metal', {
      x: bx,
      y: 0.5,
      z: bz,
      width: hullLength,
      height: 1.6,
      depth: hullLength * 0.28,
      rotation: { x: 0, y: rotY, z: 0 },
      color: rng.pick([0xf0f0e8, 0xdfe6ea, 0x2f5a8a, 0xe8dcc0]),
      tint: rng.float(0.95, 1.05),
      uScale: 0.3,
      vScale: 0.3,
    });
    groups.box('metal', {
      x: bx + Math.cos(rotY) * hullLength * 0.12,
      y: 1.6,
      z: bz - Math.sin(rotY) * hullLength * 0.12,
      width: hullLength * 0.38,
      height: 1,
      depth: hullLength * 0.22,
      rotation: { x: 0, y: rotY, z: 0 },
      color: 0xe8eef0,
      uScale: 0.4,
      vScale: 0.4,
    });
    groups.cylinder('metal', {
      x: bx,
      y: 4.4,
      z: bz,
      radiusTop: 0.1,
      radiusBottom: 0.16,
      height: 7,
      segments: 5,
      color: 0xd8dce0,
      uScale: 1,
      vScale: 0.4,
    });
    yachts.push({ x: bx, z: bz, length: hullLength });
    if (colliders) colliders.addBox({ x: bx, y: 1, z: bz, width: hullLength, height: 2.2, depth: hullLength * 0.4, kind: 'yacht' });
  }
  return { name: 'marina-pier', x: startX, z, y: deckY, yachts: yachts.length, kind: 'pier' };
}

/** A suspension bridge: deck, towers, cable, hangers, piers and approaches. */
function oldBridge({ groups, rng, colliders, plan }) {
  const bridge = plan.bridges.find((entry) => entry.id === 'The Old Bridge');
  const x = bridge.x;
  const deckY = bridge.deckHeight;
  const span = bridge.to - bridge.from;
  const half = bridge.width / 2;
  const zFrom = bridge.from;
  const zTo = bridge.to;

  // Deck with a wearing course and railings.
  groups.box('concrete', {
    x,
    y: deckY - 0.7,
    z: (zFrom + zTo) / 2,
    width: bridge.width,
    height: 1.4,
    depth: span,
    color: 0xb8b4aa,
    uScale: 1 / 8,
    vScale: 1 / 8,
    faces: ['py', 'px', 'nx', 'pz', 'nz'],
  });
  groups.ground('roadWide', {
    x,
    z: (zFrom + zTo) / 2,
    y: deckY + 0.01,
    width: span - 0.6,
    depth: bridge.width - 2,
    rotY: Math.PI / 2,
    uScale: 1 / 12,
    vScale: 1 / (bridge.width - 2),
  });
  for (const side of [-1, 1]) {
    groups.box('concreteRail', {
      x: x + side * (half - 0.4),
      y: deckY + 0.7,
      z: (zFrom + zTo) / 2,
      width: 0.8,
      height: 1.4,
      depth: span,
      color: 0xc8c4ba,
      uScale: 1 / 4,
      vScale: 1 / 4,
    });
  }
  // Approach ramps from street level up to the deck at each end.
  const approach = 30;
  for (const [dir, endZ] of [[-1, zFrom], [1, zTo]]) {
    const fromY = 0.1;
    const centreZ = endZ + dir * approach / 2;
    const angle = Math.atan2(deckY - fromY, approach);
    groups.box('concrete', {
      x,
      y: (deckY + fromY) / 2 - 0.7,
      z: centreZ,
      width: bridge.width,
      height: 1.4,
      depth: approach,
      rotation: { x: dir * -angle, y: 0, z: 0 },
      color: 0xb8b4aa,
      uScale: 1 / 8,
      vScale: 1 / 8,
      faces: ['py', 'px', 'nx', 'pz', 'nz'],
    });
  }

  // Piers.
  for (const pierZ of [zFrom + span * 0.2, zFrom + span * 0.5, zFrom + span * 0.8]) {
    const bed = -3;
    const height = deckY - 0.7 - bed;
    for (const side of [-1, 1]) {
      groups.cylinder('concrete', {
        x: x + side * 5.5,
        y: bed + height / 2,
        z: pierZ,
        radiusTop: 2,
        radiusBottom: 2.6,
        height,
        segments: 8,
        color: 0x8f8c84,
        uScale: 0.3,
        vScale: 0.2,
      });
    }
    if (colliders) colliders.addBox({ x, y: 2, z: pierZ, width: 16, height: 9, depth: 5, kind: 'bridge-pier' });
  }

  // Two towers with crossbeams, and the cable between them.
  const towerZ = [zFrom + span * 0.28, zFrom + span * 0.72];
  const towerTop = deckY + 26;
  for (const tz of towerZ) {
    for (const side of [-1, 1]) {
      groups.box('concreteRail', {
        x: x + side * (half - 0.6),
        y: (deckY + towerTop) / 2,
        z: tz,
        width: 1.8,
        height: towerTop - deckY,
        depth: 3.6,
        color: 0xd0ccc2,
        uScale: 1 / 6,
        vScale: 1 / 6,
      });
    }
    for (const beamY of [deckY + 12, towerTop - 1.5]) {
      groups.box('concreteRail', {
        x,
        y: beamY,
        z: tz,
        width: bridge.width + 1.2,
        height: 2,
        depth: 1.6,
        color: 0xc8c4ba,
        uScale: 1 / 4,
        vScale: 1 / 4,
      });
    }
    if (colliders) colliders.addBox({ x, y: (deckY + towerTop) / 2, z: tz, width: bridge.width + 2, height: towerTop - deckY, depth: 4, kind: 'bridge-tower' });
  }

  // Main cable: straight segments approximating a catenary either side of mid span.
  for (const side of [-1, 1]) {
    const cableX = x + side * (half - 0.6);
    const points = [];
    const steps = 12;
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      const cz = towerZ[0] + (towerZ[1] - towerZ[0]) * t;
      const sag = Math.sin(t * Math.PI);
      const cy = towerTop - 1.5 - (towerTop - 1.5 - (deckY + 2)) * sag;
      points.push([cableX, cy, cz]);
    }
    for (let i = 0; i < points.length - 1; i += 1) {
      strut(groups, { from: points[i], to: points[i + 1], thickness: 0.42, bucket: 'metalDark', color: 0x8f9499 });
      // A hanger dropping from the cable to the deck.
      if (i % 2 === 0 && i > 0) {
        strut(groups, {
          from: [cableX, points[i][1], points[i][2]],
          to: [cableX, deckY + 0.5, points[i][2]],
          thickness: 0.14,
          bucket: 'metalDark',
          color: 0xa8aeb4,
        });
      }
    }
    // Side spans down to the abutments.
    strut(groups, { from: [cableX, towerTop - 1.5, towerZ[0]], to: [cableX, deckY + 1, zFrom + 2], thickness: 0.42, bucket: 'metalDark', color: 0x8f9499 });
    strut(groups, { from: [cableX, towerTop - 1.5, towerZ[1]], to: [cableX, deckY + 1, zTo - 2], thickness: 0.42, bucket: 'metalDark', color: 0x8f9499 });
  }

  // Lamp standards along the deck.
  for (let i = 1; i <= 6; i += 1) {
    const lz = zFrom + (span * i) / 7;
    groups.cylinder('metalDark', {
      x: x + (i % 2 === 0 ? half - 0.9 : -(half - 0.9)),
      y: deckY + 2.6,
      z: lz,
      radiusTop: 0.1,
      radiusBottom: 0.18,
      height: 5.2,
      segments: 5,
      color: 0x3f4449,
      uScale: 1,
      vScale: 0.5,
    });
    groups.box('lamp', {
      x: x + (i % 2 === 0 ? half - 1.3 : -(half - 1.3)),
      y: deckY + 5.2,
      z: lz,
      width: 0.9,
      height: 0.3,
      depth: 0.5,
      color: 0xffffff,
      uScale: 0.6,
      vScale: 0.6,
    });
  }
  void rng;
  return { name: 'The Old Bridge', x, z: (zFrom + zTo) / 2, y: deckY, span, kind: 'bridge' };
}

/** The beach causeway: a plain girder bridge carrying the west side to the sand. */
function beachCauseway({ groups, rng, colliders, plan }) {
  const bridge = plan.bridges.find((entry) => entry.id === 'Beach Causeway');
  const x = bridge.x;
  const deckY = bridge.deckHeight;
  const span = bridge.to - bridge.from;
  const midZ = (bridge.from + bridge.to) / 2;
  groups.box('concrete', {
    x,
    y: deckY - 0.8,
    z: midZ,
    width: bridge.width,
    height: 1.6,
    depth: span,
    color: 0xb0aca2,
    uScale: 1 / 8,
    vScale: 1 / 8,
    faces: ['py', 'px', 'nx', 'pz', 'nz'],
  });
  groups.ground('road', {
    x,
    z: midZ,
    y: deckY + 0.01,
    width: span - 0.6,
    depth: bridge.width - 2,
    rotY: Math.PI / 2,
    uScale: 1 / 12,
    vScale: 1 / (bridge.width - 2),
  });
  for (const side of [-1, 1]) {
    groups.box('railing', {
      x: x + side * (bridge.width / 2 - 0.3),
      y: deckY + 0.6,
      z: midZ,
      width: 0.4,
      height: 1.2,
      depth: span,
      color: 0x9aa2a8,
      uScale: 0.4,
      vScale: 0.4,
    });
  }
  const piers = 3;
  for (let i = 1; i <= piers; i += 1) {
    const pz = bridge.from + (span * i) / (piers + 1);
    groups.box('concrete', {
      x,
      y: deckY / 2 - 1,
      z: pz,
      width: bridge.width - 3,
      height: deckY + 1,
      depth: 3.2,
      color: 0x9d9c96,
      tint: rng.float(0.95, 1.05),
      uScale: 1 / 8,
      vScale: 1 / 8,
    });
    if (colliders) colliders.addBox({ x, y: deckY / 2, z: pz, width: bridge.width, height: deckY, depth: 3.4, kind: 'bridge-pier' });
  }
  return { name: 'Beach Causeway', x, z: midZ, y: deckY, span, kind: 'causeway' };
}

/** The marsh airstrip: raised dirt runway, markings, hangars and a control tower. */
function marshAirstrip({ groups, rng, colliders, heightField }) {
  const runwayZ = CITY.runwayZ;
  const from = CITY.runwayFrom;
  const to = CITY.runwayTo;
  const length = to - from;
  const width = 26;
  const cx = (from + to) / 2;
  const surfaceY = 0.9;

  // Raised pad so the runway is level over the uneven marsh.
  groups.box('dirt', {
    x: cx,
    y: surfaceY / 2 - 0.5,
    z: runwayZ,
    width: length + 40,
    height: surfaceY + 1,
    depth: width + 46,
    color: 0xb09878,
    uScale: 1 / 14,
    vScale: 1 / 14,
    faces: ['py', 'px', 'nx', 'pz', 'nz'],
  });
  groups.ground('dirt', {
    x: cx,
    z: runwayZ,
    y: surfaceY + 0.01,
    width: length,
    depth: width,
    uScale: 1 / 14,
    vScale: 1 / 14,
    color: 0xd8c4a0,
  });
  // Threshold bars at each end and a dashed centre line.
  for (const end of [0, 1]) {
    const ex = end === 0 ? from + 6 : to - 6;
    for (let i = -4; i <= 4; i += 1) {
      groups.box('kerb', {
        x: ex,
        y: surfaceY + 0.05,
        z: runwayZ + i * 2.2,
        width: 5,
        height: 0.08,
        depth: 1.1,
        color: 0xf0ece0,
        uScale: 1,
        vScale: 1,
      });
    }
  }
  for (let x = from + 26; x < to - 26; x += 24) {
    groups.box('kerb', {
      x,
      y: surfaceY + 0.05,
      z: runwayZ,
      width: 12,
      height: 0.08,
      depth: 1,
      color: 0xe8e4d8,
      uScale: 1,
      vScale: 1,
    });
  }

  // Two hangars and a shed north of the runway.
  const hangars = [];
  for (let i = 0; i < 3; i += 1) {
    const hx = from + 40 + i * 78;
    const hz = runwayZ - 34;
    const w = i === 1 ? 40 : 28;
    const d = 26;
    const h = 11;
    groups.box('hangarSiding', {
      x: hx,
      y: surfaceY + h / 2,
      z: hz,
      width: w,
      height: h,
      depth: d,
      color: 0xa4a8a4,
      tint: rng.float(0.94, 1.06),
      uScale: 1 / 4,
      vScale: 1 / 4,
      faces: ['px', 'nx', 'pz', 'nz', 'py'],
    });
    groups.roof('hangarSiding', {
      x: hx,
      y: surfaceY + h,
      z: hz,
      width: w + 1,
      depth: d + 1,
      height: 4.5,
      axis: 'z',
      color: 0xb8bcb8,
      uScale: 1 / 5,
      vScale: 1 / 5,
    });
    // Roller door on the runway side.
    groups.box('metalDark', {
      x: hx,
      y: surfaceY + h / 2,
      z: hz + d / 2 + 0.1,
      width: w * 0.6,
      height: h * 0.8,
      depth: 0.4,
      color: 0x6f757a,
      uScale: 0.2,
      vScale: 0.2,
    });
    if (colliders) colliders.addBox({ x: hx, y: surfaceY + h / 2, z: hz, width: w, height: h + 4, depth: d, kind: 'hangar' });
    hangars.push({ x: hx, z: hz });
  }

  // Control tower.
  const tx = from + 12;
  const tz = runwayZ - 30;
  groups.box('concrete', {
    x: tx,
    y: surfaceY + 7,
    z: tz,
    width: 7,
    height: 14,
    depth: 7,
    color: 0xc4c0b6,
    uScale: 1 / 5,
    vScale: 1 / 5,
  });
  groups.box('glass', {
    x: tx,
    y: surfaceY + 15.5,
    z: tz,
    width: 10,
    height: 3.4,
    depth: 10,
    color: 0xa8c8d8,
    uScale: 1 / 4,
    vScale: 1 / 4,
  });
  groups.box('metal', {
    x: tx,
    y: surfaceY + 17.8,
    z: tz,
    width: 11,
    height: 0.6,
    depth: 11,
    color: 0x8f9499,
    uScale: 0.4,
    vScale: 0.4,
  });
  groups.cylinder('metalDark', {
    x: tx,
    y: surfaceY + 21,
    z: tz,
    radiusTop: 0.08,
    radiusBottom: 0.16,
    height: 6,
    segments: 4,
    color: 0x4a5056,
    uScale: 1,
    vScale: 0.5,
  });
  if (colliders) colliders.addBox({ x: tx, y: surfaceY + 9, z: tz, width: 10, height: 18, depth: 10, kind: 'control-tower' });

  // Windsock.
  const wx = from + 84;
  const wz = runwayZ + 20;
  groups.cylinder('metalDark', { x: wx, y: surfaceY + 2.5, z: wz, radius: 0.1, height: 5, segments: 5, color: 0x50565c, uScale: 1, vScale: 1 });
  groups.cylinder('lamp', {
    x: wx + 1.2,
    y: surfaceY + 4.6,
    z: wz,
    radiusTop: 0.5,
    radiusBottom: 0.22,
    height: 2.4,
    segments: 8,
    rotation: { x: 0, y: 0, z: Math.PI / 2 },
    color: 0xff9a3c,
    uScale: 0.5,
    vScale: 0.5,
  });
  void heightField;

  return {
    name: 'marsh-airstrip',
    x: cx,
    z: runwayZ,
    y: surfaceY,
    runway: { from, to, width, z: runwayZ, y: surfaceY },
    hangars,
    kind: 'airstrip',
  };
}

/** The beach: boardwalk railings, and the pier structures along the sand. */
function beachFront({ groups, rng, colliders, heightField }) {
  const z = 372;
  const from = -216;
  const to = 288;
  const y = SIDEWALK;
  // Boardwalk deck running the length of the beach.
  groups.box('boardwalk', {
    x: (from + to) / 2,
    y: y + 0.05,
    z,
    width: to - from,
    height: 0.4,
    depth: 7,
    color: 0xc8ae84,
    tint: rng.float(0.96, 1.04),
    uScale: 1 / 4,
    vScale: 1 / 4,
  });
  for (const side of [-1, 1]) {
    groups.box('planks', {
      x: (from + to) / 2,
      y: y + 0.75,
      z: z + side * 3.4,
      width: to - from,
      height: 1,
      depth: 0.25,
      color: 0x9a7b52,
      uScale: 0.4,
      vScale: 0.4,
    });
    for (let x = from + 10; x < to; x += 22) {
      groups.box('planks', {
        x,
        y: y + 0.35,
        z: z + side * 3.4,
        width: 0.3,
        height: 1.7,
        depth: 0.3,
        color: 0x8a6a44,
        uScale: 1,
        vScale: 1,
      });
    }
  }
  // Volleyball courts on the sand, marked with low posts.
  for (let i = 0; i < 3; i += 1) {
    const cx = -100 + i * 140;
    const cz = 430;
    const gy = heightField(cx, cz);
    for (const [ox, oz] of [[-7, -6], [7, -6], [-7, 6], [7, 6]]) {
      groups.box('planks', {
        x: cx + ox,
        y: gy + 1.2,
        z: cz + oz,
        width: 0.25,
        height: 2.4,
        depth: 0.25,
        color: 0x9a7b52,
        uScale: 1,
        vScale: 1,
      });
    }
    groups.box('railing', {
      x: cx,
      y: gy + 2.3,
      z: cz - 6,
      width: 0.1,
      height: 0.9,
      depth: 12,
      color: 0xe8e8e0,
      uScale: 0.5,
      vScale: 0.5,
    });
    void colliders;
  }
  return { name: 'beach-front', x: (from + to) / 2, z, y, kind: 'boardwalk' };
}

/**
 * Builds every handcrafted landmark and returns their anchors, which the world uses
 * for named spawn points.
 */
export function buildLandmarks({ plan, groups, rng, colliders, heightField }) {
  const anchors = {};
  const records = [];

  const add = (record, key) => {
    records.push(record);
    anchors[key] = record;
  };

  add(solmaraTower({ groups, rng, colliders }), 'tower');
  add(solmaraPlaza({ groups, rng, colliders, heightField }), 'plaza');
  add(veranoStadium({ groups, rng, colliders }), 'stadium');
  add(harbourDocks({ groups, rng, colliders, heightField }), 'docks');
  add(marinaPier({ groups, rng, colliders, heightField }), 'pier');
  add(oldBridge({ groups, rng, colliders, plan }), 'oldBridge');
  add(beachCauseway({ groups, rng, colliders, plan }), 'causeway');
  add(marshAirstrip({ groups, rng, colliders, heightField }), 'airstrip');
  add(beachFront({ groups, rng, colliders, heightField }), 'boardwalk');

  return { anchors, records, count: records.length };
}
