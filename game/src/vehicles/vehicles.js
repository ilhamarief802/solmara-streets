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
/** How far away a car can be and still be worth a prompt. */
const REACH = 3.8;

/** The names the HUD and the menus show for each body type. */
const CAR_NAMES = {
  sedan: 'Sedan',
  coupe: 'Coupe',
  van: 'Van',
  taxi: 'Taxi',
  police: 'Police cruiser',
  buggy: 'Beach buggy',
};

const _color = new THREE.Color();

/** The instanced pool: one shell mesh and one wheel mesh per body type. */
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
    const existing = this.types.get(type);
    if (existing) return existing;

    const model = getCarModel(type);
    const build = (geometry, name) => {
      const mesh = new THREE.InstancedMesh(
        geometry,
        new THREE.MeshLambertMaterial({ vertexColors: true }),
        FLEET_CAPACITY,
      );
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      // The instances move every frame and the whole pool is culled per type, not per box.
      mesh.frustumCulled = false;
      mesh.name = name;
      mesh.castShadow = false;
      this.scene.add(mesh);
      return mesh;
    };
    const entry = {
      model,
      shell: build(model.shell, `fleet-${type}-shell`),
      trim: build(model.wheels, `fleet-${type}-wheels`),
    };
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
    // A type over its capacity simply stops taking instances; the rest still draw.
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
        // The shell and the wheels share one transform per instance.
        entry.shell.setMatrixAt(index, this.matrix);
        entry.trim.setMatrixAt(index, this.matrix);
        entry.shell.setColorAt(index, _color.set(item.color));
      }
      // Instances past the count would still draw with a stale matrix.
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

    this.refresh(this.player.position.x, this.player.position.z, true);
  }

  setTraffic(traffic) {
    this.traffic = traffic;
  }

  /** Records of parked cars near a point, nearest first. Streamed, not every-frame. */
  refresh(x, z, force = false) {
    if (!force) {
      // A countdown in frames: refresh every eighth call, not every call.
      this.refreshClock -= 1;
      if (this.refreshClock > 0) return;
    }
    this.refreshClock = 8;
    this.visibleParked = this.world.walk.parking
      .filter((spot) => !this.taken.has(spot.id))
      .map((spot) => ({ ...spot, distance: Math.hypot(spot.x - x, spot.z - z) }))
      .filter((spot) => spot.distance < STREAM_RADIUS)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, MAX_PARKED_DRAWN);
  }

  /** Nearest car the player could get into: a parked one, then a live traffic car. */
  nearestStealable(x, z, maxDistance = 3.6) {
    let best = null;
    let bestDistance = maxDistance;
    for (const spot of this.visibleParked) {
      const distance = Math.hypot(spot.x - x, spot.z - z);
      if (distance >= bestDistance) continue;
      bestDistance = distance;
      best = { kind: 'parked', spot };
    }
    if (this.traffic) {
      const live = this.traffic.nearestCar(x, z, maxDistance);
      // A live car only wins when it is closer than the best parked one.
      if (live && live.distance < bestDistance) best = { kind: 'traffic', car: live.car, distance: live.distance };
    }
    return best;
  }

  /** The car object and its render group, added where the steal left it. */
  createCar({ type, paint, x, z, heading, speed = 0 }) {
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
    // The kerb it was taken from is now free, and the parked list moves with the player.
    this.refresh(this.player.position.x, this.player.position.z, true);
    bus.emit('vehicle:enter', { type, name: car.name, x, z });
    return car;
  }

  /** F near a car: steal it. Returns true when the player is now driving. */
  tryEnter(player) {
    if (this.activeCar) {
      this.exit(player);
      return false;
    }
    const found = this.nearestStealable(player.position.x, player.position.z, REACH);
    if (!found) return false;

    let source;
    if (found.kind === 'parked') {
      const spot = found.spot;
      // Mark the spot taken, so the fleet stops drawing a ghost at the kerb.
      this.taken.add(spot.id);
      source = { type: spot.type, paint: spot.color, x: spot.x, z: spot.z, heading: spot.heading };
    } else {
      const stolen = this.traffic.stealCar(found.car);
      if (!stolen) return false;
      source = { type: stolen.type, paint: stolen.color, x: stolen.x, z: stolen.z, heading: stolen.heading };
    }

    this.createCar(source);
    this.stats.stolen += 1;
    this.stats.driven += 1;
    if (this.world.state) this.world.state.carsStolen = this.stats.stolen;
    return true;
  }

  /** F again: step out at the driver's door and leave the car parked. */
  exit(player) {
    const car = this.activeCar;
    if (!car) return false;

    const spot = car.exitSpot(-1);
    // Face away from the car: half a turn from its heading.
    player.exitCar(car, spot.x, spot.z, car.heading + Math.PI * 0.5);
    this.scene.remove(car.view.group);
    car.view = null;

    // The car stays where it stopped, as a kerbside spot the walk network can hand back.
    this.released.unshift({
      id: `left-${this.released.length + 1}`,
      x: car.x,
      z: car.z,
      heading: car.heading,
      type: car.type,
      color: car.paint,
      distance: 0,
    });
    this.world.walk.parking.unshift(this.released[0]);
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
    // Above roof height there is nothing to push against.
    const minHeight = options.minHeight ?? 0;

    // A car is a rounded rectangle: push out of its box in the car's own frame.
    const test = (cx, cz, halfWidth, halfLength, heading) => {
      const sin = Math.sin(heading);
      const cos = Math.cos(heading);
      const dx = px - cx;
      const dz = pz - cz;
      // Into the car's local frame, then back out after the push.
      const lx = dx * cos - dz * sin;
      const lz = dx * sin + dz * cos;
      const ex = halfWidth + radius;
      const ez = halfLength + radius;
      if (Math.abs(lx) > ex || Math.abs(lz) > ez) return;
      blocked = true;

      // Leave along whichever axis needs the smaller push.
      const pushX = ex - Math.abs(lx);
      const pushZ = ez - Math.abs(lz);
      if (pushX < pushZ) {
        const nx = lx + (lx >= 0 ? pushX : -pushX);
        px = cx + nx * cos + lz * sin;
        pz = cz - nx * sin + lz * cos;
      } else {
        const nz = lz + (lz >= 0 ? pushZ : -pushZ);
        px = cx + lx * cos + nz * sin;
        pz = cz - lx * sin + nz * cos;
      }
    };

    // A body already above roof height passes over the cars.
    if (minHeight < 3) {
      for (const spot of this.visibleParked) {
        if (Math.hypot(spot.x - px, spot.z - pz) > 7) continue;
        const { dims } = getCarModel(spot.type);
        test(spot.x, spot.z, dims.width / 2, dims.length / 2, spot.heading);
      }
      if (this.traffic) {
        for (const car of this.traffic.cars) {
          if (Math.hypot(car.x - px, car.z - pz) > 7) continue;
          const { dims } = getCarModel(car.type);
          test(car.x, car.z, dims.width / 2, dims.length / 2, car.heading);
        }
      }
    }
    return { x: px, z: pz, blocked };
  }

  /** The closest parked car to a point, for tests. */
  nearestCarInfo(x, z) {
    let best = null;
    let bestDistance = Infinity;
    for (const spot of this.visibleParked) {
      const distance = Math.hypot(spot.x - x, spot.z - z);
      if (distance >= bestDistance) continue;
      bestDistance = distance;
      best = { x: spot.x, z: spot.z, type: spot.type, distance };
    }
    return best;
  }

  /**
   * Puts the player behind the wheel of a fresh car at a spot, no key press needed. The
   * shot rig uses this to pose the drive scenario; it is also a useful test hook.
   */
  spawnDrivenCar({ type = 'coupe', paint = 0x1f6f78, x = 0, z = 0, heading = 0, speed = 0 } = {}) {
    if (this.activeCar) this.exit(this.player);
    return this.createCar({ type, paint, x, z, heading, speed });
  }

  /** One fixed step for the driven car. */
  update(dt, input) {
    this.refresh(this.player.position.x, this.player.position.z);
    const car = this.activeCar;
    if (!car) return;

    // A scripted shot may drive the car itself by setting `autopilot`.
    const controls = car.autopilot ?? {
      throttle: (input?.isDown('forward') ? 1 : 0) - (input?.isDown('back') ? 1 : 0),
      steer: (input?.isDown('right') ? 1 : 0) - (input?.isDown('left') ? 1 : 0),
      handbrake: Boolean(input?.isDown('handbrake')),
    };
    car.update(dt, controls);
    this.separate(car);

    if (this.world.state) {
      const speed = Math.abs(car.speed);
      this.world.state.speed = speed;
      this.world.state.vehicle = car.name;
      this.world.state.topSpeed = Math.max(this.world.state.topSpeed ?? 0, speed * 3.6);
    }
    car.syncView(dt);
  }

  /** Car against car: push the driven car out and take most of the impact. */
  separate(car) {
    const others = [...this.visibleParked];
    if (this.traffic) others.push(...this.traffic.cars);

    for (const other of others) {
      const dx = car.x - other.x;
      const dz = car.z - other.z;
      const distance = Math.hypot(dx, dz);
      // 2.1 m is about two car widths: closer than that and they are overlapping.
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
      this.traffic?.bump?.(other, impact * 0.5);
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
        // A traffic car without its own height sits on the asphalt.
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
    const found = this.nearestStealable(this.player.position.x, this.player.position.z, REACH);
    if (!found) return '';
    const type = found.kind === 'parked' ? found.spot.type : found.car.type;
    const name = CAR_NAMES[type] ?? 'car';
    return found.kind === 'parked' ? `F  steal the ${name}` : `F  carjack the ${name}`;
  }

  /** A deterministic paint colour for a type, used when traffic spawns. */
  paintFor(type) {
    return paintFor(type, this.random) ?? CAR_PAINT[0];
  }
}
