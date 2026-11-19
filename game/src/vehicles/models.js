// The cars. Six bodies, all built from flat-shaded boxes, tapers and octagonal wheels at
// load time: a sedan, a coupe, a van, a taxi, a police cruiser and a beach buggy. Every
// model is a white "shell" (so a single tint colours a whole fleet) plus a "details"
// geometry that bakes its own colours: glass, bumpers, lights, grille, livery.
//
// Two consumption modes: buildCarGroup() for the one car the player drives (real wheels
// that spin, a paint material), and per-type geometries for the instanced fleet traffic and
// parked cars use.

/** A soup of coloured triangles. No indices, no UVs: flat car panels do not need them. */
class Soup {
  constructor() {
    this.positions = [];
    this.normals = [];
    this.colors = [];
    this.triangles = 0;
  }

  triangle(a, b, c, color) {
    // The face normal comes from the cross product of the two edges.
    const ux = b[0] - a[0];
    const uy = b[1] - a[1];
    const uz = b[2] - a[2];
    const vx = c[0] - a[0];
    const vy = c[1] - a[1];
    const vz = c[2] - a[2];
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const length = Math.hypot(nx, ny, nz) || 1;
    nx /= length;
    ny /= length;
    nz /= length;
    this.positions.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    this.normals.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
    // Per-vertex colour, so one vertexColors material can paint a whole fleet.
    this.colors.push(color.r, color.g, color.b, color.r, color.g, color.b, color.r, color.g, color.b);
    this.triangles += 1;
  }

  quad(a, b, c, d, color) {
    this.triangle(a, b, c, color);
    this.triangle(a, c, d, color);
  }

  /** Axis-aligned box by centre. `topW`/`topD` taper the upper face inwards. */
  box(cx, cy, cz, width, height, depth, color, options = {}) {
    const w = width / 2;
    const h = height / 2;
    const d = depth / 2;
    const x0 = cx - w;
    const x1 = cx + w;
    const y0 = cy - h;
    const y1 = cy + h;
    const z0 = cz - d;
    const z1 = cz + d;

    if (options.topW !== undefined || options.topD !== undefined) {
      // A frustum: the base rectangle and a shifted, narrower top one.
      const tw = (options.topW ?? width) / 2;
      const td = (options.topD ?? depth) / 2;
      const sx = cx + (options.shiftX ?? 0);
      const sz = cz + (options.shiftZ ?? 0);
      const base = [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]];
      const top = [[sx - tw, y1, sz - td], [sx + tw, y1, sz - td], [sx + tw, y1, sz + td], [sx - tw, y1, sz + td]];
      this.quad(top[3], top[2], top[1], top[0], color);
      this.quad(base[0], base[1], base[2], base[3], color);
      for (let i = 0; i < 4; i += 1) {
        const j = (i + 1) % 4;
        this.quad(base[i], base[j], top[j], top[i], color);
      }
      return;
    }

    // Six faces of a box, wound outward.
    this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], color);
    this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], color);
    this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], color);
    this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], color);
    this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], color);
    this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], color);
  }

  /** A wheel: an octagonal drum on the X axis, standing on the ground at cy = radius. */
  wheel(cx, cy, cz, radius, width, color, hubColor) {
    const segments = 8;
    const half = width / 2;
    const rim = [];
    for (let i = 0; i < segments; i += 1) {
      const angle = (i / segments) * Math.PI * 2;
      rim.push([cy + Math.cos(angle) * radius, cz + Math.sin(angle) * radius]);
    }
    for (let i = 0; i < segments; i += 1) {
      const p0 = rim[i];
      const p1 = rim[(i + 1) % segments];
      // The tread band, then the two octagonal end caps.
      this.quad(
        [cx - half, p0[0], p0[1]],
        [cx - half, p1[0], p1[1]],
        [cx + half, p1[0], p1[1]],
        [cx + half, p0[0], p0[1]],
        color,
      );
      this.triangle([cx - half, cy, cz], [cx - half, p0[0], p0[1]], [cx - half, p1[0], p1[1]], color);
      this.triangle([cx + half, cy, cz], [cx + half, p1[0], p1[1]], [cx + half, p0[0], p0[1]], color);
    }
    // A pale hub on the outside face, so a wheel reads as a wheel at distance.
    this.box(cx + half * 0.55, cy, cz, width * 0.12, radius * 0.75, radius * 0.75, hubColor);
  }

  build() {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(this.normals, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(this.colors, 3));
    geometry.computeBoundingSphere();
    return geometry;
  }
}

