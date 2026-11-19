// Geometry helpers. A MeshBuilder accumulates quads, boxes, beams and cylinders into one
// indexed BufferGeometry, so a whole district's walls or a street's furniture costs one
// draw call. UVs are in world metres divided by a per-call scale, which keeps a brick or
// window row the same size on every building that shares the texture. Vertex colours let
// one material serve many tinted lots.
//
// Materials are MeshLambert: cheap, fog-aware, and with an emissive map for the lit
// windows the clock turns up after dusk.

/** sRGB hex to a linear vertex-colour triple, optionally scaled. */
export function colorTriple(hex, tint = 1) {
  // THREE.Color converts an sRGB hex to the linear working space on construction, so
  // converting again here would darken every surface twice.
  const color = new THREE.Color(hex);
  return [color.r * tint, color.g * tint, color.b * tint];
}

/** A small deterministic tint around a base colour, for lot-to-lot variation. */
export function tintTriple(hex, random, amount = 0.1) {
  return colorTriple(hex, 1 + random.signed() * amount);
}

const _v = new THREE.Vector3();
const _n = new THREE.Vector3();

/** Maps a four-corner list of [u, v] pairs through a tile scale. */
function scaledUvs(corners, ux, uy) {
  return corners.map(([u, v]) => [u * ux, v * uy]);
}

/** `uvScale` is [horizontal, vertical] metres per tile, or one number for both. */
function uvPair(value) {
  if (Array.isArray(value)) return value;
  return value === undefined ? [8, 8] : [value, value];
}

export class MeshBuilder {
  constructor(name = 'builder') {
    this.name = name;
    this.positions = [];
    this.normals = [];
    this.uvs = [];
    this.colors = [];
    this.indices = [];
    this.vertices = 0;
    this.triangles = 0;
  }

  get isEmpty() {
    return this.indices.length === 0;
  }

  /** Low-level quad. Points are [x, y, z]; uvs are [u, v] per corner. */
  quad(p0, p1, p2, p3, normal, color, uvs) {
    const base = this.vertices;
    const points = [p0, p1, p2, p3];
    for (let i = 0; i < 4; i += 1) {
      const point = points[i];
      this.positions.push(point[0], point[1], point[2]);
      this.normals.push(normal[0], normal[1], normal[2]);
      this.uvs.push(uvs[i][0], uvs[i][1]);
      this.colors.push(color[0], color[1], color[2]);
    }
    this.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    this.vertices += 4;
    this.triangles += 2;
  }

  triangle(p0, p1, p2, normal, color, uv0 = [0, 0], uv1 = [1, 0], uv2 = [0.5, 1]) {
    const base = this.vertices;
    const points = [p0, p1, p2];
    const uvs = [uv0, uv1, uv2];
    for (let i = 0; i < 3; i += 1) {
      const point = points[i];
      this.positions.push(point[0], point[1], point[2]);
      this.normals.push(normal[0], normal[1], normal[2]);
      this.uvs.push(uvs[i][0], uvs[i][1]);
      this.colors.push(color[0], color[1], color[2]);
    }
    this.indices.push(base, base + 1, base + 2);
    this.vertices += 3;
    this.triangles += 1;
  }

