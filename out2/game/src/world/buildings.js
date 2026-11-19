// Procedural buildings. Each block is split into lots, each lot raises a building whose
// height, footprint, setback, roof clutter and facade come from its district's record and
// the plan's seed. Downtown leans on curtain-wall towers with tapering crowns, Verano on
// low stucco walk-ups with awnings, the Neon Strip on dark boxes wearing signs, the
// harbour on long warehouses. Every wall is merged into one mesh per facade variant; the
// lit-window emissive maps are collected so the clock can turn them on at dusk.

import { MeshBuilder, cityMaterial, colorTriple, tintTriple } from './geometry.js';
import { Random } from '../core/rng.js';
import { isWaterAt, BEACH } from './plan.js';
import { districtOf, paletteColor } from './districts.js';
import { clamp, lerp } from '../core/math.js';

const CORE = { x: 250, z: -220 };

/** Splits a rectangle into a jittered grid of lots. */
function splitLots(rect, cols, rows, random) {
  const cutsX = [rect.x0];
  const cutsZ = [rect.z0];
  for (let i = 1; i < cols; i += 1) {
    const base = lerp(rect.x0, rect.x1, i / cols);
    cutsX.push(base + random.range(-6, 6));
  }
  cutsX.push(rect.x1);
  for (let j = 1; j < rows; j += 1) {
    const base = lerp(rect.z0, rect.z1, j / rows);
    cutsZ.push(base + random.range(-6, 6));
  }
  cutsZ.push(rect.z1);
  const lots = [];
  for (let j = 0; j < rows; j += 1) {
    for (let i = 0; i < cols; i += 1) {
      lots.push({
        x0: cutsX[i],
        x1: cutsX[i + 1],
        z0: cutsZ[j],
        z1: cutsZ[j + 1],
        cx: (cutsX[i] + cutsX[i + 1]) / 2,
        cz: (cutsZ[j] + cutsZ[j + 1]) / 2,
      });
    }
  }
  return lots;
}

function districtHeight(district, cx, cz, random) {
  const distance = Math.hypot(cx - CORE.x, cz - CORE.z);
  const falloff = clamp(1.15 - distance / 900, 0.42, 1);
  const roll = random.float() ** 1.7;
  const height = lerp(district.height[0], district.height[1], roll) * (district.id === 'downtown' ? falloff : lerp(0.65, 1, falloff));
  return clamp(height, district.height[0] * 0.7, district.height[1]);
}

