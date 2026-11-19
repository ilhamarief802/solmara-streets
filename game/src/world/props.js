// Street life at ground level: palms, streetlights that come on at dusk, benches, bins,
// hydrants, market stalls, planters, parked cars and the working traffic signals. Props
// are placed by walking each block's pavement ring from a seeded stream, so a district's
// prop mix is its own. Models merge into a few meshes; the lamp heads and signal lenses
// are InstancedMeshes, which is what makes hundreds of small lights affordable.

import { MeshBuilder, cityMaterial, colorTriple } from './geometry.js';
import { Random } from '../core/rng.js';
import { BEACH, GRID, HARBOUR, isWaterAt } from './plan.js';
import { districtOf } from './districts.js';
import { clamp } from '../core/math.js';

const PALM_FROND = 0x4f7a3a;
const IRON = 0x2f3437;
/** The beach keeps its umbrellas this far from the sea. */
const WATERLINE = 640;

/**
 * The signal cycle: green, amber, red, with a per-junction offset. These three numbers
 * must match the ones traffic.js uses, or cars and lamps disagree at the lights.
 */
export class TrafficSignals {
  constructor(heads) {
    this.heads = heads;
    this.elapsed = 0;
    this.cycle = 26;
    this.green = 11;
    this.amber = 3.2;
    this.lastTick = -1;
    this.states = new Uint8Array(heads.length);
  }

  stateAt(head) {
    const t = (this.elapsed + head.offset) % this.cycle;
    if (t < this.green) return 0; // green
    if (t < this.green + this.amber) return 1; // amber
    return 2; // red
  }

