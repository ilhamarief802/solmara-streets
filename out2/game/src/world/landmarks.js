// Handcrafted landmarks, one per district signature: the Solmara Spire downtown, the
// Verano Arena stadium, the beach pier with its yachts, the harbour's gantry cranes and
// container stacks, the two channel bridges (an old stone arch and a steel truss), and
// the marsh airstrip's hangars, control tower and apron. They are built from the same
// primitives as everything else, then merged by material, so eight landmarks cost a
// handful of draw calls.

import { MeshBuilder, cityMaterial, colorTriple, glowMaterial } from './geometry.js';
import { Random } from '../core/rng.js';
import { AIRSTRIP, BEACH, HARBOUR, WATER } from './plan.js';

function blockById(plan, id) {
  return plan.blocks.find((block) => block.id === id) ?? null;
}

// Signs are the one landmark part that is not merged: each billboard keeps its own texture.
function addSignMesh(group, texture, x, y, z, width, height, rotY, doubleSided = true) {
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    side: doubleSided ? THREE.DoubleSide : THREE.FrontSide,
    depthWrite: false,
    toneMapped: false,
    fog: true,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
  mesh.position.set(x, y, z);
  mesh.rotation.y = rotY;
  mesh.name = 'landmark-sign';
  group.add(mesh);
  return mesh;
}

/** The Solmara Spire: a glass shaft, a stepped crown, a lit spire and a plaza. */
function buildSpire(group, plan, textures, colliders, block) {
  const { cx, cz } = block;
  const concrete = new MeshBuilder('spire-concrete');
  const glass = new MeshBuilder('spire-glass');
  const accent = new MeshBuilder('spire-accent');

  // A low podium with steps; the plaza palms come from the prop pass.
  const innerDepth = block.inner.x1 > block.inner.x0 ? block.inner.z1 - block.inner.z0 : 70;
  concrete.plane(cx, cz, block.innerWidth, innerDepth, 0.1, colorTriple(0xcfc8b8), { uvScale: 8 });
  concrete.box(cx, 0, cz, 54, 4, 44, colorTriple(0xd6d0c2), { uvScale: 8 });
  concrete.box(cx, 4, cz, 44, 7, 36, colorTriple(0xc8c2b4), { uvScale: 8 });

  // The shaft: three tapering tiers, each a little narrower, all glass.
  const base = 9;
  glass.box(cx, base, cz, 32, 96, 30, colorTriple(0xdfe9ee), { uvScale: [10, 16] });
  glass.box(cx, base + 96, cz, 24, 28, 22, colorTriple(0xdfe9ee), { uvScale: [9, 16] });
  glass.box(cx, base + 124, cz, 16, 18, 15, colorTriple(0xe6eef2), { uvScale: [8, 16] });

  // Corner fins give the shaft a vertical rhythm.
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    accent.box(cx + sx * 15.6, base, cz + sz * 14.6, 1.2, 96, 1.2, colorTriple(0x8fa9b4), { uvScale: 4 });
    accent.box(cx + sx * 11.6, base + 96, cz + sz * 10.6, 1, 28, 1, colorTriple(0x8fa9b4), { uvScale: 4 });
  }

  // Crown ring and spire.
  accent.box(cx, base + 142, cz, 18, 1.4, 17, colorTriple(0x2c3438), { uvScale: 4 });
  accent.cylinder(cx, cz, 1.1, 34, base + 143, 7, colorTriple(0xd8dde0), { topRadius: 0.2, uvScale: 4 });
  accent.cylinder(cx, cz, 2.2, 6, base + 176, 7, colorTriple(0x9fe4ff), { topRadius: 0.4, uvScale: 4 });

  // A vertical neon name on the podium and a horizontal one over the entrance.
  addSignMesh(group, textures.neon('SOLMARA', 0x9fe4ff, { vertical: true }), cx - 22.2, 15, cz, 3.2, 22, -Math.PI / 2);
  addSignMesh(group, textures.neon('SPIRE 88', 0x63c7ff), cx, 13, cz - 18.3, 20, 4, Math.PI);

  // The lit crown at the top of the shaft.
  const crown = new MeshBuilder('spire-crown');
  crown.box(cx, base + 128, cz, 20, 2.2, 19, colorTriple(0x9fe4ff), { uvScale: 3 });
  group.add(crown.finalize(glowMaterial(null, 0x9fe4ff, { transparent: false, depthWrite: true }), 'spire-lit-crown'));

  colliders.addBox(cx - 27, cz - 22, cx + 27, cz + 22, 4, 'landmark', { landmark: 'spire-podium' });
  colliders.addBox(cx - 16, cz - 15, cx + 16, cz + 15, base + 142, 'landmark', { landmark: 'spire' });

  return {
    materials: {
      concrete: cityMaterial(textures.concrete(), { color: 0xffffff }),
      glass: cityMaterial(textures.glassWall('downtown', 1), { emissive: 0xbfe0ff, emissiveIntensity: 0 }),
      accent: cityMaterial(textures.concrete(), { color: 0x9fb6c0 }),
    },
    builders: { concrete, glass, accent },
    note: 'Solmara Spire, 186 m with the mast',
  };
}

