// The driven car. An arcade model, not a simulator: longitudinal thrust and drag, a
// steering angle that shrinks with speed, and a lateral velocity that asphalt grips hard
// and sand barely does. The handbrake drops grip and lets the tail step out, which is the
// whole point of a city car. Collision is a circle against the world boxes and a solved
// push against every other car; a hit bleeds speed and throws a small camera kick.

import { clamp, damp } from '../core/math.js';
import { bus } from '../core/events.js';

const GRIP = { road: 8.6, pavement: 7.4, lot: 6.2, sand: 2.3, ground: 3.2, water: 1.4 };
const MAX_SPEED = { road: 27, pavement: 20, lot: 18, sand: 13.5, ground: 14, water: 6 };
const ACCELERATION = 9.4;
const BRAKING = 16;
const REVERSE_ACCELERATION = 5.6;
const HANDBRAKE_GRIP = 1.35;

export class Car {
  constructor({ model, paint, x, z, heading = 0, world, name = 'Coupe' }) {
    this.model = model;
    this.world = world;
    this.type = model.type;
    this.name = name;
    this.dims = model.dims;
    this.paint = paint;
    this.x = x;
    this.z = z;
    this.y = world.walk.surfaceAt(x, z).y;
    this.heading = heading;
    this.vx = 0;
    this.vz = 0;
    this.speed = 0;
    this.lateral = 0;
    this.steer = 0;
    this.wheelSpin = 0;
    this.throttle = 0;
    this.handbrake = false;
    this.grounded = true;
    this.surface = 'road';
    this.engineClock = 0;
    this.tyreClock = 0;
    this.crashCooldown = 0;
    this.radius = 1.22;
    this.odometer = 0;
    this.view = null;
  }

  /** Puts the car in a lane, pointed along a heading, at a speed. */
  place(x, z, heading, speed = 0) {
    this.x = x;
    this.z = z;
    this.heading = heading;
    this.y = this.world.walk.surfaceAt(x, z).y;
    this.vx = Math.sin(heading) * speed;
    this.vz = Math.cos(heading) * speed;
    this.speed = speed;
    this.lateral = 0;
    this.steer = 0;
    if (this.view) this.syncView(1);
  }

  /** Keeps the visual in step with the body; also spins the wheels. */
  syncView(dt) {
    const view = this.view;
    if (!view) return;
    view.group.position.set(this.x, this.y, this.z);
    view.group.rotation.y = this.heading;
    // Body roll into the corner, pitch under braking, only enough to read.
    const roll = clamp(-this.steer * clamp(Math.abs(this.speed) / 18, 0, 1) * 0.24, -0.1, 0.1);
    const pitch = clamp(this.throttle * 0.018, -0.03, 0.03);
    view.group.rotation.z = damp(view.group.rotation.z, roll, 6, dt);
    view.group.rotation.x = damp(view.group.rotation.x, pitch, 5, dt);
    this.wheelSpin += (this.speed / this.dims.wheelRadius) * dt;
    for (const wheel of view.wheels) {
      wheel.rotation.x = this.wheelSpin;
      wheel.rotation.y = -this.steer * 1.4;
    }
  }

