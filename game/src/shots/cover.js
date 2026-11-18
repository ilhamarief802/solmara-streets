// Shot "cover": golden hour over Solmara. The camera hangs above the Avenida Sol and
// looks south-west across the low-rise of Little Verano to the harbour and the open sea,
// with the sun a hand's width above the water and the towers of downtown close behind.

import { cameraMove } from './rig.js';

export default {
  id: 'cover',
  short: 'Solmara Streets — cover',
  description: 'Avenida Sol at golden hour, sun over the harbour, towers behind',
  setup(ctx) {
    const { clock, weather, random } = ctx;
    clock.fixed = true;
    clock.setHour(17.6);
    weather.set('hazy');
    this.from = { x: 606 + random.range(-8, 8), y: 92, z: 80 };
    this.to = { x: 520, y: 84, z: 96 };
    this.lookFrom = { x: -420, y: 8, z: 360 };
    this.lookTo = { x: -560, y: 2, z: 440 };
    ctx.camera.position.set(this.from.x, this.from.y, this.from.z);
    ctx.camera.lookAt(this.lookFrom.x, this.lookFrom.y, this.lookFrom.z);
  },
  update(ctx, elapsed) {
    cameraMove(ctx, elapsed, this.from, this.to, this.lookFrom, this.lookTo, { duration: 10, fov: 56 });
  },
};
