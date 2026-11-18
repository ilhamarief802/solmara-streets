// Geometry building blocks. Every static thing in Solmara is emitted into a named
// bucket, and each bucket becomes exactly one merged mesh, so a city of hundreds of
// buildings and thousands of props costs a few dozen draw calls instead of
// thousands. Faces are written non-indexed with per vertex colour, which lets one
// material serve many buildings and lets the day/night cycle tint the whole city by
// touching a handful of material objects.

const FACE_KEYS = ['px', 'nx', 'py', 'pz', 'nz', 'ny'];

export class GeometryBuilder {
  constructor(name = 'bucket') {
    this.name = name;
    this.positions = [];
    this.normals = [];
    this.uvs = [];
    this.colors = [];
    this.vertices = 0;
    this.min = [Infinity, Infinity, Infinity];
    this.max = [-Infinity, -Infinity, -Infinity];
  }

  get triangles() {
    return this.vertices / 3;
  }

  get isEmpty() {
    return this.vertices === 0;
  }

  track(x, y, z) {
    if (x < this.min[0]) this.min[0] = x;
    if (y < this.min[1]) this.min[1] = y;
    if (z < this.min[2]) this.min[2] = z;
    if (x > this.max[0]) this.max[0] = x;
    if (y > this.max[1]) this.max[1] = y;
    if (z > this.max[2]) this.max[2] = z;
  }

  /** One triangle: three packed vertices, one normal, three uv/colour pairs. */
  triangle(a, b, c, normal, uvA, uvB, uvC, color) {
    if (!a || !b || !c || !uvA || !uvB || !uvC || !color) {
      // A malformed face is a bug in the caller, not a reason to lose the city: say so
      // once per bucket and skip it.
      if (!this.reported) {
        this.reported = true;
        console.error(`geometry["${this.name}"]: skipped a face with missing corners, normals, uvs or colour`, { a, b, c, normal, uvA, uvB, uvC, color });
      }
      return;
    }
    this.positions.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    for (let i = 0; i < 3; i += 1) this.normals.push(normal[0], normal[1], normal[2]);
    this.uvs.push(uvA[0], uvA[1], uvB[0], uvB[1], uvC[0], uvC[1]);
    for (let i = 0; i < 3; i += 1) this.colors.push(color[0], color[1], color[2]);
    this.vertices += 3;
    this.track(a[0], a[1], a[2]);
    this.track(b[0], b[1], b[2]);
    this.track(c[0], c[1], c[2]);
  }

  /** A triangle whose three uvs arrive as one [uvA, uvB, uvC] array. */
  tri(a, b, c, normal, uvs, color) {
    this.triangle(a, b, c, normal, uvs[0], uvs[1], uvs[2], color);
    return this;
  }

  /** A quad from four corners in winding order (counter clockwise seen from front). */
  quad(a, b, c, d, normal, uv, color) {
    this.triangle(a, b, c, normal, uv[0], uv[1], uv[2], color);
    this.triangle(a, c, d, normal, uv[0], uv[2], uv[3], color);
  }

