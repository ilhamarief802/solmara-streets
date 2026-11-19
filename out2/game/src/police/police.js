// The wanted level and the response to it. Crimes on the bus raise stars, but only when
// somebody can see them: a pedestrian on the block, an officer, a cruiser. Cruisers spawn
// on lanes out of the player's view and chase through the road graph; at three stars the
// officers get out and shoot; at four a roadblock appears across the lane ahead. Staying
// unseen for long enough cools the level down a star at a time. The system owns no HUD:
// it publishes wanted:change and the HUD reads police.wanted.

import { clamp, dampAngle } from '../core/math.js';
import { bus } from '../core/events.js';
import { Random } from '../core/rng.js';
import { buildCarGroup } from '../vehicles/models.js';
import { createCharacter } from '../player/character.js';
import { PursuitCruiser } from './cruiser.js';

const SEVERITY = {
  gunshot: 1,
  assault: 1,
  kill: 2,
  carjack: 1,
  runover: 2,
  copshot: 2,
  copkill: 3,
};

const MAX_CRUISERS = 4;
const MAX_COPS = 5;
const CALM_AFTER = 8;
const CALM_DISTANCE = 62;
const DECAY_TIME = 6;

export class PoliceSystem {
  constructor({ world, scene, player, vehicles = null, traffic = null, pedestrians = null, combat = null, cameraRig = null, hud = null, seed = 1 }) {
    this.world = world;
    this.scene = scene;
    this.player = player;
    this.vehicles = vehicles;
    this.traffic = traffic;
    this.pedestrians = pedestrians;
    this.combat = combat;
    this.cameraRig = cameraRig;
    this.hud = hud;
    this.random = new Random(`${seed}:police`);
    this.wanted = 0;
    this.lastCrimeAt = -99;
    this.lastRaiseAt = -99;
    this.calm = 0;
    this.spawnClock = 1.2;
    this.blockClock = 14;
    this.cruisers = [];
    this.cops = [];
    this.stats = { spawned: 0, busted: 0, crimes: 0, arrests: 0 };
    this.sirenTimer = 0;
    this._offCrime = bus.on('crime', (crime) => this.onCrime(crime));
    this._offRespawn = bus.on('player:respawn', (event) => {
      if (event.kind === 'busted') this.clearWanted('busted');
      this.cops.length = 0;
    });
    this._fixLanes();
  }

  /** Traffic normally annotates the lanes; a police-only world still needs the ends. */
  _fixLanes() {
    const lanes = this.world.plan?.lanes ?? [];
    this.laneStart = new Map();
    for (const lane of lanes) {
      if (lane.startNode === undefined) {
        lane.startNode = lane.offset > 0 ? lane.edge.a : lane.edge.b;
        lane.endNode = lane.offset > 0 ? lane.edge.b : lane.edge.a;
      }
      const list = this.laneStart.get(lane.startNode);
      if (list) list.push(lane);
      else this.laneStart.set(lane.startNode, [lane]);
    }
    for (const lane of lanes) {
      const options = this.laneStart.get(lane.endNode);
      if (options) lane.nextOptions = options;
    }
  }

  setCombat(combat) {
    this.combat = combat;
  }

  setCameraRig(rig) {
    this.cameraRig = rig;
  }

  // ---------------------------------------------------------------- wanted
  setWanted(level, reason = 'script') {
    const next = clamp(Math.round(level), 0, 5);
    if (next === this.wanted) return this.wanted;
    const previous = this.wanted;
    this.wanted = next;
    if (next > previous) this.lastCrimeAt = this.world.elapsed ?? 0;
    if (next < previous || next === 0) this.calm = 0;
    this.spawnClock = Math.min(this.spawnClock, 0.4);
    bus.emit('wanted:change', { wanted: next, previous, reason, stars: next });
    if (this.hud) {
      if (next > previous) this.hud.notify(`Wanted level ${next}`, 'danger');
      else if (next === 0) this.hud.notify('You are clear', 'info');
    }
    if (next === 0) this.dismiss(true);
    bus.emit('police:siren', { wanted: next, active: next > 0 });
    return next;
  }