/** Verano Arena: a rectangular bowl with stepped stands and four floodlight masts. */
function buildStadium(group, plan, textures, colliders, block) {
  const { cx, cz } = block;
  const concrete = new MeshBuilder('stadium-concrete');
  const seats = new MeshBuilder('stadium-seats');
  const field = new MeshBuilder('stadium-field');
  const masts = new MeshBuilder('stadium-masts');

  const length = Math.min(block.innerWidth - 6, 76);
  const width = Math.min(block.inner.z1 - block.inner.z0 - 6, 54);

  // The pitch, with its touchlines crossed in the middle.
  field.plane(cx, cz, length - 16, width - 12, 0.12, colorTriple(0x5f8a4a), { uvScale: 8 });
  field.plane(cx, cz, length - 16, 0.4, 0.13, colorTriple(0xe8e4d4), { uvScale: 2 });
  field.plane(cx, cz, 0.4, width - 12, 0.13, colorTriple(0xe8e4d4), { uvScale: 2 });

  // Four stands, each a stack of three terraces over a concrete base.
  const stands = [
    { dx: 0, dz: -(width / 2 - 5), w: length, d: 10 },
    { dx: 0, dz: width / 2 - 5, w: length, d: 10 },
    { dx: -(length / 2 - 5), dz: 0, w: 10, d: width - 14 },
    { dx: length / 2 - 5, dz: 0, w: 10, d: width - 14 },
  ];
  for (const stand of stands) {
    for (let tier = 0; tier < 3; tier += 1) {
      seats.box(
        cx + stand.dx,
        1.6 + tier * 1.8,
        cz + stand.dz,
        stand.w - tier * 1.2,
        1.6,
        stand.d - tier * 2,
        colorTriple(tier % 2 === 0 ? 0x9aa3a8 : 0xd8d2c2),
        { uvScale: 6 },
      );
    }
    concrete.box(cx + stand.dx, 0, cz + stand.dz, stand.w, 1.6, stand.d, colorTriple(0x8d8a80), { uvScale: 8 });
  }

  // A flat roof over the main stand, on a row of columns.
  concrete.box(cx, 8.2, cz - width / 2 + 3, length + 2, 0.7, 12, colorTriple(0xd6d0c4), { uvScale: 8 });
  for (let i = -3; i <= 3; i += 1) {
    masts.cylinder(cx + i * (length / 8), cz - width / 2 + 3, 0.35, 8, 0, 6, colorTriple(0xb8bcc0), { uvScale: 4 });
  }

  // Floodlight masts at the four corners.
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const mx = cx + sx * (length / 2 - 4);
    const mz = cz + sz * (width / 2 - 4);
    masts.cylinder(mx, mz, 0.55, 20, 0, 7, colorTriple(0xa8adb0), { uvScale: 4 });
    masts.box(mx, 20, mz, 5.2, 1.4, 0.7, colorTriple(0xfff2c8), { uvScale: 3 });
    masts.box(mx, 21.4, mz - 0.4, 5.6, 0.4, 1.4, colorTriple(0x4a4f52), { uvScale: 3 });
  }

  addSignMesh(group, textures.neon('VERANO ARENA', 0xffd36e), cx, 9.5, cz + width / 2 + 1.4, 26, 4, 0);
  addSignMesh(group, textures.neon('SOLMARA', 0xff8f5e, { vertical: true }), cx - length / 2 - 1.4, 9, cz, 3, 16, -Math.PI / 2);

  colliders.addBox(cx - length / 2, cz - width / 2, cx + length / 2, cz + width / 2, 8, 'landmark', { landmark: 'stadium' });

  return {
    materials: {
      concrete: cityMaterial(textures.concrete()),
      seats: cityMaterial(textures.concrete(), { color: 0xd8d4ca }),
      field: cityMaterial(textures.grass()),
      masts: cityMaterial(textures.concrete(), { color: 0xb0b4b6 }),
    },
    builders: { concrete, seats, field, masts },
    note: 'Verano Arena, 12,000 seats',
  };
}

