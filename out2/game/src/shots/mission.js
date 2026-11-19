// Shot "mission": a live objective at the marina. The player is on foot on the waterfront
// pavement a short walk from the marker; the mission card carries the real objective text
// and clock, the beacon stands at the fish market, and the minimap holds the diamond. The
// camera is low behind his shoulder, looking down the quay.

import { clamp01, easeInOutCubic } from '../core/math.js';

export default {
  id: 'mission',
  short: 'Solmara Streets — mission',
  description: 'A live marina mission: objective card, world beacon and minimap marker with the player on foot',
  setup(ctx) {
    const { clock, weather, game, seed } = ctx;
    clock.fixed = true;
    clock.setHour(17.85);
    weather.set('hazy');

    if (game.vehicles.activeCar) game.vehicles.exit(game.player);
    game.player.teleport(-358, 84, Math.PI);
    game.player.character.rest();

    game.traffic.reset(seed, -358, 84, 24);
    game.traffic.placeAhead(-358, 84, Math.PI, { distance: 18, count: 3, spacing: 18 });
    game.pedestrians.reset(seed, -358, 84, 30);
    game.pedestrians.placeAround(-360, 78, 5, 40);
    // Two of them on the pavement in the sight line to the market, so the walk is alive.
    const stage = (index, x, z) => {
      const ped = game.pedestrians.peds[index];
      if (!ped) return;
      ped.x = x;
      ped.z = z;
      ped.heading = Math.PI / 2;
      ped.mode = 'ring';
      ped.speed = 0.85;
      ped.target = { x: x + 8, z };
      ped.corner = ped.nextCorner;
    };
    stage(0, -364, 69);
    stage(1, -354, 69);

    // The real story step: Dock Run's arrival at the fish market. Scripted, so it cannot
    // advance the story; the player stands twenty-six metres outside its radius.
    const missions = game.missions;
    if (missions) {
      missions.active = null;
      missions.silent = true;
      missions.markersHidden = false;
      missions.money = 2450;
      missions.start('dock-run', { scripted: true });
      if (missions.active) missions.active.timer = 138;
      game.hud?.update({
        mission: missions.objective,
        money: missions.money,
        health: game.combat?.health ?? 100,
        armour: game.combat?.armour ?? 0,
        wanted: 0,
        weapon: game.combat?.weaponInfo,
        districtName: 'Marina Quarter',
        hour: clock.hour,
        mode: 'foot',
      });
    }
    game.police?.clearWanted('shot');
    if (game.police) game.police.staged = true;
    game.cameraRig.timeSinceLook = 0;

    // The low sun is behind the camera; a warm ambient lifts the white mid-rises and the
    // pavement into a readable range without washing out the beacon.
    this.fill = new THREE.AmbientLight(0xffd2a0, 1.35);
    game.scene.add(this.fill);
    this.rim = new THREE.PointLight(0xffc46e, 1.4, 42, 2);
    this.rim.position.set(-344, 5.5, 72);
    game.scene.add(this.rim);

    this.origin = { x: -355.5, y: 2.45, z: 90.5 };
    this.target = { x: -360, y: 2.25, z: 56 };
    ctx.rig.exposure = 1.3;
    ctx.camera.fov = 58;
    ctx.camera.updateProjectionMatrix();
  },
  update(ctx, elapsed) {
    const t = easeInOutCubic(clamp01(elapsed / 9));
    const px = this.origin.x + (this.target.x - this.origin.x) * 0.05 * t;
    const pz = this.origin.z + (this.target.z - this.origin.z) * 0.03 * t;
    const py = this.origin.y - t * 0.14;
    ctx.camera.position.set(px, py, pz);
    ctx.camera.lookAt(this.target.x, this.target.y, this.target.z);
  },
};
