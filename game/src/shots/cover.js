// Shot "cover": the money frame. A stolen teal coupe on the Avenida Sol at golden hour, seen
// from low behind its off-side quarter; traffic runs with it, pedestrians work the pavement,
// the HUD carries money and the minimap, and the downtown towers close the far end of the
// boulevard behind a low sun. The camera pushes in a hand's width over the warm-up and then
// holds for the shutter.

import { clamp01, easeInOutCubic } from '../core/math.js';

export default {
  id: 'cover',
  short: 'Solmara Streets — cover',
  description: 'A stolen coupe on the downtown boulevard at golden hour, traffic, crowd, HUD and skyline',
  setup(ctx) {
    const { clock, weather, game, seed } = ctx;
    // A fixed clock keeps the light exactly where the palette was tuned for it.
    clock.fixed = true;
    clock.setHour(17.45);
    weather.set('hazy');

    const car = game.vehicles.spawnDrivenCar({
      type: 'coupe',
      paint: 0x1f6f78,
      x: 343.4,
      z: 70,
      heading: Math.PI,
      speed: 9.2,
    });
    // A steady right foot for the shot; the car still obeys the world.
    car.autopilot = { throttle: 0.3, steer: 0, handbrake: false };
    this.car = car;

    // The boulevard is busy in both directions and the pavement has a crowd: the street has
    // to read as a city, not a stage.
    game.traffic.reset(seed, car.x, car.z, 30);
    game.traffic.placeAhead(car.x, car.z, car.heading, { distance: 26, count: 3, spacing: 18 });
    game.pedestrians.reset(seed, car.x, car.z, 32);
    game.pedestrians.placeAround(car.x - 9, car.z, 4, 48);
    game.pedestrians.placeAround(car.x + 10, car.z - 12, 4, 48);

    game.player.character.rest();
    game.cameraRig.timeSinceLook = 0;
    if (game.police) {
      game.police.clearWanted('shot');
      // The response stands where it was put for the whole shot.
      game.police.staged = true;
    }
    if (game.missions) {
      game.missions.money = 2450;
      game.missions.active = null;
      game.missions.markersHidden = true;
      // A posed shot never writes the save.
      game.missions.silent = true;
    }
    // A fixed HUD snapshot: the shot must not wait on the simulation's own refresh.
    game.hud?.update({
      districtName: 'Downtown Core',
      hour: clock.hour,
      mode: 'driving',
      vehicle: 'Coupe',
      speed: 33,
      money: 2450,
      health: 100,
      armour: 40,
      wanted: 0,
      weapon: game.combat?.weaponInfo,
      mission: null,
    });

    // Low and close, a touch off the centre line: car in the near third, boulevard and
    // towers running away beyond it.
    this.from = { back: 8.4, side: 3.4, up: 2.35, look: 20 };
    this.to = { back: 7.6, side: 2.7, up: 2.15, look: 26 };
    ctx.rig.exposure = 1.3;
    ctx.camera.fov = 58;
    ctx.camera.updateProjectionMatrix();
  },
  update(ctx, elapsed) {
    const car = this.car ?? ctx.game.vehicles.activeCar;
    if (!car) return;

    const t = easeInOutCubic(clamp01(elapsed / 8));
    // The car's own frame: forward along its nose, right towards the kerb.
    const fx = Math.sin(car.heading);
    const fz = Math.cos(car.heading);
    const rx = Math.cos(car.heading);
    const rz = -Math.sin(car.heading);
    const back = this.from.back + (this.to.back - this.from.back) * t;
    const side = this.from.side + (this.to.side - this.from.side) * t;
    const up = this.from.up + (this.to.up - this.from.up) * t;
    const look = this.from.look + (this.to.look - this.from.look) * t;
    // A hand-held bob, a few centimetres: enough that the frame is alive, not shaky.
    const bob = Math.sin(elapsed * 2.1) * 0.025;

    // The camera rides the car: back along its nose, off to the kerb side, a hand above the
    // roof, looking down the boulevard past it.
    ctx.camera.position.set(car.x - fx * back + rx * side, car.y + up + bob, car.z - fz * back + rz * side);
    ctx.camera.lookAt(car.x + fx * look, car.y + 2.6, car.z + fz * look);
  },
};
