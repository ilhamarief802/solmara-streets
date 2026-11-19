// Cars in the world. Owns the kerbside fleet (streamed from the walk network's parking
// spots), the instanced renderer shared with traffic, and the one car the player can be
// sitting in. Enter with F/E near a car: the car becomes a real body with a paint job and
// spinning wheels, the camera takes the chase, F again steps out at the driver's door and
// the car is left parked where it stopped.

import { getCarModel, buildCarGroup, CAR_PAINT, paintFor } from './models.js';
import { Car } from './car.js';
import { Random } from '../core/rng.js';
import { bus } from '../core/events.js';

const FLEET_CAPACITY = 40;
const STREAM_RADIUS = 200;
const MAX_PARKED_DRAWN = 26;

/** The instanced pool: one shell and one trim mesh per body type. */
class Fleet {
  constructor(scene) {
    this.scene = scene;
    this.types = new Map();
    this.entries = new Map();
    this.matrix = new THREE.Matrix4();
    this.quaternion = new THREE.Quaternion();
    this.position = new THREE.Vector3();
    this.scale = new THREE.Vector3(1, 1, 1);
    this.euler = new THREE.Euler();
    this.drawn = 0;
  }

  ensure(type) {
    let entry = this.types.get(type);
    if (entry) return entry;
    const model = getCarModel(type);
    const shell = new THREE.InstancedMesh(
      model.shell,
      new THREE.MeshLambertMaterial({ vertexColors: true }),
      FLEET_CAPACITY,
    );
    const trim = new THREE.InstancedMesh(
      model.wheels,
      new THREE.MeshLambertMaterial({ vertexColors: true }),
      FLEET_CAPACITY,
    );
    shell.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    trim.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    shell.frustumCulled = false;
    trim.frustumCulled = false;
    shell.name = `fleet-${type}-shell`;
    trim.name = `fleet-${type}-wheels`;
    shell.castShadow = false;
    this.scene.add(shell, trim);
    entry = { model, shell, trim, count: 0 };
    this.types.set(type, entry);
    this.entries.set(type, []);
    return entry;
  }

  begin() {
    for (const list of this.entries.values()) list.length = 0;
  }

  add(type, x, y, z, heading, colorHex) {
    if (!this.entries.has(type)) this.ensure(type);
    const list = this.entries.get(type);
    if (list.length < FLEET_CAPACITY) list.push({ x, y, z, heading, color: colorHex });
  }

  end() {
    let drawn = 0;
    for (const [type, list] of this.entries) {
      const entry = this.types.get(type);
      for (let index = 0; index < list.length; index += 1) {
        const item = list[index];
        this.euler.set(0, item.heading, 0);
        this.quaternion.setFromEuler(this.euler);
        this.position.set(item.x, item.y, item.z);
        this.matrix.compose(this.position, this.quaternion, this.scale);
        entry.shell.setMatrixAt(index, this.matrix);
        entry.trim.setMatrixAt(index, this.matrix);
        entry.shell.setColorAt(index, _color.set(item.color));
      }
      entry.shell.count = list.length;
      entry.trim.count = list.length;
      entry.shell.instanceMatrix.needsUpdate = true;
      entry.trim.instanceMatrix.needsUpdate = true;
      if (entry.shell.instanceColor) entry.shell.instanceColor.needsUpdate = true;
      entry.shell.computeBoundingSphere?.();
      entry.trim.computeBoundingSphere?.();
      drawn += list.length;
    }
    this.drawn = drawn;
  }
}

const _color = new THREE.Color();
const CAR_NAMES = { sedan: 'Sedan', coupe: 'Coupe', van: 'Van', taxi: 'Taxi', police: 'Police cruiser', buggy: 'Beach buggy' };

export class VehicleSystem {
  constructor({ world, scene, player, seed = 1, traffic = null }) {
    this.world = world;
    this.scene = scene;
    this.player = player;
    this.traffic = traffic;
    this.random = new Random(`${seed}:vehicles`);
    this.fleet = new Fleet(scene);
    this.activeCar = null;
    this.visibleParked = [];
    this.refreshClock = 0;
    this.taken = new Set();
    this.released = [];
    this.stats = { parked: world.walk.parking.length, driven: 0, stolen: 0 };

    // Stream the kerbside cars around wherever the player is.
    this.refresh(this.player.position.x, this.player.position.z, true);
  }

  setTraffic(traffic) {
    this.traffic = traffic;
  }

  /** Records of parked cars near a point, nearest first. */
  refresh(x, z, force = false) {
    if (!force) {
      this.refreshClock -= 1;
      if (this.refreshClock > 0) return;
    }
    this.refreshClock = 8;
    const all = this.world.walk.parking
      .filter((spot) => !this.taken.has(spot.id))
      .map((spot) => ({ ...spot, distance: Math.hypot(spot.x - x, spot.z - z) }))
      .filter((spot) => spot.distance < STREAM_RADIUS)
      .sort((a, b) => a.distance - b.distance);
    this.visibleParked = all.slice(0, MAX_PARKED_DRAWN);
  }