  /**
   * An axis-aligned box with its base at y. `opts.rotY` spins it about its centre.
   * `opts.uvScale` is [horizontal, vertical] metres per texture tile.
   */
  box(cx, y, cz, width, height, depth, color, opts = {}) {
    const rotY = opts.rotY ?? 0;
    const [uvX, uvY] = uvPair(opts.uvScale);
    const topColor = opts.topColor ?? color;
    const w = width / 2;
    const d = depth / 2;
    const h = height;
    const cos = Math.cos(rotY);
    const sin = Math.sin(rotY);
    const point = (x, yy, z) => [cx + x * cos - z * sin, y + yy, cz + x * sin + z * cos];
    const ux = 1 / uvX;
    const uy = 1 / uvY;

    // +Z and -Z faces.
    this.quad(
      point(-w, 0, d), point(w, 0, d), point(w, h, d), point(-w, h, d),
      [sin, 0, cos], color,
      scaledUvs([[cx - w, y], [cx + w, y], [cx + w, y + h], [cx - w, y + h]], ux, uy),
    );
    this.quad(
      point(w, 0, -d), point(-w, 0, -d), point(-w, h, -d), point(w, h, -d),
      [-sin, 0, -cos], color,
      scaledUvs([[cx + w, y], [cx - w, y], [cx - w, y + h], [cx + w, y + h]], ux, uy),
    );
    // +X and -X faces.
    this.quad(
      point(w, 0, d), point(w, 0, -d), point(w, h, -d), point(w, h, d),
      [cos, 0, sin], color,
      scaledUvs([[cz + d, y], [cz - d, y], [cz - d, y + h], [cz + d, y + h]], ux, uy),
    );
    this.quad(
      point(-w, 0, -d), point(-w, 0, d), point(-w, h, d), point(-w, h, -d),
      [-cos, 0, -sin], color,
      scaledUvs([[cz - d, y], [cz + d, y], [cz + d, y + h], [cz - d, y + h]], ux, uy),
    );
    // The roof, laid out in world metres so its pattern lines up with the walls.
    this.quad(
      point(-w, h, d), point(w, h, d), point(w, h, -d), point(-w, h, -d),
      [0, 1, 0], topColor,
      scaledUvs([[cx - w, cz + d], [cx + w, cz + d], [cx + w, cz - d], [cx - w, cz - d]], ux, ux),
    );
    if (opts.bottom) {
      this.quad(
        point(-w, 0, -d), point(w, 0, -d), point(w, 0, d), point(-w, 0, d),
        [0, -1, 0], color,
        scaledUvs([[cx - w, cz - d], [cx + w, cz - d], [cx + w, cz + d], [cx - w, cz + d]], ux, ux),
      );
    }
    return this;
  }

  /** A box whose top footprint is scaled: one tier of a setback tower. */
  taperedBox(cx, y, cz, width, depth, height, topScale, color, opts = {}) {
    const [uvX, uvY] = uvPair(opts.uvScale);
    const rotY = opts.rotY ?? 0;
    const cos = Math.cos(rotY);
    const sin = Math.sin(rotY);
    const w = width / 2;
    const d = depth / 2;
    const tw = w * topScale;
    const td = d * topScale;
    const point = (x, yy, z) => [cx + x * cos - z * sin, y + yy, cz + x * sin + z * cos];
    const ux = 1 / uvX;
    const uy = 1 / uvY;
    const topColor = opts.topColor ?? color;

    // Each side runs from the wide base pair to the narrow top pair.
    const sides = [
      [[-w, 0, d], [w, 0, d], [tw, height, td], [-tw, height, td], [sin, 0, cos]],
      [[w, 0, -d], [-w, 0, -d], [-tw, height, -td], [tw, height, -td], [-sin, 0, -cos]],
      [[w, 0, d], [w, 0, -d], [tw, height, -td], [tw, height, td], [cos, 0, sin]],
      [[-w, 0, -d], [-w, 0, d], [-tw, height, td], [-tw, height, -td], [-cos, 0, -sin]],
    ];
    const sideUvs = [[0, 0], [width * ux, 0], [width * ux * topScale, height * uy], [0, height * uy]];
    for (const [a, b, c, d2, normal] of sides) {
      this.quad(point(...a), point(...b), point(...c), point(...d2), normal, color, sideUvs);
    }
    this.quad(
      point(-tw, height, td), point(tw, height, td), point(tw, height, -td), point(-tw, height, -td),
      [0, 1, 0], topColor,
      [
        [0, 0],
        [width * topScale * ux, 0],
        [width * topScale * ux, depth * topScale * ux],
        [0, depth * topScale * ux],
      ],
    );
    return this;
  }

