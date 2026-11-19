// Third-person camera rig. The mouse turns it (pointer lock), the wheel changes the
// boom length, and the rig answers to the city: a camera that would sit inside a wall is
// pulled in along its boom until the shot is clear, and never drops under the pavement.
// On foot the character turns to the camera; in a car the rig settles behind the boot and
// damps back there after the mouse has had its look. V switches to a close, first-person
// view that keeps the same yaw and pitch.

import { clamp, damp, dampAngle, angleDelta } from '../core/math.js';

const MIN_DISTANCE = 1.4;
const MAX_DISTANCE = 11;
const DEFAULT_DISTANCE = 5.2;
const PITCH_MIN = -0.5;
const PITCH_MAX = 1.05;

/** Slab test: the entry distance of a ray into an axis-aligned box, or null. */
function rayBox(origin, dir, box, maxT) {
  let tmin = 0;
  let tmax = maxT;
  const axes = [
    [origin.x, dir.x, box.minX, box.maxX],
    [origin.y, dir.y, 0, box.top],
    [origin.z, dir.z, box.minZ, box.maxZ],
  ];
  for (const [start, step, min, max] of axes) {
    if (Math.abs(step) < 1e-6) {
      if (start < min || start > max) return null;
      continue;
    }
    let t1 = (min - start) / step;
    let t2 = (max - start) / step;
    if (t1 > t2) {
      const swap = t1;
      t1 = t2;
      t2 = swap;
    }
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }
  return tmin;
}

export class OrbitCamera {
  constructor({ camera, world, input, player, vehicles = null }) {
    this.camera = camera;
    this.world = world;
    this.input = input;
    this.player = player;
    this.vehicles = vehicles;
    this.yaw = player.heading;
    this.pitch = 0.18;
    this.zoom = DEFAULT_DISTANCE;
    this.distance = DEFAULT_DISTANCE;
    this.orbitOffset = 0;
    this.firstPerson = false;
    this.anchor = { x: player.position.x, y: player.position.y + 1.5, z: player.position.z };
    this.timeSinceLook = 0;
    this.shake = 0;
    this.fov = 62;
    this._camPos = { x: 0, y: 0, z: 0 };
    this._target = { x: 0, y: 0, z: 0 };
  }

  /** V: a close view that behaves like a first-person camera. */
  toggleMode() {
    this.firstPerson = !this.firstPerson;
    return this.firstPerson;
  }

  /** Places the rig without any spring, for a shot or a test. */
  pose(target, yaw, pitch = 0.16, distance = DEFAULT_DISTANCE) {
    this.anchor.x = target.x;
    this.anchor.y = target.y;
    this.anchor.z = target.z;
    this.yaw = yaw;
    this.pitch = pitch;
    this.zoom = distance;
    this.distance = distance;
    this.firstPerson = false;
  }

  /** Adds a small kick to the camera, used when a car hits something. */
  kick(amount = 0.2) {
    this.shake = Math.min(0.5, this.shake + amount);
  }