const cache = new Map();
const colorCache = new Map();

function color(hex) {
  // A caller may already hand in a THREE.Color; only hex numbers need converting.
  if (typeof hex === 'string') return hex;
  let value = colorCache.get(hex);
  if (!value) {
    value = new THREE.Color(hex);
    colorCache.set(hex, value);
  }
  return value;
}

const WHITE = new THREE.Color(1, 1, 1);
const GLASS = 0x1b262e;
const DARK = 0x15181c;
const CHROME = 0x8d939a;
const HEADLIGHT = 0xfff0c8;
const TAILLIGHT = 0xc03028;
const HUB = 0xb8bcc0;

/**
 * The glasshouse every car shares: a tapered glass volume, a body-colour roof and four
 * pillars. `shiftZ` leans the roof back for a fastback or forward for a van.
 */
function cabin(soup, y, z, width, height, depth, options = {}) {
  const topW = options.topW ?? width * 0.9;
  const topD = options.topD ?? depth * 0.72;
  const shiftZ = options.shiftZ ?? 0;
  soup.box(0, y + height / 2, z, width, height, depth, color(GLASS), { topW, topD, shiftZ });
  soup.box(0, y + height + 0.045, z + shiftZ * 0.9, topW + 0.04, 0.09, topD + 0.05, WHITE);

  // Four thin pillars at the corners, in body colour.
  const halfW = width / 2 - 0.04;
  const halfD = depth / 2 - 0.04;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      soup.box(sx * halfW, y + height * 0.5, z + sz * halfD, 0.07, height, 0.09, WHITE);
    }
  }
}

/** Head and tail lamps, the dark bumper strips, and a plate light at the front. */
function lamps(soup, dims, options = {}) {
  const zFront = dims.length / 2 - 0.03;
  const zBack = -dims.length / 2 + 0.03;
  const y = options.y ?? 0.66;
  soup.box(0, y, zFront, dims.width - 0.5, 0.13, 0.06, color(HEADLIGHT));
  soup.box(0, y, zBack, (dims.width - 0.5) * 0.94, 0.12, 0.06, color(TAILLIGHT));
  soup.box(0, y - 0.15, zFront, dims.width - 0.25, 0.16, 0.07, color(DARK));
  soup.box(0, y - 0.12, zBack, dims.width - 0.2, 0.14, 0.07, color(DARK));
  soup.box(0, y - 0.24, zFront + 0.01, 0.34, 0.1, 0.03, color(CHROME));
}

function mirrors(soup, width, y, z) {
  for (const sx of [-1, 1]) {
    soup.box(sx * (width / 2 + 0.07), y, z, 0.16, 0.1, 0.08, color(DARK));
  }
}

// ---------------------------------------------------------------- the bodies

function sedan() {
  const soup = new Soup();
  const dims = { length: 4.55, width: 1.84, wheelbase: 2.66, track: 1.56, wheelRadius: 0.34, height: 1.44 };
  soup.box(0, 0.55, 0, 1.84, 0.5, 4.5, WHITE);
  soup.box(0, 0.32, 0, 1.7, 0.14, 4.3, color(DARK));
  // Bonnet and boot decks, then the shared glasshouse.
  soup.box(0, 0.86, 1.42, 1.7, 0.16, 1.55, WHITE);
  soup.box(0, 0.86, -1.55, 1.7, 0.16, 1.35, WHITE);
  cabin(soup, 0.97, -0.08, 1.66, 0.5, 2.2);
  soup.box(0, 1.02, 0, 1.5, 0.34, 1.9, color(0x22262b));
  mirrors(soup, dims.width, 1.02, 0.85);
  lamps(soup, dims);
  return { soup, dims, details: null };
}

