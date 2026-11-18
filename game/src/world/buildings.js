// Procedural buildings. Each block is cut into lots, each lot gets a massing whose
// height, setbacks, facade and rooftop clutter come from its district, and every
// volume is emitted into the geometry buckets with a facade tile that repeats in
// metres, so windows are the same size on a two storey shop and a fifty storey tower.

import { CITY } from './cityplan.js';
import { districtById } from './districts.js';
import { TAU, clamp, lerp } from '../core/math.js';

const STOREY = 3.4;
const FACADE_UV = { u: 1 / 12.8, v: 1 / 13.6 };

/** Cuts a block into lots. The scheme depends on district density and block kind. */
function subdivide(block, district, rng) {
  const margin = district.lotMargin;
  const span = block.build - margin * 2;
  const gap = 2.2;
  const half = span / 2;
  const cx = block.cx;
  const cz = block.cz;

  const scheme = rng.pickWeighted([
    ['single', district.density > 0.85 ? 3 : 1],
    ['split2', 2.5],
    ['quad', district.density > 0.65 ? 3 : 1.4],
    ['grid3', district.density < 0.75 ? 2.6 : 0.5],
    ['row', 2],
  ]);

  const lots = [];
  const push = (x, z, w, d) => lots.push({ x, z, w, d });

  if (scheme === 'single') {
    push(cx, cz, span, span);
  } else if (scheme === 'split2') {
    const alongX = rng.chance(0.5);
    const first = rng.float(0.38, 0.62);
    if (alongX) {
      const wA = span * first - gap / 2;
      const wB = span * (1 - first) - gap / 2;
      push(cx - half + wA / 2, cz, wA, span);
      push(cx + half - wB / 2, cz, wB, span);
    } else {
      const dA = span * first - gap / 2;
      const dB = span * (1 - first) - gap / 2;
      push(cx, cz - half + dA / 2, span, dA);
      push(cx, cz + half - dB / 2, span, dB);
    }
  } else if (scheme === 'quad' || scheme === 'grid3') {
    const count = scheme === 'quad' ? 2 : 3;
    const cell = (span - gap * (count - 1)) / count;
    for (let i = 0; i < count; i += 1) {
      for (let j = 0; j < count; j += 1) {
        if (scheme === 'grid3' && rng.chance(0.22)) continue; // a yard or empty plot
        const w = cell * rng.float(0.78, 1);
        const d = cell * rng.float(0.78, 1);
        const lx = cx - half + cell / 2 + i * (cell + gap);
        const lz = cz - half + cell / 2 + j * (cell + gap);
        push(lx, lz, w, d);
      }
    }
  } else {
    // A row of narrow street-front buildings, one axis deep.
    const count = rng.int(3, 5);
    const cell = (span - gap * (count - 1)) / count;
    const alongX = rng.chance(0.5);
    for (let i = 0; i < count; i += 1) {
      const depth = span * rng.float(0.6, 0.85);
      if (alongX) {
        const lx = cx - half + cell / 2 + i * (cell + gap);
        push(lx, cz + rng.float(-1, 1), cell * rng.float(0.86, 1), depth);
      } else {
        const lz = cz - half + cell / 2 + i * (cell + gap);
        push(cx + rng.float(-1, 1), lz, depth, cell * rng.float(0.86, 1));
      }
    }
  }
  return lots;
}

function massing(district, lot, rng, block) {
  const area = lot.w * lot.d;
  const sizeFactor = clamp(Math.sqrt(area) / 30, 0.45, 1.25);
  let storeys = rng.int(district.storeys[0], district.storeys[1]);
  if (block.kind === 'buildings' && rng.chance(0.12)) storeys = Math.round(storeys * rng.float(1.15, 1.5));
  const height = Math.max(5, storeys * STOREY * lerp(0.9, 1.08, rng.next()) * sizeFactor * 0.9 + 3);
  return {
    storeys,
    height: clamp(height, district.minHeight || 5, district.maxHeight || 240),
    tiers: district.tierChance > 0 && rng.chance(district.tierChance) ? rng.int(1, district.setbacks + 1) : 0,
  };
}

