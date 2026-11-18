// Traffic. Every car is an agent on the plan's lane graph: it accelerates down its lane,
// brakes for the car in front, queues at a red light, picks a new lane at the junction it
// arrives at, and is retired and replaced when it strays too far from the player. Thirty
// cars are alive at once by default; the whole thing is seeded, so the same seed always
// starts the same jam. Rendering is the vehicle system's instanced fleet.

import { Random } from '../core/rng.js';
import { clamp } from '../core/math.js';
import { TRAFFIC_MIX, TYPE_PAINT } from '../vehicles/models.js';

const COUNT = 30;
const DESPAWN = 320;
const SPAWN_MIN = 55;
const SPAWN_MAX = 230;
const SIGNAL_CYCLE = 26;
const SIGNAL_GREEN = 11;
const SIGNAL_AMBER = 3.2;

const CAR_COLORS = [
  0xb8bcc0, 0x2f3c4a, 0x7a232b, 0x24585a, 0xcbb073, 0x3b3f46, 0xe4ded0,
  0x365a8a, 0x6d2f45, 0x4e6a3f, 0xd0d4d8, 0x8a5a2b, 0x9a9a94,
];

/** Weighted type pick, resolved once per car from the seeded stream. */
function pickType(random) {
  let total = 0;
  for (const entry of TRAFFIC_MIX) total += entry.weight;
  let roll = random.float() * total;
  for (const entry of TRAFFIC_MIX) {
    roll -= entry.weight;
    if (roll <= 0) return entry.type;
  }
  return 'sedan';
}

export class TrafficSystem {
  constructor({ world, seed = 1, player = null, vehicles = null, count = COUNT }) {
    this.world = world;
    this.player = player;
    this.vehicles = vehicles;
    this.count = count;
    this.seed = seed;
    this.random = new Random(`${seed}:traffic`);
    this.cars = [];
    this.elapsed = 0;
    this.focusPoint = { x: player?.position.x ?? 0, z: player?.position.z ?? 0 };
    this.respawnClock = 0;
    this.stats = { spawns: 0, despawns: 0, stops: 0, nearest: 0 };
    this.brakeLights = 0;

    // Lane bookkeeping: which way each lane leaves and arrives, and where lanes begin.
    this.lanesFrom = new Map();
    for (const lane of world.plan.lanes) {
      lane.startNode = lane.offset > 0 ? lane.edge.a : lane.edge.b;
      lane.endNode = lane.offset > 0 ? lane.edge.b : lane.edge.a;
      lane.axis = lane.edge.axis;
      lane.midX = (lane.from.x + lane.to.x) / 2;
      lane.midZ = (lane.from.z + lane.to.z) / 2;
      const list = this.lanesFrom.get(lane.endNode);
      if (list) list.push(lane);
      else this.lanesFrom.set(lane.endNode, [lane]);
    }
    this.lanes = world.plan.lanes;
    this.fill();
  }

  /** Re-seeds the jam and fills the streets around a point. Used by the shot rig. */
  reset(seed, x = this.focusPoint.x, z = this.focusPoint.z, count = this.count) {
    this.seed = seed;
    this.count = count;
    this.random = new Random(`${seed}:traffic`);
    this.cars.length = 0;
    this.elapsed = 0;
    this.focusPoint.x = x;
    this.focusPoint.z = z;
    this.fill();
    return this.cars.length;
  }

  /** Depending on distance to the player, the point new cars appear around. */
  setFocus(x, z) {
    this.focusPoint.x = x;
    this.focusPoint.z = z;
  }

  /** Fills the streets up to `count` cars, deterministically. */
  fill() {
    let guard = 0;
    while (this.cars.length < this.count && guard < this.count * 24) {
      guard += 1;
      const car = this.makeCar();
      if (car) this.cars.push(car);
    }
    this.stats.spawns += this.cars.length;
  }

  /** A lane near the focus, far enough away to appear unseen, with room on it. */
  pickSpawnLane() {
    for (let attempt = 0; attempt < 26; attempt += 1) {
      const lane = this.random.pick(this.lanes);
      const distance = Math.hypot(lane.midX - this.focusPoint.x, lane.midZ - this.focusPoint.z);
      if (distance < SPAWN_MIN || distance > SPAWN_MAX) continue;
      return lane;
    }
    return this.random.pick(this.lanes);
  }

