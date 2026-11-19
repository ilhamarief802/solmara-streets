// The on-foot player: a character controller for a flat city with kerbs, box walls and
// moving cars. Velocity is built from the camera's facing, the body turns to it, and a
// small step-up keeps him walking from the road onto the pavement without jumping. While
// he is in a car the controller hands the body to the car and stops simulating it.

import { clamp, dampAngle } from '../core/math.js';
import { createCharacter } from './character.js';
import { bus } from '../core/events.js';

const GRAVITY = 24;
const WALK_SPEED = 2.2;
const RUN_SPEED = 5.0;
const SPRINT_SPEED = 7.7;
const JUMP_SPEED = 6.3;
/** Bodies shorter than this above the feet are stepped over (kerbs, low planters). */
const STEP_HEIGHT = 0.42;

export class Player {
  constructor({ world, scene, spawn = { x: 332.4, z: 60, heading: 0 }, vehicles = null }) {
    this.world = world;
    this.vehicles = vehicles;
    this.radius = 0.34;
    this.eyeHeight = 1.62;
    this.position = { x: spawn.x, y: 0, z: spawn.z };
    this.velocity = { x: 0, y: 0, z: 0 };
    this.heading = spawn.heading ?? 0;
    this.speed = 0;
    this.grounded = true;
    this.sprinting = false;
    this.mode = 'foot';
    this.car = null;
    this.stepPhase = 0;
    this.distanceWalked = 0;
    this.distanceDriven = 0;
    this._jumpLatch = false;
    this._lastGround = 'pavement';
    /** Set by the input bus, so a key tap between fixed steps is still seen. */
    this.jumpBuffer = 0;
    this._offKey = bus.on('input:key', (event) => {
      if (event.code === 'Space' && event.down && !event.repeat) this.jumpBuffer = 0.18;
    });

    this.character = createCharacter();
    this.object = this.character.root;
    this.object.name = 'player';
    scene.add(this.object);

    const surface = world.walk.surfaceAt(spawn.x, spawn.z);
    this.position.y = surface.y;
    this.object.position.set(this.position.x, this.position.y, this.position.z);
    this.object.rotation.y = this.heading;
  }

  /** Feet position, copied to a scratch object the camera can read. */
  get feet() {
    return this.position;
  }

  teleport(x, z, heading = this.heading, y = null) {
    this.position.x = x;
    this.position.z = z;
    this.heading = heading;
    const surface = this.world.walk.surfaceAt(x, z);
    this.position.y = y === null ? surface.y : y;
    this.velocity.x = 0;
    this.velocity.y = 0;
    this.velocity.z = 0;
    this.speed = 0;
    this.grounded = true;
    this.object.position.set(this.position.x, this.position.y, this.position.z);
    this.object.rotation.y = this.heading;
  }

  /** Called by the vehicle system: sit in the car, stop simulating the body. */
  enterCar(car) {
    this.car = car;
    this.mode = 'driving';
    this.character.setVisible(false);
    this.velocity.x = 0;
    this.velocity.y = 0;
    this.velocity.z = 0;
  }

  /** Called by the vehicle system after it has found a safe place to stand. */
  exitCar(car, x, z, heading) {
    this.car = null;
    this.mode = 'foot';
    this.character.setVisible(true);
    this.character.rest();
    const surface = this.world.walk.surfaceAt(x, z);
    this.position.x = x;
    this.position.z = z;
    this.position.y = Math.max(surface.y, car ? car.y : surface.y);
    this.heading = heading;
    this.velocity.x = 0;
    this.velocity.y = 0;
    this.velocity.z = 0;
    this.grounded = true;
    this.object.position.set(this.position.x, this.position.y, this.position.z);
    this.object.rotation.y = this.heading;
  }

  /**
   * Pushes a circle out of every solid box that rises above the feet, then out of the
   * cars around him. Two passes, like the world's own resolver, but with the height test
   * that lets a player walk over a kerb or a low planter.
   */
  resolve(x, z, feetY) {
    let px = x;
    let pz = z;
    let hit = false;
    const radius = this.radius;
    for (let pass = 0; pass < 2; pass += 1) {
      let moved = false;
      for (const box of this.world.colliders.near(px, pz, radius + 0.5)) {
        if (box.top < feetY + STEP_HEIGHT) continue;
        const closestX = clamp(px, box.minX, box.maxX);
        const closestZ = clamp(pz, box.minZ, box.maxZ);
        let dx = px - closestX;
        let dz = pz - closestZ;
        const distance = Math.hypot(dx, dz);
        if (distance >= radius) continue;
        moved = true;
        hit = true;
        if (distance < 0.0001) {
          const left = px - box.minX;
          const right = box.maxX - px;
          const back = pz - box.minZ;
          const front = box.maxZ - pz;
          const min = Math.min(left, right, back, front);
          if (min === left) px = box.minX - radius;
          else if (min === right) px = box.maxX + radius;
          else if (min === back) pz = box.minZ - radius;
          else pz = box.maxZ + radius;
        } else {
          const push = radius - distance + 0.002;
          px += (dx / distance) * push;
          pz += (dz / distance) * push;
        }
      }
      if (!moved) break;
    }
    if (this.vehicles) {
      const car = this.vehicles.resolveActor(px, pz, radius, { exclude: this.car, minHeight: feetY + 0.25 });
      if (car.blocked) {
        px = car.x;
        pz = car.z;
        hit = true;
      }
    }
    return { x: px, z: pz, hit };
  }