  /** Recolours the lenses four times a second, not every frame. */
  update(dt, mesh, colorSets) {
    this.elapsed += dt;
    const tick = Math.floor(this.elapsed * 4);
    if (tick === this.lastTick) return false;
    this.lastTick = tick;

    for (let i = 0; i < this.heads.length; i += 1) {
      const state = this.stateAt(this.heads[i]);
      this.states[i] = state;
      for (let lamp = 0; lamp < 3; lamp += 1) {
        // The lit lens uses its bright colour; the other two use the dim set.
        mesh.setColorAt(i * 3 + lamp, colorSets[lamp === state ? lamp : 3 + lamp]);
      }
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    return true;
  }
}

function palm(builder, leaves, x, z, height, random, colliders) {
  const trunk = colorTriple(random.pick([0x8a7358, 0x7d6349, 0x937c60]));
  builder.cylinder(x, z, 0.42, height, 0, 7, trunk, { topRadius: 0.28, uvScale: 3 });

  // The crown leans a little off the trunk, as a wind-bent palm does.
  const topX = x + random.range(-0.6, 0.6);
  const topZ = z + random.range(-0.5, 0.5);
  builder.cylinder(topX, topZ, 0.3, 0.9, height - 0.4, 6, trunk, { topRadius: 0.24, uvScale: 2 });

  const fronds = random.int(6, 9);
  const leafColor = colorTriple(PALM_FROND, random.range(0.85, 1.15));
  for (let i = 0; i < fronds; i += 1) {
    const angle = (i / fronds) * Math.PI * 2 + random.range(-0.18, 0.18);
    const length = random.range(2.4, 4.2);
    const droop = random.range(0.8, 2.2);
    const dx = Math.cos(angle);
    const dz = Math.sin(angle);
    // Perpendicular, for the width of the frond at its root and its tip.
    const px = -dz;
    const pz = dx;
    const baseY = height + 0.2;
    const rootWidth = 0.55;
    const tipWidth = 0.9;
    leaves.quad(
      [topX + px * rootWidth, baseY, topZ + pz * rootWidth],
      [topX - px * rootWidth, baseY, topZ - pz * rootWidth],
      [topX + dx * length - px * tipWidth, baseY + 0.9 - droop, topZ + dz * length - pz * tipWidth],
      [topX + dx * length + px * tipWidth, baseY + 0.9 - droop, topZ + dz * length + pz * tipWidth],
      [0, 1, 0],
      leafColor,
      [[0, 0], [0, 1], [1, 1], [1, 0]],
    );
  }
  colliders.addBoxAt(x, z, 0.42, 0.42, height, 'prop', { prop: 'palm' });
}

function streetlight(iron, x, z, rotY, lamps, glowPools, random) {
  const height = random.range(5.6, 7.2);
  iron.cylinder(x, z, 0.16, height, 0, 6, colorTriple(IRON), { topRadius: 0.1, uvScale: 3 });
  iron.box(x, height - 0.3, z, 0.4, 0.4, 0.4, colorTriple(IRON), { uvScale: 2 });

  // The arm reaches over the road in the direction the kerb faces.
  const armLength = 2.2;
  const lx = x + Math.sin(rotY) * armLength;
  const lz = z + Math.cos(rotY) * armLength;
  iron.beam(x, z, lx, lz, 0.18, 0.18, height - 0.2, colorTriple(IRON), { uvScale: 2 });
  iron.box(lx, height - 0.55, lz, 0.95, 0.28, 0.44, colorTriple(0x24282a), { rotY, uvScale: 2 });

  lamps.push({ x: lx, y: height - 0.62, z: lz });
  glowPools.plane(lx, lz, 9, 9, 0.2, colorTriple(0xffffff), { uvScale: 9, repeatX: 1, repeatY: 1 });
}

function bench(wood, iron, x, z, rotY, random) {
  const tone = colorTriple(random.pick([0x9a7b55, 0x8a6c49, 0xa8875e]));
  const cos = Math.cos(rotY);
  const sin = Math.sin(rotY);
  for (const side of [-1, 1]) {
    iron.box(x + cos * side * 0.85, 0, z - sin * side * 0.85, 0.18, 1.5, 0.5, colorTriple(IRON), { rotY, uvScale: 2 });
  }
  wood.box(x, 1.45, z, 2.1, 0.16, 0.62, tone, { rotY, uvScale: 2 });
  wood.box(x - sin * 0.28, 1.9, z - cos * 0.28, 2.1, 0.7, 0.14, tone, { rotY, uvScale: 2 });
}

function bin(iron, x, z, random) {
  iron.cylinder(x, z, 0.36, 0.95, 0, 8, colorTriple(random.pick([0x39513d, 0x3c4448])), { uvScale: 2 });
  iron.cylinder(x, z, 0.39, 0.1, 0.95, 8, colorTriple(0x22282a), { uvScale: 2 });
}

function hydrant(iron, x, z) {
  iron.cylinder(x, z, 0.22, 0.7, 0, 6, colorTriple(0xb04a3a), { uvScale: 2 });
  iron.cylinder(x, z, 0.28, 0.18, 0.7, 6, colorTriple(0x8a3a2e), { topRadius: 0.16, uvScale: 2 });
  iron.box(x, 0.4, z, 0.7, 0.14, 0.2, colorTriple(0x8a3a2e), { uvScale: 2 });
}

function marketStall(wood, fabric, x, z, rotY, random) {
  const colors = [0xe86a6a, 0xffd36e, 0x5fd8c4, 0xff8f5e, 0x8fb8ff];
  const canopy = colorTriple(random.pick(colors));
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    wood.cylinder(x + sx * 1.2 * Math.cos(rotY), z + sz * 1.2, 0.06, 2.3, 0, 4, colorTriple(0x6e5437), { uvScale: 2 });
  }
  fabric.box(x, 2.3, z, 3.2, 0.18, 2.8, canopy, { rotY, uvScale: 2 });
  wood.box(x, 0.9, z, 3, 0.12, 2.2, colorTriple(0xa8875e), { rotY, uvScale: 2 });
  // Crates of produce on the counter.
  for (let i = 0; i < 3; i += 1) {
    fabric.box(
      x + random.range(-0.8, 0.8),
      1.02,
      z + random.range(-0.6, 0.6),
      0.5,
      0.3,
      0.5,
      colorTriple(random.pick([0xd86a3a, 0x7aa84a, 0xd8b24a])),
      { rotY, uvScale: 1.5 },
    );
  }
}

