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
/** The walkable rectangle: the plan's land bounds, inset a little. */
const BOUNDS = { minX: -938, maxX: 1278, minZ: -972, maxZ: 678 };

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
    /** Set from the input bus, so a Space tap between fixed steps is still seen (0.18 s). */
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
    this.place();
  }

  /** Feet position, shared with the camera and the HUD. */
  get feet() {
    return this.position;
  }

  /** Writes the body transform from the simulation state. */
  place() {
    this.object.position.set(this.position.x, this.position.y, this.position.z);
    this.object.rotation.y = this.heading;
  }

  teleport(x, z, heading = this.heading, y = null) {
    this.position.x = x;
    this.position.z = z;
    this.heading = heading;
    this.position.y = y === null ? this.world.walk.surfaceAt(x, z).y : y;
    this.velocity.x = 0;
    this.velocity.y = 0;
    this.velocity.z = 0;
    this.speed = 0;
    this.grounded = true;
    this.place();
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
    const surface = this.world.walk.surfaceAt(x, z);
    this.car = null;
    this.mode = 'foot';
    this.character.setVisible(true);
    this.character.rest();
    this.position.x = x;
    this.position.z = z;
    // Never step out below the roof you are leaving.
    this.position.y = Math.max(surface.y, car ? car.y : surface.y);
    this.heading = heading;
    this.velocity.x = 0;
    this.velocity.y = 0;
    this.velocity.z = 0;
    this.grounded = true;
    this.place();
  }

  /**
   * Pushes a circle out of every solid box that rises above the feet, then out of the cars
   * around him. Two passes, like the world's own resolver, but with the height test that
   * lets a player walk over a kerb or a low planter.
   */
  resolve(x, z, feetY) {
    let px = x;
    let pz = z;
    let hit = false;
    const { radius } = this;

    for (let pass = 0; pass < 2; pass += 1) {
      let moved = false;
      for (const box of this.world.colliders.near(px, pz, radius + 0.5)) {
        // A kerb or a planter this low is underfoot, not a wall.
        if (box.top < feetY + STEP_HEIGHT) continue;
        const closestX = clamp(px, box.minX, box.maxX);
        const closestZ = clamp(pz, box.minZ, box.maxZ);
        const dx = px - closestX;
        const dz = pz - closestZ;
        const distance = Math.hypot(dx, dz);
        if (distance >= radius) continue;
        moved = true;
        hit = true;
        if (distance < 0.0001) {
          // The centre is inside: leave along the shallowest axis.
          const toLeft = px - box.minX;
          const toRight = box.maxX - px;
          const toBack = pz - box.minZ;
          const toFront = box.maxZ - pz;
          const min = Math.min(toLeft, toRight, toBack, toFront);
          if (min === toLeft) px = box.minX - radius;
          else if (min === toRight) px = box.maxX + radius;
          else if (min === toBack) pz = box.minZ - radius;
          else pz = box.maxZ + radius;
        } else {
          const push = radius - distance + 0.002;
          px += (dx / distance) * push;
          pz += (dz / distance) * push;
        }
      }
      if (!moved) break;
    }

    // Moving traffic is a soft wall: only cars taller than a step block the body.
    if (this.vehicles) {
      const car = this.vehicles.resolveActor(px, pz, radius, { minHeight: feetY + 0.25 });
      if (car.blocked) {
        px = car.x;
        pz = car.z;
        hit = true;
      }
    }
    return { x: px, z: pz, hit };
  }

  /** The unit walk direction for this frame, from the camera's yaw and the keys. */
  intent(input, cameraYaw) {
    let forward = 0;
    let side = 0;
    if (input) {
      forward = (input.isDown('forward') ? 1 : 0) - (input.isDown('back') ? 1 : 0);
      side = (input.isDown('right') ? 1 : 0) - (input.isDown('left') ? 1 : 0);
    }
    const fx = Math.sin(cameraYaw);
    const fz = Math.cos(cameraYaw);
    // Right is forward rotated -90 degrees about Y.
    let moveX = fx * forward + Math.cos(cameraYaw) * side;
    let moveZ = fz * forward - Math.sin(cameraYaw) * side;
    const length = Math.hypot(moveX, moveZ);
    if (length > 1e-4) {
      // Diagonals must not be faster than a straight line.
      moveX /= length;
      moveZ /= length;
    }
    return { x: moveX, z: moveZ, length, crouch: Boolean(input?.isDown('crouch')) };
  }

  /** One fixed step on foot. */
  update(dt, context = {}) {
    if (this.mode === 'driving') {
      this.followCar(dt);
      return;
    }
    const input = context.input;
    const move = this.intent(input, context.cameraYaw ?? 0);
    const moving = move.length > 0.01;

    this.sprinting = Boolean(input?.isDown('sprint')) && moving && !move.crouch;
    const cruising = move.crouch ? WALK_SPEED : RUN_SPEED;
    const topSpeed = this.sprinting ? SPRINT_SPEED : cruising;

    const surface = this.world.walk.surfaceAt(this.position.x, this.position.z);
    // Wading costs speed but never locks the body in place.
    const control = surface.kind === 'water' ? 0.45 : 1;
    const acceleration = this.grounded ? (moving ? 26 : 16) : 7;
    this.velocity.x = approach(this.velocity.x, move.x * topSpeed * control, acceleration * dt);
    this.velocity.z = approach(this.velocity.z, move.z * topSpeed * control, acceleration * dt);

    // Turn to face where he is going; standing still keeps the last facing.
    if (moving) this.heading = dampAngle(this.heading, Math.atan2(move.x, move.z), 14, dt);

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
    const resolved = this.resolve(
      this.position.x + this.velocity.x * dt,
      this.position.z + this.velocity.z * dt,
      this.position.y,
    );
    this.position.x = clamp(resolved.x, BOUNDS.minX, BOUNDS.maxX);
    this.position.z = clamp(resolved.z, BOUNDS.minZ, BOUNDS.maxZ);
    if (resolved.hit) {
      // Hitting a wall bleeds off the velocity into it.
      this.velocity.x *= 0.35;
      this.velocity.z *= 0.35;
    }

    this.position.y += this.velocity.y * dt;
    const ground = this.world.walk.surfaceAt(this.position.x, this.position.z);
    this._lastGround = ground.kind;
    // Kerb step-up and step-down: follow the surface while it stays close.
    if (this.grounded && Math.abs(ground.y - this.position.y) < 0.5) this.position.y = ground.y;
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

    // A footstep hook for the audio layer, one per stride.
    this.stepPhase += moved * 1.9;
    if (this.stepPhase > Math.PI) {
      this.stepPhase -= Math.PI;
      bus.emit('player:footstep', { surface: ground.kind, sprinting: this.sprinting });
    }

    this.place();
    this.character.animate(dt, {
      speed: this.speed,
      grounded: this.grounded,
      sprinting: this.sprinting,
      surface: ground.kind,
    });
  }

  /** While driving, the body rides in the seat (hidden) and the camera follows. */
  followCar(dt) {
    const { car } = this;
    if (!car) {
      // The car is gone (sold, destroyed): fall back to foot rather than ride nothing.
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
