// The minimap: one offscreen canvas holding the whole city drawn once from the plan's
// own geometry (blocks, roads, the ring highway and the two coasts), then a small live
// canvas that slides a window of that map under the player each frame. North is up, the
// player arrow turns, and the map keeps its landmarks readable when the HUD is scaled
// down: thick roads, flat district colours, one bright ring for the highway.

const DISTRICT_FILL = {
  downtown: '#3d4b58',
  marina: '#355762',
  verano: '#4d4636',
  neon: '#4a3752',
  harbour: '#3c4438',
  beach: '#5b5239',
  airstrip: '#414b3c',
};

const LAND = '#26343c';
const ROAD = '#93a4ad';
const HIGHWAY = '#e0b470';
const WATER = '#16313e';
const COAST = '#7fb6d9';

/** A rounded rectangle path, since roundRect is not in every capture browser. */
function rounded(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

export class Minimap {
  constructor(world, canvas) {
    this.world = world;
    this.canvas = canvas;
    this.ctx = canvas ? canvas.getContext('2d') : null;
    this.size = canvas?.width ?? 180;
    this.diameter = this.size;
    this.viewMetres = 320;
    this.clock = 0;
    this.pulse = 0;
    this.drawn = 0;
    this.bounds = world.minimap.bounds;
    this.staticCanvas = null;
    this.staticScale = 0;
    this.buildStatic();
  }

  /** Paints the whole city once into an offscreen canvas. */
  buildStatic() {
    if (typeof document === 'undefined' || !this.ctx) return;
    const bounds = this.bounds;
    const width = 1024;
    const height = Math.round((width * (bounds.maxZ - bounds.minZ)) / (bounds.maxX - bounds.minX));
    const scale = width / (bounds.maxX - bounds.minX);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const mx = (x) => (x - bounds.minX) * scale;
    const mz = (z) => (z - bounds.minZ) * scale;

    ctx.fillStyle = LAND;
    ctx.fillRect(0, 0, width, height);

    // Blocks first: district colour, parks a shade greener.
    for (const block of this.world.minimap.blocks) {
      ctx.fillStyle = block.park ? '#35513f' : DISTRICT_FILL[block.district] ?? '#3a4650';
      const x = mx(block.x0);
      const z = mz(block.z0);
      const w = (block.x1 - block.x0) * scale;
      const h = (block.z1 - block.z0) * scale;
      ctx.fillRect(x, z, w, h);
    }

    // Streets, then the elevated ring over them with a dark casing so it reads as a
    // different tier, not a wider street.
    ctx.lineCap = 'round';
    ctx.strokeStyle = ROAD;
    for (const road of this.world.minimap.roads) {
      ctx.lineWidth = Math.max(2.2, road.width * scale * 0.72);
      ctx.beginPath();
      ctx.moveTo(mx(road.x0), mz(road.z0));
      ctx.lineTo(mx(road.x1), mz(road.z1));
      ctx.stroke();
    }
    const ring = this.world.minimap.highway;
    if (ring?.length) {
      ctx.strokeStyle = 'rgba(10, 16, 20, 0.85)';
      ctx.lineWidth = 7;
      ctx.beginPath();
      for (let i = 0; i < ring.length; i += 1) {
        const segment = ring[i];
        if (i === 0) ctx.moveTo(mx(segment.x0), mz(segment.z0));
        ctx.lineTo(mx(segment.x1), mz(segment.z1));
      }
      ctx.stroke();
      ctx.strokeStyle = HIGHWAY;
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    // The sea cuts the edge of the map: south coast, west coast and the channel.
    ctx.fillStyle = WATER;
    for (const water of this.world.minimap.water) {
      ctx.fillRect(mx(water.x0), mz(water.z0), (water.x1 - water.x0) * scale, (water.z1 - water.z0) * scale);
    }
    ctx.strokeStyle = COAST;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(mx(-920), mz(-980));
    ctx.lineTo(mx(-920), mz(640));
    ctx.lineTo(mx(1280), mz(640));
    ctx.stroke();
    // The channel mouth, drawn as two short quay lines.
    ctx.beginPath();
    ctx.moveTo(mx(-45), mz(-640));
    ctx.lineTo(mx(-45), mz(640));
    ctx.moveTo(mx(25), mz(-640));
    ctx.lineTo(mx(25), mz(640));
    ctx.stroke();

    // Landmark pips: a white dot for each named place, so the map has bearings.
    ctx.fillStyle = 'rgba(243, 231, 207, 0.72)';
    for (const landmark of this.world.minimap.landmarks) {
      ctx.beginPath();
      ctx.arc(mx(landmark.x), mz(landmark.z), 2.2, 0, Math.PI * 2);
      ctx.fill();
    }

    this.staticCanvas = canvas;
    this.staticScale = scale;
  }

  /** Draws one frame: the map window, then dots, markers and the player arrow. */
  draw(data = {}) {
    const ctx = this.ctx;
    if (!ctx || !this.staticCanvas) return;
    const size = this.size;
    const x = data.x ?? 0;
    const z = data.z ?? 0;
    const scale = this.staticScale;
    const sourceSize = this.viewMetres * scale;
    const maxX = this.staticCanvas.width - sourceSize;
    const maxZ = this.staticCanvas.height - sourceSize;
    let sx = (x - this.bounds.minX) * scale - sourceSize / 2;
    let sz = (z - this.bounds.minZ) * scale - sourceSize / 2;
    sx = Math.max(0, Math.min(maxX, sx));
    sz = Math.max(0, Math.min(maxZ, sz));

    ctx.clearRect(0, 0, size, size);
    ctx.save();
    rounded(ctx, 0, 0, size, size, 14);
    ctx.clip();
    ctx.fillStyle = '#101c23';
    ctx.fillRect(0, 0, size, size);
    ctx.drawImage(this.staticCanvas, sx, sz, sourceSize, sourceSize, 0, 0, size, size);

    const toScreen = (wx, wz) => ({
      x: ((wx - this.bounds.minX) * scale - sx) * (size / sourceSize),
      y: ((wz - this.bounds.minZ) * scale - sz) * (size / sourceSize),
    });

    // A soft vignette so the dots near the edge do not fight the border.
    const vignette = ctx.createRadialGradient(size / 2, size / 2, size * 0.3, size / 2, size / 2, size * 0.62);
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, 'rgba(4, 8, 12, 0.55)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, size, size);

    // Traffic: small pale dots, only those inside the window.
    if (data.traffic) {
      ctx.fillStyle = 'rgba(232, 240, 244, 0.72)';
      for (const car of data.traffic) {
        const distance = Math.hypot(car.x - x, car.z - z);
        if (distance > this.viewMetres * 0.52) continue;
        const point = toScreen(car.x, car.z);
        ctx.fillRect(point.x - 1.1, point.y - 1.4, 2.2, 2.8);
      }
    }

    // Police: strobing cruisers, steady blue dots for officers on foot.
    const blink = Math.sin(this.pulse * 9) > 0;
    if (data.cruisers) {
      for (const cruiser of data.cruisers) {
        const point = toScreen(cruiser.x, cruiser.z);
        ctx.fillStyle = blink ? '#ff5a4a' : '#5aa0ff';
        ctx.beginPath();
        ctx.arc(point.x, point.y, 3.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(8, 12, 18, 0.8)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }
    if (data.cops) {
      ctx.fillStyle = '#7fb6ff';
      for (const cop of data.cops) {
        const point = toScreen(cop.x, cop.z);
        ctx.fillRect(point.x - 1.4, point.y - 1.4, 2.8, 2.8);
      }
    }

    // Mission and shop markers: a bright diamond with a dark keyline.
    if (data.markers) {
      for (const marker of data.markers) {
        if (marker.hidden) continue;
        const point = toScreen(marker.x, marker.z);
        const pulse = 1 + Math.sin(this.pulse * 4) * 0.12;
        const radius = (marker.kind === 'mission' ? 6.2 : 5) * pulse;
        ctx.beginPath();
        ctx.moveTo(point.x, point.y - radius);
        ctx.lineTo(point.x + radius, point.y);
        ctx.lineTo(point.x, point.y + radius);
        ctx.lineTo(point.x - radius, point.y);
        ctx.closePath();
        ctx.fillStyle = marker.kind === 'mission' ? '#ffd166' : '#7fe0c3';
        ctx.fill();
        ctx.strokeStyle = 'rgba(12, 16, 22, 0.85)';
        ctx.lineWidth = 1.6;
        ctx.stroke();
      }
    }

    // The player: a white arrow with a dark outline, turned to the heading.
    const playerPoint = data.centre ? { x: size / 2, y: size / 2 } : toScreen(x, z);
    ctx.save();
    ctx.translate(playerPoint.x, playerPoint.y);
    ctx.rotate(Math.PI - (data.heading ?? 0));
    ctx.beginPath();
    ctx.moveTo(0, -7.4);
    ctx.lineTo(5.4, 5.6);
    ctx.lineTo(0, 3.1);
    ctx.lineTo(-5.4, 5.6);
    ctx.closePath();
    ctx.fillStyle = '#f8f4e8';
    ctx.fill();
    ctx.strokeStyle = 'rgba(10, 14, 20, 0.9)';
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.restore();

    // North marker, fixed because the map is north-up.
    ctx.fillStyle = 'rgba(243, 231, 207, 0.7)';
    ctx.font = '600 10px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('N', size - 14, 17);
    ctx.restore();

    // A hairline ring on top of the clip, so the map reads as an instrument.
    ctx.save();
    rounded(ctx, 0.75, 0.75, size - 1.5, size - 1.5, 13.5);
    ctx.strokeStyle = 'rgba(243, 231, 207, 0.28)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();

    this.drawn += 1;
    this.lastOrigin = { sx, sz };
  }

  /** Non-blank test used by the browser check: how many opaque-ish pixels it has. */
  coverage() {
    if (!this.ctx) return 0;
    const pixels = this.ctx.getImageData(0, 0, this.size, this.size).data;
    let covered = 0;
    for (let index = 3; index < pixels.length; index += 4 * 37) {
      if (pixels[index] > 8) covered += 1;
    }
    return covered;
  }
}
