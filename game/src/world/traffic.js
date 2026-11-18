// Traffic lights: the poles and heads around every signalled junction, and the state
// machine that drives them. Junction phases are staggered across the grid so the
// lights do not all change together, and only the lamps that actually change colour
// touch the GPU each tick.

import { CITY } from './cityplan.js';

/** The light cycle, in seconds. Two axes alternate through green, amber, all red. */
export const CYCLE = [
  { id: 'nsGreen', duration: 14, ns: 'green', ew: 'red' },
  { id: 'nsAmber', duration: 3, ns: 'amber', ew: 'red' },
  { id: 'clearA', duration: 1.5, ns: 'red', ew: 'red' },
  { id: 'ewGreen', duration: 14, ns: 'red', ew: 'green' },
  { id: 'ewAmber', duration: 3, ns: 'red', ew: 'amber' },
  { id: 'clearB', duration: 1.5, ns: 'red', ew: 'red' },
];

export const CYCLE_LENGTH = CYCLE.reduce((sum, phase) => sum + phase.duration, 0);

const LAMP_COLOURS = {
  red: 0xff3b2f,
  amber: 0xffb03a,
  green: 0x3bff7a,
};

const POLE_HEIGHT = 5.6;
const ARM_LENGTH = 4.6;
const HEAD_Y = 5.2;

/** Which phase the cycle is in at time `t` seconds, with a per junction offset. */
export function phaseAt(t, offset = 0) {
  let local = (t + offset) % CYCLE_LENGTH;
  if (local < 0) local += CYCLE_LENGTH;
  for (const phase of CYCLE) {
    if (local < phase.duration) return phase;
    local -= phase.duration;
  }
  return CYCLE[0];
}

export class TrafficSystem {
  constructor({ plan, groups, rng, colliders }) {
    this.plan = plan;
    this.rng = rng;
    this.time = 0;
    this.junctions = [];
    this.heads = [];
    this.updateCount = 0;

    const signalled = plan.nodes.filter((node) => node.signals && node.island === 'mainland');
    const positions = [];
    const colours = [];

    for (const node of signalled) {
      const junction = {
        id: node.id,
        x: node.x,
        z: node.z,
        district: node.district,
        offset: (((node.x / CITY.pitch) + (node.z / CITY.pitch)) % 2 === 0) ? 0 : CYCLE_LENGTH / 2,
        ns: 'green',
        ew: 'red',
        phase: 'nsGreen',
      };
      this.junctions.push(junction);

      // Two poles on opposite corners, each governing one axis of travel.
      const specs = [
        { dx: -(CITY.roadWidth / 2 + 1.6), dz: -(CITY.roadWidth / 2 + 1.6), governs: 'ns', facing: Math.PI * 0.75 },
        { dx: CITY.roadWidth / 2 + 1.6, dz: CITY.roadWidth / 2 + 1.6, governs: 'ew', facing: -Math.PI * 0.25 },
      ];
      for (const spec of specs) {
        const px = node.x + spec.dx;
        const pz = node.z + spec.dz;
        this.buildPole({ groups, x: px, z: pz, facing: spec.facing });
        if (colliders) colliders.addBox({ x: px, y: CITY.sidewalkHeight + POLE_HEIGHT / 2, z: pz, width: 0.6, height: POLE_HEIGHT, depth: 0.6, kind: 'traffic-pole' });

        // The head hangs at the end of the arm, over the carriageway.
        const headX = px + Math.sin(spec.facing) * (ARM_LENGTH * 0.72);
        const headZ = pz + Math.cos(spec.facing) * (ARM_LENGTH * 0.72);
        const outwardX = Math.sin(spec.facing);
        const outwardZ = Math.cos(spec.facing);
        const head = {
          junction,
          governs: spec.governs,
          slots: {
            red: [headX + outwardX * 0.24, HEAD_Y + 0.52, headZ + outwardZ * 0.24],
            amber: [headX + outwardX * 0.24, HEAD_Y, headZ + outwardZ * 0.24],
            green: [headX + outwardX * 0.24, HEAD_Y - 0.52, headZ + outwardZ * 0.24],
          },
          instance: positions.length,
          colour: 'red',
        };
        this.heads.push(head);
        positions.push(head.slots.red);
        colours.push(LAMP_COLOURS.red);
      }
    }

    // One instanced lamp per head: the active lens is the instance, and it moves
    // between the three slots as the phase changes.
    const geometry = new THREE.BoxGeometry(0.34, 0.34, 0.26);
    this.material = new THREE.MeshBasicMaterial({ toneMapped: false, fog: true });
    this.lampMesh = new THREE.InstancedMesh(geometry, this.material, Math.max(1, positions.length));
    this.lampMesh.name = 'traffic-lamps';
    this.lampMesh.frustumCulled = false;
    this.matrix = new THREE.Matrix4();
    this.colour = new THREE.Color();
    for (let i = 0; i < this.heads.length; i += 1) {
      this.placeLamp(i, 'red');
    }
    this.lampMesh.count = this.heads.length;
    this.lampMesh.instanceMatrix.needsUpdate = true;
    if (this.lampMesh.instanceColor) this.lampMesh.instanceColor.needsUpdate = true;
  }

