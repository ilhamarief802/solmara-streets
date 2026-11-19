// Combat effects, all generated in code and all pooled: muzzle flashes are additive
// billboards painted once into a canvas texture, tracers are stretched boxes that fade in
// under a tenth of a second, and impacts are a handful of points thrown out with gravity.
// There are no decals and no files on disk, and the pools never grow at run time.

const SPARKS_PER_BURST = 14;
const GRAVITY = 12;

function createFlashTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const centre = 32;
  const glow = ctx.createRadialGradient(centre, centre, 0, centre, centre, 30);
  glow.addColorStop(0, 'rgba(255, 252, 230, 1)');
  glow.addColorStop(0.25, 'rgba(255, 214, 140, 0.95)');
  glow.addColorStop(0.55, 'rgba(255, 150, 60, 0.45)');
  glow.addColorStop(1, 'rgba(255, 120, 30, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 64, 64);

  // Four short rays, so the flash reads as a star even on a small screen.
  ctx.strokeStyle = 'rgba(255, 236, 190, 0.85)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (const angle of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
    ctx.moveTo(centre + Math.cos(angle) * 6, centre + Math.sin(angle) * 6);
    ctx.lineTo(centre + Math.cos(angle) * 30, centre + Math.sin(angle) * 30);
  }
  ctx.stroke();

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

const _dir = new THREE.Vector3();
const _origin = new THREE.Vector3();
const _target = new THREE.Vector3();

export class CombatEffects {
  constructor(scene, camera = null) {
    this.scene = scene;
    this.camera = camera;
    this.flashTexture = createFlashTexture();
    this.flashGeometry = new THREE.PlaneGeometry(1, 1);
    this.boxGeometry = new THREE.BoxGeometry(1, 1, 1);
    this.flashes = [];
    this.tracers = [];
    this.sparks = [];
    this.buildFlashes(6);
    this.buildTracers(18);
    this.buildSparks(6);
    this.active = 0;
  }

  setCamera(camera) {
    this.camera = camera;
  }