/** The pier: planks on piles, a pavilion, and three yachts tied alongside. */
function buildPier(group, plan, textures, colliders) {
  const deck = new MeshBuilder('pier-deck');
  const piles = new MeshBuilder('pier-piles');
  const white = new MeshBuilder('yacht-hulls');
  const canvas = new MeshBuilder('yacht-canvas');
  const x = BEACH.pierX;
  const startZ = BEACH.boardwalkZ;
  const endZ = BEACH.pierEndZ;
  const width = 15;
  const wood = colorTriple(0x6e5437);

  deck.plane(x, (startZ + endZ) / 2, width, endZ - startZ, 0.38, colorTriple(0xc2a274), {
    uvScale: 6,
    repeatX: 2,
    repeatY: (endZ - startZ) / 8,
  });
  // Edge beams, then the piles that carry them into the water.
  deck.beam(x - width / 2, startZ, x - width / 2, endZ, 0.9, 0.6, -0.2, wood, { uvScale: 4 });
  deck.beam(x + width / 2, startZ, x + width / 2, endZ, 0.9, 0.6, -0.2, wood, { uvScale: 4 });
  for (let z = startZ + 6; z < endZ; z += 14) {
    for (const side of [-1, 1]) {
      piles.cylinder(x + side * (width / 2 - 1.1), z, 0.55, 5.4, -3.6, 7, colorTriple(0x5b4a35), { uvScale: 3 });
    }
    piles.cylinder(x, z + 7, 0.45, 5.2, -3.5, 6, colorTriple(0x5b4a35), { uvScale: 3 });
  }

  // The pavilion at the end: four posts and a shallow roof.
  const pavZ = endZ - 22;
  for (const [ox, oz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    piles.cylinder(x + ox * 5, pavZ + oz * 7, 0.32, 5, 0.38, 6, colorTriple(0x8a7358), { uvScale: 3 });
  }
  deck.box(x, 5.2, pavZ, 13, 0.5, 17, colorTriple(0xd8c8a4), { uvScale: 5 });
  deck.box(x, 5.7, pavZ, 12, 1.2, 3, colorTriple(0xe6dcc4), { uvScale: 4 });
  addSignMesh(group, textures.neon('PIER 9', 0x8ee6ff), x, 7.4, pavZ + 8.6, 7, 1.6, 0);

  // Three yachts moored east of the pier, hulls in the water.
  const yachtSpecs = [
    { z: endZ - 44, length: 15, beam: 4.2, cabin: 6 },
    { z: endZ - 68, length: 20, beam: 5, cabin: 8 },
    { z: endZ - 96, length: 12, beam: 3.4, cabin: 5 },
  ];
  for (const spec of yachtSpecs) {
    const hx = x + 15;
    const hz = spec.z;
    const hull = colorTriple(0xeceff0);
    white.box(hx, -0.1, hz, spec.beam, 1.1, spec.length, hull, { uvScale: 5 });
    white.taperedBox(hx, -1.3, hz, spec.beam, spec.length, 1.2, 0.55, hull, { uvScale: 5 });
    white.box(hx, 1, hz + spec.length * 0.08, spec.beam * 0.78, 1.5, spec.cabin, colorTriple(0xf2f4f2), { uvScale: 4 });
    white.box(hx, 2.5, hz + spec.length * 0.08, spec.beam * 0.6, 1.1, spec.cabin * 0.7, colorTriple(0xd8dde0), { uvScale: 4 });
    // The windscreen and the mast with its cross-tree.
    canvas.box(hx, 2.5, hz - spec.length * 0.16, spec.beam * 0.58, 1.1, 0.2, colorTriple(0x3d5a66), { uvScale: 3 });
    white.cylinder(hx, hz + spec.length * 0.05, 0.11, 7, 2.5, 5, colorTriple(0xcfd4d6), { uvScale: 4 });
    white.box(hx + 0.2, 6.8, hz + spec.length * 0.05, 1.8, 0.1, 0.1, colorTriple(0xcfd4d6), { uvScale: 2 });
    colliders.addBox(hx - spec.beam / 2, hz - spec.length / 2, hx + spec.beam / 2, hz + spec.length / 2, 1.2, 'prop', {
      landmark: 'yacht',
    });
  }

  // A low rail along the pier, and the two gate posts on the boardwalk.
  for (let z = startZ; z < endZ - 4; z += 3) {
    for (const side of [-1, 1]) {
      piles.cylinder(x + side * (width / 2 - 0.35), z, 0.09, 1.1, 0.38, 5, colorTriple(0x5f4c38), { uvScale: 2 });
    }
    piles.beam(x - width / 2 + 0.35, z, x + width / 2 - 0.35, z, 0.12, 0.12, 1.3, colorTriple(0x6a5540), { uvScale: 2 });
  }
  piles.box(x - width / 2, 0.38, startZ + 1, 2.2, 3, 2.2, colorTriple(0x6a5540), { uvScale: 4 });
  piles.box(x + width / 2, 0.38, startZ + 1, 2.2, 3, 2.2, colorTriple(0x6a5540), { uvScale: 4 });

  colliders.addPlatform(x - width / 2, startZ, x + width / 2, endZ, 0.38, 'pier');

  return {
    materials: {
      deck: cityMaterial(textures.boardwalk()),
      piles: cityMaterial(textures.concrete(), { color: 0x9b8568 }),
      white: cityMaterial(textures.concrete(), { color: 0xf2f4f2 }),
      canvas: cityMaterial(textures.concrete(), { color: 0x7a94a0 }),
    },
    builders: { deck, piles, white, canvas },
    note: 'Pier 9 with three yachts',
  };
}

/** Gantry cranes and stacked containers along the harbour quay. */
function buildCranes(group, plan, textures, colliders, block, random) {
  const steel = new MeshBuilder('crane-steel');
  const accent = new MeshBuilder('crane-accent');
  const containers = new MeshBuilder('containers');
  const quayY = 0.02;
  const containerColors = [0xc2553d, 0x2f6f8f, 0xd8a33d, 0x4f7a4a, 0x8f5a8f, 0xb8b8b0];

  HARBOUR.craneXs.forEach((x, index) => {
    const z = HARBOUR.quayZ - 14;
    const legHeight = 22;
    const legInsetX = 5.5;
    const legInsetZ = 4;

    // Four legs with foot braces.
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      steel.box(x + sx * legInsetX, quayY, z + sz * legInsetZ, 1.5, legHeight, 1.5, colorTriple(0xd8b24a), { uvScale: 5 });
      steel.box(x + sx * legInsetX * 0.55, quayY, z + sz * legInsetZ * 0.55, 1.1, 1.1, 1.1, colorTriple(0x8d7430), { uvScale: 3 });
      colliders.addBoxAt(x + sx * legInsetX, z + sz * legInsetZ, 0.9, 0.9, legHeight, 'prop', { landmark: 'crane-leg' });
    }

    // The top gantry, the machinery house and the boom over the water.
    steel.box(x, legHeight, z, 15, 2.2, 6, colorTriple(0xe0c060), { uvScale: 6 });
    steel.box(x, legHeight + 2.2, z, 3.2, 3.6, 3.2, colorTriple(0xc2553d), { uvScale: 4 });
    const boomLength = 34;
    steel.box(x, legHeight + 1.2, z + 9 + boomLength / 2, 2.2, 1.4, boomLength, colorTriple(0xe0c060), { uvScale: 6 });
    steel.box(x, legHeight + 5.4, z, 14, 0.7, 0.7, colorTriple(0x8d7430), { uvScale: 4 });
    // Cables from the tower crown to the boom tip.
    for (const [fromX, width] of [[x, 0.18], [x - 4, 0.12], [x + 4, 0.12]]) {
      steel.beam(fromX, z, x, z + 9 + boomLength, width, width, legHeight + 4.2, colorTriple(0x33383a), { uvScale: 4 });
    }
    // The trolley, its cable and the spreader below.
    accent.box(x, legHeight - 0.8, z + 16, 2.4, 1, 2.4, colorTriple(0x2f3335), { uvScale: 4 });
    accent.box(x, legHeight - 10, z + 16, 0.15, 9, 0.15, colorTriple(0x2f3335), { uvScale: 3 });
    accent.box(x, legHeight - 11, z + 16, 2.2, 1.2, 2.2, colorTriple(0x2f3335), { uvScale: 4 });
    addSignMesh(group, textures.neon(`CRANE ${index + 1}`, 0xffd36e), x, legHeight + 3.8, z - 3.3, 7, 1.6, Math.PI);
  });

  // Container rows, three deep and five along.
  for (let row = 0; row < 3; row += 1) {
    for (let stack = 0; stack < 5; stack += 1) {
      const x = HARBOUR.x0 + 40 + stack * 18 + row * 6;
      const z = HARBOUR.quayZ - 92 + row * 13;
      const levels = random.int(1, 3);
      for (let level = 0; level < levels; level += 1) {
        containers.box(x, quayY + level * 2.7, z, 12, 2.6, 2.5, colorTriple(random.pick(containerColors), 0.9), { uvScale: 4 });
        containers.box(x, quayY + level * 2.7 + 2.4, z, 12.2, 0.2, 2.7, colorTriple(0x2f3335), { uvScale: 4 });
      }
      colliders.addBox(x - 6, z - 1.25, x + 6, z + 1.25, quayY + levels * 2.7, 'prop', { landmark: 'containers' });
    }
  }

  // A few loose containers by the cranes.
  for (let i = 0; i < 7; i += 1) {
    const x = HARBOUR.x0 + random.range(60, 340);
    const z = HARBOUR.quayZ - random.range(18, 40);
    containers.box(x, quayY, z, 12, 2.6, 2.5, colorTriple(random.pick(containerColors)), { uvScale: 4 });
    colliders.addBox(x - 6, z - 1.25, x + 6, z + 1.25, 2.6, 'prop', { landmark: 'containers' });
  }

  return {
    materials: {
      steel: cityMaterial(textures.concrete(), { color: 0xe0c060 }),
      accent: cityMaterial(textures.concrete(), { color: 0x8d9497 }),
      containers: cityMaterial(textures.siding(), { color: 0xffffff }),
    },
    builders: { steel, accent, containers },
    note: 'Harbour Works: four gantry cranes',
  };
}