function facadeFor(district, height, rng) {
  if (height > 78) return rng.chance(0.72) ? 'glass' : 'officeStone';
  const list = district.facades;
  return rng.pick(list) ?? 'residential';
}

/** Rooftop clutter: parapet, plant boxes, tanks, stair house, masts and signs. */
function roofClutter({ groups, rng, district, x, z, width, depth, top, tall, records }) {
  const inset = 0.5;
  const railH = 0.85;
  const railT = 0.35;
  const parapet = district.palette.roof;
  // Parapet: four strips around the roof edge.
  const strips = [
    { x, z: z - depth / 2 + railT / 2, w: width, d: railT },
    { x, z: z + depth / 2 - railT / 2, w: width, d: railT },
    { x: x - width / 2 + railT / 2, z, w: railT, d: depth },
    { x: x + width / 2 - railT / 2, z, w: railT, d: depth },
  ];
  for (const strip of strips) {
    groups.box('concrete', {
      x: strip.x,
      y: top + railH / 2,
      z: strip.z,
      width: strip.w,
      height: railH,
      depth: strip.d,
      color: parapet,
      tint: rng.float(0.92, 1.06),
      uScale: 1 / 4,
      vScale: 1 / 4,
    });
  }

  const area = width * depth;
  const units = tall ? rng.int(2, 4) : rng.int(1, 3);
  for (let i = 0; i < units; i += 1) {
    const unitW = rng.float(1.6, Math.min(5, width * 0.34));
    const unitD = rng.float(1.6, Math.min(4.4, depth * 0.34));
    const ux = x + rng.float(-1, 1) * (width / 2 - unitW / 2 - inset);
    const uz = z + rng.float(-1, 1) * (depth / 2 - unitD / 2 - inset);
    const kind = rng.next();
    if (kind < 0.45) {
      groups.box('metal', {
        x: ux,
        y: top + 0.85,
        z: uz,
        width: unitW,
        height: 1.7,
        depth: unitD,
        color: 0x8a9096,
        tint: rng.float(0.9, 1.06),
        uScale: 0.5,
        vScale: 0.5,
      });
    } else if (kind < 0.72) {
      const radius = Math.min(2.1, Math.min(unitW, unitD) * 0.45);
      groups.cylinder('metal', {
        x: ux,
        y: top + 1.1,
        z: uz,
        radius,
        height: 2.2,
        segments: 8,
        color: 0x9aa0a6,
        uScale: 0.5,
        vScale: 0.5,
      });
    } else {
      // A stair or lift house with its own little roof.
      groups.box('concrete', {
        x: ux,
        y: top + 1.5,
        z: uz,
        width: unitW,
        height: 3,
        depth: unitD,
        color: district.palette.accent,
        tint: rng.float(0.95, 1.1),
        uScale: 1 / 5,
        vScale: 1 / 5,
      });
      groups.box('roof', {
        x: ux,
        y: top + 3.2,
        z: uz,
        width: unitW + 0.5,
        height: 0.4,
        depth: unitD + 0.5,
        color: district.palette.roof,
        uScale: 1 / 4,
        vScale: 1 / 4,
      });
    }
  }

  // Masts and antennas, the taller the building the more likely.
  if (tall || rng.chance(0.34)) {
    const mastHeight = tall ? rng.float(10, 26) : rng.float(3, 8);
    const mx = x + rng.float(-1, 1) * width * 0.2;
    const mz = z + rng.float(-1, 1) * depth * 0.2;
    groups.cylinder('metalDark', {
      x: mx,
      y: top + mastHeight / 2,
      z: mz,
      radiusTop: 0.16,
      radiusBottom: 0.3,
      height: mastHeight,
      segments: 5,
      color: 0x4a5056,
      uScale: 1,
      vScale: 0.3,
    });
    if (area > 900) {
      groups.cylinder('metalDark', {
        x: mx,
        y: top + mastHeight * 0.62,
        z: mz,
        radius: 0.9,
        height: 1.6,
        segments: 8,
        color: 0x6a7076,
        uScale: 1,
        vScale: 1,
      });
    }
  }

  // A signboard on the roof of some low buildings.
  if (!tall && rng.chance(0.22) && records) {
    records.signRequests.push({ x, z, y: top + 2.4, width: Math.min(width * 0.8, 9), facing: rng.chance(0.5) ? 'x' : 'z' });
  }
}