  buildFlashes(count) {
    for (let index = 0; index < count; index += 1) {
      const material = new THREE.MeshBasicMaterial({
        map: this.flashTexture,
        color: 0xffd9a0,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(this.flashGeometry, material);
      mesh.visible = false;
      mesh.frustumCulled = false;
      mesh.renderOrder = 5;
      this.scene.add(mesh);
      this.flashes.push({ mesh, material, life: 0, maxLife: 1, scale: 1 });
    }
  }

  buildTracers(count) {
    for (let index = 0; index < count; index += 1) {
      const material = new THREE.MeshBasicMaterial({
        color: 0xffd9a0,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      // One unit cube, stretched along its local Z by tracer().
      const mesh = new THREE.Mesh(this.boxGeometry, material);
      mesh.visible = false;
      mesh.frustumCulled = false;
      mesh.renderOrder = 4;
      this.scene.add(mesh);
      this.tracers.push({ mesh, material, life: 0, maxLife: 1 });
    }
  }

  buildSparks(count) {
    for (let index = 0; index < count; index += 1) {
      const positions = new Float32Array(SPARKS_PER_BURST * 3);
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      const material = new THREE.PointsMaterial({
        color: 0xffcf8a,
        size: 0.16,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        sizeAttenuation: true,
      });
      const points = new THREE.Points(geometry, material);
      points.visible = false;
      points.frustumCulled = false;
      this.scene.add(points);
      this.sparks.push({
        points,
        material,
        geometry,
        positions,
        velocities: new Float32Array(SPARKS_PER_BURST * 3),
        life: 0,
        maxLife: 1,
      });
    }
  }

  /** A free slot, or the one closest to expiring when the pool is full. */
  static take(pool) {
    let oldest = pool[0];
    for (const entry of pool) {
      if (entry.life <= 0) return entry;
      if (entry.life < oldest.life) oldest = entry;
    }
    return oldest;
  }

  /** A muzzle flash at a point, billboarded every frame. `life` is seconds. */
  muzzle(x, y, z, { life = 0.07, scale = 0.85, color = 0xffd9a0 } = {}) {
    const slot = CombatEffects.take(this.flashes);
    slot.life = life;
    slot.maxLife = life;
    slot.scale = scale;
    slot.mesh.position.set(x, y, z);
    slot.mesh.visible = true;
    slot.material.color.setHex(color);
    slot.material.opacity = 1;
    // A random size each time keeps a burst of shots from looking stamped.
    slot.mesh.scale.setScalar(scale * (0.7 + Math.random() * 0.6));
    this.active += 1;
    return slot;
  }

  /** A line of light from the barrel to the hit point (or the weapon's reach). */
  tracer(from, to, { life = 0.055, width = 0.035, color = 0xffd9a0 } = {}) {
    const slot = CombatEffects.take(this.tracers);
    _origin.set(from.x, from.y, from.z);
    _target.set(to.x, to.y, to.z);
    _dir.subVectors(_target, _origin);
    const length = _dir.length() || 0.01;
    // The cube is stretched along Z and aimed from its midpoint at the target.
    slot.mesh.position.copy(_origin).addScaledVector(_dir, 0.5);
    slot.mesh.lookAt(_target);
    slot.mesh.scale.set(width, width, length);
    slot.mesh.visible = true;
    slot.material.color.setHex(color);
    slot.material.opacity = 0.9;
    slot.life = life;
    slot.maxLife = life;
    this.active += 1;
    return slot;
  }

  /** A small burst of points, thrown sideways and up, in a warm dust palette. */
  impact(x, y, z, { color = 0xffc98a, count = SPARKS_PER_BURST, speed = 4.2, life = 0.34, size = 0.16 } = {}) {
    const slot = CombatEffects.take(this.sparks);
    slot.life = life;
    slot.maxLife = life;
    slot.material.color.setHex(color);
    slot.material.size = size;
    slot.material.opacity = 1;
    slot.points.visible = true;

    const used = Math.min(count, SPARKS_PER_BURST);
    const { positions, velocities } = slot;
    for (let index = 0; index < SPARKS_PER_BURST; index += 1) {
      const offset = index * 3;
      positions[offset] = x;
      positions[offset + 1] = y;
      positions[offset + 2] = z;
      // Unused points sit exactly on the burst's origin and are never moved.
      if (index >= used) {
        velocities[offset] = 0;
        velocities[offset + 1] = 0;
        velocities[offset + 2] = 0;
        continue;
      }
      const theta = Math.random() * Math.PI * 2;
      const spread = speed * (0.45 + Math.random());
      velocities[offset] = Math.cos(theta) * spread;
      velocities[offset + 1] = 0.4 + Math.random() * 1.6;
      velocities[offset + 2] = Math.sin(theta) * spread;
    }
    slot.geometry.attributes.position.needsUpdate = true;
    this.active += 1;
    return slot;
  }

  update(dt) {
    for (const flash of this.flashes) {
      if (flash.life <= 0) continue;
      flash.life -= dt;
      flash.material.opacity = Math.max(0, flash.life / flash.maxLife);
      // A flash always faces the camera; the quad has no other orientation.
      if (this.camera) flash.mesh.quaternion.copy(this.camera.quaternion);
      if (flash.life <= 0) flash.mesh.visible = false;
    }

    for (const tracer of this.tracers) {
      if (tracer.life <= 0) continue;
      tracer.life -= dt;
      tracer.material.opacity = Math.max(0, tracer.life / tracer.maxLife) * 0.9;
      if (tracer.life <= 0) tracer.mesh.visible = false;
    }

    for (const spark of this.sparks) {
      if (spark.life <= 0) continue;
      spark.life -= dt;
      spark.material.opacity = Math.max(0, spark.life / spark.maxLife);
      const { positions, velocities } = spark;
      for (let index = 0; index < SPARKS_PER_BURST; index += 1) {
        const offset = index * 3;
        velocities[offset + 1] -= GRAVITY * dt;
        positions[offset] += velocities[offset] * dt;
        positions[offset + 1] += velocities[offset + 1] * dt;
        positions[offset + 2] += velocities[offset + 2] * dt;
      }
      spark.geometry.attributes.position.needsUpdate = true;
      if (spark.life <= 0) spark.points.visible = false;
    }
  }

  /** How many effects are alive, for the debug readout and the browser check. */
  get busy() {
    const alive = (pool) => pool.reduce((sum, entry) => sum + (entry.life > 0 ? 1 : 0), 0);
    return alive(this.flashes) + alive(this.tracers) + alive(this.sparks);
  }
}