  /**
   * Axis aligned box. `faces` selects the sides to emit (default: everything but the
   * bottom). `rotation` is an Euler-ish {x, y, z} in radians applied about the box
   * centre. uScale/vScale are texels-per-world-unit multipliers for the facade map.
   */
  addBox(box) {
    const width = box.width ?? box.size ?? 1;
    const height = box.height ?? box.size ?? 1;
    const depth = box.depth ?? box.size ?? 1;
    const hw = width / 2;
    const hh = height / 2;
    const hd = depth / 2;
    const cx = box.x ?? 0;
    const cy = box.y ?? 0;
    const cz = box.z ?? 0;
    const rotation = box.rotation ?? null;
    const matrix = rotation ? rotationMatrix(rotation) : null;
    const color = colourOf(box.color ?? 0xffffff, box.tint ?? 1);
    const uScale = box.uScale ?? 0.25;
    const vScale = box.vScale ?? 0.25;
    const uOffset = box.uOffset ?? 0;
    const vOffset = box.vOffset ?? 0;
    const faces = box.faces ? box.faces.filter((key) => FACE_KEYS.includes(key)) : null;

    const corners = [
      [-hw, -hh, -hd],
      [hw, -hh, -hd],
      [hw, hh, -hd],
      [-hw, hh, -hd],
      [-hw, -hh, hd],
      [hw, -hh, hd],
      [hw, hh, hd],
      [-hw, hh, hd],
    ];

    const place = (index) => {
      const local = corners[index];
      let x = local[0];
      let y = local[1];
      let z = local[2];
      if (matrix) {
        const rx = matrix[0] * x + matrix[1] * y + matrix[2] * z;
        const ry = matrix[3] * x + matrix[4] * y + matrix[5] * z;
        const rz = matrix[6] * x + matrix[7] * y + matrix[8] * z;
        x = rx;
        y = ry;
        z = rz;
      }
      return [cx + x, cy + y, cz + z];
    };

    const p = [place(0), place(1), place(2), place(3), place(4), place(5), place(6), place(7)];
    const want = (key) => !faces || faces.includes(key);

    const emit = (key, order, normal, uSize, vSize) => {
      if (!want(key)) return;
      const n = normal;
      const quadUv = [
        [uOffset, vOffset],
        [uOffset + uSize * uScale, vOffset],
        [uOffset + uSize * uScale, vOffset + vSize * vScale],
        [uOffset, vOffset + vSize * vScale],
      ];
      const finalNormal = matrix ? rotateVector(n, matrix) : n;
      this.quad(p[order[0]], p[order[1]], p[order[2]], p[order[3]], finalNormal, quadUv, color);
    };

    emit('pz', [4, 5, 6, 7], [0, 0, 1], width, height);
    emit('nz', [1, 0, 3, 2], [0, 0, -1], width, height);
    emit('px', [5, 1, 2, 6], [1, 0, 0], depth, height);
    emit('nx', [0, 4, 7, 3], [-1, 0, 0], depth, height);
    emit('py', [3, 7, 6, 2], [0, 1, 0], width, depth);
    emit('ny', [0, 1, 5, 4], [0, -1, 0], width, depth);
    return this;
  }

  /**
   * A flat quad lying on the ground plane, useful for road surfaces, sidewalks,
   * paint, water and any decal. u runs along local +X before rotation.
   */
  addGroundQuad(quad) {
    const width = quad.width ?? 1;
    const depth = quad.depth ?? 1;
    const cx = quad.x ?? 0;
    const y = quad.y ?? 0;
    const cz = quad.z ?? 0;
    const rotY = quad.rotY ?? 0;
    const cos = Math.cos(rotY);
    const sin = Math.sin(rotY);
    const hw = width / 2;
    const hd = depth / 2;
    const color = colourOf(quad.color ?? 0xffffff, quad.tint ?? 1);
    const uScale = quad.uScale ?? 1;
    const vScale = quad.vScale ?? 1;
    const uOffset = quad.uOffset ?? 0;
    const vOffset = quad.vOffset ?? 0;

    const corner = (lx, lz) => [cx + lx * cos - lz * sin, y, cz + lx * sin + lz * cos];
    // Wound so the face points up: (-x,+z) -> (+x,+z) -> (+x,-z) -> (-x,-z).
    const d = corner(-hw, hd);
    const c = corner(hw, hd);
    const b = corner(hw, -hd);
    const a = corner(-hw, -hd);
    const uSpan = width * uScale;
    const vSpan = depth * vScale;
    this.quad(d, c, b, a, [0, 1, 0], [
      [uOffset, vOffset + vSpan],
      [uOffset + uSpan, vOffset + vSpan],
      [uOffset + uSpan, vOffset],
      [uOffset, vOffset],
    ], color);
    return this;
  }

