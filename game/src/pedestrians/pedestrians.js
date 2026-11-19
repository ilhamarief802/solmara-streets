// Pedestrians. They walk the pavement rings the walk network hands them, and at a
// signalised corner some of them take the crossing straight across the street instead of
// turning. They never step off a kerb anywhere else. A speeding car or a sprinting player
// sends them running, but even then they look for pavement to run on.
//
// All of them are drawn from seven InstancedMeshes (torso, head, hat, two legs, two arms),
// so three dozen people cost seven draw calls.

import { Random } from '../core/rng.js';
import { clamp, dampAngle } from '../core/math.js';
import { isWaterAt } from '../world/plan.js';

const COUNT = 32;
const CAPACITY = 48;
const CROSS_SPEED = 1.7;
const FLEE_SPEED = 5.2;
const DESPAWN = 300;
const SPAWN_MIN = 9;
const SPAWN_MAX = 165;
/** Chance a pedestrian wears a hat rather than bare hair. */
const HAT_CHANCE = 0.45;

const JACKETS = [0xd9483d, 0x2f6f8f, 0x3f7d59, 0xc9a24a, 0x8a5a9a, 0xd7d2c6, 0x27313f, 0xb8663a, 0x5f8fd1, 0x9a3f5c];
const PANTS = [0x27313f, 0x3a3f46, 0x5a5148, 0x24303a, 0x6f6a5c, 0x1c2026];
const SKINS = [0xc58a5a, 0x8a5a3a, 0xe0b088, 0x6b4428, 0xb87a4e, 0xd9a97e];
const HATS = [0x2f8f8a, 0x8f2f3a, 0x2a3a4a, 0xd8c28a, 0x3a5a3a];

/** A box whose top face is at y = 0, so a limb pivots where it hangs from. */
function hangingBox(width, height, depth) {
  const geometry = new THREE.BoxGeometry(width, height, depth);
  geometry.translate(0, -height / 2, 0);
  return geometry;
}

/** A box standing on y = 0, optionally lifted, for a torso or a head. */
function standingBox(width, height, depth, offsetY = 0) {
  const geometry = new THREE.BoxGeometry(width, height, depth);
  geometry.translate(0, height / 2 + offsetY, 0);
  return geometry;
}

export class PedestrianSystem {
  constructor({ world, scene, seed = 1, player = null, traffic = null, vehicles = null, count = COUNT }) {
    this.world = world;
    this.scene = scene;
    this.player = player;
    this.traffic = traffic;
    this.vehicles = vehicles;
    this.count = count;
    this.seed = seed;
    this.random = new Random(`${seed}:peds`);
    this.peds = [];
    this.blocks = world.plan.blocks.filter((block) => !isWaterAt(block.cx, block.cz));
    this.focus = { x: player?.position.x ?? 0, z: player?.position.z ?? 0 };
    this.respawnClock = 0;
    this.stats = { fleeing: 0, crossing: 0, spawned: 0 };
    this.clock = 0;

    this.geometry = {
      torso: standingBox(0.46, 0.56, 0.27),
      head: standingBox(0.25, 0.25, 0.23, 0.02),
      hat: standingBox(0.28, 0.14, 0.26, 0.05),
      leg: hangingBox(0.16, 0.82, 0.19),
      arm: hangingBox(0.13, 0.56, 0.15),
    };
    const material = () => new THREE.MeshLambertMaterial({ color: 0xffffff });
    this.meshes = {
      torso: this.makeMesh(this.geometry.torso, material(), 'peds-torso'),
      head: this.makeMesh(this.geometry.head, material(), 'peds-head'),
      hat: this.makeMesh(this.geometry.hat, material(), 'peds-hat'),
      legL: this.makeMesh(this.geometry.leg, material(), 'peds-leg-l'),
      legR: this.makeMesh(this.geometry.leg, material(), 'peds-leg-r'),
      armL: this.makeMesh(this.geometry.arm, material(), 'peds-arm-l'),
      armR: this.makeMesh(this.geometry.arm, material(), 'peds-arm-r'),
    };

    // Scratch objects: draw() builds a few hundred matrices per frame and none of these
    // allocations need to happen twice.
    this.matrix = new THREE.Matrix4();
    this.position = new THREE.Vector3();
    this.scale = new THREE.Vector3();
    this.quaternion = new THREE.Quaternion();
    this.yawQuat = new THREE.Quaternion();
    this.swingQuat = new THREE.Quaternion();
    this.lyingQuat = new THREE.Quaternion();
    this.yAxis = new THREE.Vector3(0, 1, 0);
    this.xAxis = new THREE.Vector3(1, 0, 0);
    this.color = new THREE.Color();

    this.fill();
  }

