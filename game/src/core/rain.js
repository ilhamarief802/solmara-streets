// Rain. A single Points cloud of short streaks that lives in a box around the camera and
// wraps as it falls, so a shower costs one draw call wherever the player drives. The wet
// look is CSS: a cool tint over the frame and, while driving, streaks on the windscreen.

const DROPS = 1400;
const BOX = { x: 70, y: 34, z: 70 };
const RESPAWN_ABOVE = BOX.y * 0.55;

export class Rain {
  constructor(scene, { seed = 1 } = {}) {
    this.scene = scene;
    this.active = false;
    this.intensity = 0;
    this.elapsed = 0;
    this.target = 0;
    this.positions = new Float32Array(DROPS * 3);
    this.speeds = new Float32Array(DROPS);

    // A local LCG rather than Random: the drops need one float per spawn on the hot path,
    // and every reload should place the same cloud.
    let state = (seed >>> 0) || 7;
    const random = () => {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 4294967296;
    };
    this._random = random;

    for (let i = 0; i < DROPS; i += 1) {
      this.positions[i * 3] = (random() - 0.5) * BOX.x;
      this.positions[i * 3 + 1] = random() * BOX.y;
      this.positions[i * 3 + 2] = (random() - 0.5) * BOX.z;
      this.speeds[i] = 16 + random() * 12;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    const material = new THREE.PointsMaterial({
      color: 0xbfd6e8,
      size: 0.075,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });
    this.points = new THREE.Points(geometry, material);
    this.points.frustumCulled = false;
    this.points.name = 'rain';
    this.points.visible = false;
    scene.add(this.points);
  }

  /** `id` is the weather module's current id; storm rains at a heavier target. */
  setWeather(id) {
    this.target = id === 'rain' ? 1 : id === 'storm' ? 0.6 : 0;
    if (this.target > 0) this.points.visible = true;
  }

  update(dt, camera) {
    // Ease towards the target so a shower starts and stops instead of popping.
    this.intensity += (this.target - this.intensity) * Math.min(1, dt * 2.5);
    this.points.visible = this.intensity > 0.02;
    if (!this.points.visible || !camera) return;

    this.elapsed += dt;
    const positions = this.positions;
    const fall = 0.5 + this.intensity;
    const random = this._random;
    for (let i = 0; i < DROPS; i += 1) {
      const index = i * 3;
      positions[index + 1] -= this.speeds[i] * dt * fall;
      // A little slant with the wind; a drop that falls out respawns partway up the box
      // so the shower never visibly empties from the bottom.
      positions[index] += dt * 3.2;
      if (positions[index + 1] < -4) {
        positions[index] = (random() - 0.5) * BOX.x;
        positions[index + 1] = RESPAWN_ABOVE;
        positions[index + 2] = (random() - 0.5) * BOX.z;
      }
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.material.opacity = 0.5 * this.intensity;
    // The box follows the camera, so the shower is always around the player.
    this.points.position.copy(camera.position);
  }

  get isRaining() {
    return this.intensity > 0.05;
  }
}

export function createRain(scene, options) {
  return new Rain(scene, options);
}