  /** Pole, arm, housing and the three unlit lenses. */
  buildPole({ groups, x, z, facing }) {
    const y = CITY.sidewalkHeight;
    groups.cylinder('metalDark', {
      x,
      y: y + POLE_HEIGHT / 2,
      z,
      radiusTop: 0.13,
      radiusBottom: 0.19,
      height: POLE_HEIGHT,
      segments: 6,
      color: 0x3f4449,
      uScale: 0.6,
      vScale: 0.4,
    });
    const armX = x + Math.sin(facing) * ARM_LENGTH * 0.5;
    const armZ = z + Math.cos(facing) * ARM_LENGTH * 0.5;
    groups.box('metalDark', {
      x: armX,
      y: y + POLE_HEIGHT - 0.3,
      z: armZ,
      width: ARM_LENGTH,
      height: 0.2,
      depth: 0.2,
      rotation: { x: 0, y: facing, z: 0 },
      color: 0x3f4449,
      uScale: 1,
      vScale: 1,
    });
    const headX = x + Math.sin(facing) * ARM_LENGTH * 0.72;
    const headZ = z + Math.cos(facing) * ARM_LENGTH * 0.72;
    // Housing with a small visor over each lens.
    groups.box('metalDark', {
      x: headX,
      y: y + HEAD_Y,
      z: headZ,
      width: 0.46,
      height: 1.8,
      depth: 0.42,
      rotation: { x: 0, y: facing, z: 0 },
      color: 0x2c3136,
      uScale: 1,
      vScale: 1,
    });
    for (const offset of [0.52, 0, -0.52]) {
      groups.box('metalDark', {
        x: headX + Math.sin(facing) * 0.24,
        y: y + HEAD_Y + offset,
        z: headZ + Math.cos(facing) * 0.24,
        width: 0.3,
        height: 0.3,
        depth: 0.16,
        rotation: { x: 0, y: facing, z: 0 },
        color: 0x14171a,
        uScale: 2,
        vScale: 2,
      });
    }
  }

  placeLamp(index, colour) {
    const head = this.heads[index];
    if (!head) return;
    const slot = head.slots[colour] ?? head.slots.red;
    this.matrix.makeTranslation(slot[0], slot[1], slot[2]);
    this.lampMesh.setMatrixAt(index, this.matrix);
    this.colour.setHex(LAMP_COLOURS[colour] ?? LAMP_COLOURS.red);
    this.lampMesh.setColorAt(index, this.colour);
    head.colour = colour;
  }

  /** Advances the cycle and moves any lamp whose axis changed colour. */
  update(dt) {
    this.time += dt;
    let changed = false;
    for (const junction of this.junctions) {
      const phase = phaseAt(this.time, junction.offset);
      junction.phase = phase.id;
      const nextNs = phase.ns;
      const nextEw = phase.ew;
      if (nextNs === junction.ns && nextEw === junction.ew) continue;
      junction.ns = nextNs;
      junction.ew = nextEw;
      this.updateCount += 1;
      changed = true;
      for (const head of this.heads) {
        if (head.junction !== junction) continue;
        const wanted = head.governs === 'ns' ? nextNs : nextEw;
        if (wanted !== head.colour) this.placeLamp(head.instance, wanted);
      }
    }
    if (changed) {
      this.lampMesh.instanceMatrix.needsUpdate = true;
      if (this.lampMesh.instanceColor) this.lampMesh.instanceColor.needsUpdate = true;
    }
  }

  /** The signal state for a movement axis at a junction near a point. */
  stateAt(x, z) {
    let best = null;
    let bestDist = Infinity;
    for (const junction of this.junctions) {
      const distance = Math.hypot(junction.x - x, junction.z - z);
      if (distance < bestDist) {
        bestDist = distance;
        best = junction;
      }
    }
    if (!best) return null;
    return { junction: best, ns: best.ns, ew: best.ew, phase: best.phase, distance: bestDist };
  }

  describe() {
    const counts = { green: 0, amber: 0, red: 0 };
    for (const junction of this.junctions) {
      if (junction.ns === 'green') counts.green += 1;
      else if (junction.ns === 'amber') counts.amber += 1;
      else counts.red += 1;
    }
    return `${this.junctions.length} junctions, ${this.heads.length} heads, ns green ${counts.green}/amber ${counts.amber}/red ${counts.red}, t=${this.time.toFixed(1)}s`;
  }
}

export function createTrafficSystem(options) {
  return new TrafficSystem(options);
}