/** Both channel bridges: the old stone arch and the steel truss. */
function buildBridges(group, plan, textures, colliders) {
  const stone = new MeshBuilder('bridge-stone');
  const steel = new MeshBuilder('bridge-steel');
  const asphalt = new MeshBuilder('bridge-deck');
  const lanes = new MeshBuilder('bridge-lanes');
  const stoneColor = colorTriple(0xb9ac93);
  const steelColor = colorTriple(0xb2543c);
  const white = colorTriple(0xffffff);

  for (const bridge of plan.bridges) {
    const { width } = bridge;
    const x0 = bridge.x0 - 8;
    const x1 = bridge.x1 + 8;
    const length = x1 - x0;
    const cx = (x0 + x1) / 2;

    if (bridge.kind === 'stone') {
      stone.box(cx, -0.9, bridge.z, length, 1.05, width, stoneColor, { uvScale: 6 });
      asphalt.plane(cx, bridge.z, length - 1, width - 4, 0.16, white, { uvScale: 10, repeatX: 1, repeatY: length / 18 });

      // Parapets with regular cap stones.
      for (const side of [-1, 1]) {
        const edgeZ = bridge.z + side * (width / 2 - 0.6);
        stone.box(cx, 0.15, edgeZ, length, 1.05, 1.2, stoneColor, { uvScale: 4 });
        for (let i = 0; i <= 10; i += 1) {
          stone.box(x0 + (length * i) / 10, 1.2, edgeZ, 0.9, 0.7, 1.1, colorTriple(0xcabda2), { uvScale: 3 });
        }
        colliders.addBox(cx - length / 2, edgeZ - 0.6, cx + length / 2, edgeZ + 0.6, 1.2, 'rail', { bridge: bridge.id });
      }

      // Piers under the deck, then a trough of shallow arches between them.
      for (const px of [x0 + length * 0.28, cx, x1 - length * 0.28]) {
        stone.box(px, WATER.level - 0.2, bridge.z, 4.4, 2.2, width - 1, colorTriple(0xa89a80), { uvScale: 5 });
      }
      const archCount = 10;
      for (let i = 0; i < archCount; i += 1) {
        const t = i / (archCount - 1);
        const x = x0 + length * (0.06 + t * 0.88);
        const drop = Math.sin(t * Math.PI) * 2.2 + 0.4;
        stone.box(x, WATER.level - drop, bridge.z, length * 0.06, 0.7, width - 3, colorTriple(0xa89a80), { uvScale: 5 });
      }

      // Two lamps at each entrance.
      for (const lx of [x0 + 3, x1 - 3]) {
        for (const side of [-1, 1]) {
          const lz = bridge.z + side * (width / 2 - 1);
          steel.cylinder(lx, lz, 0.16, 4.4, 1.2, 6, colorTriple(0x33383a), { uvScale: 3 });
          steel.box(lx, 5.6, lz, 0.9, 0.35, 0.9, colorTriple(0xffd9a0), { uvScale: 3 });
        }
      }
      colliders.addPlatform(x0, bridge.z - width / 2, x1, bridge.z + width / 2, 0.16, 'bridge');
    } else {
      // Steel truss: a deck, two towers, top chords, verticals and a swooping cable.
      asphalt.plane(cx, bridge.z, length, width - 2, 0.16, white, { uvScale: 10, repeatX: 1, repeatY: length / 18 });
      steel.box(cx, -1.1, bridge.z, length, 1.3, width - 2, steelColor, { uvScale: 6 });

      for (const side of [-1, 1]) {
        const sz = bridge.z + side * (width / 2 - 1);
        steel.box(cx, 0.16, sz, length, 1, 1.4, steelColor, { uvScale: 4 });
        steel.box(cx, 9, sz, length, 0.9, 1.2, steelColor, { uvScale: 4 });
        for (let i = 0; i <= 12; i += 1) {
          steel.box(x0 + (length * i) / 12, 1.2, sz, 0.7, 7.8, 0.8, steelColor, { uvScale: 4 });
        }
        for (const tx of [x0 + 7, x1 - 7]) {
          steel.box(tx, 1.2, sz, 3.4, 14, 2, colorTriple(0x8f4332), { uvScale: 4 });
          colliders.addBox(tx - 1.7, sz - 1, tx + 1.7, sz + 1, 15, 'landmark', { bridge: bridge.id });
        }
        colliders.addBox(cx - length / 2, sz - 0.7, cx + length / 2, sz + 0.7, 1.2, 'rail', { bridge: bridge.id });
      }

      // Cable stays, sagging between the towers.
      for (let i = 0; i <= 16; i += 1) {
        const t = i / 16;
        const sag = Math.sin(t * Math.PI) * 3.2;
        steel.box(x0 + length * t, 14 - sag, bridge.z, 0.16, 0.16, width - 2, colorTriple(0xd8d0c0), { uvScale: 2 });
      }
      colliders.addPlatform(x0, bridge.z - width / 2, x1, bridge.z + width / 2, 0.16, 'bridge');
    }

    // Centre line paint, on both bridges.
    lanes.plane(cx, bridge.z, length - 4, 0.3, 0.18, colorTriple(0xe8dfbf), { uvScale: 2 });
  }

  return {
    materials: {
      stone: cityMaterial(textures.concrete(), { color: 0xc8bca4 }),
      steel: cityMaterial(textures.concrete(), { color: 0xff8a6a }),
      asphalt: cityMaterial(textures.road()),
      lanes: cityMaterial(textures.asphalt(), { color: 0xe8dfbf }),
    },
    builders: { stone, steel, asphalt, lanes },
    note: 'Two channel bridges: stone arch and steel truss',
  };
}