  raise(levels, reason, x = null, z = null) {
    if (!levels) return this.wanted;
    const next = clamp(this.wanted + levels, 0, 5);
    this.lastCrimeAt = this.world.elapsed ?? 0;
    if (next === this.wanted) {
      // Same stars, but the chase clock resets.
      return this.wanted;
    }
    const previous = this.wanted;
    this.wanted = next;
    this.calm = 0;
    this.spawnClock = Math.min(this.spawnClock, 0.4);
    bus.emit('wanted:change', { wanted: next, previous, reason, stars: next, x, z });
    if (this.hud) this.hud.notify(`Wanted level ${next}`, 'danger');
    bus.emit('police:siren', { wanted: next, active: true });
    return next;
  }

  clearWanted(reason = 'cleared') {
    if (this.wanted === 0) return;
    const previous = this.wanted;
    this.wanted = 0;
    this.calm = 0;
    bus.emit('wanted:change', { wanted: 0, previous, reason, stars: 0 });
    bus.emit('police:siren', { wanted: 0, active: false });
    this.dismiss(true);
  }

  /** True when the crime has a witness: anyone close enough to have seen or heard it. */
  hasWitness(x, z) {
    const px = x ?? this.player.position.x;
    const pz = z ?? this.player.position.z;
    for (const cop of this.cops) {
      if (!cop.dead && Math.hypot(cop.x - px, cop.z - pz) < 62) return true;
    }
    for (const cruiser of this.cruisers) {
      if (Math.hypot(cruiser.x - px, cruiser.z - pz) < 80) return true;
    }
    if (this.pedestrians) {
      for (const ped of this.pedestrians.peds) {
        if (!ped.dead && Math.hypot(ped.x - px, ped.z - pz) < 42) return true;
      }
    }
    return false;
  }

  onCrime(crime) {
    if (!crime || !crime.type) return;
    this.stats.crimes += 1;
    const levels = SEVERITY[crime.type] ?? 1;
    // Gunfire is heard: a shot raises less than a body, but it is never silent downtown.
    if (!this.hasWitness(crime.x, crime.z) && crime.type !== 'copshot' && crime.type !== 'copkill') return;
    const now = this.world.elapsed ?? 0;
    if (crime.type === 'gunshot' && now - this.lastRaiseAt < 0.8) return;
    this.lastRaiseAt = now;
    this.raise(levels, crime.type, crime.x, crime.z);
  }

  /** Called by the vehicle system when the player takes a car in front of witnesses. */
  onCarjack(x, z) {
    if (!this.hasWitness(x, z)) return;
    this.raise(1, 'carjack', x, z);
  }

  /** Called when the player's car knocks a body down. */
  onRunover(x, z) {
    this.raise(2, 'runover', x, z);
  }

  get threatDistance() {
    let best = Infinity;
    for (const cruiser of this.cruisers) {
      best = Math.min(best, Math.hypot(cruiser.x - this.player.position.x, cruiser.z - this.player.position.z));
    }
    for (const cop of this.cops) {
      if (cop.dead) continue;
      best = Math.min(best, Math.hypot(cop.x - this.player.position.x, cop.z - this.player.position.z));
    }
    return best;
  }

  get nearestCopDistance() {
    return this.threatDistance;
  }

  isBustedNearby() {
    return this.wanted > 0 && this.threatDistance < 26;
  }

