// Shot "shootout": the harbour quay at dusk, the warehouses dark behind, a pistol going off
// in the player's hands and two officers working the same crew. The muzzle flash and tracer
// are held for the shutter, the thugs are fixed in their poses, and the HUD carries three
// stars and the mission card for the fight.
//
// Everything in the frame is the game's own: thugs from combat.spawnThug, officers from
// police.spawnCop, flash and tracer from combat.effects. The quay south of the warehouses is
// the one stretch of open road with a clean sight line to the loading doors.

import { clamp01, easeInOutCubic } from '../core/math.js';

/** The crew at the loading doors; fixed for the shutter. */
const CREW = [
  { x: -664, z: 592, boss: false, health: 80 },
  { x: -616, z: 590, boss: false, health: 80 },
  { x: -646, z: 588, boss: true, health: 120 },
];

/** Seconds a flash and tracer are held: a live 0.06 s flash would miss the shutter. */
const HELD = 120;

export default {
  id: 'shootout',
  short: 'Solmara Streets — shootout',
  description: 'Harbour quay at dusk: muzzle flash, tracer, thugs and police',
  setup(ctx) {
    const { clock, weather, game, seed } = ctx;
    clock.fixed = true;
    clock.setHour(18.5);
    weather.set('hazy');

    const { combat, police, missions } = game;

    if (game.vehicles.activeCar) game.vehicles.exit(game.player);
    game.player.teleport(-636, 606, Math.PI);
    game.player.character.rest();

    game.traffic.reset(seed, -640, 604, 12);
    game.pedestrians.reset(seed, -640, 604, 10);

    combat.clearThugs();
    combat.stagedThugs = true;
    for (const member of CREW) {
      combat.spawnThug({
        x: member.x,
        z: member.z,
        boss: member.boss,
        health: member.health,
        tag: 'shot',
        heading: Math.PI,
      });
    }

    // The officers, flanking the player and firing at the crew.
    police.clearWanted('shot');
    police.staged = true;
    police.spawnCop(-648, 612);
    police.spawnCop(-634, 600);

    // A pistol in the player's hands and a round in the air.
    combat.grantWeapon('pistol', { clip: 12, reserve: 48 });
    combat.switchWeapon('pistol');
    combat.weaponId = 'pistol';
    if (combat.gun) combat.gun.visible = true;
    combat.health = 78;
    combat.armour = 35;
    combat.stats.shots = 3;
    combat.stats.hits = 2;
    combat.stageFire({ x: -636.2, y: 1.4, z: 603.2 }, { x: -647.5, y: 1.2, z: 589.2 }, { scale: 1.2, color: 0xffd9a0 });

    // Both officers' shots, held lit.
    for (const [from, to, scale, width] of [
      [{ x: -648.2, y: 1.36, z: 609.2 }, { x: -663.2, y: 1.15, z: 593.2 }, 0.75, 0.03],
      [{ x: -633.8, y: 1.33, z: 597.5 }, { x: -646.5, y: 1.18, z: 589.4 }, 0.7, 0.028],
    ]) {
      combat.effects.muzzle(from.x, from.y, from.z, { life: HELD, scale, color: 0xffe0b0 });
      combat.effects.tracer(from, to, { life: HELD, color: 0xffb066, width });
    }

    // The player cannot fire or be hit during the capture.
    combat.suspended = true;
    combat.invuln = 999;

    police.setWanted(3, 'shot');
    police.spawnClock = 99;

    // A live job behind the card: the harbour clearing, so the HUD reads the fight.
    if (missions) {
      missions.active = null;
      missions.silent = true;
      missions.markersHidden = true;
      const started = missions.start('harbour-heat', { scripted: true, stepIndex: 1 });
      if (started) {
        missions.money = 3120;
        if (missions.active) missions.active.timer = 96;
      }
      game.hud?.update({
        mission: missions.objective,
        money: missions.money,
        health: combat.health,
        armour: combat.armour,
        wanted: 3,
        weapon: combat.weaponInfo,
        districtName: 'Harbour Works',
        hour: clock.hour,
        mode: 'foot',
      });
    }

    // Dusk at street level: the shot brings its own cool fill, as the street shot does.
    this.fill = new THREE.AmbientLight(0x9fb0cc, 1.7);
    game.scene.add(this.fill);
    this.rim = new THREE.PointLight(0xffb066, 1.6, 46, 2);
    this.rim.position.set(-636, 6.5, 588);
    game.scene.add(this.rim);

    this.origin = { x: -624.5, y: 2.6, z: 621.5 };
    this.target = { x: -641, y: 1.4, z: 588 };
    ctx.rig.exposure = 1.45;
    ctx.camera.fov = 56;
    ctx.camera.updateProjectionMatrix();

    // The flash billboards are posed to the camera; keep them ahead of the first frame.
    combat.effects.setCamera(ctx.camera);
  },
  update(ctx, elapsed) {
    const t = easeInOutCubic(clamp01(elapsed / 9));
    // A hand-held push in, dropping as it goes: the camera crouches with the fight.
    const px = this.origin.x + (this.target.x - this.origin.x) * 0.08 * t;
    const pz = this.origin.z + (this.target.z - this.origin.z) * 0.04 * t;

    ctx.camera.position.set(px, this.origin.y - 0.2 * t, pz);
    ctx.camera.lookAt(this.target.x + 0.5 * t, this.target.y, this.target.z);
  },
};