function coupe() {
  const soup = new Soup();
  const dims = { length: 4.35, width: 1.86, wheelbase: 2.6, track: 1.6, wheelRadius: 0.33, height: 1.26 };
  soup.box(0, 0.5, 0, 1.86, 0.46, 4.3, WHITE);
  soup.box(0, 0.3, 0, 1.72, 0.12, 4.15, color(DARK));
  soup.box(0, 0.78, 1.32, 1.76, 0.14, 1.7, WHITE);
  soup.box(0, 0.78, -1.62, 1.72, 0.14, 1.1, WHITE);
  // A fastback roof: the top is pulled back over the rear deck.
  cabin(soup, 0.86, -0.42, 1.62, 0.42, 1.95, { topD: 0.62, shiftZ: -0.16 });
  // A ducktail spoiler on the boot.
  soup.box(0, 1.14, -1.52, 1.5, 0.09, 0.42, WHITE);
  soup.box(0, 1.05, 0.1, 1.45, 0.26, 1.5, color(0x1d2126));
  mirrors(soup, dims.width, 0.9, 0.55);
  lamps(soup, dims, { y: 0.6 });
  return { soup, dims };
}

function van() {
  const soup = new Soup();
  const dims = { length: 5.05, width: 2.0, wheelbase: 3.0, track: 1.68, wheelRadius: 0.36, height: 2.12 };
  soup.box(0, 1.0, -0.2, 2.0, 1.46, 4.6, WHITE);
  soup.box(0, 0.3, 0, 1.78, 0.14, 4.5, color(DARK));
  // A short sloped nose, then the flat sides.
  soup.box(0, 1.34, 2.05, 1.9, 0.72, 0.9, WHITE, { topW: 1.75, topD: 0.6, shiftZ: -0.2 });
  // Windscreen, then the two side windows.
  soup.box(0, 1.3, 2.52, 1.76, 0.5, 0.08, color(GLASS));
  for (const sx of [-1, 1]) {
    soup.box(sx * 0.99, 1.44, 0.75, 0.06, 0.46, 1.5, color(GLASS));
    soup.box(sx * 0.99, 1.35, -1.3, 0.06, 0.62, 1.7, color(GLASS));
  }
  soup.box(0, 1.76, -0.2, 1.94, 0.1, 4.4, WHITE);
  mirrors(soup, dims.width, 1.5, 1.9);
  lamps(soup, dims, { y: 0.72 });
  return { soup, dims };
}

/** The checker band along a taxi's flanks. */
function taxiCheckers(soup, width, y) {
  for (let i = 0; i < 9; i += 1) {
    const z = -1.5 + i * 0.36;
    for (const sx of [-1, 1]) {
      soup.box(sx * (width / 2 + 0.005), y, z, 0.03, 0.12, 0.18, color(i % 2 === 0 ? 0x14161a : 0xf1ead8));
    }
  }
}

function taxi() {
  const soup = new Soup();
  const dims = { length: 4.6, width: 1.88, wheelbase: 2.68, track: 1.58, wheelRadius: 0.34, height: 1.72 };
  soup.box(0, 0.55, 0, 1.88, 0.5, 4.55, WHITE);
  soup.box(0, 0.3, 0, 1.74, 0.14, 4.4, color(DARK));
  soup.box(0, 0.86, 1.4, 1.74, 0.16, 1.6, WHITE);
  soup.box(0, 0.86, -1.55, 1.74, 0.16, 1.4, WHITE);
  taxiCheckers(soup, dims.width, 0.62);
  cabin(soup, 0.97, -0.08, 1.68, 0.5, 2.2);
  soup.box(0, 1.02, 0, 1.5, 0.34, 1.9, color(0x22262b));
  // The roof sign: a pale box with a dark face.
  soup.box(0, 1.5, -0.1, 0.76, 0.28, 0.4, color(0xf4ecd8));
  soup.box(0, 1.5, -0.1, 0.5, 0.14, 0.42, color(0x1b1b1b));
  mirrors(soup, dims.width, 1.02, 0.85);
  lamps(soup, dims);
  return { soup, dims };
}

