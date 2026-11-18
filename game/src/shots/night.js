// Shot "night": the Neon Strip after midnight, seen from above its western end. The
// strip runs east under the camera, blade signs and lit windows on both sides, the
// downtown skyline to the right and the moon climbing over the rooftops ahead.

import { cameraMove } from './rig.js';

export default {
  id: 'night',
  short: 'Solmara Streets — night',
  description: 'The Neon Strip after dark, lit windows, streetlights and blade signs',
  setup(ctx) {
    const { clock, weather, random } = ctx;
    clock.fixed = true;
    clock.setHour(21.4);
    weather.set('clear');
    this.from = { x: -268 + random.range(-6, 6), y: 54, z: -788 };
    this.to = { x: -150, y: 44, z: -766 };
    this.lookFrom = { x: 300, y: 22, z: -700 };
    this.lookTo = { x: 420, y: 18, z: -672 };
    ctx.camera.position.set(this.from.x, this.from.y, this.from.z);
    ctx.camera.lookAt(this.lookFrom.x, this.lookFrom.y, this.lookFrom.z);
  },
  update(ctx, elapsed) {
    cameraMove(ctx, elapsed, this.from, this.to, this.lookFrom, this.lookTo, { duration: 11, fov: 60 });
  },
};