/** Awnings and shop boards on the street face of low buildings. */
function streetDressing({ groups, rng, district, x, z, width, depth, groundTop, records }) {
  const side = rng.pick(['px', 'nx', 'pz', 'nz']);
  const along = side === 'px' || side === 'nx';
  const length = (along ? depth : width) * rng.float(0.6, 0.9);
  const offset = (along ? width : depth) / 2 + 0.9;
  const awningX = x + (side === 'px' ? offset : side === 'nx' ? -offset : 0);
  const awningZ = z + (side === 'pz' ? offset : side === 'nz' ? -offset : 0);
  const colour = rng.pick([0xc2452a, 0x2f7f8f, 0xd8a03c, 0x3f7a4a, 0x8a3f6a, 0xe0e0d8]);
  groups.box('planks', {
    x: awningX,
    y: groundTop + 3.5,
    z: awningZ,
    width: along ? 2.2 : length,
    height: 0.35,
    depth: along ? length : 2.2,
    color: colour,
    tint: rng.float(0.94, 1.08),
    uScale: 0.4,
    vScale: 0.4,
  });
  // Two support poles.
  for (const side2 of [-1, 1]) {
    const poleX = along ? awningX + 0.9 : awningX + side2 * (length / 2 - 0.3);
    const poleZ = along ? awningZ + side2 * (length / 2 - 0.3) : awningZ + 0.9;
    groups.cylinder('metalDark', {
      x: poleX,
      y: groundTop + 1.75,
      z: poleZ,
      radius: 0.09,
      height: 3.5,
      segments: 5,
      color: 0x3a3f44,
      uScale: 1,
      vScale: 1,
    });
  }
  if (rng.chance(0.55) && records) {
    records.signRequests.push({
      x: along ? awningX - 0.6 : awningX,
      z: along ? awningZ : awningZ - 0.6,
      y: groundTop + 4.6,
      width: Math.min(length * 0.9, 7),
      facing: along ? 'x' : 'z',
      low: true,
    });
  }
}

/**
 * Fills every ordinary block with buildings. Returns the records later phases use
 * for collision, the minimap and spawn selection.
 */