function planter(builder, x, z, random) {
  builder.box(x, 0, z, 1.4, 0.5, 1.4, colorTriple(0xb5ad9c), { uvScale: 2 });
  builder.box(x, 0.5, z, 1.1, 0.1, 1.1, colorTriple(0x3f2f22), { uvScale: 2 });
  builder.cylinder(x, z, 0.42, random.range(0.7, 1.3), 0.5, 6, colorTriple(0x4f7a3a), { topRadius: 0.3, uvScale: 2 });
}

function parkedCar(body, glass, x, z, rotY, random, colliders) {
  const paint = colorTriple(random.pick([0xd8d4c8, 0x3b4a5a, 0x8a2f2f, 0x2f5a4a, 0xc9a24a, 0x6a6a72, 0xe6e2d8]));
  const length = random.range(4.2, 5.4);
  const width = 1.9;
  const cos = Math.cos(rotY);
  const sin = Math.sin(rotY);

  body.box(x, 0.3, z, width, 0.75, length, paint, { rotY, uvScale: 3 });
  body.taperedBox(x, 1.05, z, width - 0.15, length * 0.55, 0.7, 0.72, paint, { rotY, uvScale: 3 });
  glass.box(x, 1.12, z, width - 0.4, 0.5, length * 0.5, colorTriple(0x23303a), { rotY, uvScale: 2 });

  // Wheels as dark boxes, then the lamp lenses.
  for (const [lx, lz] of [[-0.95, -1.5], [0.95, -1.5], [-0.95, 1.5], [0.95, 1.5]]) {
    body.box(x + lx * cos - lz * sin, 0, z + lx * sin + lz * cos, 0.25, 0.62, 0.62, colorTriple(0x1a1c1e), {
      rotY,
      uvScale: 1.5,
    });
  }
  body.box(x, 0.55, z + length / 2 - 0.04, width - 0.35, 0.18, 0.08, colorTriple(0xffe6b0), { rotY, uvScale: 1.5 });
  body.box(x, 0.55, z - length / 2 + 0.04, width - 0.35, 0.18, 0.08, colorTriple(0x9a3030), { rotY, uvScale: 1.5 });
  colliders.addBoxAt(x, z, width / 2 + 0.2, length / 2 + 0.2, 1.6, 'car', { prop: 'parked-car' });
}

/**
 * Places every prop.
 * @returns {{group, update, signals, lamps, signalsCount, count, triangles}}
 */