  makeCar(lane = null, s = null) {
    const chosen = lane ?? this.pickSpawnLane();
    if (!chosen) return null;
    const along = s ?? this.random.range(6, Math.max(8, chosen.length - 8));
    const x = chosen.from.x + chosen.dirX * along;
    const z = chosen.from.z + chosen.dirZ * along;
    // Keep a gap from anything already on this stretch.
    for (const other of this.cars) {
      if (other.lane !== chosen) continue;
      if (Math.abs(other.s - along) < 12) return null;
    }
    const type = pickType(this.random);
    const color = TYPE_PAINT[type] ?? this.random.pick(CAR_COLORS);
    return {
      id: `traffic-${this.stats.spawns + this.cars.length + 1}-${this.random.int(0, 9999)}`,
      lane: chosen,
      s: along,
      speed: this.random.range(4, 9),
      factor: this.random.range(0.85, 1.08),
      desired: chosen.speed * this.random.range(0.85, 1.08),
      type,
      color,
      x,
      z,
      y: 0.09,
      heading: Math.atan2(chosen.dirX, chosen.dirZ),
      nextLane: null,
      patience: 0,
      braking: false,
      wheelSpin: this.random.range(0, 6),
      driver: this.random.int(0, 999),
    };
  }

  /** The lane whose direction matches a heading and whose line passes near a point. */
  laneNear(x, z, heading, tolerance = 14) {
    const fx = Math.sin(heading);
    const fz = Math.cos(heading);
    let best = null;
    let bestScore = Infinity;
    for (const lane of this.lanes) {
      const dot = lane.dirX * fx + lane.dirZ * fz;
      if (dot < 0.7) continue;
      const px = x - lane.from.x;
      const pz = z - lane.from.z;
      const along = px * lane.dirX + pz * lane.dirZ;
      const perp = Math.abs(px * lane.dirZ - pz * lane.dirX);
      if (perp > tolerance) continue;
      // How far the point is outside this lane's actual stretch, so a lane in the same
      // street two blocks away is not mistaken for the one under the car.
      const outside = along < 0 ? -along : along > lane.length ? along - lane.length : 0;
      if (outside > 40) continue;
      const score = perp + outside * 1.5;
      if (score < bestScore) {
        bestScore = score;
        best = { lane, along };
      }
    }
    return best;
  }

  /**
   * Puts a small platoon in the lane ahead of a point. The drive shot uses this so the
   * frame is guaranteed to have traffic in it; it is deterministic from the seed.
   */
  placeAhead(x, z, heading, { distance = 32, count = 3, spacing = 16 } = {}) {
    const found = this.laneNear(x, z, heading);
    if (!found) return 0;
    let placed = 0;
    for (let index = 0; index < count; index += 1) {
      const s = clamp(found.along + distance + index * spacing, 4, found.lane.length - 10);
      const car = this.makeCar(found.lane, s);
      if (car) {
        this.cars.push(car);
        placed += 1;
      }
    }
    return placed;
  }

  /** The state of the light facing a lane at a junction. */
  lightFor(node, axis) {
    const signals = this.world.props?.signals;
    const elapsed = signals ? signals.elapsed : this.elapsed;
    const offset = ((node.i * 3 + node.j * 5) % 26) * 0.9;
    const phase = (elapsed + offset + (axis === 'v' ? SIGNAL_CYCLE / 2 : 0)) % SIGNAL_CYCLE;
    if (phase < SIGNAL_GREEN) return 'green';
    if (phase < SIGNAL_GREEN + SIGNAL_AMBER) return 'amber';
    return 'red';
  }

  /** Chooses the lane a car takes at the end of its current one. */
  chooseNext(lane) {
    const options = this.lanesFrom.get(lane.endNode);
    if (!options || !options.length) return null;
    let total = 0;
    const weighted = [];
    for (const option of options) {
      const dot = option.dirX * lane.dirX + option.dirZ * lane.dirZ;
      if (dot < -0.55) continue; // no U-turns at a junction
      if (option === lane) continue;
      const cross = lane.dirX * option.dirZ - lane.dirZ * option.dirX;
      let weight = dot > 0.7 ? 5 : cross < 0 ? 2.4 : 1.6;
      if (option.edge.bridge) weight *= 0.5;
      weighted.push({ lane: option, weight });
      total += weight;
    }
    if (!weighted.length) return null;
    let roll = this.random.float() * total;
    for (const entry of weighted) {
      roll -= entry.weight;
      if (roll <= 0) return entry.lane;
    }
    return weighted[weighted.length - 1].lane;
  }

  /** A gap, in metres, to the nearest thing in this car's path. */
  pathGap(car) {
    const fx = Math.sin(car.heading);
    const fz = Math.cos(car.heading);
    const rx = Math.cos(car.heading);
    const rz = -Math.sin(car.heading);
    let gap = Infinity;
    const consider = (x, z, halfWidth) => {
      const dx = x - car.x;
      const dz = z - car.z;
      const ahead = dx * fx + dz * fz;
      if (ahead <= 0) return;
      const side = Math.abs(dx * rx + dz * rz);
      if (side > halfWidth + 1.55) return;
      if (ahead < gap) gap = ahead;
    };
    for (const other of this.cars) {
      if (other === car) continue;
      if (Math.abs(other.x - car.x) > 30 || Math.abs(other.z - car.z) > 30) continue;
      consider(other.x, other.z, 1.05);
    }
    const playerCar = this.vehicles?.activeCar;
    if (playerCar) consider(playerCar.x, playerCar.z, 1.2);
    if (this.player && this.player.mode === 'foot') consider(this.player.position.x, this.player.position.z, 0.4);
    return gap;
  }