function police() {
  const soup = new Soup();
  const dims = { length: 4.85, width: 1.92, wheelbase: 2.84, track: 1.62, wheelRadius: 0.35, height: 1.5 };
  soup.box(0, 0.56, 0, 1.92, 0.52, 4.8, WHITE);
  soup.box(0, 0.3, 0, 1.78, 0.14, 4.65, color(DARK));
  soup.box(0, 0.88, 1.35, 1.82, 0.16, 1.85, color(0x131619));
  soup.box(0, 0.88, -1.6, 1.8, 0.16, 1.35, WHITE);

  // Door decals and the push bars.
  for (const sx of [-1, 1]) {
    soup.box(sx * 0.965, 0.62, 0.55, 0.04, 0.44, 1.1, color(0x16191d));
    soup.box(sx * 0.965, 0.62, -0.95, 0.04, 0.44, 0.9, color(0x16191d));
    soup.box(sx * 0.84, 0.7, 1.1, 0.2, 0.26, 1.6, WHITE);
  }

  cabin(soup, 0.98, -0.1, 1.74, 0.48, 2.4);
  soup.box(0, 1.02, 0, 1.56, 0.34, 2.05, color(0x22262b));

  // The light bar: red on the left, blue on the right, a dark base under it.
  soup.box(0, 1.5, -0.12, 1.2, 0.1, 0.34, color(DARK));
  soup.box(-0.3, 1.59, -0.12, 0.52, 0.13, 0.3, color(0xd02a2a));
  soup.box(0.3, 1.59, -0.12, 0.52, 0.13, 0.3, color(0x2a5ad0));
  soup.box(0, 0.66, 2.42, 1.2, 0.24, 0.12, color(DARK));
  for (const sx of [-1, 1]) {
    soup.box(sx * 0.55, 0.46, 2.44, 0.08, 0.5, 0.1, color(DARK));
  }
  mirrors(soup, dims.width, 1.02, 0.9);
  lamps(soup, dims);
  return { soup, dims };
}

function buggy() {
  const soup = new Soup();
  const dims = { length: 3.7, width: 1.82, wheelbase: 2.25, track: 1.9, wheelRadius: 0.46, height: 1.42 };
  soup.box(0, 0.4, 0, 1.5, 0.16, 3.1, WHITE);
  soup.box(0, 0.62, 1.28, 1.36, 0.3, 0.98, WHITE, { topW: 1.1, topD: 0.8 });
  soup.box(0, 0.56, -1.32, 1.3, 0.24, 0.6, WHITE);

  // Open cockpit: two seats, a dash and a low screen.
  soup.box(0, 0.62, -0.15, 1.24, 0.26, 1.15, color(0x2a2f34));
  soup.box(-0.3, 0.78, -0.52, 0.44, 0.42, 0.16, color(0xb8a27c));
  soup.box(0.3, 0.78, -0.52, 0.44, 0.42, 0.16, color(0xb8a27c));
  soup.box(0, 0.7, 0.42, 1.14, 0.16, 0.16, color(0x22262b));
  soup.box(0, 0.86, 0.42, 0.9, 0.4, 0.05, color(GLASS));

  // Roll bar: two legs and a cross tube.
  for (const sx of [-1, 1]) {
    soup.box(sx * 0.58, 1.05, -0.62, 0.09, 1.2, 0.09, WHITE);
  }
  soup.box(0, 1.62, -0.62, 1.26, 0.1, 0.1, WHITE);
  soup.box(0, 0.46, 1.78, 1.2, 0.1, 0.12, color(DARK));
  soup.box(0, 0.7, 1.78, 0.9, 0.16, 0.06, color(HEADLIGHT));
  soup.box(0, 0.62, -1.6, 0.7, 0.12, 0.05, color(TAILLIGHT));
  return { soup, dims };
}

const BUILDERS = { sedan, coupe, van, taxi, police, buggy };

/** The traffic mix: sedans are the city's default, taxis and vans fill the rest. */
export const TRAFFIC_MIX = [
  { type: 'sedan', weight: 34 },
  { type: 'coupe', weight: 16 },
  { type: 'taxi', weight: 16 },
  { type: 'van', weight: 15 },
  { type: 'police', weight: 6 },
  { type: 'buggy', weight: 3 },
];

export const CAR_PAINT = [
  0xb8bcc0, 0x2f3c4a, 0x7a232b, 0x24585a, 0xcbb073, 0x3b3f46, 0xe4ded0,
  0x365a8a, 0x6d2f45, 0x4e6a3f, 0xd0d4d8, 0x8a5a2b,
];

const TYPE_PAINT = {
  taxi: 0xe8b21f,
  police: 0xe9e9e2,
  buggy: 0x5fb0a2,
};