function roofPlant(builder, random, cx, cz, width, depth, top, color, districtId) {
  const acColor = colorTriple(0x8f9497);
  const count = random.int(1, districtId === 'downtown' ? 4 : 2);
  for (let i = 0; i < count; i += 1) {
    const w = random.range(1.4, 3.2);
    const d = random.range(1.2, 2.6);
    const x = cx + random.range(-width * 0.32, width * 0.32);
    const z = cz + random.range(-depth * 0.32, depth * 0.32);
    builder.box(x, top, z, w, random.range(0.6, 1.4), d, acColor, { uvScale: 6 });
  }
  // Parapet around the roof edge.
  const railColor = colorTriple(0xd8d4c8, 0.9);
  const t = 0.5;
  builder.box(cx, top, cz - depth / 2 + t / 2, width, 0.9, t, railColor, { uvScale: 4 });
  builder.box(cx, top, cz + depth / 2 - t / 2, width, 0.9, t, railColor, { uvScale: 4 });
  builder.box(cx - width / 2 + t / 2, top, cz, t, 0.9, depth, railColor, { uvScale: 4 });
  builder.box(cx + width / 2 - t / 2, top, cz, t, 0.9, depth, railColor, { uvScale: 4 });

  if (random.chance(districtId === 'downtown' ? 0.5 : 0.35)) {
    // A water tank on legs, a very coastal roof detail.
    const tankX = cx + random.range(-width * 0.25, width * 0.25);
    const tankZ = cz + random.range(-depth * 0.25, depth * 0.25);
    const radius = random.range(1.1, 2);
    builder.cylinder(tankX, tankZ, radius, radius * 1.2, top + 1.2, 8, colorTriple(0x8a7a63), { uvScale: 3 });
    for (const [ox, oz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      builder.box(tankX + ox * radius * 0.6, top, tankZ + oz * radius * 0.6, 0.2, 1.2, 0.2, colorTriple(0x5a5348), { uvScale: 2 });
    }
  }
  if (random.chance(districtId === 'downtown' ? 0.65 : 0.2)) {
    const mastHeight = random.range(4, 14);
    builder.cylinder(cx + random.range(-width * 0.2, width * 0.2), cz + random.range(-depth * 0.2, depth * 0.2), 0.12, mastHeight, top, 5, colorTriple(0xb8bcc0), { uvScale: 4 });
  }
  if (districtId === 'neon' && random.chance(0.45)) {
    // Rooftop neon board frame.
    builder.box(cx, top, cz, width * 0.7, 0.25, 0.25, colorTriple(0x2a2630), { uvScale: 4 });
    builder.box(cx, top + 3.4, cz, width * 0.7, 0.25, 0.25, colorTriple(0x2a2630), { uvScale: 4 });
  }
}

/**
 * Raises the city's buildings.
 * @returns {{group, materials, signs, count, triangles, tallest}}
 */
export function buildBuildings(plan, textures, colliders, options = {}) {
  const lite = Boolean(options.lite);
  const group = new THREE.Group();
  group.name = 'buildings';
  const random = new Random(`${plan.seed}:buildings`);
  const buckets = new Map();
  const signBuckets = new Map();
  const lots = new MeshBuilder('empty-lots');
  const materials = [];
  const landmarks = new Set(Object.values(plan.landmarkBlocks ?? {}));
  let count = 0;
  let tallest = 0;
  let signIndex = 0;

  const bucketFor = (districtId, variant, glass = false) => {
    const key = `${districtId}:${glass ? 'glass' : 'facade'}:${variant % 2}`;
    if (buckets.has(key)) return buckets.get(key);
    const pair = glass ? textures.glassWall(districtId, variant % 2) : textures.facade(districtId, variant % 2);
    const material = cityMaterial(pair, {
      emissive: glass ? 0xbfe0ff : 0xffc07a,
      emissiveIntensity: 0,
    });
    material.name = `wall-${key}`;
    const builder = new MeshBuilder(`walls-${key}`);
    const entry = { key, builder, material, pair };
    buckets.set(key, entry);
    materials.push(material);
    return entry;
  };

  const sidingBucket = () => {
    const key = 'warehouse';
    if (buckets.has(key)) return buckets.get(key);
    const material = cityMaterial(textures.siding(), { color: 0xd8dcd6, emissiveIntensity: 0 });
    material.name = 'wall-warehouse';
    const entry = { key, builder: new MeshBuilder('warehouse'), material, pair: null };
    buckets.set(key, entry);
    materials.push(material);
    return entry;
  };

  const addSign = (texture, cx, cy, cz, width, height, rotY, color) => {
    const key = texture?.uuid ?? `flat-${color}`;
    let entry = signBuckets.get(key);
    if (!entry) {
      const builder = new MeshBuilder('sign');
      const material = new THREE.MeshBasicMaterial({
        map: texture ?? null,
        color: texture ? 0xffffff : color,
        transparent: Boolean(texture),
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
        fog: true,
        vertexColors: !texture,
      });
      entry = { builder, material };
      signBuckets.set(key, entry);
    }
    entry.builder.panel(cx, cy, cz, width, height, colorTriple(0xffffff), { rotY, twoSided: true });
  };

  for (const block of plan.blocks) {
    if (block.park) continue;
    if (block.district === 'airstrip') continue;
    if (landmarks.has(block.id)) continue;
    const district = districtOf(block.district);

    // The open sand south of the boardwalk stays open.
    if (block.district === 'beach' && block.cz > BEACH.boardwalkZ - 20) continue;
    if (isWaterAt(block.cx, block.cz)) continue;

    const inner = block.inner;
    const innerWidth = inner.x1 - inner.x0;
    const innerDepth = inner.z1 - inner.z0;
    if (innerWidth < 14 || innerDepth < 14) continue;

    const avgLot = lerp(district.lot[0], district.lot[1], random.float());
    const cols = clamp(Math.round(innerWidth / avgLot), 1, 3);
    const rows = clamp(Math.round(innerDepth / avgLot), 1, 3);
    const cells = splitLots(inner, cols, rows, random);

    for (const cell of cells) {
      const cellWidth = cell.x1 - cell.x0;
      const cellDepth = cell.z1 - cell.z0;
      if (cellWidth < 9 || cellDepth < 9) continue;
      const emptyChance = clamp(0.34 - district.density * 0.3, 0.02, 0.3);
      if (random.chance(emptyChance)) {
        // A parking lot or yard, asphalt with a painted edge.
        lots.plane(cell.cx, cell.cz, cellWidth - 2, cellDepth - 2, 0.09, colorTriple(0x4a4b4e), { uvScale: 6 });
        lots.plane(cell.cx, cell.cz, cellWidth - 6, 0.4, 0.1, colorTriple(0xc9c3a8), { uvScale: 3 });
        continue;
      }

      const marginX = random.range(1.2, district.id === 'downtown' ? 4.5 : 3.2);
      const marginZ = random.range(1.2, district.id === 'downtown' ? 4.5 : 3.2);
      const width = cellWidth - marginX * 2;
      const depth = cellDepth - marginZ * 2;
      if (width < 7 || depth < 7) continue;

      const cx = cell.cx;
      const cz = cell.cz;
      const footprint = Math.max(width, depth);
      const height = districtHeight(district, cx, cz, random);
      tallest = Math.max(tallest, height);

      const isWarehouse = district.zoning === 'industrial';
      const glass = !isWarehouse && (district.id === 'downtown' || district.id === 'marina') && random.chance(district.id === 'downtown' ? 0.48 : 0.2);
      const variant = lite ? 0 : random.int(0, district.facadeCycle);
      const tone = tintTriple(paletteColor(district.palette, variant), random, 0.06);

      if (isWarehouse) {
        const entry = sidingBucket();
        entry.builder.box(cx, 0, cz, width, height, depth, tone, { uvScale: [10, 10] });
        // Roof line and a roller door.
        entry.builder.box(cx, height, cz, width + 0.6, 0.5, depth + 0.6, colorTriple(0x4c5253), { uvScale: 6 });
        entry.builder.box(cx, 0, cz + depth / 2 + 0.05, width * 0.4, 4.6, 0.2, colorTriple(0x3d4244), { uvScale: 5 });
        colliders.addBox(cx - width / 2, cz - depth / 2, cx + width / 2, cz + depth / 2, height, 'building', { district: block.district, height });
        count += 1;
        continue;
      }

      const entry = bucketFor(block.district, variant, glass);
      const builder = entry.builder;
      const uvScale = glass ? [12, 18] : [15, 24];

      // The main shaft. Very tall towers get a stepped crown.
      const tiers = height > 60 ? random.int(1, 2) : 0;
      let top = 0;
      let tierWidth = width;
      let tierDepth = depth;
      if (tiers === 0) {
        builder.box(cx, 0, cz, width, height, depth, tone, { uvScale, topColor: tintTriple(0x565a5e, random, 0.05) });
        top = height;
      } else {
        const lowerHeight = height * random.range(0.62, 0.8);
        builder.box(cx, 0, cz, width, lowerHeight, depth, tone, { uvScale, topColor: colorTriple(0x5d6063) });
        const crownHeight = height - lowerHeight;
        const crownScale = random.range(0.62, 0.82);
        const crownWidth = width * crownScale;
        const crownDepth = depth * crownScale;
        builder.box(cx + random.range(-1, 1), lowerHeight, cz + random.range(-1, 1), crownWidth, crownHeight, crownDepth, tone, { uvScale, topColor: colorTriple(0x62666a) });
        tierWidth = crownWidth;
        tierDepth = crownDepth;
        top = height;
        // A shoulder at the setback, so the tower reads as a stack of volumes.
        builder.box(cx, lowerHeight, cz, width + 0.5, 0.7, depth + 0.5, colorTriple(0x4b4f53), { uvScale: 4 });
      }

      // Ground-floor canopy / shop awning on the low-rise districts.
      if ((district.id === 'verano' || district.id === 'neon') && random.chance(0.7)) {
        const side = random.pick([-1, 1]);
        const awningColor = colorTriple(random.pick(district.palette.signage), 1);
        builder.box(cx + side * (width / 2 + 1.1), 3.4, cz, 2.4, 0.22, depth * 0.7, awningColor, { uvScale: 3 });
      }

      roofPlant(builder, random, cx, cz, tierWidth, tierDepth, top, tone, district.id);

      // A neon blade or a painted board on some street faces.
      const signChance = lite ? 0 : (district.props.signs ?? 0.3) * 0.32;
      if (random.chance(signChance)) {
        const texture = textures.buildingSign(block.district, signIndex);
        signIndex += 1;
        const vertical = texture.userData?.vertical;
        const signWidth = vertical ? 2.2 : Math.min(width * 0.68, 9);
        const signHeight = vertical ? Math.min(top * 0.3, 8) : 2.2;
        const side = random.pick([-1, 1]);
        const face = random.chance(0.5) ? 'z' : 'x';
        const y = Math.min(top - signHeight / 2 - 1, 4.6 + signHeight / 2 + random.range(0, 4));
        if (face === 'z') {
          addSign(texture, cx + random.range(-width * 0.2, width * 0.2), y, cz + side * (depth / 2 + 0.18), signWidth, signHeight, side > 0 ? 0 : Math.PI, 0xffffff);
        } else {
          addSign(texture, cx + side * (width / 2 + 0.18), y, cz + random.range(-depth * 0.2, depth * 0.2), signWidth, signHeight, side > 0 ? Math.PI / 2 : -Math.PI / 2, 0xffffff);
        }
      }

      colliders.addBox(cx - width / 2, cz - depth / 2, cx + width / 2, cz + depth / 2, height, 'building', { district: block.district, height, glass });
      count += 1;
    }
  }

  for (const entry of buckets.values()) {
    const mesh = entry.builder.finalize(entry.material, `buildings-${entry.key}`);
    if (mesh) group.add(mesh);
  }
  for (const entry of signBuckets.values()) {
    const mesh = entry.builder.finalize(entry.material, 'building-signs');
    if (mesh) group.add(mesh);
  }
  const lotMesh = lots.finalize(cityMaterial(textures.asphalt(), { color: 0x8a8a8a }), 'empty-lots');
  if (lotMesh) group.add(lotMesh);

  const triangles = [...buckets.values()].reduce((sum, entry) => sum + entry.builder.triangles, 0) + lots.triangles;

  return {
    group,
    materials,
    signs: signBuckets.size,
    count,
    triangles,
    tallest: Math.round(tallest),
    buckets: buckets.size,
  };
}
