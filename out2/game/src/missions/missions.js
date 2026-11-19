// Missions. One job at a time, read from definitions.js: a marker in the world and on the
// map, a short brief, timed steps that advance on distance, kills or checkpoints, a
// reward paid into the wallet, and a simple localStorage save so the story survives a
// reload. The shop on the Avenida sells armour, ammunition, a shotgun and repairs, and
// the whole system only touches the other systems through their public methods and the
// event bus.

import { clamp } from '../core/math.js';
import { bus } from '../core/events.js';
import { Random } from '../core/rng.js';
import { MISSIONS, MISSION_ORDER, SHOP } from './definitions.js';
import { ChaseCar } from './chasecar.js';

const SAVE_KEY = 'solmara.save.v1';
const START_MONEY = 750;

/** Shop slot: what each purchase does. Prices are intentional — armour is the cheapest. */
const SHOP_PRICES = { armour: 250, pistolAmmo: 120, shotgunAmmo: 90, shotgun: 450, repair: 150 };

export class MissionSystem {
  constructor({ world, scene, player, vehicles, police, combat, hud, seed = 1 }) {
    this.world = world;
    this.scene = scene;
    this.player = player;
    this.vehicles = vehicles;
    this.police = police;
    this.combat = combat;
    this.hud = hud;
    this.random = new Random(`${seed}:missions`);
    this.money = START_MONEY;
    this.completed = [];
    this.active = null;
    this.chaseCar = null;
    this.checkpointIndex = 0;
    this.shopOpen = false;
    this.silent = false;
    this.markersHidden = false;
    this.markerPulse = 0;
    this.shopPulse = 0;
    this.stats = { completed: 0, failed: 0, spent: 0, earned: 0 };
    this.buildMarkers();
    this._offDown = bus.on('player:down', () => this.fail('down'));
    this.load();
  }

  // ---------------------------------------------------------------- markers
  buildMarkers() {
    const build = (color, height, radius) => {
      const group = new THREE.Group();
      const shaft = new THREE.Mesh(
        new THREE.CylinderGeometry(0.22, radius, height, 16, 1, true),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }),
      );
      shaft.position.y = height / 2;