  /** Nearest car the player could get into: a parked one, then a live traffic car. */
  nearestStealable(x, z, maxDistance = 3.6) {
    let best = null;
    let bestDistance = maxDistance;
    for (const spot of this.visibleParked) {
      const distance = Math.hypot(spot.x - x, spot.z - z);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = { kind: 'parked', spot };
      }
    }
    if (this.traffic) {
      const live = this.traffic.nearestCar(x, z, maxDistance);
      if (live && live.distance < bestDistance) best = { kind: 'traffic', car: live.car, distance: live.distance };
    }
    return best;
  }

  /** F near a car: steal it. Returns true when the player is now driving. */
  tryEnter(player) {
    if (this.activeCar) {
      this.exit(player);
      return false;
    }
    const found = this.nearestStealable(player.position.x, player.position.z, 3.8);
    if (!found) return false;
    let type;
    let paint;
    let x;
    let z;
    let heading;
    if (found.kind === 'parked') {
      const spot = found.spot;
      this.taken.add(spot.id);
      type = spot.type;
      paint = spot.color;
      x = spot.x;
      z = spot.z;
      heading = spot.heading;
    } else {
      const stolen = this.traffic.stealCar(found.car);
      if (!stolen) return false;
      type = stolen.type;
      paint = stolen.color;
      x = stolen.x;
      z = stolen.z;
      heading = stolen.heading;
    }
    const model = getCarModel(type);
    const car = new Car({ model, paint, x, z, heading, world: this.world, name: CAR_NAMES[type] ?? 'Car' });
    const view = buildCarGroup(type, paint);
    this.scene.add(view.group);
    car.view = view;
    car.syncView(0.016);
    this.activeCar = car;
    player.enterCar(car);
    this.stats.stolen += 1;
    this.stats.driven = (this.stats.driven ?? 0) + 1;
    if (this.world.state) {
      this.world.state.carsStolen = this.stats.stolen;
      this.world.state.mode = 'driving';
      this.world.state.vehicle = CAR_NAMES[type] ?? 'Car';
    }
    this.refresh(player.position.x, player.position.z, true);
    bus.emit('vehicle:enter', { type, name: car.name, x, z });
    return true;
  }

  /** F again: step out at the driver's door and leave the car parked. */
  exit(player) {
    const car = this.activeCar;
    if (!car) return false;
    const spot = car.exitSpot(-1);
    player.exitCar(car, spot.x, spot.z, car.heading + Math.PI * 0.5);
    this.scene.remove(car.view.group);
    car.view = null;
    const record = {
      id: `left-${this.released.length + 1}`,
      x: car.x,
      z: car.z,
      heading: car.heading,
      type: car.type,
      color: car.paint,
      distance: 0,
    };
    this.released.unshift(record);
    // Released cars live in the walk network's own list from now on.
    this.world.walk.parking.unshift(record);
    this.refresh(player.position.x, player.position.z, true);
    this.activeCar = null;
    if (this.world.state) {
      this.world.state.mode = 'foot';
      this.world.state.vehicle = null;
    }
    bus.emit('vehicle:exit', { type: car.type, x: car.x, z: car.z });
    return true;
  }

  /** Pushes a walking body out of parked and moving cars. */
  resolveActor(x, z, radius, options = {}) {
    let px = x;
    let pz = z;
    let blocked = false;
    const minHeight = options.minHeight ?? 0;
    const test = (cx, cz, halfWidth, halfLength, heading) => {
      // A car is a rounded rectangle: pushed out of its box in its own frame.
      const sin = Math.sin(heading);
      const cos = Math.cos(heading);
      let dx = px - cx;
      let dz = pz - cz;
      const lx = dx * cos - dz * sin;
      const lz = dx * sin + dz * cos;
      const ex = halfWidth + radius;
      const ez = halfLength + radius;
      if (Math.abs(lx) > ex || Math.abs(lz) > ez) return;
      blocked = true;
      const pushX = ex - Math.abs(lx);
      const pushZ = ez - Math.abs(lz);
      if (pushX < pushZ) {
        const sign = lx >= 0 ? 1 : -1;
        const nx = lx + sign * pushX;
        px = cx + nx * cos + lz * sin;
        pz = cz - nx * sin + lz * cos;
      } else {
        const sign = lz >= 0 ? 1 : -1;
        const nz = lz + sign * pushZ;
        px = cx + lx * cos + nz * sin;
        pz = cz - lx * sin + nz * cos;
      }
    };
    if (minHeight < 3) {
      for (const spot of this.visibleParked) {
        if (Math.hypot(spot.x - px, spot.z - pz) > 7) continue;
        const model = getCarModel(spot.type);
        test(spot.x, spot.z, model.dims.width / 2, model.dims.length / 2, spot.heading);
      }
      if (this.traffic) {
        for (const car of this.traffic.cars) {
          if (Math.hypot(car.x - px, car.z - pz) > 7) continue;
          const model = getCarModel(car.type);
          test(car.x, car.z, model.dims.width / 2, model.dims.length / 2, car.heading);
        }
      }
    }
    return { x: px, z: pz, blocked };
  }

  /** The closest car to a point among everything on the road, for tests. */
  nearestCarInfo(x, z) {
    let best = null;
    let bestDistance = Infinity;
    for (const spot of this.visibleParked) {
      const distance = Math.hypot(spot.x - x, spot.z - z);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = { x: spot.x, z: spot.z, type: spot.type, distance };
      }
    }
    return best;
  }

  /**
   * Puts the player behind the wheel of a fresh car at a spot, no key press needed.
   * The shot rig uses this to pose the drive scenario; it is also a useful test hook.
   */
  spawnDrivenCar({ type = 'coupe', paint = 0x1f6f78, x = 0, z = 0, heading = 0, speed = 0 } = {}) {
    if (this.activeCar) this.exit(this.player);
    const model = getCarModel(type);
    const car = new Car({ model, paint, x, z, heading, world: this.world, name: CAR_NAMES[type] ?? 'Car' });
    car.speed = speed;
    car.vx = Math.sin(heading) * speed;
    car.vz = Math.cos(heading) * speed;
    const view = buildCarGroup(type, paint);
    this.scene.add(view.group);
    car.view = view;
    car.syncView(0.016);
    this.activeCar = car;
    this.player.enterCar(car);
    if (this.world.state) {
      this.world.state.mode = 'driving';
      this.world.state.vehicle = car.name;
    }
    this.refresh(this.player.position.x, this.player.position.z, true);
    bus.emit('vehicle:enter', { type, name: car.name, x, z });
    return car;
  }

  /** One fixed step for the driven car. */
  update(dt, input) {
    this.refresh(this.player.position.x, this.player.position.z);
    const car = this.activeCar;
    if (!car) return;
    const controls = car.autopilot ?? {
      throttle: (input?.isDown('forward') ? 1 : 0) - (input?.isDown('back') ? 1 : 0),
      steer: (input?.isDown('right') ? 1 : 0) - (input?.isDown('left') ? 1 : 0),
      handbrake: Boolean(input?.isDown('handbrake')),
    };
    car.update(dt, controls);
    this.separate(car);
    if (this.world.state) {
      this.world.state.speed = Math.abs(car.speed);
      this.world.state.vehicle = car.name;
      this.world.state.topSpeed = Math.max(this.world.state.topSpeed ?? 0, Math.abs(car.speed) * 3.6);
    }
    car.syncView(dt);
  }

  /** Car against car: push the driven car out and take most of the impact. */
  separate(car) {
    const others = [];
    for (const spot of this.visibleParked) others.push(spot);
    if (this.traffic) for (const other of this.traffic.cars) others.push(other);
    for (const other of others) {
      const dx = car.x - other.x;
      const dz = car.z - other.z;
      const distance = Math.hypot(dx, dz);
      const minimum = 2.1;
      if (distance >= minimum || distance < 0.0001) continue;
      const push = (minimum - distance) / distance;
      const resolved = this.world.resolveCircle(car.x + dx * push, car.z + dz * push, car.radius);
      car.x = resolved.x;
      car.z = resolved.z;
      const impact = Math.abs(car.speed) + Math.abs(other.speed ?? 0);
      car.vx *= 0.35;
      car.vz *= 0.35;
      car.speed *= 0.4;
      if (impact > 4) bus.emit('vehicle:crash', { x: car.x, z: car.z, impact });
      if (this.traffic && this.traffic.bump) this.traffic.bump(other, impact * 0.5);
    }
  }

  /** Rebuilds the instanced fleet: parked and traffic cars, one draw pair per body. */
  paint() {
    this.fleet.begin();
    for (const spot of this.visibleParked) {
      const surface = this.world.walk.surfaceAt(spot.x, spot.z);
      this.fleet.add(spot.type, spot.x, surface.y, spot.z, spot.heading, spot.color);
    }
    if (this.traffic) {
      for (const car of this.traffic.cars) {
        this.fleet.add(car.type, car.x, car.y ?? 0.09, car.z, car.heading, car.color);
      }
    }
    this.fleet.end();
  }

  /** HUD data. */
  get info() {
    const car = this.activeCar;
    if (!car) return { mode: 'foot', label: 'On foot', speed: 0 };
    return {
      mode: 'driving',
      label: car.name,
      speed: Math.abs(car.speed) * 3.6,
      surface: car.surface,
      gear: car.speed < -0.2 ? 'R' : 'D',
    };
  }

  /** The nearest car worth prompting about, for the HUD. */
  prompt() {
    if (this.activeCar) return 'F  get out';
    const found = this.nearestStealable(this.player.position.x, this.player.position.z, 3.8);
    if (!found) return '';
    return found.kind === 'parked' ? `F  steal the ${CAR_NAMES[found.spot.type] ?? 'car'}` : `F  carjack the ${CAR_NAMES[found.car.type] ?? 'car'}`;
  }

  /** A deterministic paint colour for a type, used when traffic spawns. */
  paintFor(type) {
    return paintFor(type, this.random) ?? CAR_PAINT[0];
  }
}