export const CAR_TYPES = Object.keys(BUILDERS);
export { TYPE_PAINT };

/**
 * Splits a body soup into a painted shell and baked-colour details. The builders write body
 * panels as pure white, so one colour test separates them.
 */
function splitShell(soup) {
  const shell = new Soup();
  const details = new Soup();
  // Nine floats per triangle: three vertices of three components.
  for (let i = 0; i < soup.positions.length; i += 9) {
    const isWhite = soup.colors[i] > 0.99 && soup.colors[i + 1] > 0.99 && soup.colors[i + 2] > 0.99;
    const target = isWhite ? shell : details;
    for (let vertex = 0; vertex < 9; vertex += 1) {
      const offset = i + vertex;
      target.positions.push(soup.positions[offset]);
      target.normals.push(soup.normals[offset]);
      target.colors.push(soup.colors[offset]);
    }
    target.triangles += 1;
  }
  return { shell, details };
}

/**
 * Builds and caches the geometries for one body type.
 * @returns {{type, dims, shell, details, wheels, wheelGeometry, wheelOffsets}}
 */
export function getCarModel(type) {
  const key = BUILDERS[type] ? type : 'sedan';
  if (cache.has(key)) return cache.get(key);
  const { soup, dims } = BUILDERS[key]();
  const { shell, details } = splitShell(soup);

  // One wheel at the origin, for the player's car to spin, plus the static set for the fleet
  // and the parked cars.
  const wheelGeometry = new Soup();
  wheelGeometry.wheel(0, dims.wheelRadius, 0, dims.wheelRadius, 0.28, color(DARK), color(HUB));

  const wheels = new Soup();
  const wheelOffsets = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const offset = { x: (sx * dims.track) / 2, y: dims.wheelRadius, z: (sz * dims.wheelbase) / 2 };
      wheelOffsets.push(offset);
      wheels.wheel(offset.x, offset.y, offset.z, dims.wheelRadius, 0.28, color(DARK), color(HUB));
    }
  }

  const model = {
    type: key,
    dims,
    shell: shell.build(),
    details: details.build(),
    wheels: wheels.build(),
    wheelGeometry: wheelGeometry.build(),
    wheelOffsets,
    triangles: shell.triangles + details.triangles + wheels.triangles,
    radius: Math.max(dims.width, dims.length) * 0.32,
  };
  cache.set(key, model);
  return model;
}

/**
 * A standalone car the player can drive: real wheels that spin, a paint material, and a
 * contact shadow. The group faces +Z with its wheels on y = 0.
 */
export function buildCarGroup(type, paint = 0xb8bcc0) {
  const model = getCarModel(type);
  const group = new THREE.Group();
  group.name = `car-${model.type}`;

  // The hero car carries a little self-illumination so its paint reads after sunset.
  const paintMaterial = new THREE.MeshLambertMaterial({
    color: paint,
    vertexColors: true,
    emissive: new THREE.Color(paint).multiplyScalar(0.16),
  });
  const shell = new THREE.Mesh(model.shell, paintMaterial);
  group.add(shell);

  const details = new THREE.Mesh(model.details, new THREE.MeshLambertMaterial({ vertexColors: true }));
  group.add(details);

  // Every wheel shares one geometry and one material: the offsets live on the meshes.
  const wheelMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });
  const wheels = model.wheelOffsets.map((offset) => {
    const wheel = new THREE.Mesh(model.wheelGeometry, wheelMaterial);
    wheel.position.set(offset.x, offset.y, offset.z);
    group.add(wheel);
    return wheel;
  });

  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(model.dims.width + 0.5, model.dims.length + 0.4),
    new THREE.MeshBasicMaterial({ color: 0x0a0d12, transparent: true, opacity: 0.3, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.02;
  group.add(shadow);

  return {
    group,
    shell,
    details,
    wheels,
    shadow,
    paintMaterial,
    dims: model.dims,
    setPaint(hex) {
      paintMaterial.color.set(hex);
    },
  };
}

/** A colour for a body type, respecting the liveries. */
export function paintFor(type, random) {
  if (TYPE_PAINT[type]) return TYPE_PAINT[type];
  return random ? random.pick(CAR_PAINT) : CAR_PAINT[0];
}
