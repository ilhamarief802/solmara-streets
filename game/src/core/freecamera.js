// The phase one debug camera: a fly camera with a damped velocity and a mouse look
// that works under pointer lock or a held button. The shot rig poses it directly and
// switches it off, which is how the deterministic screenshots get an exact framing.

import { clamp, damp } from './math.js';
import { HALF_PI } from './math.js';

const PITCH_LIMIT = HALF_PI - 0.02;

export class FreeCamera {
  constructor(options = {}) {
    this.camera = options.camera;
    this.input = options.input ?? null;
    this.settings = options.settings ?? { freeCameraSpeed: 46 };
    this.velocity = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.enabled = options.enabled !== false;
    this.sensitivity = options.sensitivity ?? 1;
    this.camera.rotation.order = 'YXZ';
    this.desired = new THREE.Vector3();
    this.forward = new THREE.Vector3();
    this.right = new THREE.Vector3();
  }

  /** Places the camera and aims it; used by the shot scenarios. */
  setPose(position, target) {
    this.camera.position.set(position.x, position.y, position.z);
    const dx = target.x - position.x;
    const dy = target.y - position.y;
    const dz = target.z - position.z;
    const horizontal = Math.hypot(dx, dz) || 0.0001;
    this.yaw = Math.atan2(-dx, -dz);
    this.pitch = Math.atan2(dy, horizontal);
    this.applyRotation();
    return this;
  }

  setYawPitch(yaw, pitch) {
    this.yaw = yaw;
    this.pitch = clamp(pitch, -PITCH_LIMIT, PITCH_LIMIT);
    this.applyRotation();
    return this;
  }

  applyRotation() {
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;
    this.camera.rotation.z = 0;
  }

  look(delta) {
    if (!delta) return;
    this.yaw += delta.yaw * this.sensitivity;
    this.pitch = clamp(this.pitch + delta.pitch * this.sensitivity, -PITCH_LIMIT, PITCH_LIMIT);
    this.applyRotation();
  }

  currentSpeed() {
    let speed = this.settings.freeCameraSpeed;
    if (this.input?.action('sprint')) speed *= 4;
    if (this.input?.action('boost')) speed *= 2.4;
    if (this.input?.action('slow')) speed *= 0.22;
    return speed;
  }

  update(dt) {
    if (!this.enabled || !this.input) return;
    this.look(this.input.lookDelta());

    const axis = this.input.moveAxis();
    const speed = this.currentSpeed();

    // Movement follows the view, so looking down and pressing W dives.
    const cosPitch = Math.cos(this.pitch);
    const sinPitch = Math.sin(this.pitch);
    const sinYaw = Math.sin(this.yaw);
    const cosYaw = Math.cos(this.yaw);
    this.forward.set(-sinYaw * cosPitch, sinPitch, -cosYaw * cosPitch);
    this.right.set(cosYaw, 0, -sinYaw);

    this.desired.set(0, 0, 0);
    this.desired.addScaledVector(this.forward, axis.forward);
    this.desired.addScaledVector(this.right, axis.strafe);
    this.desired.y += axis.vertical;
    if (this.desired.lengthSq() > 1) this.desired.normalize();
    this.desired.multiplyScalar(speed);

    const lambda = 9;
    this.velocity.x = damp(this.velocity.x, this.desired.x, lambda, dt);
    this.velocity.y = damp(this.velocity.y, this.desired.y, lambda, dt);
    this.velocity.z = damp(this.velocity.z, this.desired.z, lambda, dt);
    this.camera.position.addScaledVector(this.velocity, dt);

    // Never let the fly camera sink under the sea or climb absurdly high.
    this.camera.position.y = clamp(this.camera.position.y, 0.4, 1400);
  }

  describe() {
    const p = this.camera.position;
    return `${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)}`;
  }
}

export function createFreeCamera(options) {
  return new FreeCamera(options);
}