  /** Tapered cylinder with an optional top cap: poles, palms, tanks, masts. */
  addCylinder(cylinder) {
    const segments = Math.max(3, Math.floor(cylinder.segments ?? 6));
    const radiusTop = cylinder.radiusTop ?? cylinder.radius ?? 0.5;
    const radiusBottom = cylinder.radiusBottom ?? cylinder.radius ?? radiusTop;
    const height = cylinder.height ?? 1;
    const cx = cylinder.x ?? 0;
    const cy = cylinder.y ?? 0;
    const cz = cylinder.z ?? 0;
    const color = colourOf(cylinder.color ?? 0xffffff, cylinder.tint ?? 1);
    const uScale = cylinder.uScale ?? 0.4;
    const vScale = cylinder.vScale ?? 0.4;
    const tilt = cylinder.rotation ?? null;
    const matrix = tilt ? rotationMatrix(tilt) : null;

    const put = (lx, ly, lz) => {
      let x = lx;
      let y = ly;
      let z = lz;
      if (matrix) {
        const rx = matrix[0] * x + matrix[1] * y + matrix[2] * z;
        const ry = matrix[3] * x + matrix[4] * y + matrix[5] * z;
        const rz = matrix[6] * x + matrix[7] * y + matrix[8] * z;
        x = rx;
        y = ry;
        z = rz;
      }
      return [cx + x, cy + y, cz + z];
    };

    const topY = height / 2;
    const bottomY = -height / 2;
    for (let i = 0; i < segments; i += 1) {
      const t0 = (i / segments) * Math.PI * 2;
      const t1 = ((i + 1) / segments) * Math.PI * 2;
      const c0 = Math.cos(t0);
      const s0 = Math.sin(t0);
      const c1 = Math.cos(t1);
      const s1 = Math.sin(t1);
      const b0 = put(c0 * radiusBottom, bottomY, s0 * radiusBottom);
      const b1 = put(c1 * radiusBottom, bottomY, s1 * radiusBottom);
      const t0v = put(c0 * radiusTop, topY, s0 * radiusTop);
      const t1v = put(c1 * radiusTop, topY, s1 * radiusTop);
      let nx = c0 + c1;
      let nz = s0 + s1;
      const nLength = Math.hypot(nx, nz) || 1;
      nx /= nLength;
      nz /= nLength;
      const normal = matrix ? rotateVector([nx, 0, nz], matrix) : [nx, 0, nz];
      const u0 = (i / segments) * Math.PI * 2 * radiusBottom * uScale;
      const u1 = ((i + 1) / segments) * Math.PI * 2 * radiusBottom * uScale;
      const vTop = height * vScale;
      // Wound bottom(i) -> top(i) -> top(i+1) -> bottom(i+1) so the wall faces out.
      this.quad(b0, t0v, t1v, b1, normal, [[u0, 0], [u0, vTop], [u1, vTop], [u1, 0]], color);
      if (cylinder.cap !== false && radiusTop > 0.001) {
        const apex = put(0, topY, 0);
        const normalTop = matrix ? rotateVector([0, 1, 0], matrix) : [0, 1, 0];
        this.tri(t1v, t0v, apex, normalTop, [[u1, vTop], [u0, vTop], [(u0 + u1) / 2, vTop + radiusTop * vScale]], color);
      }
    }
    return this;
  }

