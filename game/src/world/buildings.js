// Procedural buildings: for every built block the plan gives us, subdivide its lot into plots,
// then raise a building per plot with district-appropriate massing. Towers get setbacks, a crown
// and rooftop plant; low-rise gets awnings and stairs; the strip gets neon boards. All of it is
// merged into a handful of meshes (one per facade family), so the whole skyline is a few draws.

import { MeshBuilder, colorTriple, cityMaterial } from './geometry.js';
import { Random } from '../core/rng.js';
import { clamp, lerp } from '../core/math.js';

/** The tallest a facade texture should tile across a wall, in metres: keeps windows window-sized. */
const FACADE_TILE = 26;

/** Setback from a block's edge to its buildable lot: the pavement band the kerbs already draw. */
const SIDEWALK_INSET = 5;

/**
 * Builds every ordinary building in the city.
 * @param {object} plan
 * @param {object} textures
 * @param {object} colliders ColliderWorld
 * @param {object} options { detail }
 */
export function buildBuildings(plan, textures, colliders, options = {}) {
  const group = new THREE.Group();
  group.name = 'buildings';
  const detail = options.detail ?? 1;

  // One builder per facade family: a district's blocks all end up in the same few draws.
  const families = {
    tower: new MeshBuilder('buildings-tower'),
    office: new MeshBuilder('buildings-office'),
    lowrise: new MeshBuilder('buildings-lowrise'),
    strip: new MeshBuilder('buildings-strip'),
    harbour: new MeshBuilder('buildings-harbour'),
  };
  const roofs = new MeshBuilder('rooftops');
  const trim = new MeshBuilder('trim');
  const signs = [];

  let buildingCount = 0;

  for (const block of plan.blocks) {
    if (block.role !== 'built') continue;
    const random = new Random(`bld:${block.id}`);
    const district = block.district;
    const massing = district.massing;

    // How many plots this lot holds: downtown blocks split into a couple of towers, the
    // neighbourhoods into rows of narrow houses.
    const lots = random.int(massing.lots[0], massing.lots[1]);
    const columns = lots === 1 ? 1 : random.int(1, 2);
    const rows = Math.max(1, Math.ceil(lots / columns));
    const inset = SIDEWALK_INSET;
    const lotX0 = block.x0 + inset;
    const lotX1 = block.x1 - inset;
    const lotZ0 = block.z0 + inset;
    const lotZ1 = block.z1 - inset;
    const lotWidth = (lotX1 - lotX0) / columns;
    const lotDepth = (lotZ1 - lotZ0) / rows;

    for (let c = 0; c < columns; c++) {
      for (let r = 0; r < rows; r++) {
        if (random.chance(0.06)) continue; // the odd empty plot reads as a demolition site
        const pad = random.range(0.4, 2.2);
        const x0 = lotX0 + c * lotWidth + pad;
        const x1 = lotX0 + (c + 1) * lotWidth - pad;
        const z0 = lotZ0 + r * lotDepth + pad;
        const z1 = lotZ0 + (r + 1) * lotDepth - pad;
        const width = x1 - x0;
        const depth = z1 - z0;
        if (width < 6 || depth < 6) continue;
        const cx = (x0 + x1) / 2;
        const cz = (z0 + z1) / 2;

        // Ground floor retail line, three metres tall, proud of the facade by a hand.
        const floors = random.int(massing.floors[0], massing.floors[1]);
        let height = floors * random.range(2.9, 3.5) + 3.6;
        height = clamp(height, massing.minHeight, massing.maxHeight);

        const family = pickFamily(district, massing, random, height);
        const facadeHex = district.palette.facades[random.int(0, district.palette.facades.length - 1)];
        const tint = colorTriple(facadeHex, random.range(0.92, 1.06));

        raiseBuilding({
          builder: families[family],
          roofs, trim, signs,
          block, district, random, detail,
          cx, cz, width, depth, height, floors, tint,
          x0, x1, z0, z1,
          family,
        });
        colliders.addFootprint(cx, cz, width, depth, height, 'building', {
          id: `bld-${block.id}-${c}-${r}`,
          districtId: block.districtId,
          family,
        });
        buildingCount++;
      }
    }
  }

  // ---------------------------------------------------------------- materials and meshes
  const towerTexture = textures.facadeTower;
  const towerMaterial = cityMaterial(towerTexture.map, { roughness: 0.24, metalness: 0.32, emissiveMap: towerTexture.emissive });
  families.tower.build(towerMaterial, group);
  const officeTexture = textures.facadeOffice;
  families.office.build(cityMaterial(officeTexture.map, { roughness: 0.78, emissiveMap: officeTexture.emissive }), group);
  const lowriseTexture = textures.facadeLowrise;
  families.lowrise.build(cityMaterial(lowriseTexture.map, { roughness: 0.88, emissiveMap: lowriseTexture.emissive }), group);
  const stripTexture = textures.facadeStrip;
  families.strip.build(cityMaterial(stripTexture.map, { roughness: 0.8, emissiveMap: stripTexture.emissive, emissiveIntensity: 1.4 }), group);
  const harbourTexture = textures.facadeHarbour;
  families.harbour.build(cityMaterial(textures.siding, { roughness: 0.62, metalness: 0.22, emissiveMap: harbourTexture.emissive }), group);
  roofs.build(cityMaterial(textures.rooftop, { roughness: 0.95 }), group);
  trim.build(cityMaterial(null, { roughness: 0.7 }), group);

  // Neon boards: each is its own small mesh, additive at night so it blooms against the dark.
  const neonGroup = buildNeonSigns(signs, textures);
  group.add(neonGroup);

  return {
    group,
    neonGroup,
    count: buildingCount,
    triangleCount: Object.values(families).reduce((sum, builder) => sum + builder.triangles, 0),
    emitter: { kind: 'night-windows', height: 60 },
  };
}

