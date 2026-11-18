// Shot "street": dusk on the Neon Strip, on foot, crossing the avenue. He stands on the
// centre line of the Avenida with the junction zebra at his feet and the strip's lit
// fronts on both sides; traffic passes him on either side and pedestrians work the
// pavements. The camera is low on the same line, a dozen metres back, and pushes in
// slowly. A soft fill light lifts the street out of the dusk murk for the shutter.

import { clamp01, easeInOutCubic } from '../core/math.js';

export default {
  id: 'street',
  short: 'Solmara Streets — neon strip',
  description: 'On foot on the Neon Strip at dusk, pedestrians and traffic around',
  setup(ctx) {
    const { clock, weather, game, seed } = ctx;
    clock.fixed = true;
    clock.setHour(20.1);
    weather.set('clear');

    // Out of the car if a previous scenario left him in one.
    if (game.vehicles.activeCar) game.vehicles.exit(game.player);
    game.player.teleport(210, -702, Math.PI / 2);
    game.player.character.rest();

    game.traffic.reset(seed, 210, -702, 30);
    game.traffic.placeAhead(210, -702, Math.PI, { distance: 24, count: 2, spacing: 20 });
    game.pedestrians.reset(seed, 210, -702, 32);
    game.pedestrians.placeAround(196, -702, 3, 40);
    game.pedestrians.placeAround(222, -702, 3, 40);
    game.cameraRig.timeSinceLook = 0;

    // A dozen metres up the avenue, on the centre line, low: the road runs away behind
    // him, the buildings hold the edges and the sky sits above the vanishing point.
    this.origin = { x: 211.2, y: 2.05, z: -694.4 };
    this.target = { x: 209.9, y: 1.15, z: -702.2 };

    // The city has no shadow maps, so street level after dark is nearly a silhouette. A
    // cool ambient fill is the shot's key light; it only exists in this scenario.
    this.fill = new THREE.AmbientLight(0x9fb0cc, 2.2);
    game.scene.add(this.fill);
    ctx.rig.exposure = 1.5;
    ctx.camera.fov = 58;
    ctx.camera.updateProjectionMatrix();
  },
  update(ctx, elapsed) {
    const t = easeInOutCubic(clamp01(elapsed / 9));
    // A slow push in and a hand's width of drift to the right.
    const dx = this.origin.x - this.target.x;
    const dz = this.origin.z - this.target.z;
    const shrink = 1 - t * 0.12;
    const px = this.target.x + dx * shrink + t * 0.5;
    const pz = this.target.z + dz * shrink;
    const py = this.origin.y - t * 0.2;
    ctx.camera.position.set(px, py, pz);
    ctx.camera.lookAt(this.target.x, this.target.y, this.target.z);
  },
};