  /** A horizontal ground quad facing up. */
  plane(cx, cz, width, depth, y, color, opts = {}) {
    const rotY = opts.rotY ?? 0;
    const uvScale = opts.uvScale ?? 8;
    const repeatX = opts.repeatX ?? width / uvScale;
    const repeatY = opts.repeatY ?? depth / uvScale;
    const cos = Math.cos(rotY);
    const sin = Math.sin(rotY);
    const w = width / 2;
    const d = depth / 2;
    const point = (x, z) => [cx + x * cos - z * sin, y, cz + x * sin + z * cos];
    this.quad(point(-w, d), point(w, d), point(w, -d), point(-w, -d), [0, 1, 0], color, [
      [0, 0],
      [repeatX, 0],
      [repeatX, repeatY],
      [0, repeatY],
    ]);
    return this;
  }

  /** A vertical rectangle centred at (cx, cy, cz), facing -Z before rotY. */
  panel(cx, cy, cz, width, height, color, opts = {}) {
    const rotY = opts.rotY ?? 0;
    const cos = Math.cos(rotY);
    const sin = Math.sin(rotY);
    const w = width / 2;
    const h = height / 2;
    const point = (x, y) => [cx + x * cos, cy + y, cz + x * sin];
    const repeatX = opts.repeatX ?? 1;
    const repeatY = opts.repeatY ?? 1;
    const uvs = [[0, 0], [repeatX, 0], [repeatX, repeatY], [0, repeatY]];

    this.quad(point(-w, -h), point(w, -h), point(w, h), point(-w, h), [sin, 0, cos], color, uvs);
    if (opts.twoSided) {
      this.quad(point(w, -h), point(-w, -h), point(-w, h), point(w, h), [-sin, 0, -cos], color, uvs);
    }
    return this;
  }

  /** A beam between two ground points, used for bridge decks, rails and highway spans. */
  beam(ax, az, bx, bz, width, height, bottomY, color, opts = {}) {
    const dx = bx - ax;
    const dz = bz - az;
    const length = Math.hypot(dx, dz);
    if (length < 0.001) return this;
    return this.box((ax + bx) / 2, bottomY, (az + bz) / 2, width, height, length, color, {
      ...opts,
      rotY: Math.atan2(dx, dz),
      uvScale: opts.uvScale ?? [8, 8],
    });
  }

  /** A vertical cylinder (or truncated cone) with its base at y. */
  cylinder(cx, cz, radius, height, y, segments, color, opts = {}) {
    const topRadius = opts.topRadius ?? radius;
    const uvScale = opts.uvScale ?? 8;
    const cap = opts.cap ?? true;
    const sides = Math.max(3, segments);
    const ux = 1 / uvScale;
    const uy = 1 / uvScale;
    const arc = (Math.PI * 2 * radius) / sides;

    for (let i = 0; i < sides; i += 1) {
      const a0 = (i / sides) * Math.PI * 2;
      const a1 = ((i + 1) / sides) * Math.PI * 2;
      const x0 = Math.cos(a0);
      const z0 = Math.sin(a0);
      const x1 = Math.cos(a1);
      const z1 = Math.sin(a1);
      // The normal points out of the middle of the segment.
      const nx = Math.cos((a0 + a1) / 2);
      const nz = Math.sin((a0 + a1) / 2);
      this.quad(
        [cx + x0 * radius, y, cz + z0 * radius],
        [cx + x1 * radius, y, cz + z1 * radius],
        [cx + x1 * topRadius, y + height, cz + z1 * topRadius],
        [cx + x0 * topRadius, y + height, cz + z0 * topRadius],
        [nx, 0, nz],
        color,
        [
          [i * arc * ux, 0],
          [(i + 1) * arc * ux, 0],
          [(i + 1) * arc * ux, height * uy],
          [i * arc * ux, height * uy],
        ],
      );
    }

    if (cap && topRadius > 0.01) {
      for (let i = 0; i < sides; i += 1) {
        const a0 = (i / sides) * Math.PI * 2;
        const a1 = ((i + 1) / sides) * Math.PI * 2;
        this.triangle(
          [cx, y + height, cz],
          [cx + Math.cos(a0) * topRadius, y + height, cz + Math.sin(a0) * topRadius],
          [cx + Math.cos(a1) * topRadius, y + height, cz + Math.sin(a1) * topRadius],
          [0, 1, 0],
          opts.topColor ?? color,
          [0, 0],
          [1, 0],
          [0, 1],
        );
      }
    }
    return this;
  }

