// Shot "night": the Neon Strip after dark, looking east down the avenue. A coupe sits in
// the near lane with its lamps on, pedestrians work the lit pavements on both sides,
// blade signs and windows glow above, and the HUD stays readable against the dark. The
// camera is low on the near kerb and pushes slowly into the street.

import { clamp01, easeInOutCubic } from '../core/math.js';

export default {
  id: 'night',
  short: 'Solmara Streets — night',
  description: 'The Neon Strip after dark: lit windows, neon signs, streetlight pools, a car, pedestrians and HUD',
  setup(ctx) {
    const { clock, weather, game, seed } = ctx;
    clock.fixed = true;
    clock.setHour(21.6);
    weather.set('clear');

    const car = game.vehicles.spawnDrivenCar({
      type: 'coupe',
      paint: 0x8a2f45,
      x: 206,
      z: -697,
      heading: Math.PI / 2,
      speed: 0,
    });
    // Standing at the kerb with the handbrake on: the lamps stay lit, the wheels stay put.
    car.autopilot = { throttle: 0, steer: 0, handbrake: true };
    this.car = car;

    game.traffic.reset(seed, 206, -697, 26);
    game.traffic.placeAhead(206, -697, Math.PI / 2, { distance: 24, count: 3, spacing: 18 });
    game.pedestrians.reset(seed, 206, -697, 34);

    // Put four of the crowd on the two lit pavements, inside the frame the camera sees;
    // they keep walking their rings once placed.
    const stage = (index, x, z, heading) => {
      const ped = game.pedestrians.peds[index];
      if (!ped) return;
      ped.x = x;
      ped.z = z;
      ped.heading = heading;
      ped.mode = 'ring';
      ped.speed = 0.9;
      ped.target = { x: x + Math.sin(heading) * 9, z: z + Math.cos(heading) * 9 };
      ped.nextCorner = ped.corner;
    };
    stage(0, 196, -687, Math.PI / 2);
    stage(1, 198, -689, -Math.PI / 2);
    stage(2, 222, -712, Math.PI / 2);
    stage(3, 226, -710, -Math.PI / 2);

    if (game.police) {
      game.police.clearWanted('shot');
      game.police.staged = true;
    }
    if (game.missions) {
      game.missions.active = null;
      game.missions.markersHidden = true;
      game.missions.silent = true;
      game.missions.money = 2450;
    }
    game.hud?.update({
      districtName: 'Neon Strip',
      hour: clock.hour,
      mode: 'driving',
      vehicle: 'Coupe',
      speed: 0,
      money: 2450,
      health: 100,
      armour: 40,
      wanted: 0,
      weapon: game.combat?.weaponInfo,
      mission: null,
    });

    // The city has no shadow maps, so street level after dark gets a cool ambient fill and
    // three coloured lights: the signs on the north side, the warm shopfronts opposite and
    // one streetlight over the kerb.
    this.fill = new THREE.AmbientLight(0x9fb0cc, 1.7);
    game.scene.add(this.fill);
    this.key = new THREE.PointLight(0xff5fc8, 2.6, 50, 2);
    this.key.position.set(214, 7, -684);
    game.scene.add(this.key);
    this.warm = new THREE.PointLight(0xffc46e, 2.1, 42, 2);
    this.warm.position.set(224, 4.5, -710);
    game.scene.add(this.warm);
    this.lamp = new THREE.PointLight(0xbfe4ff, 1.5, 26, 2);
    this.lamp.position.set(200, 5.4, -694);
    game.scene.add(this.lamp);

    this.origin = { x: 186.5, y: 2.5, z: -692.5 };
    this.target = { x: 238, y: 1.9, z: -700.5 };
    ctx.rig.exposure = 1.55;
    ctx.camera.fov = 64;
    ctx.camera.updateProjectionMatrix();
  },
  update(ctx, elapsed) {
    const t = easeInOutCubic(clamp01(elapsed / 10));
    // A short drift down the street rather than a full move: the frame is mostly static.
    const px = this.origin.x + (this.target.x - this.origin.x) * 0.18 * t;
    const pz = this.origin.z + (this.target.z - this.origin.z) * 0.12 * t;

    ctx.camera.position.set(px, this.origin.y - t * 0.12, pz);
    ctx.camera.lookAt(this.target.x, this.target.y, this.target.z);
  },
};