  /**
   * One fixed step.
   * @param {number} dt seconds
   * @param {object} controls { throttle (-1..1), steer (-1..1, +1 right), handbrake }
   */
  update(dt, controls = {}) {
    const surface = this.world.walk.surfaceAt(this.x, this.z);
    this.surface = surface.kind;
    this.y = surface.y;
    this.grounded = true;
    const throttle = clamp(controls.throttle ?? 0, -1, 1);
    const steerInput = clamp(controls.steer ?? 0, -1, 1);
    const handbrake = Boolean(controls.handbrake);
    this.throttle = throttle;
    this.handbrake = handbrake;

    const fx = Math.sin(this.heading);
    const fz = Math.cos(this.heading);
    const rx = Math.cos(this.heading);
    const rz = -Math.sin(this.heading);

    let vLong = this.vx * fx + this.vz * fz;
    let vLat = this.vx * rx + this.vz * rz;

    const maxSpeed = MAX_SPEED[surface.kind] ?? MAX_SPEED.road;

    // ------------------------------------------------------------ engine and brakes
    if (throttle > 0) {
      const fade = 1 - clamp(vLong / maxSpeed, 0, 1) * 0.82;
      vLong += ACCELERATION * throttle * fade * dt;
    } else if (throttle < 0) {
      if (vLong > 0.35) vLong += BRAKING * throttle * dt;
      else vLong += REVERSE_ACCELERATION * throttle * dt;
      if (vLong < -8.5) vLong = -8.5;
    }
    // Rolling resistance and aero drag, and a handbrake that scrubs speed.
    vLong -= vLong * (handbrake ? 1.4 : 0.32) * dt;
    vLong -= Math.sign(vLong) * 0.55 * dt;
    if (Math.abs(vLong) < 0.06 && Math.abs(throttle) < 0.05) vLong = 0;

    // ------------------------------------------------------------ steering
    // The faster you go, the less lock you get: full lock to park, a whisker at speed.
    const lock = 0.6 / (1 + Math.abs(vLong) * 0.115);
    const steerAngle = steerInput * lock;
    this.steer = damp(this.steer, steerAngle, 11, dt);
    let yawRate = (Math.abs(vLong) > 0.05 ? vLong / this.dims.wheelbase : 0) * Math.tan(this.steer);
    yawRate = clamp(yawRate, -1.7, 1.7);
    if (handbrake) yawRate *= 1.35;
    this.heading -= yawRate * dt;

    // ------------------------------------------------------------ lateral grip
    const grip = handbrake ? HANDBRAKE_GRIP : GRIP[surface.kind] ?? GRIP.road;
    vLat *= Math.exp(-grip * dt);
    // Sand and kerbs add a little wander, so the beach is not a racetrack.
    if (surface.kind === 'sand' || surface.kind === 'pavement') {
      vLat += Math.sin(this.odometer * 0.9) * 0.4 * dt;
    }

    this.vx = fx * vLong + rx * vLat;
    this.vz = fz * vLong + rz * vLat;

    const nx = this.x + this.vx * dt;
    const nz = this.z + this.vz * dt;
    const resolved = this.world.resolveCircle(nx, nz, this.radius);
    const blocked = resolved.blocked || Math.hypot(resolved.x - nx, resolved.z - nz) > 0.0001;
    this.x = resolved.x;
    this.z = resolved.z;

    if (blocked) {
      // A wall takes most of the speed; the rest is a scrape along it.
      const impact = Math.abs(vLong);
      vLong *= -0.16;
      vLat *= 0.4;
      this.vx = fx * vLong + rx * vLat;
      this.vz = fz * vLong + rz * vLat;
      if (impact > 3 && this.crashCooldown <= 0) {
        this.crashCooldown = 0.5;
        bus.emit('vehicle:crash', { x: this.x, z: this.z, impact });
      }
    }
    this.crashCooldown = Math.max(0, this.crashCooldown - dt);

    this.speed = vLong;
    this.lateral = vLat;
    this.odometer += Math.abs(vLong) * dt;

    // ------------------------------------------------------------ audio hooks
    this.engineClock += dt;
    if (this.engineClock > 0.1) {
      this.engineClock = 0;
      bus.emit('vehicle:engine', {
        rpm: clamp(Math.abs(vLong) / maxSpeed, 0, 1),
        load: Math.abs(throttle),
        surface: surface.kind,
      });
    }
    this.tyreClock -= dt;
    if (Math.abs(vLat) > 3.2 && this.tyreClock <= 0) {
      this.tyreClock = 0.28;
      bus.emit('vehicle:tyre', { x: this.x, z: this.z, slip: Math.abs(vLat), surface: surface.kind });
    }

    this.syncView(dt);
  }

  /** True when the car is close to a point, for enter/exit prompts. */
  isNear(x, z, distance = 3.4) {
    return Math.hypot(this.x - x, this.z - z) <= distance + this.dims.length * 0.18;
  }

  /** A safe standing spot beside the driver's door, resolving it out of the world. */
  exitSpot(side = -1) {
    const rx = Math.cos(this.heading) * side;
    const rz = -Math.sin(this.heading) * side;
    const x = this.x + rx * (this.dims.width / 2 + 0.75);
    const z = this.z + rz * (this.dims.width / 2 + 0.75);
    const resolved = this.world.resolveCircle(x, z, 0.4);
    return { x: resolved.x, z: resolved.z, heading: this.heading };
  }
}