  /** A flat ring on the ground, for plazas and stadium tiers. */
  ring(cx, cz, innerRadius, outerRadius, y, segments, color) {
    const sides = Math.max(8, segments);
    for (let i = 0; i < sides; i += 1) {
      const a0 = (i / sides) * Math.PI * 2;
      const a1 = ((i + 1) / sides) * Math.PI * 2;
      const c0 = Math.cos(a0);
      const s0 = Math.sin(a0);
      const c1 = Math.cos(a1);
      const s1 = Math.sin(a1);
      this.quad(
        [cx + c0 * innerRadius, y, cz + s0 * innerRadius],
        [cx + c1 * innerRadius, y, cz + s1 * innerRadius],
        [cx + c1 * outerRadius, y, cz + s1 * outerRadius],
        [cx + c0 * outerRadius, y, cz + s0 * outerRadius],
        [0, 1, 0],
        color,
        [[0, 0], [1, 0], [1, 1], [0, 1]],
      );
    }
    return this;
  }

  /** Appends another builder's data, offsetting its indices. */
  append(other) {
    if (!other || !other.positions.length) return this;
    const base = this.vertices;
    this.positions.push(...other.positions);
    this.normals.push(...other.normals);
    this.uvs.push(...other.uvs);
    this.colors.push(...other.colors);
    for (const index of other.indices) this.indices.push(index + base);
    this.vertices += other.vertices;
    this.triangles += other.triangles;
    return this;
  }

  /** Turns the accumulated data into one mesh. Returns null for an empty builder. */
  finalize(material, name = this.name) {
    if (!this.positions.length) return null;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(this.normals, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(this.uvs, 2));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(this.colors, 3));
    geometry.setIndex(this.indices);
    geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    // City geometry never moves after generation; skip the per-frame matrix update.
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.userData.triangles = this.triangles;
    return mesh;
  }

  /** Finalizes and adds to a group; returns the mesh (or null) for chaining. */
  attach(group, material, name = this.name) {
    const mesh = this.finalize(material, name);
    if (mesh) group.add(mesh);
    return mesh;
  }
}

/** The standard lit city material. Vertex colours tint one shared texture. */
export function cityMaterial(texture, options = {}) {
  const material = new THREE.MeshLambertMaterial({
    map: texture?.map ?? texture ?? null,
    color: options.color ?? 0xffffff,
    vertexColors: options.vertexColors ?? true,
    side: options.side ?? THREE.FrontSide,
    transparent: options.transparent ?? false,
    opacity: options.opacity ?? 1,
    depthWrite: options.depthWrite ?? true,
    emissive: options.emissive ?? 0x000000,
    emissiveMap: texture?.lights ?? options.emissiveMap ?? null,
    emissiveIntensity: options.emissiveIntensity ?? 0,
    fog: options.fog ?? true,
  });
  if (material.map) material.map.repeat.set(1, 1);
  return material;
}

/** Unlit material for neon, lamps and screens. */
export function glowMaterial(texture = null, color = 0xffffff, options = {}) {
  return new THREE.MeshBasicMaterial({
    map: texture,
    color,
    transparent: options.transparent ?? Boolean(texture),
    opacity: options.opacity ?? 1,
    depthWrite: options.depthWrite ?? false,
    side: options.side ?? THREE.DoubleSide,
    blending: options.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    toneMapped: options.toneMapped ?? false,
    fog: options.fog ?? true,
    vertexColors: options.vertexColors ?? true,
  });
}

/** A plain shaded material for untextured detail (iron, wood, roofs). */
export function flatMaterial(color = 0xffffff, options = {}) {
  return new THREE.MeshLambertMaterial({
    color,
    vertexColors: options.vertexColors ?? true,
    side: options.side ?? THREE.FrontSide,
    transparent: options.transparent ?? false,
    opacity: options.opacity ?? 1,
    fog: options.fog ?? true,
  });
}

// Shared scratch vectors for the callers that project a point per frame.
export { _v as scratchVector, _n as scratchNormal };