      const ring = new THREE.Mesh(
        new THREE.RingGeometry(radius * 0.72, radius, 28),
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.65,
          side: THREE.DoubleSide,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.06;

      const diamond = new THREE.Mesh(new THREE.OctahedronGeometry(0.34), new THREE.MeshBasicMaterial({ color }));
      diamond.position.y = height * 0.62;

      group.add(shaft, ring, diamond);
      group.visible = false;
      this.scene.add(group);
      return { group, shaft, ring, diamond, height, radius };
    };
    this.marker = build(0xffd166, 6.2, 1.65);
    this.shopMarker = build(0x7fe0c3, 4.2, 1.15);
  }

  updateMarker(marker, x, z, dt, pulse) {
    if (x === null || this.markersHidden) {
      marker.group.visible = false;
      return;
    }
    marker.group.position.set(x, this.world.walk.surfaceAt(x, z).y, z);
    marker.group.visible = true;
    marker.diamond.rotation.y += dt * 1.7;
    marker.diamond.position.y = marker.height * 0.62 + Math.sin(pulse * 2.1) * 0.16;
    marker.ring.scale.setScalar(1 + Math.sin(pulse * 3.4) * 0.06);
  }

  /** The point the mission marker should sit on this frame, or null when hidden. */
  get markerPoint() {
    if (!this.active) {
      const next = this.nextMission;
      return next ? { ...next.start } : null;
    }
    const step = this.currentStep;
    if (!step) return null;

    if (step.type === 'chase') {
      return this.chaseCar ? { x: this.chaseCar.x, z: this.chaseCar.z } : { ...step.spawn };
    }
    if (step.type === 'killAll') {
      // Sit the marker on the middle of the survivors, so it tracks the fight.
      const alive = (this.combat?.thugs ?? []).filter((thug) => !thug.dead && thug.tag === this.stepTag);
      if (!alive.length) return { ...step.spawns[0] };
      let sx = 0;
      let sz = 0;
      for (const thug of alive) {
        sx += thug.x;
        sz += thug.z;
      }
      return { x: sx / alive.length, z: sz / alive.length };
    }
    if (step.type === 'checkpoints') {
      return step.points[Math.min(this.checkpointIndex, step.points.length - 1)];
    }
    if (step.type === 'escape') return null;
    return step.marker ? { ...step.marker } : null;
  }

  /** For the minimap: the mission diamond plus the shop. */
  get markers() {
    if (this.markersHidden) return [];
    const point = this.markerPoint;
    return [
      { x: point?.x ?? 0, z: point?.z ?? 0, kind: 'mission', hidden: !point },
      { x: SHOP.x, z: SHOP.z, kind: 'shop', hidden: false },
    ];
  }

  // ---------------------------------------------------------------- story
  get nextMission() {
    for (const id of MISSION_ORDER) {
      if (this.completed.includes(id)) continue;
      return MISSIONS.find((mission) => mission.id === id) ?? null;
    }
    return null;
  }

  get currentStep() {
    if (!this.active) return null;
    return this.active.def.steps[this.active.stepIndex] ?? null;
  }

  /** The tag every actor placed for the current step carries. */
  get stepTag() {
    if (!this.active) return null;
    return `${this.active.def.id}:${this.active.stepIndex}`;
  }

  get timerFraction() {
    const step = this.currentStep;
    if (!step?.time || !this.active) return 1;
    return clamp(this.active.timer / step.time, 0, 1);
  }

  /** What the HUD mission card shows. */
  get objective() {
    const step = this.currentStep;
    if (!this.active || !step) return null;
    return {
      title: this.active.def.title,
      text: step.text,
      timer: this.active.timer,
      timerFraction: this.timerFraction,
      step: this.active.stepIndex + 1,
      total: this.active.def.steps.length,
      hint: step.hint ?? '',
    };
  }

  distanceTo(point) {
    if (!point) return Infinity;
    return Math.hypot(point.x - this.player.position.x, point.z - this.player.position.z);
  }

  get nearShop() {
    return this.distanceTo(SHOP) < 5.5;
  }

  get nearStart() {
    const next = this.nextMission;
    return Boolean(next) && this.distanceTo(next.start) < 4.5;
  }

  /** The one contextual line for the action key. */
  prompt() {
    if (this.shopOpen) return 'E  Close the shop';
    if (this.nearShop) return 'E  Shop · armour, guns, repairs';
    if (!this.active && this.nearStart) return `E  Start “${this.nextMission.title}”`;
    // A by-car step is unstartable from the pavement; say so before the player tries.
    if (this.active && this.currentStep?.byCar && !this.vehicles?.activeCar) {
      const point = this.markerPoint;
      if (point && this.distanceTo(point) < 30) return 'Find a car';
    }
    return '';
  }

  /** The action key: shop first, then a mission start. Returns true when handled. */
  interact() {
    if (this.shopOpen) {
      this.closeShop();
      return true;
    }
    if (this.nearShop) {
      this.openShop();
      return true;
    }
    if (!this.active && this.nearStart) {
      this.start(this.nextMission.id);
      return true;
    }
    return false;
  }

  start(id, { scripted = false, stepIndex = 0 } = {}) {
    if (this.active) return false;
    const def = MISSIONS.find((mission) => mission.id === id);
    if (!def) return false;
    if (!scripted && this.nextMission?.id !== id) return false;

    this.silent = scripted;
    this.active = { def, stepIndex: 0, timer: def.steps[0].time ?? null, startedAt: this.world.elapsed };
    this.enterStep(stepIndex);
    bus.emit('mission:start', { id, title: def.title, reward: def.reward });
    if (!this.silent) {
      const line = def.dialogue?.[0];
      this.hud?.notify(line ? `${line.who}: ${line.line}` : def.title, 'info');
    }
    return true;
  }

  /** Shot hook: start a mission at a step without touching story order or the save. */
  startAt(id, stepIndex = 0) {
    this.active = null;
    return this.start(id, { scripted: true, stepIndex });
  }

  enterStep(index) {
    if (!this.active) return;
    const def = this.active.def;
    const step = def.steps[index];
    if (!step) {
      this.completeMission();
      return;
    }

    this.active.stepIndex = index;
    this.active.timer = step.time ?? null;
    this.active.stepStartedAt = this.world.elapsed;
    this.checkpointIndex = 0;

    // Every step starts by clearing whatever the last one left behind.
    if (this.chaseCar) {
      this.chaseCar.dispose();
      this.chaseCar = null;
    }

    if (step.type === 'chase') {
      this.chaseCar = new ChaseCar({
        world: this.world,
        scene: this.scene,
        x: step.spawn.x,
        z: step.spawn.z,
        heading: step.spawn.heading ?? 0,
        color: step.spawn.color ?? 0x9a2028,
        seed: this.world.seed,
      });
    }

    if (step.type === 'killAll') {
      const tag = this.stepTag;
      for (const spawn of step.spawns) {
        this.combat?.spawnThug({
          x: spawn.x,
          z: spawn.z,
          health: spawn.health ?? 80,
          boss: Boolean(spawn.boss),
          tag,
          heading: Math.atan2(this.player.position.x - spawn.x, this.player.position.z - spawn.z),
        });
      }
    }

    if (step.type === 'escape' && step.heat) {
      const missing = Math.max(0, step.heat - (this.police?.wanted ?? 0));
      if (missing > 0) this.police?.raise(missing, 'finale');
    }

    bus.emit('mission:step', {
      id: def.id,
      step: index + 1,
      total: def.steps.length,
      text: step.text,
      type: step.type,
    });
    if (!this.silent && index > 0) this.hud?.notify(step.text, 'info');
  }

  /** Drops the actors and props the current step owns. */
  clearStepActors() {
    if (this.chaseCar) {
      this.chaseCar.dispose();
      this.chaseCar = null;
    }
    if (this.currentStep?.type === 'killAll') this.combat?.clearThugs(this.stepTag);
  }

  completeStep() {
    if (!this.active) return;
    const def = this.active.def;
    this.clearStepActors();

    const next = this.active.stepIndex + 1;
    if (next >= def.steps.length) {
      this.completeMission();
      return;
    }
    bus.emit('mission:step:complete', { id: def.id, step: this.active.stepIndex + 1 });
    this.enterStep(next);
  }

  completeMission() {
    const def = this.active?.def;
    if (!def) return;
    const first = !this.completed.includes(def.id);
    if (first) this.completed.push(def.id);

    const { reward } = def;
    this.addMoney(reward, `mission:${def.id}`);
    this.stats.completed += 1;
    this.active = null;
    this.silent = false;
    this.save();
    this.hud?.notify(`Mission complete · $${reward.toLocaleString('en-US')}`, 'reward');
    bus.emit('mission:complete', { id: def.id, title: def.title, reward, completed: [...this.completed] });
  }

  fail(reason = 'failed') {
    if (!this.active) return;
    const { def } = this.active;
    this.clearStepActors();
    this.active = null;
    this.silent = false;
    this.stats.failed += 1;
    this.hud?.notify('Mission failed', 'danger');
    bus.emit('mission:fail', { id: def.id, reason });
  }

  // ---------------------------------------------------------------- wallet
  addMoney(amount, reason = 'reward') {
    this.money += amount;
    this.stats.earned += amount;
    bus.emit('money:change', { money: this.money, delta: amount, reason });
    this.save();
  }

  spend(amount, reason = 'purchase') {
    if (amount > this.money) return false;
    this.money -= amount;
    this.stats.spent += amount;
    bus.emit('money:change', { money: this.money, delta: -amount, reason });
    this.save();
    return true;
  }

  // ---------------------------------------------------------------- shop
  shopItems() {
    const hasShotgun = Boolean(this.combat?.unlocked?.shotgun);
    const items = [
      { key: '1', slot: 1, label: 'Body armour (100)', price: SHOP_PRICES.armour },
      { key: '2', slot: 2, label: 'Pistol ammo · 24 rounds', price: SHOP_PRICES.pistolAmmo },
      {
        key: '3',
        slot: 3,
        label: hasShotgun ? 'Shotgun shells · 12' : 'Shotgun + 24 shells',
        price: hasShotgun ? SHOP_PRICES.shotgunAmmo : SHOP_PRICES.shotgun,
      },
      { key: '4', slot: 4, label: 'Repair your car', price: SHOP_PRICES.repair },
    ];
    for (const item of items) item.affordable = this.money >= item.price;
    return items;
  }

  openShop() {
    if (!this.nearShop && !this.shopOpen) return false;
    this.shopOpen = true;
    this.hud?.showShop(this.shopItems());
    bus.emit('shop:open', { money: this.money });
    return true;
  }

  closeShop() {
    this.shopOpen = false;
    this.hud?.showShop(null);
    bus.emit('shop:close', { money: this.money });
  }

  /** Applies one purchase. The repair slot is refused when there is nothing to repair. */
  buy(slot) {
    if (!this.shopOpen) return false;
    const item = this.shopItems().find((entry) => entry.slot === slot);
    if (!item) return false;
    if (!item.affordable) {
      this.hud?.notify('Not enough money', 'danger');
      return false;
    }
    if (slot === 4 && !this.vehicles?.activeCar) {
      this.hud?.notify('You are not in a car', 'danger');
      return false;
    }

    if (!this.spend(item.price, `shop:${slot}`)) return false;
    if (slot === 1) this.combat?.addArmour(100);
    if (slot === 2) this.combat?.addAmmo('pistol', 24);
    if (slot === 3) {
      if (this.combat?.unlocked?.shotgun) this.combat.addAmmo('shotgun', 12);
      else this.combat?.grantWeapon('shotgun', { clip: 6, reserve: 24 });
    }
    if (slot === 4) {
      const { activeCar } = this.vehicles;
      activeCar.health = 100;
      activeCar.disabled = false;
    }

    this.hud?.notify(`Bought ${item.label}`, 'reward');
    if (this.shopOpen) this.hud?.showShop(this.shopItems());
    bus.emit('shop:buy', { slot, price: item.price, money: this.money });
    return true;
  }

  // ---------------------------------------------------------------- loop
  update(dt) {
    this.markerPulse += dt;
    this.shopPulse += dt;
    const point = this.markerPoint;
    this.updateMarker(this.marker, point?.x ?? null, point?.z ?? null, dt, this.markerPulse);
    this.updateMarker(this.shopMarker, SHOP.x, SHOP.z, dt, this.shopPulse);

    if (!this.active) return;
    const step = this.currentStep;
    if (!step) return;

    if (this.active.timer !== null) {
      this.active.timer -= dt;
      if (this.active.timer <= 0) {
        this.active.timer = 0;
        this.fail('time');
        return;
      }
    }

    const player = this.player.position;
    const reached = (target, radius) => this.distanceTo(target) < (radius ?? 9);

    switch (step.type) {
      case 'goto':
        // A by-car objective is not complete until the player arrives in one.
        if (reached(step.marker, step.radius) && (!step.byCar || this.vehicles?.activeCar)) this.completeStep();
        return;

      case 'chase': {
        if (!this.chaseCar) return;
        this.chaseCar.update(dt);
        const target = this.vehicles?.activeCar ?? player;
        const distance = Math.hypot(this.chaseCar.x - target.x, this.chaseCar.z - target.z);
        if (distance < (step.radius ?? 7)) this.completeStep();
        return;
      }

      case 'killAll':
        if (this.combat?.countAlive(this.stepTag) === 0) this.completeStep();
        return;

      case 'checkpoints': {
        const next = step.points[this.checkpointIndex];
        if (!next) {
          this.completeStep();
          return;
        }
        if (!reached(next, step.radius ?? 11)) return;
        this.checkpointIndex += 1;
        bus.emit('mission:checkpoint', {
          id: this.active.def.id,
          checkpoint: this.checkpointIndex,
          total: step.points.length,
        });
        if (!this.silent && this.checkpointIndex < step.points.length) {
          this.hud?.notify(`Checkpoint ${this.checkpointIndex + 1} of ${step.points.length}`, 'info');
        }
        if (this.checkpointIndex >= step.points.length) this.completeStep();
        return;
      }

      case 'escape':
        if ((this.police?.wanted ?? 0) === 0) this.completeStep();
        return;

      default:
    }
  }

  // ---------------------------------------------------------------- persistence
  save() {
    // A scripted run is not the player's story: never overwrite the save with one.
    if (this.silent) return;
    try {
      const payload = {
        money: Math.round(this.money),
        completed: [...this.completed],
        armour: Math.round(this.combat?.armour ?? 0),
        health: Math.round(this.combat?.health ?? 100),
        weapons: { ...(this.combat?.unlocked ?? {}) },
        ammo: {
          pistol: { ...(this.combat?.ammo?.pistol ?? { clip: 12, reserve: 48 }) },
          shotgun: { ...(this.combat?.ammo?.shotgun ?? { clip: 0, reserve: 0 }) },
        },
      };
      localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
    } catch {
      // Private mode or a file:// page: the game runs, it just forgets.
    }
  }

  load() {
    let payload = null;
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) payload = JSON.parse(raw);
    } catch {
      payload = null;
    }
    if (!payload || typeof payload !== 'object') return false;

    if (Number.isFinite(payload.money)) this.money = Math.max(0, Math.round(payload.money));
    if (Array.isArray(payload.completed)) {
      this.completed = payload.completed.filter((id) => MISSION_ORDER.includes(id));
    }
    if (!this.combat) return true;

    if (Number.isFinite(payload.health)) this.combat.health = clamp(payload.health, 1, 100);
    if (Number.isFinite(payload.armour)) this.combat.armour = clamp(payload.armour, 0, 100);
    if (payload.weapons?.shotgun) this.combat.unlocked.shotgun = true;
    if (payload.ammo?.pistol) {
      this.combat.ammo.pistol.clip = clamp(Number(payload.ammo.pistol.clip) || 0, 0, 12);
      this.combat.ammo.pistol.reserve = Math.max(0, Number(payload.ammo.pistol.reserve) || 0);
    }
    if (payload.ammo?.shotgun) {
      this.combat.ammo.shotgun.clip = clamp(Number(payload.ammo.shotgun.clip) || 0, 0, 6);
      this.combat.ammo.shotgun.reserve = Math.max(0, Number(payload.ammo.shotgun.reserve) || 0);
    }
    return true;
  }

  resetProgress() {
    this.money = START_MONEY;
    this.completed = [];
    this.active = null;
    this.save();
  }

  get info() {
    return {
      money: this.money,
      active: this.active?.def.id ?? null,
      step: this.active ? this.active.stepIndex + 1 : 0,
      completed: [...this.completed],
      next: this.nextMission?.id ?? null,
      shop: this.shopOpen,
    };
  }
}