/** The marsh airstrip: two hangars, a control tower, a windsock and a light plane. */
function buildAirstrip(group, plan, textures, colliders) {
  const concrete = new MeshBuilder('airstrip-concrete');
  const metal = new MeshBuilder('airstrip-metal');
  const glass = new MeshBuilder('airstrip-glass');
  const hangarColor = colorTriple(0x9aa08a);
  const roofColor = colorTriple(0x747d72);

  const hangarZ = -735;
  for (let index = 0; index < 2; index += 1) {
    const x = AIRSTRIP.runwayX + 48 + index * 38;
    const width = 30;
    const depth = 26;
    const wallHeight = 7;

    // Three walls, leaving the front open.
    metal.box(x, 0, hangarZ - depth / 2 + 0.6, width, wallHeight, 1.2, hangarColor, { uvScale: 7 });
    metal.box(x - width / 2 + 0.6, 0, hangarZ, 1.2, wallHeight, depth, hangarColor, { uvScale: 7 });
    metal.box(x + width / 2 - 0.6, 0, hangarZ, 1.2, wallHeight, depth, hangarColor, { uvScale: 7 });
    metal.box(x - width / 2 + 6, wallHeight - 1.2, hangarZ + depth / 2, 10, 1.2, 0.6, hangarColor, { uvScale: 6 });
    metal.box(x + width / 2 - 6, wallHeight - 1.2, hangarZ + depth / 2, 10, 1.2, 0.6, hangarColor, { uvScale: 6 });

    // A curved roof, made from eight quads across the span.
    const segments = 8;
    for (let i = 0; i < segments; i += 1) {
      const a0 = (i / segments) * Math.PI;
      const a1 = ((i + 1) / segments) * Math.PI;
      metal.quad(
        [x + Math.cos(a0) * (width / 2), wallHeight + Math.sin(a0) * 6, hangarZ - depth / 2],
        [x + Math.cos(a1) * (width / 2), wallHeight + Math.sin(a1) * 6, hangarZ - depth / 2],
        [x + Math.cos(a1) * (width / 2), wallHeight + Math.sin(a1) * 6, hangarZ + depth / 2],
        [x + Math.cos(a0) * (width / 2), wallHeight + Math.sin(a0) * 6, hangarZ + depth / 2],
        [0, 1, 0],
        roofColor,
        [[0, 0], [1, 0], [1, 1], [0, 1]],
      );
    }

    // Threshold stripe across the door.
    metal.box(x, 0, hangarZ + depth / 2 - 0.1, width, 0.8, 0.3, colorTriple(0xd8b24a), { uvScale: 4 });
    colliders.addBox(x - width / 2, hangarZ - depth / 2, x + width / 2, hangarZ + depth / 2, wallHeight + 5, 'landmark', {
      landmark: 'hangar',
    });
    addSignMesh(group, textures.neon(`HANGAR ${index + 1}`, 0xc8d98a), x, wallHeight + 1.8, hangarZ + depth / 2 + 0.2, 7, 1.5, 0);
  }

  // The control tower beside the apron.
  const towerX = AIRSTRIP.runwayX + 20;
  const towerZ = -790;
  concrete.box(towerX, 0, towerZ, 7, 15, 7, colorTriple(0xd8d4c6), { uvScale: 6 });
  glass.box(towerX, 15, towerZ, 9, 3.4, 9, colorTriple(0xa8c8d0), { uvScale: 5 });
  concrete.box(towerX, 18.4, towerZ, 9.6, 0.7, 9.6, colorTriple(0x8d8a80), { uvScale: 5 });
  metal.cylinder(towerX, towerZ, 0.22, 7, 19.1, 5, colorTriple(0xb8bcc0), { uvScale: 3 });
  metal.box(towerX, 26, towerZ, 0.6, 0.6, 0.6, colorTriple(0xff5a4a), { uvScale: 2 });
  colliders.addBox(towerX - 4.5, towerZ - 4.5, towerX + 4.5, towerZ + 4.5, 19, 'landmark', { landmark: 'control-tower' });

  // The windsock: a pole and three tapering rings.
  const sockX = AIRSTRIP.runwayX - 28;
  const sockZ = -680;
  metal.cylinder(sockX, sockZ, 0.12, 6, 0, 5, colorTriple(0xb8bcc0), { uvScale: 3 });
  for (let i = 0; i < 3; i += 1) {
    metal.cylinder(sockX, sockZ + 0.7 + i * 1.5, 0.5 - i * 0.08, 1.4, 5.4, 7, colorTriple(i % 2 === 0 ? 0xff7a4a : 0xf0e6d0), {
      uvScale: 2,
    });
  }

  // A small parked plane on the apron: fuselage, tail, wings, prop.
  const planeX = AIRSTRIP.runwayX + 50;
  const planeZ = -676;
  metal.box(planeX, 0.6, planeZ, 2.2, 2, 12, colorTriple(0xe6e8e4), { uvScale: 4 });
  metal.box(planeX, 1.8, planeZ - 4.6, 1.8, 1, 2, colorTriple(0xd8dcd8), { uvScale: 4 });
  metal.box(planeX, 0.9, planeZ, 16, 0.3, 2.2, colorTriple(0xe6e8e4), { uvScale: 5 });
  metal.box(planeX, 1.4, planeZ + 5.2, 5.4, 0.25, 1.4, colorTriple(0xd8dcd8), { uvScale: 4 });
  metal.box(planeX, 2, planeZ + 5.4, 0.2, 2, 1.4, colorTriple(0xd8dcd8), { uvScale: 2 });
  metal.cylinder(planeX, planeZ + 6.2, 0.5, 0.5, 0.7, 8, colorTriple(0x3d4244), { uvScale: 3 });
  colliders.addBoxAt(planeX, planeZ, 1.4, 6.4, 2.6, 'prop', { landmark: 'light-plane' });

  // Fuel drums by the apron.
  for (let i = 0; i < 6; i += 1) {
    metal.cylinder(AIRSTRIP.runwayX + 34 + i * 2.2, -744 + (i % 2) * 2.4, 0.8, 1.6, 0, 8, colorTriple(0x8f5a3a), { uvScale: 2 });
  }

  return {
    materials: {
      concrete: cityMaterial(textures.concrete()),
      metal: cityMaterial(textures.siding()),
      glass: cityMaterial(textures.glassWall('airstrip', 0), { emissiveIntensity: 0 }),
    },
    builders: { concrete, metal, glass },
    note: 'Marsh Airstrip with two hangars',
  };
}

