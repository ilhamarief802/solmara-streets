// Fighting. The player's health and armour, three weapons with real ammunition, hit
// detection against pedestrians, mission thugs and police, a muzzle flash and tracer for
// every shot, pooled impact particles instead of decals, and a short wasted/busted loop that
// hands the body back at a hospital or the station. It also owns the small cast of armed
// thugs the missions place, because they share the same damage rules as everyone else. Every
// consequence is published on the bus so the police and the audio can react.

import { clamp, clamp01, damp } from '../core/math.js';
import { bus } from '../core/events.js';
import { createCharacter } from '../player/character.js';
import { CombatEffects } from './effects.js';
import { WEAPONS, WEAPON_ORDER } from './weapons.js';

const MAX_HEALTH = 100;
const REGEN_DELAY = 9;
const REGEN_RATE = 2.2;
const DOWN_TIME = 3.2;
/** A dead thug's body stays for this long so missions can count the kill. */
const THUG_LIFETIME = 45;
/** Two crimes closer together than this are reported as one. */
const CRIME_INTERVAL = 0.45;

const _cameraDir = new THREE.Vector3();
const _muzzle = new THREE.Vector3();
const _aim = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();
const _point = new THREE.Vector3();

// One counter for the whole module: a reused id would confuse the kill tally.
let thugSerial = 0;

export class Combat {
  constructor({
    scene,
    camera,
    world,
    player,
    pedestrians,
    vehicles,
    police = null,
    cameraRig = null,
    hud = null,
    resolveDown = null,
  }) {
    this.scene = scene;
    this.camera = camera;
    this.world = world;
    this.player = player;
    this.pedestrians = pedestrians;
    this.vehicles = vehicles;
    this.police = police;
    this.cameraRig = cameraRig;
    this.hud = hud;
    this.resolveDown = resolveDown;

    this.health = MAX_HEALTH;
    this.maxHealth = MAX_HEALTH;
    this.armour = 0;
    this.weaponId = 'fists';
    this.unlocked = { fists: true, pistol: true, shotgun: false };
    this.ammo = {
      fists: { clip: Infinity, reserve: Infinity },
      pistol: { clip: 12, reserve: 48 },
      shotgun: { clip: 0, reserve: 0 },
    };
    this.cooldown = 0;
    this.reloadTimer = 0;
    this.fireHeld = false;
    this.fireQueued = false;
    this.lastDamage = 99;
    this.invuln = 0;
    this.suspended = false;
    this.firing = 0;
    this.punch = 0;
    this.downKind = null;
    this.downTimer = 0;
    this.lastCrime = -99;
    this.stats = { shots: 0, hits: 0, kills: 0, punches: 0, downed: 0 };
    this.thugs = [];
    this.deaths = [];
    this.effects = new CombatEffects(scene, camera);
    this.buildGun();
    // The trigger is read from the bus: the mouse-down is the shot, not the per-frame key.
    this._offMouse = bus.on('input:mouse', (event) => {
      if (event.button !== 0) return;
      this.fireHeld = Boolean(event.down);
      if (event.down) this.fireQueued = true;
    });
    this._offCrash = bus.on('vehicle:crash', (event) => this.onCrash(event));
  }