/** Which facade family an elevation belongs to. */
function pickFamily(district, massing, random, height) {
  if (district.id === 'downtown') {
    if (height > 52 || random.chance(massing.towerChance * 0.5)) return 'tower';
    return 'office';
  }
  if (district.id === 'harbour') return 'harbour';
  if (district.id === 'neon') return 'strip';
  if (district.id === 'marina' && height > 22) return 'office';
  if (district.id === 'airstrip') return 'harbour';
  return 'lowrise';
}

/**
 * Raises one building on its lot: a base floor, the shaft with optional setbacks, a crown, and
 * rooftop clutter. Writes into the family's builder, in the district's own voice.
 */
function raiseBuilding(ctx) {
  const { builder, roofs, trim, signs, block, district, random, detail, cx, cz, width, depth, height, floors, tint } = ctx;
  const baseH = 3.8;
  const isTower = ctx.family === 'tower';
  const isStrip = ctx.family === 'strip';
  const isHarbour = ctx.family === 'harbour';

  // The ground floor: a darker band, with a slight overhang, so buildings sit on the street.
  trim.block(cx, cz, width + 0.6, baseH, depth + 0.6, 0, {
    color: colorTriple(district.palette.trim, 0.9),
    uvScale: 6,
  });

  // The shaft. Towers step in once or twice; everything else is a single box, maybe chamfered.
  const setbacks = isTower && random.chance(district.massing.setbackChance) ? random.int(1, 2) : 0;
  let y = baseH;
  let w = width;
  let d = depth;
  const shaftHeight = height - baseH;
  for (let s = 0; s <= setbacks; s++) {
    const share = s === setbacks ? shaftHeight - (y - baseH) : shaftHeight / (setbacks + 1);
    const h = s === setbacks ? height - y : share;
    if (h <= 0.5) break;
    builder.block(cx, cz, w, h, d, y, { color: tint, uvScale: FACADE_TILE });
    // A cornice at each setback: a thin proud slab, the cheapest way to make massing read.
    if (s < setbacks) {
      trim.block(cx, cz, w + 1.0, 0.5, d + 1.0, y + h - 0.4, {
        color: colorTriple(district.palette.trim, 1.05), uvScale: 4,
      });
      w *= random.range(0.62, 0.82);
      d *= random.range(0.62, 0.82);
      y += h;
    } else {
      y += h;
    }
  }

  const topY = y;

  // Crown: towers get a mechanical penthouse and an antenna; the rest a parapet.
  if (isTower) {
    const penthouseH = random.range(3.2, 7.5);
    const pw = w * random.range(0.42, 0.66);
    const pd = d * random.range(0.42, 0.66);
    builder.block(cx + random.range(-1, 1), cz + random.range(-1, 1), pw, penthouseH, pd, topY, {
      color: tint, uvScale: FACADE_TILE,
    });
    if (random.chance(0.75)) {
      const mastHeight = random.range(6, 20);
      trim.prism(cx, topY + penthouseH + mastHeight / 2, cz, 0.22, 0.1, mastHeight, 4, {
        color: colorTriple(0xd8d8d8, 1), uvScale: 2,
      });
      // The aviation light at the mast's tip is added to `signs` as a point to glow.
      signs.push({ kind: 'mast', x: cx, y: topY + penthouseH + mastHeight, z: cz });
    }
    // Rooftop plant: air handlers and a water tank, on a corner of the roof.
    if (detail >= 1) {
      for (let i = 0; i < random.int(1, 3); i++) {
        roofs.block(
          cx + random.range(-w * 0.3, w * 0.3), cz + random.range(-d * 0.3, d * 0.3),
          random.range(1.6, 3.6), random.range(0.8, 2.2), random.range(1.6, 3.6), topY,
          { color: colorTriple(0x9a9c9e), uvScale: 4 },
        );
      }
    }
  } else {
    // Parapet: four thin walls around the roof edge.
    const ph = 0.9;
    trim.block(cx, cz - d / 2 + 0.25, w, ph, 0.5, topY, { color: colorTriple(district.palette.trim, 1.0), uvScale: 4 });
    trim.block(cx, cz + d / 2 - 0.25, w, ph, 0.5, topY, { color: colorTriple(district.palette.trim, 1.0), uvScale: 4 });
    trim.block(cx - w / 2 + 0.25, cz, 0.5, ph, d, topY, { color: colorTriple(district.palette.trim, 1.0), uvScale: 4 });
    trim.block(cx + w / 2 - 0.25, cz, 0.5, ph, d, topY, { color: colorTriple(district.palette.trim, 1.0), uvScale: 4 });

    if (detail >= 1 && random.chance(0.55)) {
      roofs.block(cx + random.range(-w * 0.2, w * 0.2), cz + random.range(-d * 0.2, d * 0.2), 2.2, 1.4, 2.2, topY, {
        color: colorTriple(0x8e8e8a), uvScale: 4,
      });
    }
  }

  // Ground-floor awnings and shopfronts, for the districts where the street is the show.
  if (!isTower && !isHarbour) {
    const awningColor = district.palette.accents[random.int(0, district.palette.accents.length - 1)];
    const sides = [
      { x: cx, z: cz - depth / 2 - 0.9, sx: width * 0.8, sz: 1.8, f: 'z' },
      { x: cx, z: cz + depth / 2 + 0.9, sx: width * 0.8, sz: 1.8, f: '-z' },
    ];
    if (random.chance(0.6)) {
      const side = sides[random.int(0, 1)];
      trim.box(side.x, baseH - 0.5, side.z, side.sx, 0.35, side.sz, {
        color: colorTriple(awningColor, 1.0), uvScale: 3,
      });
    }
    // A lit shopfront band, which the strip's texture already suggests but others need.
    if (isStrip || random.chance(0.5)) {
      const side = sides[random.int(0, 1)];
      trim.box(side.x * 0.996, baseH * 0.5, side.z * 0.996, side.sx * 0.98, 2.0, 0.16, {
        color: colorTriple(isStrip ? 0xffb0d0 : 0xffe0b0, 0.9), uvScale: 3,
      });
    }
  }

  // Neon boards on the strip: a vertical blade sign on one street face.
  if (isStrip && random.chance(0.85)) {
    const face = random.int(0, 3);
    const signHeight = random.range(4, 9);
    const signWidth = random.range(1.4, 3.2);
    const y = random.range(4.5, Math.max(5, topY - signHeight - 1));
    let x = cx;
    let z = cz;
    let rotation = 0;
    if (face === 0) { z = cz - depth / 2 - 1.2; rotation = 0; }
    else if (face === 1) { z = cz + depth / 2 + 1.2; rotation = Math.PI; }
    else if (face === 2) { x = cx - width / 2 - 1.2; rotation = -Math.PI / 2; }
    else { x = cx + width / 2 + 1.2; rotation = Math.PI / 2; }
    signs.push({ kind: 'board', x, y, z, rotation, width: signWidth, height: signHeight, index: random.int(0, 5) });
  }
}

