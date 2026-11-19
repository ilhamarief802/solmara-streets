// Shot "drive": the player has just taken the teal coupe from the kerb on the Avenida Sol
// and is rolling north through the downtown core, traffic ahead and the towers over the
// bonnet. The camera sits low behind the off-side quarter and drifts in over the warm-up,
// then holds. The car keeps a light throttle on autopilot, so the frame is a moving one.

import { clamp01, easeInOutCubic } from '../core/math.js';

export default {
  id: 'drive',
  short: 'Solmara Streets — drive',
  description: 'A stolen coupe in the downtown traffic on the Avenida Sol, towers ahead',
  setup(ctx) {
    const { clock, weather, game, seed } = ctx;
    clock.fixed = true;
    clock.setHour(17.15);
    weather.set('clear');

    const car = game.vehicles.spawnDrivenCar({
      type: 'coupe',
      paint: 0x1f6f78,
      x: 343.2,
      z: 64,
      heading: Math.PI,
      speed: 8.4,
    });
    car.autopilot = { throttle: 0.34, steer: 0, handbrake: false };
    this.car = car;

    // The jam and the crowd fill the streets around the car, deterministically.
    game.traffic.reset(seed, car.x, car.z, 30);
    game.traffic.placeAhead(car.x, car.z, car.heading, { distance: 30, count: 3, spacing: 17 });
    game.pedestrians.reset(seed, car.x, 40, 32);
    game.pedestrians.placeAround(car.x, car.z, 6, 60);

    // The body rides in the car; make sure no leftover pose shows.
    game.player.character.rest();
    game.cameraRig.timeSinceLook = 0;

    // Keyframes in car space: metres behind the nose, metres to the right, metres up, and
    // how far ahead of the car the camera looks.
    this.from = { back: 10.4, side: 3.1, up: 3.15, look: 19 };
    this.to = { back: 9.2, side: 2.4, up: 2.7, look: 24 };
    ctx.rig.exposure = 1.25;
    ctx.camera.fov = 60;
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
    const back = this.from.back + (this.to.back - this.from.back) * t;
    const side = this.from.side + (this.to.side - this.from.side) * t;
    const up = this.from.up + (this.to.up - this.from.up) * t;
    const look = this.from.look + (this.to.look - this.from.look) * t;
    // A small settle on the suspension, not a shake: the car is cruising.
    const bob = Math.sin(elapsed * 2.2) * 0.03;

    ctx.camera.position.set(car.x - fx * back + rx * side, car.y + up + bob, car.z - fz * back + rz * side);
    // The look point stays low over the bonnet: the skyline fills the top of the frame.
    ctx.camera.lookAt(car.x + fx * look, car.y + 1.2, car.z + fz * look);
  },
};