  update(dt, context = {}) {
    const player = this.player;
    const car = context.car ?? player.car ?? null;
    const driving = Boolean(car);
    const step = Math.min(dt, 0.1);

    // ------------------------------------------------------------ look input
    const look = this.input ? this.input.consumeMouseDelta() : { x: 0, y: 0 };
    if (Math.abs(look.x) + Math.abs(look.y) > 1e-5) this.timeSinceLook = 0;
    else this.timeSinceLook += step;

    if (this.input?.isDown('cameraLeft')) this.yaw += step * 1.8;
    if (this.input?.isDown('cameraRight')) this.yaw -= step * 1.8;
    if (this.input?.isDown('lookUp')) this.pitch = clamp(this.pitch - step * 1.1, PITCH_MIN, PITCH_MAX);
    if (this.input?.isDown('lookDown')) this.pitch = clamp(this.pitch + step * 1.1, PITCH_MIN, PITCH_MAX);

    if (driving) {
      // In a car the mouse is a look-around offset that decays when it is let go.
      this.orbitOffset = clamp(this.orbitOffset - look.x, -1.4, 1.4);
      this.orbitOffset = damp(this.orbitOffset, 0, this.timeSinceLook > 1.1 ? 2.4 : 0.15, step);
      this.yaw = dampAngle(this.yaw, car.heading + this.orbitOffset, 3.4, step);
      this.pitch = clamp(this.pitch + look.y, PITCH_MIN, PITCH_MAX);
    } else {
      this.yaw -= look.x;
      this.pitch = clamp(this.pitch + look.y, PITCH_MIN, PITCH_MAX);
      this.orbitOffset = 0;
    }

    // Mouse wheel: zoom the boom. Input only reports wheel while locked.
    const wheel = this.input?.mouse?.wheel ?? 0;
    if (wheel) this.zoom = clamp(this.zoom + wheel * 0.8, MIN_DISTANCE, MAX_DISTANCE);

    // ------------------------------------------------------------ follow target
    const focus = car
      ? { x: car.x, y: car.y + 1.05, z: car.z }
      : { x: player.position.x, y: player.position.y + 1.45, z: player.position.z };
    const followSpeed = driving ? 16 : 12;
    this.anchor.x = damp(this.anchor.x, focus.x, followSpeed, step);
    this.anchor.y = damp(this.anchor.y, focus.y, followSpeed * 0.7, step);
    this.anchor.z = damp(this.anchor.z, focus.z, followSpeed, step);

    this.firstPerson = this.firstPerson && !driving;
    const targetDistance = this.firstPerson ? 0 : driving ? clamp(this.zoom + 1.9, 3.4, 10) : this.zoom;
    this.distance = damp(this.distance, targetDistance, 9, step);

    // ------------------------------------------------------------ place
    const yaw = this.yaw;
    const pitch = this.pitch;
    const cosPitch = Math.cos(pitch);
    const forward = { x: Math.sin(yaw) * cosPitch, y: -Math.sin(pitch), z: Math.cos(yaw) * cosPitch };
    const up = driving ? 0.5 : 0.32;
    const shoulder = this.firstPerson ? 0 : driving ? 0 : 0.28;
    const right = { x: Math.cos(yaw), z: -Math.sin(yaw) };

    let px = this.anchor.x - forward.x * this.distance + right.x * shoulder;
    let py = this.anchor.y - forward.y * this.distance + up;
    let pz = this.anchor.z - forward.z * this.distance + right.z * shoulder;

    if (this.firstPerson) {
      // Eye height, just behind the head, so the nose does not clip the near plane.
      px = player.position.x + Math.sin(yaw) * 0.12;
      py = player.position.y + player.eyeHeight;
      pz = player.position.z + Math.cos(yaw) * 0.12;
    } else {
      // Boom collision: pull in to the first wall between the head and the camera.
      const origin = { x: this.anchor.x, y: this.anchor.y, z: this.anchor.z };
      const delta = { x: px - origin.x, y: py - origin.y, z: pz - origin.z };
      const length = Math.hypot(delta.x, delta.y, delta.z) || 1;
      const dir = { x: delta.x / length, y: delta.y / length, z: delta.z / length };
      const midX = (origin.x + px) / 2;
      const midZ = (origin.z + pz) / 2;
      let nearest = 1;
      for (const box of this.world.colliders.near(midX, midZ, length * 0.6 + 1)) {
        const hit = rayBox(origin, dir, box, length);
        if (hit !== null) {
          const t = clamp((hit - 0.35) / length, 0.08, 1);
          if (t < nearest) nearest = t;
        }
      }
      if (nearest < 1) {
        px = origin.x + delta.x * nearest;
        py = origin.y + delta.y * nearest;
        pz = origin.z + delta.z * nearest;
      }
    }

    // Never under the pavement.
    const ground = this.world.walk.surfaceAt(px, pz);
    if (py < ground.y + 0.35) py = ground.y + 0.35;

    // Small impact shake, decaying fast.
    if (this.shake > 0.001) {
      const wobble = this.shake;
      px += Math.sin(performance.now() * 0.05) * wobble * 0.18;
      py += Math.cos(performance.now() * 0.043) * wobble * 0.12;
      this.shake = damp(this.shake, 0, 8, step);
    }

    this._camPos.x = px;
    this._camPos.y = py;
    this._camPos.z = pz;

    // The look target sits ahead of the anchor a touch at speed, so the road leads.
    const speedLead = car ? clamp(Math.abs(car.speed) * 0.16, 0, 5) : 0;
    if (this.firstPerson) {
      this._target.x = px + forward.x * 4;
      this._target.y = py + forward.y * 4;
      this._target.z = pz + forward.z * 4;
    } else {
      // In a car the camera looks down the bonnet, not down the old mouse yaw: the
      // target leads along the car's heading so the road opens up before the turn.
      const lookHeading = driving ? car.heading : this.yaw;
      this._target.x = this.anchor.x + Math.sin(lookHeading) * speedLead;
      this._target.y = this.anchor.y + 0.1;
      this._target.z = this.anchor.z + Math.cos(lookHeading) * speedLead;
    }

    this.camera.position.set(px, py, pz);
    this.camera.lookAt(this._target.x, this._target.y, this._target.z);

    const wantedFov = this.firstPerson ? 70 : driving ? 66 : 62;
    if (Math.abs(this.camera.fov - wantedFov) > 0.01) {
      this.camera.fov = damp(this.camera.fov, wantedFov, 6, step);
      this.camera.updateProjectionMatrix();
    }

    // The body is invisible in first person: the camera is inside its head.
    if (player.mode === 'foot') player.character.setVisible(!this.firstPerson);
  }
}