/** Builds the neon boards and the mast lights the buildings asked for. */
function buildNeonSigns(signs, textures) {
  const group = new THREE.Group();
  group.name = 'neon-signs';
  const boards = [];
  const masts = [];
  for (const sign of signs) {
    if (sign.kind === 'board') boards.push(sign);
    else masts.push(sign);
  }

  // Up to six board textures, so a group per texture is still only six draws.
  const byIndex = new Map();
  for (const board of boards) {
    if (!byIndex.has(board.index)) byIndex.set(board.index, []);
    byIndex.get(board.index).push(board);
  }
  for (const [index, list] of byIndex) {
    const builder = new MeshBuilder(`neon-${index}`);
    for (const board of list) {
      // A thin box, textured on both faces, turned to face the street it stands over.
      builder.rotatedBox(board.x, board.y, board.z, board.width, board.height, 0.18, board.rotation, {
        color: [1, 1, 1], uvScale: 1,
      });
    }
    const texture = textures.neon(index);
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    const mesh = builder.build(material);
    mesh.name = `neon-board-${index}`;
    group.add(mesh);
  }

  // Mast lights: one small additive sprite per tower tip.
  if (masts.length) {
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(masts.length * 3);
    masts.forEach((mast, i) => {
      positions[i * 3] = mast.x;
      positions[i * 3 + 1] = mast.y;
      positions[i * 3 + 2] = mast.z;
    });
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
      color: 0xff5a5a,
      size: 4,
      sizeAttenuation: true,
      map: textures.glow,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    const points = new THREE.Points(geometry, material);
    points.name = 'mast-lights';
    group.add(points);
  }

  return group;
}

export { lerp };