  /**
   * A gable roof: a ridge running along the local X or Z axis with two slopes and two
   * triangular ends. Cheap, and it turns a warehouse box into a believable shed.
   */
  addGableRoof(roof) {
    const width = roof.width ?? 4;
    const depth = roof.depth ?? 4;
    const height = roof.height ?? 1.2;
    const cx = roof.x ?? 0;
    const cy = roof.y ?? 0;
    const cz = roof.z ?? 0;
    const rotY = roof.rotY ?? 0;
    const alongZ = roof.axis === 'z';
    const color = colourOf(roof.color ?? 0xffffff, roof.tint ?? 1);
    const uScale = roof.uScale ?? 0.3;
    const vScale = roof.vScale ?? 0.3;
    const cos = Math.cos(rotY);
    const sin = Math.sin(rotY);
    const at = (lx, ly, lz) => [cx + lx * cos - lz * sin, cy + ly, cz + lx * sin + lz * cos];
    const hw = width / 2;
    const hd = depth / 2;

    if (!alongZ) {
      // Ridge along X: slopes face +Z and -Z.
      const ridgeA = at(-hw, height, 0);
      const ridgeB = at(hw, height, 0);
      const frontA = at(-hw, 0, hd);
      const frontB = at(hw, 0, hd);
      const backA = at(-hw, 0, -hd);
      const backB = at(hw, 0, -hd);
      const slope = Math.hypot(hd, height) || 1;
      const normalFront = rotateY([0, hd / slope, height / slope], rotY);
      const normalBack = rotateY([0, hd / slope, -height / slope], rotY);
      const uSpan = width * uScale;
      const vSpan = slope * vScale;
      this.quad(frontA, frontB, ridgeB, ridgeA, normalFront, [[0, 0], [uSpan, 0], [uSpan, vSpan], [0, vSpan]], color);
      this.quad(backB, backA, ridgeA, ridgeB, normalBack, [[0, 0], [uSpan, 0], [uSpan, vSpan], [0, vSpan]], color);
      this.tri(frontA, ridgeA, backA, rotateY([-1, 0, 0], rotY), [[0, 0], [hw * uScale, vSpan], [0, vSpan * 0.6]], color);
      this.tri(backB, ridgeB, frontB, rotateY([1, 0, 0], rotY), [[0, 0], [hw * uScale, vSpan], [0, vSpan * 0.6]], color);
    } else {
      const ridgeA = at(0, height, -hd);
      const ridgeB = at(0, height, hd);
      const leftA = at(-hw, 0, -hd);
      const leftB = at(-hw, 0, hd);
      const rightA = at(hw, 0, -hd);
      const rightB = at(hw, 0, hd);
      const slope = Math.hypot(hw, height) || 1;
      const normalLeft = rotateY([-hw / slope, height / slope, 0], rotY);
      const normalRight = rotateY([hw / slope, height / slope, 0], rotY);
      const uSpan = depth * uScale;
      const vSpan = slope * vScale;
      this.quad(leftA, leftB, ridgeB, ridgeA, normalLeft, [[0, 0], [uSpan, 0], [uSpan, vSpan], [0, vSpan]], color);
      this.quad(rightB, rightA, ridgeA, ridgeB, normalRight, [[0, 0], [uSpan, 0], [uSpan, vSpan], [0, vSpan]], color);
      this.tri(leftA, ridgeA, rightA, rotateY([0, 0, -1], rotY), [[0, 0], [hd * uScale, vSpan], [0, vSpan * 0.6]], color);
      this.tri(rightB, ridgeB, leftB, rotateY([0, 0, 1], rotY), [[0, 0], [hd * uScale, vSpan], [0, vSpan * 0.6]], color);
    }
    return this;
  }

  /** A flat ring between two radii, on the ground plane: stadium stands, plazas. */
  addRing(ring) {
    const segments = Math.max(3, Math.floor(ring.segments ?? 12));
    const inner = ring.inner ?? 1;
    const outer = ring.outer ?? 2;
    const cx = ring.x ?? 0;
    const cz = ring.z ?? 0;
    const y = ring.y ?? 0;
    const color = colourOf(ring.color ?? 0xffffff, ring.tint ?? 1);
    const uScale = ring.uScale ?? 0.2;
    const vScale = ring.vScale ?? 0.2;
    for (let i = 0; i < segments; i += 1) {
      const t0 = (i / segments) * Math.PI * 2;
      const t1 = ((i + 1) / segments) * Math.PI * 2;
      const a = [cx + Math.cos(t0) * inner, y, cz + Math.sin(t0) * inner];
      const b = [cx + Math.cos(t0) * outer, y, cz + Math.sin(t0) * outer];
      const c = [cx + Math.cos(t1) * outer, y, cz + Math.sin(t1) * outer];
      const d = [cx + Math.cos(t1) * inner, y, cz + Math.sin(t1) * inner];
      const u0 = t0 * inner * uScale;
      const u1 = t1 * inner * uScale;
      const vSpan = (outer - inner) * vScale;
      // Wound inner(start) -> inner(end) -> outer(end) -> outer(start) to face up.
      this.quad(a, d, c, b, [0, 1, 0], [[u0, 0], [u1, 0], [u1, vSpan], [u0, vSpan]], color);
    }
    return this;
  }