  /**
   * One fixed step on foot.
   * @param {number} dt seconds
   * @param {object} context { input, cameraYaw, cameraPitch }
   */
  update(dt, context = {}) {
    if (this.mode === 'driving') {
      this.followCar(dt);
      return;
    }
    const input = context.input;
    const cameraYaw = context.cameraYaw ?? 0;

    let forward = 0;
    let side = 0;
    if (input) {
      forward = (input.isDown('forward') ? 1 : 0) - (input.isDown('back') ? 1 : 0);
      side = (input.isDown('right') ? 1 : 0) - (input.isDown('left') ? 1 : 0);
    }
    const fx = Math.sin(cameraYaw);
    const fz = Math.cos(cameraYaw);
    const rx = Math.cos(cameraYaw);
    const rz = -Math.sin(cameraYaw);
    let moveX = fx * forward + rx * side;
    let moveZ = fz * forward + rz * side;
    const moveLength = Math.hypot(moveX, moveZ);
    if (moveLength > 1e-4) {
      moveX /= moveLength;
      moveZ /= moveLength;
    }

    const walkIntent = input?.isDown('crouch') ?? false;
    this.sprinting = Boolean(input?.isDown('sprint')) && moveLength > 0 && !walkIntent;
    const cruising = walkIntent ? WALK_SPEED : RUN_SPEED;
    const topSpeed = this.sprinting ? SPRINT_SPEED : cruising;
    const targetX = moveX * topSpeed;
    const targetZ = moveZ * topSpeed;

    const surface = this.world.walk.surfaceAt(this.position.x, this.position.z);
    const wading = surface.kind === 'water';
    const acceleration = this.grounded ? (moveLength > 0 ? 26 : 16) : 7;
    const control = wading ? 0.45 : 1;
    this.velocity.x = approach(this.velocity.x, targetX * control, acceleration * dt);
    this.velocity.z = approach(this.velocity.z, targetZ * control, acceleration * dt);

    // Turn to face where he is going; standing still keeps the last facing.
    if (moveLength > 0.01) {
      const targetHeading = Math.atan2(moveX, moveZ);
      this.heading = dampAngle(this.heading, targetHeading, 14, dt);
    }

    // Jump: a short input buffer means a tap between two fixed steps still jumps, and a
    // held key does not bunny-hop (the latch clears only on release).
    this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);
    const jumpHeld = Boolean(input?.isDown('jump'));
    if ((this.jumpBuffer > 0 || (jumpHeld && !this._jumpLatch)) && this.grounded) {
      this.velocity.y = JUMP_SPEED;
      this.grounded = false;
      this._jumpLatch = true;
      this.jumpBuffer = 0;
      bus.emit('player:jump', { x: this.position.x, z: this.position.z });
    }
    if (!jumpHeld) this._jumpLatch = false;

    if (!this.grounded) this.velocity.y -= GRAVITY * dt;

    const beforeX = this.position.x;
    const beforeZ = this.position.z;
    const nextX = this.position.x + this.velocity.x * dt;
    const nextZ = this.position.z + this.velocity.z * dt;
    const resolved = this.resolve(nextX, nextZ, this.position.y);
    this.position.x = clamp(resolved.x, -938, 1278);
    this.position.z = clamp(resolved.z, -972, 678);
    if (resolved.hit) {
      // Colliding into a wall bleeds off the velocity along it.
      this.velocity.x *= 0.35;
      this.velocity.z *= 0.35;
    }

    this.position.y += this.velocity.y * dt;
    const ground = this.world.walk.surfaceAt(this.position.x, this.position.z);
    this._lastGround = ground.kind;
    if (this.grounded) {
      // Kerb step-up and step-down: follow the surface while it is close.
      if (Math.abs(ground.y - this.position.y) < 0.5) this.position.y = ground.y;
    }
    if (this.position.y <= ground.y) {
      this.position.y = ground.y;
      this.velocity.y = 0;
      this.grounded = true;
    } else if (this.position.y > ground.y + 0.06) {
      this.grounded = false;
    }

    const moved = Math.hypot(this.position.x - beforeX, this.position.z - beforeZ);
    this.speed = moved / Math.max(dt, 1e-4);
    this.distanceWalked += moved;
    if (this.world.state) this.world.state.distanceWalked = this.distanceWalked;

    // Footstep hook for the audio session, one per stride.
    this.stepPhase += moved * 1.9;
    if (this.stepPhase > Math.PI) {
      this.stepPhase -= Math.PI;
      bus.emit('player:footstep', { surface: ground.kind, sprinting: this.sprinting });
    }

    this.object.position.set(this.position.x, this.position.y, this.position.z);
    this.object.rotation.y = this.heading;
    this.character.animate(dt, {
      speed: this.speed,
      grounded: this.grounded,
      sprinting: this.sprinting,
      surface: ground.kind,
    });
  }

  /** While driving, the body rides in the seat (hidden) and the camera follows. */
  followCar(dt) {
    const car = this.car;
    if (!car) {
      this.mode = 'foot';
      return;
    }
    this.position.x = car.x;
    this.position.z = car.z;
    this.position.y = car.y;
    this.heading = car.heading;
    this.speed = Math.abs(car.speed);
    this.distanceDriven += this.speed * dt;
    if (this.world.state) this.world.state.distanceDriven = this.distanceDriven;
    this.object.position.set(car.x, car.y, car.z);
    this.object.rotation.y = car.heading;
  }

  /** Used by the HUD and by the pedestrian reactions. */
  get sprintingNow() {
    return this.speed > 5.4 && this.mode === 'foot';
  }

  get district() {
    return this.world.districtAt(this.position.x, this.position.z);
  }

  get facingVector() {
    return { x: Math.sin(this.heading), z: Math.cos(this.heading) };
  }
}

/** Moves a value towards a target by at most `step`. */
function approach(value, target, step) {
  if (value < target) return Math.min(value + step, target);
  if (value > target) return Math.max(value - step, target);
  return value;
}
