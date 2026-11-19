// Shot "chase": three stars and three cruisers. The player's coupe runs north up the
// Avenida with a cruiser on each shoulder and a third hanging back, lights strobing, the
// HUD stars lit and the minimap showing the pursuit. The camera rides ahead of the pack
// and looks back down the boulevard, so the whole chase is in one frame.

import { clamp01, easeInOutCubic } from '../core/math.js';

export default {
  id: 'chase',
  short: 'Solmara Streets — chase',
  description: 'Three police cruisers behind the player coupe, wanted stars lit, minimap pursuit',
  setup(ctx) {
    const { clock, weather, game, seed } = ctx;
    clock.fixed = true;
    clock.setHour(17.35);
    weather.set('clear');

    const car = game.vehicles.spawnDrivenCar({
      type: 'coupe',
      paint: 0x1f6f78,
      x: 340,
      z: 100,
      heading: Math.PI,
      speed: 10.2,
    });
    car.autopilot = { throttle: 0.36, steer: 0, handbrake: false };
    this.car = car;

    game.traffic.reset(seed, car.x, car.z, 24);
    game.traffic.placeAhead(car.x, car.z, car.heading, { distance: 34, count: 2, spacing: 18 });
    game.pedestrians.reset(seed, car.x, car.z, 24);
    game.pedestrians.placeAround(car.x + 12, car.z + 2, 4, 44);

    const police = game.police;
    police.clearWanted('shot');
    police.staged = true;
    const spawnAt = (back, side) =>
      police.spawnCruiser(null, {
        mode: 'chase',
        x: car.x - Math.sin(car.heading) * back + Math.cos(car.heading) * side,
        z: car.z - Math.cos(car.heading) * back - Math.sin(car.heading) * side,
        heading: car.heading,
      });
    if (police.cruisers.length) {
      for (const cruiser of police.cruisers.slice()) {
        game.scene.remove(cruiser.view?.group);
      }
      police.cruisers.length = 0;
    }
    this.near = spawnAt(7.4, -1.2);
    this.mid = spawnAt(15.5, 1.6);
    this.far = spawnAt(27, -0.6);
    police.setWanted(3, 'shot');
    police.spawnClock = 999;

    game.player.character.rest();
    game.cameraRig.timeSinceLook = 0;
    if (game.missions) {
      game.missions.markersHidden = true;
      game.missions.silent = true;
      game.missions.money = 2450;
    }
    game.hud?.update({
      districtName: 'Downtown Core',
      hour: clock.hour,
      mode: 'driving',
      vehicle: 'Coupe',
      speed: 37,
      money: 2450,
      health: 84,
      armour: 30,
      wanted: 3,
      weapon: game.combat?.weaponInfo,
      mission: null,
    });

    this.from = { ahead: 13.5, side: 4.6, up: 2.7, lookBack: 2 };
    this.to = { ahead: 11.2, side: 3.7, up: 2.35, lookBack: 9 };
    ctx.rig.exposure = 1.28;
    ctx.camera.fov = 64;
    ctx.camera.updateProjectionMatrix();
  },
  update(ctx, elapsed) {
    const car = this.car ?? ctx.game.vehicles.activeCar;
    if (!car) return;
    const t = easeInOutCubic(clamp01(elapsed / 7));
    const fx = Math.sin(car.heading);
    const fz = Math.cos(car.heading);
    const rx = Math.cos(car.heading);
    const rz = -Math.sin(car.heading);
    const station = (cruiser, distance, side) => {
      if (!cruiser) return;
      cruiser.x = car.x - fx * distance + rx * side;
      cruiser.z = car.z - fz * distance + rz * side;
      cruiser.heading = car.heading;
      cruiser.speed = 10.4;
      cruiser.syncView(0.016);
    };
    station(this.near, 7.4, -1.2);
    station(this.mid, 15.5, 1.6);
    station(this.far, 27, -0.6);
    const ahead = this.from.ahead + (this.to.ahead - this.from.ahead) * t;
    const side = this.from.side + (this.to.side - this.from.side) * t;
    const up = this.from.up + (this.to.up - this.from.up) * t;
    const lookBack = this.from.lookBack + (this.to.lookBack - this.from.lookBack) * t;
    const bob = Math.sin(elapsed * 2.8) * 0.03;
    ctx.camera.position.set(
      car.x + fx * ahead + rx * side,
      car.y + up + bob,
      car.z + fz * ahead + rz * side,
    );
    ctx.camera.lookAt(car.x + fx * lookBack, car.y + 0.95, car.z + fz * lookBack);
  },
};