  // ---------------------------------------------------------------- spawning
  /** A lane 110..270 m away, preferably behind the player and out of the camera. */
  pickSpawnLane() {
    const lanes = this.world.plan?.lanes ?? [];
    if (!lanes.length) return null;
    const player = this.player.position;
    const forward = { x: Math.sin(this.player.heading), z: Math.cos(this.player.heading) };
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const lane = this.random.pick(lanes);
      const x = lane.from.x + lane.dirX * lane.length * 0.5;
      const z = lane.from.z + lane.dirZ * lane.length * 0.5;
      const distance = Math.hypot(x - player.x, z - player.z);
      if (distance < 105 || distance > 275) continue;
      const nx = (x - player.x) / distance;
      const nz = (z - player.z) / distance;
      const ahead = nx * forward.x + nz * forward.z;
      if (ahead > 0.25 && distance < 170) continue;
      return lane;
    }
    return this.random.pick(lanes);
  }

  spawnCruiser(lane = null, { mode = 'chase', x = null, z = null, heading = null } = {}) {
    if (this.cruisers.length >= MAX_CRUISERS + 2) return null;
    let cruiser;
    if (x !== null && z !== null) {
      cruiser = new PursuitCruiser({
        world: this.world,
        x,
        z,
        heading: heading ?? 0,
        lane: lane ?? PursuitCruiser.nearestLane(this.world, x, z).lane,
        mode,
      });
    } else {
      const chosen = lane ?? this.pickSpawnLane();
      if (!chosen) return null;
      cruiser = PursuitCruiser.fromLane(this.world, chosen, null, mode);
    }
    if (mode === 'block') {
      cruiser.heading += Math.PI / 2;
      cruiser.speed = 0;
    }
    const view = buildCarGroup('police', 0xe9e9e2);
    this.scene.add(view.group);
    cruiser.attach(view);
    this.cruisers.push(cruiser);
    this.stats.spawned += 1;
    bus.emit('police:spawn', { x: cruiser.x, z: cruiser.z, mode, wanted: this.wanted });
    return cruiser;
  }

  /** Roadblocks: two cruisers across the lane ahead at four stars and up. */
  spawnRoadblock() {
    const player = this.player.position;
    const fx = Math.sin(this.player.heading);
    const fz = Math.cos(this.player.heading);
    const aheadX = player.x + fx * 90;
    const aheadZ = player.z + fz * 90;
    const found = this.traffic?.laneNear ? this.traffic.laneNear(aheadX, aheadZ, this.player.heading, 22) : null;
    if (!found) return 0;
    const lane = found.lane;
    const along = clamp(found.along, 4, lane.length - 8);
    let placed = 0;
    for (const offset of [-0.55, 0.55]) {
      if (this.cruisers.length >= MAX_CRUISERS + 2) break;
      const s = clamp(along + offset * 8, 2, lane.length - 4);
      const x = lane.from.x + lane.dirX * s;
      const z = lane.from.z + lane.dirZ * s;
      const heading = Math.atan2(lane.dirX, lane.dirZ) + Math.PI / 2;
      if (this.spawnCruiser(lane, { mode: 'block', x, z, heading })) placed += 1;
    }
    if (placed) bus.emit('police:roadblock', { x: aheadX, z: aheadZ, count: placed });
    return placed;
  }

  spawnCop(x, z) {
    if (this.cops.length >= MAX_COPS) return null;
    const character = createCharacter({ jacket: 0x2b3c5e, sleeve: 0x1f2c46, beanie: 0x141d2c });
    character.root.name = 'police-officer';
    this.scene.add(character.root);
    const surface = this.world.walk.surfaceAt(x, z);
    const gun = new THREE.Group();
    const gunMesh = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.07, 0.26), new THREE.MeshLambertMaterial({ color: 0x1b1e22 }));
    gunMesh.position.set(0, -0.58, 0.16);
    gun.add(gunMesh);
    character.parts.rightArm.pivot.add(gun);
    const cop = {
      x,
      z,
      y: surface.y,
      heading: 0,
      health: 70,
      dead: false,
      deadTimer: 0,
      cooldown: 0.6 + Math.random() * 0.6,
      object: character.root,
      character,
      speed: 0,
    };
    character.root.position.set(x, surface.y, z);
    this.cops.push(cop);
    return cop;
  }

  hitCop(cop, damage, direction) {
    if (!cop || cop.dead) return;
    cop.health -= damage;
    if (direction) cop.heading = Math.atan2(direction.x, direction.z);
    if (cop.health > 0) return;
    cop.dead = true;
    cop.deadTimer = 26;
    cop.object.rotation.x = -Math.PI / 2;
    cop.object.position.y = cop.y + 0.3;
    this.raise(2, 'copshot', cop.x, cop.z);
    bus.emit('npc:dead', { kind: 'cop', x: cop.x, z: cop.z });
  }

  // ---------------------------------------------------------------- loop
  update(dt) {
    const player = this.player;
    const elapsed = this.world.elapsed ?? 0;

    // A staged shot owns the frame: the response stands where it was put, sirens and all.
    if (this.staged) {
      for (const cruiser of this.cruisers) {
        cruiser.blink += dt;
        cruiser.updateLights();
        cruiser.syncView(dt);
      }
      return;
    }

    // Decay: quiet streets and distance cool the level one star at a time.
    if (this.wanted > 0) {
      if (elapsed - this.lastCrimeAt > CALM_AFTER && this.threatDistance > CALM_DISTANCE) this.calm += dt;
      else this.calm = 0;
      if (this.calm > DECAY_TIME) {
        this.calm = 0;
        this.wanted -= 1;
        bus.emit('wanted:change', { wanted: this.wanted, previous: this.wanted + 1, reason: 'cooled', stars: this.wanted });
        bus.emit('police:siren', { wanted: this.wanted, active: this.wanted > 0 });
        if (this.wanted === 0) this.dismiss(false);
      }
    }

    const desired = this.wanted === 0 ? 0 : Math.min(MAX_CRUISERS, this.wanted);
    this.spawnClock -= dt;
    if (this.cruisers.length < desired && this.spawnClock <= 0) {
      this.spawnClock = this.wanted >= 3 ? 2.2 : 3.6;
      this.spawnCruiser();
    }

    if (this.wanted >= 4) {
      this.blockClock -= dt;
      if (this.blockClock <= 0) {
        this.blockClock = 17;
        const blocks = this.cruisers.filter((cruiser) => cruiser.mode === 'block').length;
        if (blocks < 2) this.spawnRoadblock();
      }
    }

    const playerCar = this.vehicles?.activeCar ?? null;
    for (let index = this.cruisers.length - 1; index >= 0; index -= 1) {
      const cruiser = this.cruisers[index];
      if (this.wanted === 0 && !cruiser.dismissed) {
        cruiser.dismissed = true;
        cruiser.mode = 'leave';
      }
      cruiser.update(dt, player, { wanted: Math.max(1, this.wanted), cameraPosition: null });
      const distance = Math.hypot(cruiser.x - player.position.x, cruiser.z - player.position.z);

      // Ramming: the player's car takes a shove and a knock on the camera.
      if (playerCar && cruiser.ramCooldown <= 0) {
        const carDistance = Math.hypot(cruiser.x - playerCar.x, cruiser.z - playerCar.z);
        if (carDistance < 4.4) {
          cruiser.ramCooldown = 1.4;
          const nx = (playerCar.x - cruiser.x) / (carDistance || 1);
          const nz = (playerCar.z - cruiser.z) / (carDistance || 1);
          const shove = 2.6 + this.wanted * 0.5;
          playerCar.vx += nx * shove;
          playerCar.vz += nz * shove;
          playerCar.speed *= 0.92;
          if (this.cameraRig?.kick) this.cameraRig.kick(0.18);
          if (this.combat) this.combat.damagePlayer(3 + this.wanted, { cause: 'ram', x: cruiser.x, z: cruiser.z });
          bus.emit('police:ram', { x: cruiser.x, z: cruiser.z, wanted: this.wanted });
        }
      }
      if (!playerCar && distance < 2.1 && cruiser.speed > 4 && cruiser.ramCooldown <= 0) {
        cruiser.ramCooldown = 2.4;
        if (this.combat) this.combat.damagePlayer(24, { cause: 'cruiser', x: cruiser.x, z: cruiser.z });
        bus.emit('police:ram', { x: cruiser.x, z: cruiser.z, wanted: this.wanted });
      }

      // Officers deploy once a cruiser is close and slow, at three stars and up.
      if (this.wanted >= 3 && distance < 34 && cruiser.speed < 3.4 && this.cops.length < MAX_COPS && !cruiser.deployed) {
        cruiser.deployed = true;
        cruiser.deployClock = 4;
        this.spawnCop(cruiser.x + 2.2, cruiser.z + 1.2);
        this.spawnCop(cruiser.x - 2.2, cruiser.z - 1.2);
      }

      const retire = cruiser.mode === 'leave' ? distance > 120 : distance > 430;
      if (retire) {
        this.scene.remove(cruiser.view.group);
        this.cruisers.splice(index, 1);
      }
    }

    this.updateCops(dt);
    this.checkRunovers();

    // Sirens are a signal for the audio session, not a sound made here.
    this.sirenTimer -= dt;
    if (this.wanted > 0 && this.sirenTimer <= 0) {
      this.sirenTimer = 2.5;
      bus.emit('police:siren', {
        wanted: this.wanted,
        active: true,
        x: this.cruisers[0]?.x ?? player.position.x,
        z: this.cruisers[0]?.z ?? player.position.z,
      });
    }
  }

  updateCops(dt) {
    const player = this.player;
    const px = player.position.x;
    const pz = player.position.z;
    for (let index = this.cops.length - 1; index >= 0; index -= 1) {
      const cop = this.cops[index];
      if (cop.dead) {
        cop.deadTimer -= dt;
        if (cop.deadTimer <= 0) {
          this.scene.remove(cop.object);
          this.cops.splice(index, 1);
        }
        continue;
      }
      if (this.wanted === 0) {
        // The heat is gone: the officer walks away rather than standing there forever.
        this.scene.remove(cop.object);
        this.cops.splice(index, 1);
        continue;
      }
      const dx = px - cop.x;
      const dz = pz - cop.z;
      const distance = Math.hypot(dx, dz) || 1;
      cop.heading = dampAngle(cop.heading, Math.atan2(dx, dz), 9, dt);
      cop.cooldown -= dt;

      if (distance < 27 && cop.cooldown <= 0 && this.combat && !this.combat.isDown) {
        cop.cooldown = 1.5 + Math.random() * 0.9;
        const originY = cop.y + 1.4;
        this.combat.effects.muzzle(
          cop.x + Math.sin(cop.heading) * 0.45,
          originY,
          cop.z + Math.cos(cop.heading) * 0.45,
          { scale: 0.72, color: 0xffd9a0 },
        );
        this.combat.effects.tracer(
          { x: cop.x, y: originY, z: cop.z },
          { x: px, y: player.position.y + 1.15, z: pz },
          { color: 0xffb066, width: 0.03 },
        );
        if (Math.random() < (distance < 12 ? 0.72 : 0.45)) {
          this.combat.damagePlayer(7 + Math.random() * 4, { cause: 'police', x: cop.x, z: cop.z });
        }
        bus.emit('combat:copfire', { x: cop.x, z: cop.z });
      }

      if (distance > 2.4 && distance < 70) {
        const speed = distance > 16 ? 4.2 : 2.6;
        const step = Math.min(speed * dt, distance - 1.8);
        const resolved = this.world.resolveCircle(cop.x + (dx / distance) * step, cop.z + (dz / distance) * step, 0.34);
        cop.x = resolved.x;
        cop.z = resolved.z;
        cop.speed = speed;
      } else {
        cop.speed = 0;
      }
      const surface = this.world.walk.surfaceAt(cop.x, cop.z);
      cop.y = surface.y;
      cop.object.position.set(cop.x, cop.y, cop.z);
      cop.object.rotation.y = cop.heading;
      cop.character.animate(dt, { speed: cop.speed, grounded: true, sprinting: distance > 18, surface: surface.kind });
    }
  }

  /** The player's car, moving with intent, hits a body: a crime and a knock-on effect. */
  checkRunovers() {
    const car = this.vehicles?.activeCar;
    if (!car || Math.abs(car.speed) < 4.5) return;
    const now = this.world.elapsed ?? 0;
    if (now - (this.lastRunover ?? -99) < 0.3) return;
    const dir = { x: Math.sin(car.heading), z: Math.cos(car.heading) };
    for (const ped of this.pedestrians?.peds ?? []) {
      if (ped.dead) continue;
      if (now - (ped.lastRunover ?? -99) < 2) continue;
      if (Math.hypot(ped.x - car.x, ped.z - car.z) > 2.1) continue;
      ped.lastRunover = now;
      this.lastRunover = now;
      this.combat?.hitPed(ped, 55, dir);
      this.onRunover(ped.x, ped.z);
      car.speed *= 0.84;
      bus.emit('police:runover', { x: ped.x, z: ped.z });
      return;
    }
    for (const cop of this.cops) {
      if (cop.dead) continue;
      if (Math.hypot(cop.x - car.x, cop.z - car.z) > 2.3) continue;
      cop.health = 0;
      this.combat?.hitCop(cop, 200, dir);
      bus.emit('police:runover', { x: cop.x, z: cop.z, cop: true });
      return;
    }
  }

  /** Everyone leaves after a bust, a clear or a scripted reset. */
  dismiss(force = false) {
    for (const cruiser of this.cruisers) {
      if (!cruiser.dismissed) cruiser.dismissed = true;
    }
    if (force) {
      for (const cruiser of this.cruisers) this.scene.remove(cruiser.view.group);
      this.cruisers.length = 0;
      for (const cop of this.cops) this.scene.remove(cop.object);
      this.cops.length = 0;
    }
  }

  /** HUD/minimap dots. */
  get mapDots() {
    return {
      cruisers: this.cruisers.map((cruiser) => cruiser.mapDot),
      cops: this.cops.filter((cop) => !cop.dead).map((cop) => ({ x: cop.x, z: cop.z })),
    };
  }

  get info() {
    return {
      wanted: this.wanted,
      cruisers: this.cruisers.length,
      cops: this.cops.filter((cop) => !cop.dead).length,
      threat: Math.round(this.threatDistance),
      calm: Math.round(this.calm),
    };
  }
}