  update(dt) {
    this.elapsed += dt;
    if (this.player) this.setFocus(this.player.position.x, this.player.position.z);
    this.respawnClock -= dt;

    let stops = 0;
    for (let index = 0; index < this.cars.length; index += 1) {
      const car = this.cars[index];
      this.stepCar(car, dt);
      if (car.speed < 0.35) stops += 1;
    }
    this.stats.stops = stops;

    // Stream: retire cars behind the player and bring new ones in ahead.
    if (this.respawnClock <= 0) {
      this.respawnClock = 1.4;
      this.stream();
    }
  }

  /** Moves one car along its lane, obeying the car ahead and the light. */
  stepCar(car, dt) {
    const lane = car.lane;
    const remaining = lane.length - car.s;
    const next = car.nextLane ?? this.chooseNext(lane);
    if (!car.nextLane) car.nextLane = next;

    // Turning costs speed: the sharper the turn, the slower the entry.
    let desired = car.desired;
    if (next) {
      const dot = next.dirX * lane.dirX + next.dirZ * lane.dirZ;
      if (dot < 0.72) desired = Math.min(desired, dot < 0.2 ? 5.6 : 7.6);
    }

    // The car or body ahead.
    const gap = this.pathGap(car);
    if (gap < 18) {
      const allowed = Math.sqrt(Math.max(0, (gap - 4.2) * 3.4));
      if (allowed < desired) desired = Math.max(0, allowed);
    }
    // A stopped queue is a stop, even if its tail is out of sight.
    if (gap < 3.4) desired = 0;
    car.braking = desired < car.speed - 0.5;

    // The light at the end of the lane.
    const node = this.world.plan.nodeById.get(lane.endNode);
    if (node && node.signal && remaining < 18 && remaining > 0) {
      const light = this.lightFor(node, lane.axis);
      const stopAt = remaining - 5.2;
      if (light === 'red' || (light === 'amber' && stopAt > 3)) {
        if (stopAt < desired * 1.2) desired = Math.max(0, stopAt * 0.55);
      }
    }

    const rate = desired < car.speed ? 9.5 : 3.4;
    car.speed = approach(car.speed, desired, rate * dt);
    car.s = car.s + car.speed * dt;

    // Lane change at the junction.
    let guard = 0;
    while (car.s >= car.lane.length && guard < 4) {
      guard += 1;
      const following = car.nextLane ?? this.chooseNext(car.lane);
      if (!following) {
        car.s = 0;
        car.lane = this.pickSpawnLane();
        car.nextLane = null;
        break;
      }
      car.s -= car.lane.length;
      car.lane = following;
      car.nextLane = null;
    }
    if (car.s < 0) car.s = 0;

    const cl = car.lane;
    car.x = cl.from.x + cl.dirX * car.s;
    car.z = cl.from.z + cl.dirZ * car.s;
    car.heading = Math.atan2(cl.dirX, cl.dirZ);
    car.y = 0.09;
    car.wheelSpin += car.speed * dt * 2.4;
    car.desired = cl.speed * car.factor;
  }

  stream() {
    const focus = this.focusPoint;
    for (let index = this.cars.length - 1; index >= 0; index -= 1) {
      const car = this.cars[index];
      const distance = Math.hypot(car.x - focus.x, car.z - focus.z);
      if (distance > DESPAWN) {
        this.cars.splice(index, 1);
        this.stats.despawns += 1;
      }
    }
    let guard = 0;
    while (this.cars.length < this.count && guard < 40) {
      guard += 1;
      const car = this.makeCar();
      if (car) this.cars.push(car);
    }
  }

  nearestCar(x, z, maxDistance = 4) {
    let best = null;
    let bestDistance = maxDistance;
    for (const car of this.cars) {
      const distance = Math.hypot(car.x - x, car.z - z);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = { car, distance };
      }
    }
    return best;
  }

  /** Removes a car from the flow; the player is about to drive it. */
  stealCar(car) {
    const index = this.cars.indexOf(car);
    if (index === -1) return null;
    this.cars.splice(index, 1);
    this.stats.despawns += 1;
    return { type: car.type, color: car.color, x: car.x, z: car.z, heading: car.heading };
  }

  /** A knock from the player's car sends a traffic car lurching. */
  bump(car, amount) {
    if (!car) return;
    car.speed = Math.max(0, car.speed - amount);
    car.patience = 1.2;
  }

  get info() {
    return {
      count: this.cars.length,
      moving: this.cars.filter((car) => car.speed > 0.35).length,
      stopped: this.stats.stops,
      spawns: this.stats.spawns,
      despawns: this.stats.despawns,
    };
  }
}

function approach(value, target, step) {
  if (value < target) return Math.min(value + step, target);
  if (value > target) return Math.max(value - step, target);
  return value;
}