export function buildProps(plan, textures, colliders, options = {}) {
  const detail = options.detail ?? 1;
  const group = new THREE.Group();
  group.name = 'props';
  const random = new Random(`${plan.seed}:props`);

  const iron = new MeshBuilder('props-iron');
  const wood = new MeshBuilder('props-wood');
  const leaves = new MeshBuilder('palm-fronds');
  const fabric = new MeshBuilder('market-canvas');
  const bodies = new MeshBuilder('parked-cars');
  const carGlass = new MeshBuilder('parked-car-glass');
  const glowPools = new MeshBuilder('lamp-pools');
  const lamps = [];
  const signalHeads = [];
  const signalLampPositions = [];

  let propCount = 0;
  const chance = (p) => random.chance(clamp(p * detail, 0, 1));

  // Palms count themselves: they can be skipped over water, and both the kerb pass and
  // the beach promenade place them.
  const addPalm = (x, z) => {
    if (isWaterAt(x, z)) return;
    palm(iron, leaves, x, z, random.range(5.5, 10.5), random, colliders);
    propCount += 1;
  };

  // ------------------------------------------------------------ block pavements
  const inset = GRID.kerbInset - 1.6;

  for (const block of plan.blocks) {
    if (isWaterAt(block.cx, block.cz)) continue;
    const district = districtOf(block.district);
    const mix = district.props;

    // The four kerb lines, each with the outward normal the props face.
    const sides = [
      { x0: block.x0 + inset, z0: block.z0 + inset, x1: block.x1 - inset, z1: block.z0 + inset, nx: 0, nz: -1 },
      { x0: block.x0 + inset, z0: block.z1 - inset, x1: block.x1 - inset, z1: block.z1 - inset, nx: 0, nz: 1 },
      { x0: block.x0 + inset, z0: block.z0 + inset, x1: block.x0 + inset, z1: block.z1 - inset, nx: -1, nz: 0 },
      { x0: block.x1 - inset, z0: block.z0 + inset, x1: block.x1 - inset, z1: block.z1 - inset, nx: 1, nz: 0 },
    ];

    // Cumulative thresholds over one roll per station. Order is the priority order: a
    // lamp beats a palm, a palm beats a bench, and so on down to the planters. A handler
    // that counts its own prop returns false so the loop does not count it twice.
    const bands = [];
    let edge = 0;
    const band = (width, place) => {
      edge += width;
      bands.push({ until: edge, place });
    };
    band(mix.lights * 0.34, (x, z, rotY) => {
      streetlight(iron, x, z, rotY, lamps, glowPools, random);
      colliders.addBoxAt(x, z, 0.25, 0.25, 6.5, 'prop', { prop: 'streetlight' });
    });
    band(mix.lights * 0.16 + mix.palms * 0.4, (x, z) => {
      addPalm(x, z);
      return false;
    });
    band(mix.benches * 0.22, (x, z, rotY) => bench(wood, iron, x, z, rotY, random));
    band(mix.stalls * 0.16, (x, z, rotY) => {
      marketStall(wood, fabric, x, z, rotY, random);
      colliders.addBoxAt(x, z, 1.8, 1.6, 2.4, 'prop', { prop: 'stall' });
    });
    band(mix.bins * 0.12, (x, z) => bin(iron, x, z, random));
    band(mix.hydrants * 0.08, (x, z) => hydrant(iron, x, z));

    const plantable = district.id === 'verano' || district.id === 'marina' || district.id === 'beach';

    for (const side of sides) {
      const length = Math.hypot(side.x1 - side.x0, side.z1 - side.z0);
      const steps = Math.max(2, Math.floor((length / 34) * detail));
      const rotY = Math.atan2(side.nx, side.nz);
      for (let i = 0; i <= steps; i += 1) {
        const t = steps === 0 ? 0 : i / steps;
        const x = side.x0 + (side.x1 - side.x0) * t;
        const z = side.z0 + (side.z1 - side.z0) * t;
        const roll = random.float();
        const slot = bands.find((candidate) => roll < candidate.until);
        if (slot) {
          if (slot.place(x, z, rotY) !== false) propCount += 1;
        } else if (chance(0.12) && plantable) {
          // The draw comes first: the stream is not allowed to depend on the district.
          planter(wood, x, z, random);
          propCount += 1;
        }
      }
    }

    // Parked cars along one or two kerbs. The vehicle system owns the driven cars, so the
    // world only draws its own when the caller asks for them.
    if (options.parkedCars !== false && mix.cars > 0.2) {
      for (const side of random.shuffle(sides.slice()).slice(0, 2)) {
        const length = Math.hypot(side.x1 - side.x0, side.z1 - side.z0);
        const count = Math.floor(length / random.range(18, 30));
        for (let i = 0; i < count; i += 1) {
          if (!chance(mix.cars * 0.45)) continue;
          const t = (i + 0.5) / Math.max(1, count);
          const x = side.x0 + (side.x1 - side.x0) * t + side.nx * 1.9;
          const z = side.z0 + (side.z1 - side.z0) * t + side.nz * 1.9;
          if (isWaterAt(x, z)) continue;
          parkedCar(bodies, carGlass, x, z, Math.atan2(side.nx, side.nz) + Math.PI / 2, random, colliders);
          propCount += 1;
        }
      }
    }
  }

  // ------------------------------------------------------------- beach extras
  // Palms down the promenade, benches facing the water and stalls behind them. The beach
  // is the city's postcard, so it carries more props than its density suggests.
  for (let x = BEACH.x0 + 12; x <= BEACH.x1 - 10; x += 26) {
    if (x > BEACH.pierX - 12 && x < BEACH.pierX + 12) continue;
    addPalm(x, BEACH.boardwalkZ + 12);
    if (random.chance(0.55)) {
      bench(wood, iron, x + 8, BEACH.boardwalkZ - 11, Math.PI, random);
      propCount += 1;
    }
    if (random.chance(0.35)) {
      marketStall(wood, fabric, x + 14, BEACH.boardwalkZ + 4, Math.PI / 2, random);
      propCount += 1;
    }
  }

  // Umbrellas on the sand (no colliders: they are soft).
  const umbrellaColors = [0xff6a5a, 0xffd36e, 0x5fd8c4, 0x8fb8ff, 0xff8fd8];
  for (let i = 0; i < 22 * detail; i += 1) {
    const x = random.range(BEACH.x0 + 30, BEACH.x1 - 30);
    const z = random.range(BEACH.boardwalkZ + 26, WATERLINE - 18);
    if (isWaterAt(x, z)) continue;
    iron.cylinder(x, z, 0.06, 2.3, 0, 4, colorTriple(0xcfc4ac), { uvScale: 2 });
    fabric.cylinder(x, z, 1.6, 0.35, 2.3, 8, colorTriple(random.pick(umbrellaColors)), { topRadius: 0.1, uvScale: 2 });
  }

  // ------------------------------------------------------------- harbour extras
  for (let i = 0; i < 10 * detail; i += 1) {
    const x = random.range(HARBOUR.x0 + 20, HARBOUR.x1 - 20);
    const z = random.range(HARBOUR.z0 + 30, HARBOUR.z1 - 10);
    if (isWaterAt(x, z)) continue;
    planter(wood, x, z, random);
  }
  for (let i = 0; i < 7 * detail; i += 1) {
    const x = HARBOUR.x0 + 30 + i * 30;
    streetlight(iron, x, HARBOUR.quayZ + 6, Math.PI, lamps, glowPools, random);
    colliders.addBoxAt(x, HARBOUR.quayZ + 6, 0.25, 0.25, 6.5, 'prop', { prop: 'streetlight' });
  }

  // ---------------------------------------------------------------- signals
  for (const node of plan.nodes) {
    if (!node.signal) continue;
    // Each junction runs a little out of phase with its neighbours.
    const offset = ((node.i * 3 + node.j * 5) % 26) * 0.9;
    for (const [dx, dz] of [[0, -1], [1, 0]]) {
      const px = node.x + dx * (GRID.roadWidth / 2 + 1.4);
      const pz = node.z + dz * (GRID.roadWidth / 2 + 1.4);
      if (isWaterAt(px, pz)) continue;

      iron.cylinder(px, pz, 0.12, 4.4, 0, 5, colorTriple(IRON), { uvScale: 3 });
      const arm = 5.2;
      iron.beam(px, pz, px - dx * arm, pz - dz * arm, 0.14, 0.14, 4.3, colorTriple(IRON), { uvScale: 2 });
      const hx = px - dx * arm;
      const hz = pz - dz * arm;
      const rotY = Math.atan2(dx, dz);
      iron.box(hx, 3.15, hz, 0.62, 1.35, 0.42, colorTriple(0x25292b), { rotY, uvScale: 2 });

      signalHeads.push({ offset, index: signalHeads.length });
      // Three lenses per head, red at the top.
      for (let lamp = 0; lamp < 3; lamp += 1) {
        signalLampPositions.push({ x: hx, y: 3.35 + (2 - lamp) * 0.38, z: hz, rotY });
      }
      // A small pedestrian sign on the pole.
      iron.box(px, 2.2, pz, 0.5, 0.5, 0.08, colorTriple(0xc9c3a8), { rotY, uvScale: 1.5 });
    }
  }

  // ---------------------------------------------------------------- materials
  const materials = {
    iron: cityMaterial(textures.concrete(), { color: 0x9ca2a4 }),
    wood: cityMaterial(textures.boardwalk(), { color: 0xd8c8a8 }),
    leaves: cityMaterial(textures.grass(), { color: 0xffffff, side: THREE.DoubleSide }),
    fabric: cityMaterial(textures.concrete(), { color: 0xffffff, side: THREE.DoubleSide }),
    bodies: cityMaterial(textures.concrete(), { color: 0xffffff }),
    carGlass: cityMaterial(textures.glassWall('marina', 0), { emissiveIntensity: 0 }),
  };

  iron.attach(group, materials.iron, 'props-iron');
  wood.attach(group, materials.wood, 'props-wood');
  leaves.attach(group, materials.leaves, 'palm-fronds');
  fabric.attach(group, materials.fabric, 'market-canvas');
  bodies.attach(group, materials.bodies, 'parked-cars');
  carGlass.attach(group, materials.carGlass, 'parked-car-glass');

  // Lamp pools on the ground: additive, and faded out by day.
  const poolMaterial = new THREE.MeshBasicMaterial({
    map: textures.glow(),
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    fog: true,
  });
  const poolMesh = glowPools.finalize(poolMaterial, 'lamp-pools');
  if (poolMesh) {
    poolMesh.renderOrder = 2;
    group.add(poolMesh);
  }

  const matrix = new THREE.Matrix4();

  // Lamp heads: one instanced sphere for every streetlight.
  const lampMaterial = new THREE.MeshBasicMaterial({ color: 0xffd9a0, toneMapped: false, fog: true });
  const lampMesh = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.22, 6, 4),
    lampMaterial,
    Math.max(1, lamps.length),
  );
  lampMesh.name = 'streetlight-heads';
  lampMesh.frustumCulled = false;
  lamps.forEach((lamp, index) => {
    lampMesh.setMatrixAt(index, matrix.makeTranslation(lamp.x, lamp.y, lamp.z));
  });
  lampMesh.instanceMatrix.needsUpdate = true;
  group.add(lampMesh);

  // Signal lenses: one instanced sphere, coloured per state.
  const lensMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, fog: true });
  const lensMesh = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.14, 6, 4),
    lensMaterial,
    Math.max(1, signalLampPositions.length),
  );
  lensMesh.name = 'traffic-lenses';
  lensMesh.frustumCulled = false;
  signalLampPositions.forEach((lamp, index) => {
    lensMesh.setMatrixAt(index, matrix.makeTranslation(lamp.x, lamp.y, lamp.z));
  });
  lensMesh.instanceMatrix.needsUpdate = true;
  group.add(lensMesh);

  // Three bright lens colours, then the three unlit ones.
  const colorSets = [
    new THREE.Color(0x39e06a),
    new THREE.Color(0xffb020),
    new THREE.Color(0xff3b30),
    new THREE.Color(0x123a20),
    new THREE.Color(0x3a2a08),
    new THREE.Color(0x3a1010),
  ];
  const signals = new TrafficSignals(signalHeads);
  signals.update(0, lensMesh, colorSets);

  let nightFactor = 0;
  function update(dt, context = {}) {
    signals.update(dt, lensMesh, colorSets);
    nightFactor += (clamp(context.night ?? 0, 0, 1) - nightFactor) * Math.min(1, dt * 2.5);
    lampMaterial.opacity = 0.15 + nightFactor * 0.85;
    lampMaterial.color.setRGB(1, 0.78 + nightFactor * 0.08, 0.5 + nightFactor * 0.1);
    poolMaterial.opacity = nightFactor * 0.55;
    if (poolMesh) poolMesh.visible = poolMaterial.opacity > 0.01;
  }

  return {
    group,
    update,
    signals,
    lamps: lamps.length,
    signalsCount: signalHeads.length,
    count: propCount,
    triangles:
      iron.triangles + wood.triangles + leaves.triangles + fabric.triangles + bodies.triangles + carGlass.triangles,
    materials,
  };
}