/**
 * Builds every landmark. The blocks come from plan.landmarkBlocks, so the procedural
 * building pass leaves those lots empty.
 */
export function buildLandmarks(plan, textures, colliders, options = {}) {
  const group = new THREE.Group();
  group.name = 'landmarks';
  const random = new Random(`${plan.seed}:landmarks`);
  const notes = [];

  // One bucket per shared material, so every landmark part lands in a handful of meshes.
  // The per-part colours are baked into the vertex colours.
  const masterMaterials = {
    concrete: cityMaterial(textures.concrete()),
    glass: cityMaterial(textures.glassWall('downtown', 0), { emissive: 0xbfe0ff, emissiveIntensity: 0 }),
    steel: cityMaterial(textures.siding()),
    boardwalk: cityMaterial(textures.boardwalk()),
    grass: cityMaterial(textures.grass()),
    road: cityMaterial(textures.road()),
    lane: cityMaterial(textures.asphalt(), { color: 0xe8dfbf }),
    siding: cityMaterial(textures.siding()),
  };
  const masterBuilders = new Map();
  const masterFor = (key) => {
    if (!masterBuilders.has(key)) masterBuilders.set(key, new MeshBuilder(`landmark-${key}`));
    return masterBuilders.get(key);
  };

  // Which of each landmark's local materials is merged into which master bucket.
  const PART_TO_BUCKET = {
    spire: { concrete: 'concrete', glass: 'glass', accent: 'concrete' },
    stadium: { concrete: 'concrete', seats: 'concrete', field: 'grass', masts: 'steel' },
    pier: { deck: 'boardwalk', piles: 'concrete', white: 'concrete', canvas: 'glass' },
    cranes: { steel: 'steel', accent: 'steel', containers: 'siding' },
    bridges: { stone: 'concrete', steel: 'steel', asphalt: 'road', lanes: 'lane' },
    airstrip: { concrete: 'concrete', metal: 'siding', glass: 'glass' },
  };

  const addAll = (kind, result) => {
    const mapping = PART_TO_BUCKET[kind] ?? {};
    for (const [part, builder] of Object.entries(result.builders)) {
      if (builder.isEmpty) continue;
      masterFor(mapping[part] ?? 'concrete').append(builder);
    }
    notes.push(result.note);
  };

  const towerBlock = blockById(plan, plan.landmarkBlocks.tower);
  if (towerBlock) addAll('spire', buildSpire(group, plan, textures, colliders, towerBlock));

  const stadiumBlock = blockById(plan, plan.landmarkBlocks.stadium);
  if (stadiumBlock) addAll('stadium', buildStadium(group, plan, textures, colliders, stadiumBlock));

  const pierBlock = blockById(plan, plan.landmarkBlocks.pier);
  if (pierBlock) addAll('pier', buildPier(group, plan, textures, colliders, pierBlock));

  const craneBlock = blockById(plan, plan.landmarkBlocks.cranes);
  if (craneBlock) addAll('cranes', buildCranes(group, plan, textures, colliders, craneBlock, random));

  addAll('bridges', buildBridges(group, plan, textures, colliders));

  const hangarBlock = blockById(plan, plan.landmarkBlocks.hangars) ?? plan.blocks.find((block) => block.district === 'airstrip');
  if (hangarBlock) addAll('airstrip', buildAirstrip(group, plan, textures, colliders, hangarBlock));

  // On a software rasteriser the sign quads are the difference between a dozen and forty
  // draw calls; drop them rather than the buildings they hang on.
  if (options.lite) {
    for (const child of [...group.children]) {
      if (child.name === 'landmark-sign') group.remove(child);
    }
  }

  const builders = Object.fromEntries(masterBuilders);
  for (const [key, builder] of masterBuilders) {
    const mesh = builder.finalize(masterMaterials[key] ?? masterMaterials.concrete, `landmarks-${key}`);
    if (mesh) group.add(mesh);
  }

  return {
    group,
    materials: masterMaterials,
    builders,
    notes,
    triangles: Object.values(builders).reduce((sum, builder) => sum + builder.triangles, 0),
  };
}