  // ---------------------------------------------------------------- weapon view
  // The gun hangs off the right forearm, so the player's own arm swing carries it.
  buildGun() {
    const group = new THREE.Group();
    group.name = 'player-gun';
    const metal = new THREE.MeshLambertMaterial({ color: 0x23272c });
    const wood = new THREE.MeshLambertMaterial({ color: 0x5a3a24 });

    const slide = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.075, 0.3), metal);
    slide.position.set(0, 0.02, 0.13);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.15, 0.08), wood);
    grip.position.set(0, -0.06, 0.01);
    grip.rotation.x = 0.24;
    group.add(slide, grip);

    // Hung low and tipped forward, so the barrel points where the camera looks.
    group.position.set(0.03, -0.56, 0.03);
    group.rotation.x = -1.4;
    group.visible = false;
    this.player?.character?.parts?.rightArm?.pivot?.add(group);
    this.gun = group;
  }

  setPolice(police) {
    this.police = police;
  }

  setHud(hud) {
    this.hud = hud;
  }

  // ---------------------------------------------------------------- state
  get isDown() {
    return Boolean(this.downKind);
  }

  get weapon() {
    return WEAPONS[this.weaponId] ?? WEAPONS.fists;
  }

  get weaponInfo() {
    const weapon = this.weapon;
    const ammo = this.ammo[weapon.id] ?? { clip: 0, reserve: 0 };
    return {
      id: weapon.id,
      name: weapon.name,
      // Melee reports Infinity, which the HUD prints as a dash.
      clip: weapon.melee ? Infinity : ammo.clip,
      reserve: weapon.melee ? Infinity : ammo.reserve,
      armed: !weapon.melee,
      reloading: this.reloadTimer > 0,
    };
  }

  /** The HUD shows a fire flag for a frame or two after a shot. */
  get firingNow() {
    return this.firing > 0;
  }

  // ---------------------------------------------------------------- input
  /** Keys the loop reads once per rendered frame: 1-3 choose, R reloads. */
  handleInput(input) {
    if (!input) return;
    for (const [code, slot] of [['Digit1', 0], ['Digit2', 1], ['Digit3', 2]]) {
      if (!input.keyPressed(code)) continue;
      this.switchWeapon(WEAPON_ORDER[slot]);
      break;
    }
    if (input.keyPressed('KeyR')) this.reload();
  }

  switchWeapon(id) {
    if (!id || !WEAPONS[id]) return false;
    if (!this.unlocked[id]) {
      if (this.hud) this.hud.notify('Shotgun not owned — buy one at the shop', 'danger');
      return false;
    }
    if (this.weaponId === id) return false;
    this.weaponId = id;
    this.reloadTimer = 0;
    // A small delay stops a switch from firing on the same frame as the draw.
    this.cooldown = Math.max(this.cooldown, 0.12);
    if (this.gun) this.gun.visible = !WEAPONS[id].melee;
    bus.emit('weapon:change', { id, name: WEAPONS[id].name });
    return true;
  }

  reload() {
    const weapon = this.weapon;
    if (weapon.melee || this.reloadTimer > 0) return false;
    const ammo = this.ammo[weapon.id];
    // A full clip or an empty reserve has nothing to gain from a reload.
    if (ammo.clip >= weapon.clipSize || ammo.reserve <= 0) return false;
    this.reloadTimer = weapon.id === 'shotgun' ? 1.5 : 1.05;
    if (this.hud) this.hud.notify('Reloading', 'info');
    bus.emit('weapon:reload', { id: weapon.id, time: this.reloadTimer });
    return true;
  }

  grantWeapon(id, { clip = null, reserve = null } = {}) {
    const weapon = WEAPONS[id];
    if (!weapon || weapon.melee) return false;
    const firstTime = !this.unlocked[id];
    this.unlocked[id] = true;
    if (firstTime) {
      this.ammo[id].clip = clip ?? weapon.clipSize;
      this.ammo[id].reserve = reserve ?? weapon.reserve;
    } else {
      // A duplicate grant tops up the reserve, and the clip if the caller asked for it.
      this.ammo[id].reserve += reserve ?? weapon.clipSize * 2;
      if (clip) this.ammo[id].clip = Math.min(weapon.clipSize, this.ammo[id].clip + clip);
    }
    this.switchWeapon(id);
    bus.emit('weapon:grant', { id, unlocked: this.unlocked });
    return true;
  }

  addAmmo(id, amount) {
    const weapon = WEAPONS[id];
    if (!weapon || weapon.melee) return false;
    this.unlocked[id] = true;
    this.ammo[id].reserve += amount;
    return true;
  }

  addArmour(amount) {
    this.armour = clamp(this.armour + amount, 0, 100);
    bus.emit('health:change', { health: this.health, armour: this.armour });
    return this.armour;
  }

  heal(amount) {
    this.health = clamp(this.health + amount, 0, this.maxHealth);
    bus.emit('health:change', { health: this.health, armour: this.armour });
    return this.health;
  }

  // ---------------------------------------------------------------- shooting
  /**
   * Aim for hitscan. The camera's centre ray finds the point under the crosshair first; the
   * shot is then fired from the body towards that point, so the third-person boom's parallax
   * cannot make the crosshair lie. In first person the camera is the body, so the two rays
   * are the same.
   */
  aim(originOut = _muzzle, dirOut = _cameraDir, range = 62) {
    const camera = this.camera;
    camera.getWorldDirection(dirOut);
    const player = this.player;

    if (this.cameraRig?.firstPerson) {
      originOut.set(
        camera.position.x + dirOut.x * 0.25,
        camera.position.y + dirOut.y * 0.25,
        camera.position.z + dirOut.z * 0.25,
      );
      return { origin: originOut, direction: dirOut };
    }

    // The camera ray's first body: the shot goes at where the crosshair actually landed.
    _aim.set(
      camera.position.x + dirOut.x * 0.3,
      camera.position.y + dirOut.y * 0.3,
      camera.position.z + dirOut.z * 0.3,
    );
    const seen = this.pickTarget(_aim, dirOut, range);

    // The body's own muzzle: chest height, a little in front of the shoulders.
    const originX = player.position.x + Math.sin(player.heading) * 0.32;
    const originY = player.position.y + 1.42;
    const originZ = player.position.z + Math.cos(player.heading) * 0.32;
    originOut.set(originX, originY, originZ);
    if (seen) dirOut.set(seen.x - originX, seen.y - originY, seen.z - originZ).normalize();
    return { origin: originOut, direction: dirOut };
  }

  /**
   * The closest damageable body along a ray, or null. Pedestrians, thugs and cops all test
   * as a vertical capsule approximated by a sphere at chest height.
   */
  pickTarget(origin, direction, range) {
    let best = null;
    let bestAlong = range;

    const test = (x, y, z, radius, kind, target) => {
      _point.set(x - origin.x, y - origin.y, z - origin.z);
      const along = _point.dot(direction);
      // Behind the muzzle or past a closer body: not a candidate.
      if (along <= 0.2 || along > bestAlong) return;
      const perpSq = _point.lengthSq() - along * along;
      if (perpSq > radius * radius) return;
      bestAlong = along;
      best = { kind, target, distance: along, x, y, z };
    };

    for (const ped of this.pedestrians?.peds ?? []) {
      if (!ped.dead) test(ped.x, 1.05, ped.z, 0.58, 'ped', ped);
    }
    for (const thug of this.thugs) {
      if (!thug.dead) test(thug.x, 1.05, thug.z, 0.6, 'thug', thug);
    }
    for (const cop of this.police?.cops ?? []) {
      if (!cop.dead) test(cop.x, 1.08, cop.z, 0.62, 'cop', cop);
    }
    return best;
  }

  /** LMB: one trigger pull. Returns true when something was fired. */
  attack() {
    if (this.suspended || this.isDown) return false;
    if (this.reloadTimer > 0 || this.cooldown > 0) return false;

    const weapon = this.weapon;
    if (weapon.melee) return this.punchNow();
    const ammo = this.ammo[weapon.id];
    if (!ammo || ammo.clip <= 0) {
      if (!this.reload()) bus.emit('weapon:empty', { id: weapon.id });
      return false;
    }

    ammo.clip -= 1;
    this.cooldown = weapon.rate;
    this.firing = 0.11;
    this.stats.shots += 1;

    const { origin, direction } = this.aim();
    if (this.cameraRig?.kick) this.cameraRig.kick(weapon.recoil);
    this.effects.muzzle(
      origin.x + direction.x * 0.55,
      origin.y + direction.y * 0.55 + 0.06,
      origin.z + direction.z * 0.55,
      {
        scale: weapon.id === 'shotgun' ? 1.25 : 0.85,
        color: weapon.id === 'shotgun' ? 0xffc27a : 0xffe0b0,
      },
    );

    // A little spread, applied in the camera's own right/up plane.
    _right.set(direction.z, 0, -direction.x).normalize();
    _up.crossVectors(_right, direction).normalize();
    let hitAny = null;
    for (let pellet = 0; pellet < weapon.pellets; pellet += 1) {
      _aim
        .copy(direction)
        .addScaledVector(_right, (Math.random() - 0.5) * weapon.spread)
        .addScaledVector(_up, (Math.random() - 0.5) * weapon.spread)
        .normalize();

      const hit = this.pickTarget(origin, _aim, weapon.range);
      const end = hit
        ? { x: hit.x, y: hit.y, z: hit.z }
        : {
            x: origin.x + _aim.x * weapon.range,
            y: origin.y + _aim.y * weapon.range,
            z: origin.z + _aim.z * weapon.range,
          };

      this.effects.tracer({ x: origin.x, y: origin.y, z: origin.z }, end, {
        color: weapon.tracer ?? 0xffd9a0,
        width: weapon.id === 'shotgun' ? 0.026 : 0.032,
      });

      if (!hit) continue;
      hitAny = hit;
      this.effects.impact(hit.x, hit.y, hit.z, {
        color: hit.kind === 'ped' ? 0xffd2a0 : 0xffb066,
        speed: 3.6,
        count: weapon.id === 'shotgun' ? 10 : 6,
        size: 0.14,
      });
      this.applyDamage(hit, weapon.damage, _aim);
    }

    if (hitAny) this.stats.hits += 1;
    this.emitCrime({ type: 'gunshot', severity: 1, x: this.player.position.x, z: this.player.position.z });
    bus.emit('combat:fire', {
      weapon: weapon.id,
      x: origin.x,
      y: origin.y,
      z: origin.z,
      hit: Boolean(hitAny),
    });
    // Running the clip dry is the one time a reload is free; otherwise the player asks.
    if (ammo.clip <= 0) this.reload();
    return true;
  }

  /** Melee: a short cone in front of the camera, with a visible arm swing. */
  punchNow() {
    this.cooldown = WEAPONS.fists.rate;
    this.punch = 0.22;
    this.stats.punches += 1;

    const direction = this.camera.getWorldDirection(_cameraDir);
    // Flatten the aim: a fist does not reach into the sky.
    const flat = Math.hypot(direction.x, direction.z) || 1;
    const fx = direction.x / flat;
    const fz = direction.z / flat;

    let best = null;
    let bestDistance = WEAPONS.fists.range;
    const test = (x, z, kind, target) => {
      const dx = x - this.player.position.x;
      const dz = z - this.player.position.z;
      const distance = Math.hypot(dx, dz);
      if (distance > bestDistance) return;
      // Only bodies in a rough cone in front of the player.
      if ((dx / (distance || 1)) * fx + (dz / (distance || 1)) * fz < 0.4) return;
      best = { kind, target, x, z, distance };
      bestDistance = distance;
    };

    for (const ped of this.pedestrians?.peds ?? []) if (!ped.dead) test(ped.x, ped.z, 'ped', ped);
    for (const thug of this.thugs) if (!thug.dead) test(thug.x, thug.z, 'thug', thug);
    for (const cop of this.police?.cops ?? []) if (!cop.dead) test(cop.x, cop.z, 'cop', cop);

    if (!best) {
      // A swing at the air still counts as a shot, so the HUD and the audio react.
      bus.emit('combat:punch', { target: null, hit: false });
      return false;
    }
    this.effects.impact(best.x, 1.15, best.z, { color: 0xffd6b0, speed: 2.4, count: 5, size: 0.1 });
    this.applyDamage(
      { kind: best.kind, target: best.target, x: best.x, y: 1.15, z: best.z },
      WEAPONS.fists.damage,
      { x: fx, y: 0, z: fz },
    );
    this.stats.hits += 1;
    bus.emit('combat:punch', { target: best.kind, hit: true, x: best.x, z: best.z });
    return true;
  }

  /** Routes one weapon's damage to whatever the ray or cone found. */
  applyDamage(hit, damage, direction) {
    if (hit.kind === 'ped') this.hitPed(hit.target, damage, direction);
    else if (hit.kind === 'thug') this.hitThug(hit.target, damage, direction);
    else if (hit.kind === 'cop') this.police?.hitCop(hit.target, damage, direction);
  }

  hitPed(ped, damage, direction) {
    if (!ped || ped.dead) return;
    if (ped.health === undefined) ped.health = MAX_HEALTH;
    ped.health -= damage;

    const away = direction ? Math.atan2(direction.x, direction.z) : this.player.heading;
    if (ped.health > 0) {
      // Still standing: shoved a step, and running from whoever hit them.
      this.pedestrians?.startle?.(ped, this.player.position.x, this.player.position.z);
      ped.fleeTimer = Math.max(ped.fleeTimer ?? 0, 2.4);
      ped.heading = away;
      ped.threat.x = Math.sin(away);
      ped.threat.z = Math.cos(away);
      ped.x += Math.sin(away) * 0.28;
      ped.z += Math.cos(away) * 0.28;
      bus.emit('npc:hit', { kind: 'ped', x: ped.x, z: ped.z });
      this.emitCrime({ type: 'assault', severity: 1, x: ped.x, z: ped.z });
      return;
    }

    ped.dead = true;
    ped.deadTimer = 24;
    ped.speed = 0;
    ped.fleeTimer = 0;
    this.stats.kills += 1;
    this.deaths.push({ kind: 'ped', at: this.world.elapsed });
    bus.emit('npc:dead', { kind: 'ped', x: ped.x, z: ped.z });
    this.emitCrime({ type: 'kill', severity: 2, x: ped.x, z: ped.z });
  }

  // ---------------------------------------------------------------- thugs
  /**
   * A mission actor with a gun: a box body, a health pool and a simple shooter. Missions
   * place these at the harbour and on the Strip; the combat loop moves and fires them.
   */
  spawnThug({ x, z, health = 80, boss = false, tag = null, heading = 0 } = {}) {
    thugSerial += 1;
    const character = createCharacter({
      jacket: boss ? 0x2a2438 : 0x6d2a30,
      sleeve: boss ? 0x1c1a26 : 0x512027,
      beanie: boss ? 0xd0a24a : 0x231f24,
    });
    character.root.name = `thug-${thugSerial}`;
    this.scene.add(character.root);

    const surface = this.world.walk.surfaceAt(x, z);
    character.root.position.set(x, surface.y, z);
    const thug = {
      id: thugSerial,
      x,
      z,
      y: surface.y,
      heading,
      health,
      maxHealth: health,
      dead: false,
      deadTimer: 0,
      boss,
      tag,
      // A staggered opening shot, so a group does not fire in one volley.
      cooldown: 0.8 + Math.random() * 0.8,
      object: character.root,
      character,
      speed: 0,
    };
    this.thugs.push(thug);
    return thug;
  }

  hitThug(thug, damage, direction) {
    if (!thug || thug.dead) return;
    thug.health -= damage;
    if (direction) thug.heading = Math.atan2(direction.x, direction.z);

    if (thug.health > 0) {
      // A flinch, not a shove: the body only nudge-steps in the shot's direction.
      thug.object.position.x += (direction?.x ?? 0) * 0.16;
      thug.object.position.z += (direction?.z ?? 0) * 0.16;
      return;
    }

    thug.dead = true;
    thug.deadTimer = THUG_LIFETIME;
    thug.speed = 0;
    thug.object.rotation.x = -Math.PI / 2;
    thug.object.position.y = thug.y + 0.3;
    this.stats.kills += 1;
    this.deaths.push({ kind: thug.boss ? 'boss' : 'thug', tag: thug.tag, at: this.world.elapsed });
    bus.emit('npc:dead', { kind: 'thug', boss: thug.boss, tag: thug.tag, x: thug.x, z: thug.z });
    this.emitCrime({ type: 'kill', severity: 1, x: thug.x, z: thug.z });
  }

  updateThugs(dt) {
    const player = this.player;
    const px = player.position.x;
    const pz = player.position.z;

    if (this.stagedThugs) {
      // A posed shot: hold them still, but keep them breathing.
      for (const thug of this.thugs) {
        if (thug.dead) continue;
        thug.character.animate(dt, { speed: 0, grounded: true, sprinting: false, surface: 'pavement' });
      }
      return;
    }

    for (const thug of this.thugs) {
      if (thug.dead) {
        thug.deadTimer -= dt;
        continue;
      }
      const dx = px - thug.x;
      const dz = pz - thug.z;
      const distance = Math.hypot(dx, dz) || 1;
      thug.heading = Math.atan2(dx, dz);
      thug.cooldown -= dt;

      if (!this.isDown && distance < 30 && thug.cooldown <= 0) {
        thug.cooldown = thug.boss ? 1.35 : 1.8 + Math.random() * 0.8;
        const originY = thug.y + 1.35;
        this.effects.muzzle(thug.x + Math.sin(thug.heading) * 0.4, originY, thug.z + Math.cos(thug.heading) * 0.4, {
          scale: 0.7,
        });
        this.effects.tracer(
          { x: thug.x, y: originY, z: thug.z },
          { x: px, y: player.position.y + 1.1, z: pz },
          { color: 0xff9f6a, width: 0.028 },
        );
        // Close range is far more likely to land than a shot across the street.
        if (Math.random() < (distance < 12 ? 0.8 : 0.55)) {
          this.damagePlayer(thug.boss ? 11 : 7, { cause: 'thug', x: thug.x, z: thug.z });
        }
        bus.emit('combat:thugfire', { x: thug.x, z: thug.z });
      }

      if (distance > 2.1 && distance < 34) {
        const speed = thug.boss ? 2.2 : 2.7;
        const step = Math.min(speed * dt, distance - 1.8);
        const resolved = this.world.resolveCircle(
          thug.x + (dx / distance) * step,
          thug.z + (dz / distance) * step,
          0.36,
        );
        thug.x = resolved.x;
        thug.z = resolved.z;
        thug.speed = speed;
      } else {
        thug.speed = 0;
      }

      const surface = this.world.walk.surfaceAt(thug.x, thug.z);
      thug.y = surface.y;
      thug.object.position.set(thug.x, thug.y, thug.z);
      thug.object.rotation.y = thug.heading;
      thug.character.animate(dt, { speed: thug.speed, grounded: true, sprinting: false, surface: surface.kind });
    }

    // Clear the corpses once the missions have had time to count them.
    for (let index = this.thugs.length - 1; index >= 0; index -= 1) {
      const thug = this.thugs[index];
      if (!thug.dead || thug.deadTimer > 0) continue;
      this.scene.remove(thug.object);
      this.thugs.splice(index, 1);
    }
  }

  /** Kills by tag, for the mission system's objective checks. */
  countDead(tag) {
    return this.deaths.reduce((sum, entry) => sum + (entry.tag === tag ? 1 : 0), 0);
  }

  countAlive(tag) {
    return this.thugs.reduce((sum, thug) => sum + (!thug.dead && thug.tag === tag ? 1 : 0), 0);
  }

  clearThugs(tag = null) {
    for (let index = this.thugs.length - 1; index >= 0; index -= 1) {
      const thug = this.thugs[index];
      if (tag && thug.tag !== tag) continue;
      this.scene.remove(thug.object);
      this.thugs.splice(index, 1);
    }
  }

  // ---------------------------------------------------------------- player damage
  damagePlayer(amount, { cause = 'hit', x = null, z = null } = {}) {
    // A short invulnerability window stops a burst of shots from stacking into one frame.
    if (this.isDown || this.invuln > 0) return;
    this.invuln = 0.12;
    this.lastDamage = 0;

    // Armour soaks most of a hit until it is gone; health takes the remainder.
    let remaining = amount;
    if (this.armour > 0) {
      const absorbed = Math.min(this.armour, remaining * 0.7);
      this.armour -= absorbed;
      remaining -= absorbed;
    }
    this.health = Math.max(0, this.health - remaining);
    bus.emit('health:change', { health: this.health, armour: this.armour, cause, x, z });
    if (this.health <= 0) this.down(cause);
  }

  down(cause) {
    if (this.isDown) return;
    // Wasted or busted: whoever is standing over the body decides.
    const kind = this.resolveDown ? this.resolveDown(cause) : 'wasted';
    this.downKind = kind === 'busted' ? 'busted' : 'wasted';
    this.downTimer = DOWN_TIME;
    this.stats.downed += 1;
    this.fireHeld = false;
    this.fireQueued = false;
    bus.emit('player:down', { kind: this.downKind, cause });
    if (this.hud) this.hud.notify(this.downKind === 'busted' ? 'Busted' : 'Wasted', 'danger');
  }

  respawn() {
    const kind = this.downKind;
    const spawn = kind === 'busted' ? this.policeSpawn() : this.hospitalSpawn();
    if (this.vehicles?.activeCar) this.vehicles.exit(this.player);

    this.player.teleport(spawn.x, spawn.z, spawn.heading, spawn.y ?? null);
    this.player.character.rest();
    this.health = MAX_HEALTH;
    this.armour = 0;
    this.lastDamage = 99;
    this.invuln = 1.4;
    this.downKind = null;
    this.downTimer = 0;

    if (this.cameraRig) {
      this.cameraRig.anchor.x = spawn.x;
      this.cameraRig.anchor.z = spawn.z;
      this.cameraRig.yaw = spawn.heading;
      this.cameraRig.timeSinceLook = 0;
    }
    bus.emit('player:respawn', { kind, x: spawn.x, z: spawn.z });
    bus.emit('health:change', { health: this.health, armour: this.armour, cause: 'respawn' });
  }

  hospitalSpawn() {
    const spawn = this.world.spawnById?.('marina') ?? { x: -360, z: 60 };
    // A few steps off the spawn point, on the pavement.
    const x = spawn.x + 12;
    const z = spawn.z + 14;
    return { x, z, y: this.world.walk.surfaceAt(x, z).y, heading: Math.PI };
  }

  policeSpawn() {
    const spawn = this.world.spawnById?.('downtown-boulevard') ?? { x: 340, z: 80 };
    // Outside the station on the Avenida Sol.
    const x = spawn.x - 16;
    const z = spawn.z - 12;
    return { x, z, y: this.world.walk.surfaceAt(x, z).y, heading: 0 };
  }

  // ---------------------------------------------------------------- loop
  update(dt, { input = null } = {}) {
    this.effects.update(dt);
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.firing = Math.max(0, this.firing - dt);
    this.punch = Math.max(0, this.punch - dt);
    this.invuln = Math.max(0, this.invuln - dt);

    // Down: the body waits out the timer, then respawns. Nothing else simulates.
    if (this.isDown) {
      this.downTimer -= dt;
      if (this.downTimer <= 0) this.respawn();
      return;
    }

    // Reload finishes on a timer; the clip is topped up from the reserve.
    if (this.reloadTimer > 0) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) {
        const weapon = this.weapon;
        const ammo = this.ammo[weapon.id];
        if (ammo && !weapon.melee) {
          const moved = Math.min(weapon.clipSize - ammo.clip, ammo.reserve);
          ammo.clip += moved;
          ammo.reserve -= moved;
          bus.emit('weapon:reloaded', { id: weapon.id, clip: ammo.clip, reserve: ammo.reserve });
        }
      }
    }

    // Health recovers slowly once the street has been quiet for a while.
    this.lastDamage += dt;
    if (this.lastDamage > REGEN_DELAY && this.health < this.maxHealth) {
      const before = this.health;
      this.health = Math.min(this.maxHealth, this.health + REGEN_RATE * dt);
      // Only notify when the whole number moves; the bar would otherwise emit every frame.
      if (Math.floor(before) !== Math.floor(this.health)) {
        bus.emit('health:change', { health: this.health, armour: this.armour, cause: 'regen' });
      }
    }

    // A held trigger keeps firing at the weapon's own rate; a queued pull fires once.
    if (!this.suspended && (this.fireHeld || this.fireQueued)) this.attack();
    this.fireQueued = false;

    this.updateThugs(dt);

    // The gun and the punch arm: the player system animates the rig, so the aim pose is
    // applied afterwards, on the same frame.
    if (this.gun) this.gun.visible = !this.weapon.melee && !this.isDown;
    const arm = this.player.character?.parts?.rightArm?.pivot;
    if (arm) {
      if (this.punch > 0) arm.rotation.x = -1.5 * clamp01(this.punch / 0.22);
      else if (!this.weapon.melee) arm.rotation.x = damp(arm.rotation.x, -0.34, 12, dt);
    }
  }

  /** Published consequence, rate-limited so one burst of shots is one report. */
  emitCrime(crime) {
    const now = this.world.elapsed ?? 0;
    if (now - this.lastCrime < CRIME_INTERVAL) return;
    this.lastCrime = now;
    bus.emit('crime', { ...crime, at: now });
  }

  onCrash(event) {
    const car = this.vehicles?.activeCar;
    if (!car || event.impact < 5) return;
    car.health = Math.max(0, (car.health ?? 100) - event.impact * 1.6);
    // The first time a car is written off, the game notices once.
    if (car.health <= 0 && !car.disabled) {
      car.disabled = true;
      bus.emit('vehicle:disabled', { x: car.x, z: car.z });
    }
  }

  // ---------------------------------------------------------------- shot staging
  /**
   * Poses a shot's muzzle flash and tracer with a long life so the capture sees it. Used by
   * the shootout scenario; gameplay never calls this.
   */
  stageFire(from, to, { scale = 1, color = 0xffd9a0 } = {}) {
    this.effects.muzzle(from.x, from.y, from.z, { life: 60, scale });
    this.effects.tracer(from, to, { life: 60, color, width: 0.04 });
    this.effects.impact(to.x, to.y, to.z, { life: 60, count: 14, speed: 1.2 });
    this.firing = 0.12;
  }
}