export function buildBuildings({ plan, groups, rng, colliders, materials }) {
  const records = [];
  const signRequests = [];
  const stats = { blocks: 0, lots: 0, tiers: 0, tallest: 0 };

  for (const block of plan.blocks) {
    if (block.kind !== 'buildings') continue;
    if (block.landKind === 'marsh' || block.landKind === 'beach') continue;
    const district = districtById(block.districtId);
    if (!district || district.density <= 0) continue;
    const blockRng = rng.fork(`block:${block.i}:${block.j}`);
    const lots = subdivide(block, district, blockRng);
    stats.blocks += 1;

    for (const lot of lots) {
      if (lot.w < 4 || lot.d < 4) continue;
      const buildingRng = rng.fork(`lot:${block.i}:${block.j}:${Math.round(lot.x)}:${Math.round(lot.z)}`);
      const mass = massing(district, lot, buildingRng, block);
      const facade = facadeFor(district, mass.height, buildingRng);
      const palette = district.palette;
      const tint = buildingRng.float(0.92, 1.08);
      const colour = buildingRng.pick(palette.facade);
      const ground = CITY.sidewalkHeight;
      let footW = lot.w * buildingRng.float(0.88, 1);
      let footD = lot.d * buildingRng.float(0.88, 1);

      // Main volume.
      emitVolume(groups, {
        x: lot.x,
        y: ground,
        z: lot.z,
        width: footW,
        depth: footD,
        height: mass.height,
        tint,
        colour,
        facade,
      });
      if (colliders) {
        colliders.addBox({
          x: lot.x,
          y: ground + mass.height / 2,
          z: lot.z,
          width: footW,
          height: mass.height,
          depth: footD,
          kind: 'building',
          district: district.id,
        });
      }

      // Setbacks: stacked tiers that step back and thin out, plus a crown roof.
      let top = ground + mass.height;
      for (let tier = 0; tier < mass.tiers; tier += 1) {
        const shrink = buildingRng.float(3, 7);
        const nextW = Math.max(4, footW - shrink * 2);
        const nextD = Math.max(4, footD - shrink * 2);
        if (nextW < 4 || nextD < 4) break;
        const tierHeight = mass.height * buildingRng.float(0.16, 0.34);
        const offX = lot.x + buildingRng.float(-1, 1) * 1.5;
        const offZ = lot.z + buildingRng.float(-1, 1) * 1.5;
        // A ledge slab so the step reads as a floor rather than a floating box.
        groups.box('concrete', {
          x: lot.x,
          y: top + 0.25,
          z: lot.z,
          width: footW + 0.6,
          height: 0.5,
          depth: footD + 0.6,
          color: palette.roof,
          uScale: 1 / 5,
          vScale: 1 / 5,
        });
        emitVolume(groups, {
          x: offX,
          y: top,
          z: offZ,
          width: nextW,
          depth: nextD,
          height: tierHeight,
          tint: tint * 0.98,
          colour,
          facade,
        });
        if (colliders) {
          colliders.addBox({
            x: offX,
            y: top + tierHeight / 2,
            z: offZ,
            width: nextW,
            height: tierHeight,
            depth: nextD,
            kind: 'building-tier',
            district: district.id,
          });
        }
        top += tierHeight;
        footW = nextW;
        footD = nextD;
        stats.tiers += 1;
      }

      const footprint = footW * footD;
      groups.box('roof', {
        x: lot.x,
        y: top + 0.08,
        z: lot.z,
        width: footW + 0.2,
        height: 0.24,
        depth: footD + 0.2,
        color: palette.roof,
        tint: buildingRng.float(0.92, 1.06),
        uScale: 1 / 5,
        vScale: 1 / 5,
      });

      roofClutter({
        groups,
        rng: buildingRng,
        district,
        x: lot.x,
        z: lot.z,
        width: footW,
        depth: footD,
        top,
        tall: mass.height > 70,
        records: { signRequests },
      });

      if (mass.height < 30 && district.props.awning > 0.4 && blockRng.chance(district.props.awning * 0.6)) {
        streetDressing({
          groups,
          rng: buildingRng,
          district,
          x: lot.x,
          z: lot.z,
          width: footW,
          depth: footD,
          groundTop: ground,
          records: { signRequests },
        });
      }

      records.push({
        x: lot.x,
        z: lot.z,
        width: footW,
        depth: footD,
        height: top - ground,
        storeys: mass.storeys,
        district: district.id,
        facade,
        tile: FACADE_UV,
        footprint,
        block: `${block.i},${block.j}`,
      });
      stats.lots += 1;
      if (top > stats.tallest) stats.tallest = top;
    }
  }

  return { records, signRequests, stats, facadeUv: FACADE_UV };
}

/** One straight volume with a tiled facade and a bit of per face brightness. */
function emitVolume(groups, box) {
  groups.builder(facadeBucket(box.facade)).addBox({
    x: box.x,
    y: box.y + box.height / 2,
    z: box.z,
    width: box.width,
    height: box.height,
    depth: box.depth,
    color: box.colour,
    tint: box.tint,
    uScale: FACADE_UV.u,
    vScale: FACADE_UV.v,
    faces: ['px', 'nx', 'pz', 'nz', 'py'],
  });
}

function facadeBucket(facade) {
  return facade === 'glass' ? 'glass' : `facade:${facade}`;
}

export { STOREY, FACADE_UV, TAU };