  build() {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.positions), 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(this.normals), 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(this.uvs), 2));
    geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(this.colors), 3));
    geometry.computeBoundingSphere();
    geometry.computeBoundingBox();
    geometry.name = this.name;
    return geometry;
  }

  dispose() {
    this.positions.length = 0;
    this.normals.length = 0;
    this.uvs.length = 0;
    this.colors.length = 0;
    this.vertices = 0;
  }
}

/** Named buckets of geometry, each drained into a single merged mesh. */
export class BuildGroups {
  constructor(materials = {}) {
    this.materials = materials;
    this.builders = new Map();
    this.meshes = new Map();
  }

  builder(name) {
    let builder = this.builders.get(name);
    if (!builder) {
      builder = new GeometryBuilder(name);
      this.builders.set(name, builder);
    }
    return builder;
  }

  /** Shorthand so call sites read like `groups.box('roof', {...})`. */
  box(name, box) {
    this.builder(name).addBox(box);
    return this;
  }

  ground(name, quad) {
    this.builder(name).addGroundQuad(quad);
    return this;
  }

  cylinder(name, cylinder) {
    this.builder(name).addCylinder(cylinder);
    return this;
  }

  roof(name, roof) {
    this.builder(name).addGableRoof(roof);
    return this;
  }

  ring(name, ring) {
    this.builder(name).addRing(ring);
    return this;
  }

  materialFor(name) {
    return this.materials[name] ?? this.materials.default ?? null;
  }

  /** Builds every non-empty bucket and attaches the meshes to `parent`. */
  drain(parent, options = {}) {
    const created = [];
    for (const [name, builder] of this.builders) {
      const material = this.materialFor(name);
      if (builder.isEmpty || !material) continue;
      const geometry = builder.build();
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = `bucket:${name}`;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      mesh.castShadow = options.castShadow === true && material.transparent !== true;
      mesh.receiveShadow = options.receiveShadow !== false;
      parent.add(mesh);
      this.meshes.set(name, mesh);
      created.push(mesh);
      builder.dispose();
    }
    return created;
  }

  get triangles() {
    let total = 0;
    for (const builder of this.builders.values()) total += builder.triangles;
    return total;
  }

  summary() {
    const rows = [];
    for (const [name, builder] of this.builders) {
      if (builder.isEmpty) continue;
      rows.push({ name, triangles: builder.triangles });
    }
    rows.sort((a, b) => b.triangles - a.triangles);
    return rows;
  }
}

export function colourOf(hex, tint = 1) {
  const r = ((hex >> 16) & 255) / 255;
  const g = ((hex >> 8) & 255) / 255;
  const b = (hex & 255) / 255;
  return [r * tint, g * tint, b * tint];
}

export function rotationMatrix(rotation) {
  const cx = Math.cos(rotation.x ?? 0);
  const sx = Math.sin(rotation.x ?? 0);
  const cy = Math.cos(rotation.y ?? 0);
  const sy = Math.sin(rotation.y ?? 0);
  const cz = Math.cos(rotation.z ?? 0);
  const sz = Math.sin(rotation.z ?? 0);
  // R = Ry * Rx * Rz, expanded by hand to keep this dependency free.
  return [
    cy * cz + sy * sx * sz, -cy * sz + sy * sx * cz, sy * cx,
    cx * sz, cx * cz, -sx,
    -sy * cz + cy * sx * sz, sy * sz + cy * sx * cz, cy * cx,
  ];
}

export function rotateVector(vector, matrix) {
  const [x, y, z] = vector;
  return [
    matrix[0] * x + matrix[1] * y + matrix[2] * z,
    matrix[3] * x + matrix[4] * y + matrix[5] * z,
    matrix[6] * x + matrix[7] * y + matrix[8] * z,
  ];
}

function rotateY(vector, angle) {
  if (!angle) return vector;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return [vector[0] * cos + vector[2] * sin, vector[1], -vector[0] * sin + vector[2] * cos];
}