  makeMesh(geometry, material, name) {
    const mesh = new THREE.InstancedMesh(geometry, material, CAPACITY);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.name = name;
    mesh.count = 0;
    this.scene.add(mesh);
    return mesh;
  }

  /** Re-seeds the crowd and fills the pavements around a point. Shot rig entry. */
  reset(seed, x = this.focus.x, z = this.focus.z, count = this.count) {
    this.seed = seed;
    this.count = count;
    this.random = new Random(`${seed}:peds`);
    this.peds.length = 0;
    this.focus.x = x;
    this.focus.z = z;
    this.fill();
    this.draw(0);
    return this.peds.length;
  }

  setFocus(x, z) {
    this.focus.x = x;
    this.focus.z = z;
  }

  /** Changes the crowd size without reseeding the pavements. The menus call this. */
  setCount(count) {
    const next = Math.max(0, Math.min(CAPACITY, Math.round(count)));
    this.count = next;
    if (this.peds.length > next) this.peds.length = next;
    else if (this.peds.length < next) this.fill();
    this.draw(0);
    return this.peds.length;
  }

  /** A block whose pavement is SPAWN_MIN..SPAWN_MAX metres from the focus. */
  pickBlock() {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const block = this.random.pick(this.blocks);
      const distance = Math.hypot(block.cx - this.focus.x, block.cz - this.focus.z);
      if (distance < SPAWN_MIN || distance > SPAWN_MAX) continue;
      return block;
    }
    // Nothing in the window (the player is off the grid): take the nearest block.
    let best = this.blocks[0];
    let bestDistance = Infinity;
    for (const block of this.blocks) {
      const distance = Math.hypot(block.cx - this.focus.x, block.cz - this.focus.z);
      if (distance >= bestDistance) continue;
      bestDistance = distance;
      best = block;
    }
    return best;
  }

  makePed(chosenBlock = null) {
    const block = chosenBlock ?? this.pickBlock();
    if (!block) return null;
    const corners = this.world.walk.ring(block);

    // Never appear on top of the player: try corners until one is a few steps away.
    let corner = this.random.int(0, 3);
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const candidate = corners[corner];
      if (Math.hypot(candidate.x - this.focus.x, candidate.z - this.focus.z) > 5) break;
      corner = (corner + 1) % 4;
    }
    const start = corners[corner];
    const nextIndex = (corner + 1) % 4;
    const hatRoll = this.random.float();

    return {
      id: `ped-${this.stats.spawned + this.peds.length + 1}`,
      block,
      corner,
      target: corners[nextIndex],
      nextCorner: nextIndex,
      nextBlock: block,
      mode: 'ring',
      x: start.x,
      z: start.z,
      heading: this.random.range(0, Math.PI * 2),
      speed: this.random.range(0.9, 1.5),
      height: this.random.range(0.9, 1.1),
      phase: this.random.range(0, Math.PI * 2),
      jacket: this.random.pick(JACKETS),
      pants: this.random.pick(PANTS),
      skin: this.random.pick(SKINS),
      hat: hatRoll < HAT_CHANCE ? this.random.pick(HATS) : null,
      health: 100,
      dead: false,
      deadTimer: 0,
      fleeTimer: 0,
      fleeCooldown: 0,
      threat: { x: 0, z: 0 },
      settled: 2,
    };
  }

  /**
   * Adds peds on the pavements around a point, walking those blocks' rings. The street
   * shot uses this to guarantee a living crowd in the frame.
   */
  placeAround(x, z, count = 6, radius = 50) {
    const walk = this.world.walk;
    const block =
      walk.blockContaining(x, z) ??
      this.blocks.find((candidate) => Math.hypot(candidate.cx - x, candidate.cz - z) < radius) ??
      this.pickBlock();
    if (!block) return 0;

    const corners = walk.ring(block);
    const edges = corners.map((from, index) => {
      const to = corners[(index + 1) % 4];
      return { from, to, length: Math.hypot(to.x - from.x, to.z - from.z) };
    });
    const perimeter = edges.reduce((sum, edge) => sum + edge.length, 0);

    // Walk the ring from the corner nearest the player, measured in metres of perimeter.
    const nearest = walk.nearestCorner(block, x, z);
    let start = 0;
    for (let index = 0; index < nearest.corner; index += 1) start += edges[index].length;

    const pointAt = (distance) => {
      let rest = ((distance % perimeter) + perimeter) % perimeter;
      for (let index = 0; index < 4; index += 1) {
        const edge = edges[index];
        if (rest <= edge.length) {
          const t = rest / edge.length;
          return {
            x: edge.from.x + (edge.to.x - edge.from.x) * t,
            z: edge.from.z + (edge.to.z - edge.from.z) * t,
            edge: index,
          };
        }
        rest -= edge.length;
      }
      return { x: corners[0].x, z: corners[0].z, edge: 0 };
    };

    let placed = 0;
    for (let index = 1; index <= count; index += 1) {
      const ped = this.makePed(block);
      if (!ped) continue;
      // A loose line down the pavement from where the player stands: 4 m, 10 m, 16 m...
      const direction = index % 2 === 0 ? -1 : 1;
      const distance = start + direction * (3.5 + Math.floor(index / 2) * 7 + this.random.range(0, 2));
      const point = pointAt(distance);
      const nextIndex = (point.edge + 1) % 4;
      ped.x = point.x;
      ped.z = point.z;
      ped.corner = point.edge;
      ped.nextCorner = nextIndex;
      ped.nextBlock = block;
      ped.target = corners[nextIndex];
      ped.heading = Math.atan2(ped.target.x - ped.x, ped.target.z - ped.z);
      this.peds.push(ped);
      placed += 1;
    }
    return placed;
  }

  fill() {
    let guard = 0;
    while (this.peds.length < this.count && guard < this.count * 12) {
      guard += 1;
      const ped = this.makePed();
      if (ped) this.peds.push(ped);
    }
    this.stats.spawned += this.peds.length;
  }

  /** Chooses the next leg: across the street at a signalised corner, or around it. */
  decideNext(ped) {
    const walk = this.world.walk;
    const crossing = walk.crossingFrom(ped.block, ped.corner);
    if (crossing && ped.settled > 0 && this.random.chance(0.36)) {
      ped.mode = 'crossing';
      ped.nextBlock = crossing.block;
      ped.nextCorner = crossing.corner;
      ped.target = crossing.to;
      ped.settled = 0;
      this.stats.crossing += 1;
      return;
    }
    const corners = walk.ring(ped.block);
    const next = (ped.corner + 1) % 4;
    ped.nextCorner = next;
    ped.nextBlock = ped.block;
    ped.target = corners[next];
    ped.mode = 'ring';
    ped.settled += 1;
  }

  /** Starts a run away from a threat, if the ped is free to react. */
  startle(ped, x, z) {
    if (ped.fleeCooldown > 0) return;
    const dx = ped.x - x;
    const dz = ped.z - z;
    const distance = Math.hypot(dx, dz) || 1;
    ped.threat.x = dx / distance;
    ped.threat.z = dz / distance;
    ped.fleeTimer = 1.5 + this.random.float() * 1.4;
    ped.fleeCooldown = 3.4;
  }

  /** A direction for a fleeing ped that stays on pavement; null when boxed in. */
  fleeDirection(ped, step) {
    const walk = this.world.walk;
    const base = Math.atan2(ped.threat.x, ped.threat.z);
    // Try straight away from the threat first, then wider and wider angles.
    const offsets = [0, 0.5, -0.5, 1.0, -1.0, 1.6, -1.6, Math.PI];
    for (const offset of offsets) {
      const angle = base + offset;
      const nx = ped.x + Math.sin(angle) * step;
      const nz = ped.z + Math.cos(angle) * step;
      if (this.world.colliders?.blockedAt?.(nx, nz, 0.24)) continue;
      const surface = walk.surfaceAt(nx, nz);
      if (surface.kind === 'pavement') return { x: nx, z: nz };
      // A ped already in the crossing may keep running along it.
      if (ped.mode === 'crossing' && surface.kind === 'road') return { x: nx, z: nz };
    }
    return null;
  }

  update(dt) {
    this.clock += dt;
    if (this.player) this.setFocus(this.player.position.x, this.player.position.z);
    let fleeing = 0;
    let crossing = 0;
    for (const ped of this.peds) {
      if (ped.dead) {
        ped.deadTimer = (ped.deadTimer ?? 0) - dt;
        continue;
      }
      if (ped.fleeCooldown > 0) ped.fleeCooldown -= dt;
      this.threaten(ped, dt);
      this.stepPed(ped, dt);
      if (ped.fleeTimer > 0) fleeing += 1;
      if (ped.mode === 'crossing') crossing += 1;
    }
    this.stats.fleeing = fleeing;
    this.stats.crossing = crossing;
    this.draw(dt);

    this.respawnClock -= dt;
    if (this.respawnClock <= 0) {
      this.respawnClock = 2.2;
      this.stream();
    }
  }

  /** A speeding car heading at them, or the player sprinting, sends a ped running. */
  threaten(ped, dt) {
    const cars = this.traffic?.cars;
    if (cars) {
      for (const car of cars) {
        if (Math.abs(car.speed) < 3) continue;
        const dx = car.x - ped.x;
        const dz = car.z - ped.z;
        const distanceSq = dx * dx + dz * dz;
        if (distanceSq > 100) continue;
        // Positive when the pedestrian is in front of the car, not behind it.
        const ahead = (dx * Math.sin(car.heading) + dz * Math.cos(car.heading)) / Math.sqrt(distanceSq || 1);
        if (ahead < -0.2) {
          this.startle(ped, car.x, car.z);
          break;
        }
      }
    }

    const player = this.player;
    if (player && player.mode === 'foot' && player.speed > 5.5) {
      const dx = player.position.x - ped.x;
      const dz = player.position.z - ped.z;
      if (dx * dx + dz * dz < 42) this.startle(ped, player.position.x, player.position.z);
    }
    if (ped.fleeTimer > 0) ped.fleeTimer -= dt;
  }

  /** Rejoins the pavement ring at the nearest corner and resumes walking. */
  settle(ped) {
    const block = this.world.walk.blockContaining(ped.x, ped.z) ?? ped.block;
    const corners = this.world.walk.ring(block);
    const nearest = this.world.walk.nearestCorner(block, ped.x, ped.z);
    ped.block = block;
    ped.corner = nearest.corner;
    ped.x = corners[nearest.corner].x;
    ped.z = corners[nearest.corner].z;
    const next = (nearest.corner + 1) % 4;
    ped.nextCorner = next;
    ped.nextBlock = block;
    ped.target = corners[next];
    ped.mode = 'ring';
    ped.settled = 1;
  }

  stepPed(ped, dt) {
    if (ped.fleeTimer > 0) {
      const next = this.fleeDirection(ped, FLEE_SPEED * dt);
      if (!next) {
        ped.speed = 0;
        return;
      }
      ped.heading = dampAngle(ped.heading, Math.atan2(next.x - ped.x, next.z - ped.z), 12, dt);
      ped.x = next.x;
      ped.z = next.z;
      ped.speed = FLEE_SPEED;
      ped.phase += dt * 12;
      ped.mode = 'flee';
      return;
    }

    if (ped.mode === 'flee') this.settle(ped);

    const dx = ped.target.x - ped.x;
    const dz = ped.target.z - ped.z;
    const distance = Math.hypot(dx, dz);
    const speed = ped.mode === 'crossing' ? CROSS_SPEED : ped.speed;

    if (distance < 0.16) {
      ped.x = ped.target.x;
      ped.z = ped.target.z;
      if (ped.mode === 'crossing') {
        // Arrived on the far kerb: the target block is now home.
        ped.block = ped.nextBlock;
        ped.corner = ped.nextCorner;
        ped.mode = 'ring';
      } else {
        ped.corner = ped.nextCorner;
      }
      this.decideNext(ped);
      return;
    }

    const step = Math.min(speed * dt, distance);
    const nx = ped.x + (dx / distance) * step;
    const nz = ped.z + (dz / distance) * step;

    // A wall between here and the next corner: drop the crossing and take the next leg.
    if (this.world.colliders?.blockedAt?.(nx, nz, 0.24)) {
      if (ped.mode === 'crossing') ped.mode = 'ring';
      const corners = this.world.walk.ring(ped.block);
      ped.corner = (ped.corner + 1) % 4;
      ped.nextCorner = (ped.corner + 1) % 4;
      ped.target = corners[ped.nextCorner];
      ped.heading = Math.atan2(ped.target.x - ped.x, ped.target.z - ped.z);
      return;
    }

    ped.x = nx;
    ped.z = nz;
    ped.heading = dampAngle(ped.heading, Math.atan2(dx, dz), 7, dt);
    ped.phase += step * 5.6;

    // Keep clear of the player's body without leaving the pavement.
    const player = this.player;
    if (player && player.mode === 'foot') {
      const px = ped.x - player.position.x;
      const pz = ped.z - player.position.z;
      const length = Math.hypot(px, pz);
      if (length < 0.7 && length > 0.001) {
        const push = (0.7 - length) / length;
        ped.x += px * push;
        ped.z += pz * push;
      }
    }
  }

  /** Writes the seven instanced meshes from the ped list. */
  draw(dt) {
    const meshes = this.meshes;
    const sway = Math.sin(this.clock * 1.6) * 0.02;
    let hats = 0;

    for (let index = 0; index < this.peds.length; index += 1) {
      const ped = this.peds[index];
      const { height } = ped;
      const cos = Math.cos(ped.heading);
      const sin = Math.sin(ped.heading);
      this.yawQuat.setFromAxisAngle(this.yAxis, ped.heading);
      this.scale.set(height, height, height);

      /** Places one part at a body-local offset, optionally swung about the X axis. */
      const place = (mesh, baseY, offsetX, offsetY, offsetZ, swingAngle, colorHex, at = index) => {
        this.position.set(
          ped.x + offsetX * cos + offsetZ * sin,
          baseY + offsetY * height,
          ped.z - offsetX * sin + offsetZ * cos,
        );
        if (swingAngle) {
          this.swingQuat.setFromAxisAngle(this.xAxis, swingAngle);
          this.quaternion.copy(this.yawQuat).multiply(this.swingQuat);
        } else {
          this.quaternion.copy(this.yawQuat);
        }
        this.matrix.compose(this.position, this.quaternion, this.scale);
        mesh.setMatrixAt(at, this.matrix);
        mesh.setColorAt(at, this.color.set(colorHex));
      };

      // A body on the ground: the same seven boxes, laid flat in a loose heap. The hit
      // particles already told the story; this only has to read at a glance.
      if (ped.dead) {
        this.lyingQuat.setFromAxisAngle(this.xAxis, -1.42);
        this.quaternion.copy(this.yawQuat).multiply(this.lyingQuat);
        const lay = (mesh, offsetX, offsetZ, colorHex, at = index) => {
          this.position.set(ped.x + offsetX * cos + offsetZ * sin, 0.24, ped.z - offsetX * sin + offsetZ * cos);
          this.matrix.compose(this.position, this.quaternion, this.scale);
          mesh.setMatrixAt(at, this.matrix);
          mesh.setColorAt(at, this.color.set(colorHex));
        };
        lay(meshes.torso, 0, 0, ped.jacket);
        lay(meshes.head, 0, 0.5, ped.skin);
        if (ped.hat) {
          lay(meshes.hat, 0, 0.62, ped.hat, hats);
          hats += 1;
        }
        lay(meshes.legL, -0.1, -0.5, ped.pants);
        lay(meshes.legR, 0.12, -0.46, ped.pants);
        lay(meshes.armL, -0.28, 0.1, ped.jacket);
        lay(meshes.armR, 0.28, 0.16, ped.jacket);
        continue;
      }

      // A walking body: hips at 0.84 of the ped's height, limbs swinging about the joint.
      const moving = clamp(ped.speed / 2.2, 0, 1);
      const swing = Math.sin(ped.phase) * (0.3 + clamp(ped.speed / 5, 0, 1) * 0.52) * (ped.speed > 0.1 ? 1 : 0);
      const hip = 0.84 * height;

      place(meshes.torso, hip, 0, 0, 0, sway * (1 - moving), ped.jacket);
      place(meshes.head, hip, 0, 0.56, 0.01, 0, ped.skin);
      if (ped.hat) {
        place(meshes.hat, hip, 0, 0.78, 0.01, 0, ped.hat, hats);
        hats += 1;
      }
      place(meshes.legL, hip, -0.11, 0, 0, swing, ped.pants);
      place(meshes.legR, hip, 0.11, 0, 0, -swing, ped.pants);
      place(meshes.armL, hip, -0.29, 0.46, 0, -swing * 0.75, ped.jacket);
      place(meshes.armR, hip, 0.29, 0.46, 0, swing * 0.75, ped.jacket);
    }

    for (const mesh of [meshes.torso, meshes.head, meshes.legL, meshes.legR, meshes.armL, meshes.armR]) {
      mesh.count = this.peds.length;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    meshes.hat.count = hats;
    meshes.hat.instanceMatrix.needsUpdate = true;
    if (meshes.hat.instanceColor) meshes.hat.instanceColor.needsUpdate = true;
  }

  stream() {
    const focus = this.focus;
    for (let index = this.peds.length - 1; index >= 0; index -= 1) {
      const ped = this.peds[index];
      const gone = Boolean(ped.dead) && (ped.deadTimer ?? 0) <= 0;
      if (!gone && Math.hypot(ped.x - focus.x, ped.z - focus.z) <= DESPAWN) continue;
      const replacement = this.makePed();
      if (replacement) this.peds[index] = replacement;
      else this.peds.splice(index, 1);
    }

    let guard = 0;
    while (this.peds.length < this.count && guard < 20) {
      guard += 1;
      const ped = this.makePed();
      if (ped) this.peds.push(ped);
    }
  }

  get info() {
    return {
      count: this.peds.length,
      crossing: this.stats.crossing,
      fleeing: this.stats.fleeing,
      drawn: this.peds.length,
    };
  }
}
