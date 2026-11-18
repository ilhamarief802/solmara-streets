// Geometry building blocks: a mesh builder that merges many boxes, quads and prisms into one
// BufferGeometry (one draw call per material), plus collider bookkeeping. The whole city is
// assembled from these, which is what keeps a thousand buildings inside a headless frame budget.

import { clamp } from '../core/math.js';

const _v = new THREE.Vector3();
const _n = new THREE.Vector3();

/** Writes a box's four side faces plus top and bottom, optionally with UVs scaled to metres. */
function pushBox(target, cx, cy, cz, sx, sy, sz, options = {}) {
  const hx = sx / 2;
  const hy = sy / 2;
  const hz = sz / 2;
  const { color, uvScale = 1, skipBottom = true, skipTop = false, uvOffset = 0 } = options;

  // Faces as [normal, four corners in CCW order seen from outside, uWidth, vHeight].
  const faces = [
    { n: [0, 0, 1], c: [[-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz]], u: sx, v: sy },
    { n: [0, 0, -1], c: [[hx, -hy, -hz], [-hx, -hy, -hz], [-hx, hy, -hz], [hx, hy, -hz]], u: sx, v: sy },
    { n: [1, 0, 0], c: [[hx, -hy, hz], [hx, -hy, -hz], [hx, hy, -hz], [hx, hy, hz]], u: sz, v: sy },
    { n: [-1, 0, 0], c: [[-hx, -hy, -hz], [-hx, -hy, hz], [-hx, hy, hz], [-hx, hy, -hz]], u: sz, v: sy },
    { n: [0, 1, 0], c: [[-hx, hy, hz], [hx, hy, hz], [hx, hy, -hz], [-hx, hy, -hz]], u: sx, v: sz },
    { n: [0, -1, 0], c: [[-hx, -hy, -hz], [hx, -hy, -hz], [hx, -hy, hz], [-hx, -hy, hz]], u: sx, v: sz },
  ];

  for (let f = 0; f < faces.length; f++) {
    const face = faces[f];
    if (skipBottom && f === 5) continue;
    if (skipTop && f === 4) continue;
    // Two triangles, corners 0-1-2 and 0-2-3: a plain triangle list, no index buffer needed.
    for (const index of [0, 1, 2, 0, 2, 3]) {
      const corner = face.c[index];
      target.positions.push(cx + corner[0], cy + corner[1], cz + corner[2]);
      target.normals.push(face.n[0], face.n[1], face.n[2]);
    }
    // UVs in metres / uvScale: a wall's texture tiles by its own size, so windows stay window-size.
    const u = face.u / uvScale + uvOffset;
    const v = face.v / uvScale + uvOffset;
    for (const [iu, iv] of [[0, 0], [u, 0], [u, v], [0, 0], [u, v], [0, v]]) target.uvs.push(iu, iv);
    if (color !== undefined) {
      for (let i = 0; i < 6; i++) target.colors.push(color[0], color[1], color[2]);
    } else {
      for (let i = 0; i < 6; i++) target.colors.push(1, 1, 1);
    }
  }
}

/** A horizontal quad at height y, facing up (or down), sized sx by sz. */
function pushQuad(target, cx, y, cz, sx, sz, options = {}) {
  const hx = sx / 2;
  const hz = sz / 2;
  const { color, up = true, uvScale = 1, uvOffset = 0 } = options;
  const corners = up
    ? [[-hx, 0, hz], [hx, 0, hz], [hx, 0, -hz], [-hx, 0, -hz]]
    : [[-hx, 0, -hz], [hx, 0, -hz], [hx, 0, hz], [-hx, 0, hz]];
  const normal = up ? [0, 1, 0] : [0, -1, 0];
  const order = [0, 1, 2, 0, 2, 3];
  for (const index of order) {
    const corner = corners[index];
    target.positions.push(cx + corner[0], y, cz + corner[2]);
    target.normals.push(normal[0], normal[1], normal[2]);
  }
  const u = sx / uvScale + uvOffset;
  const v = sz / uvScale + uvOffset;
  const uvs = [[0, 0], [u, 0], [u, v], [0, 0], [u, v], [0, v]];
  for (const [iu, iv] of uvs) target.uvs.push(iu, iv);
  for (let i = 0; i < 6; i++) target.colors.push(color ? color[0] : 1, color ? color[1] : 1, color ? color[2] : 1);
}

/** A vertical quad facing +Z/-Z/+X/-X, for glass sheets, signs and banner walls. */
function pushWallQuad(target, cx, cy, cz, sx, sy, facing, options = {}) {
  const hx = sx / 2;
  const hy = sy / 2;
  const { color, uvScale = 1 } = options;
  const spots = {
    z: [[-hx, -hy, 0], [hx, -hy, 0], [hx, hy, 0], [-hx, hy, 0]],
    '-z': [[hx, -hy, 0], [-hx, -hy, 0], [-hx, hy, 0], [hx, hy, 0]],
    x: [[0, -hy, hx], [0, -hy, -hx], [0, hy, -hx], [0, hy, hx]],
    '-x': [[0, -hy, -hx], [0, -hy, hx], [0, hy, hx], [0, hy, -hx]],
  };
  const normals = { z: [0, 0, 1], '-z': [0, 0, -1], x: [1, 0, 0], '-x': [-1, 0, 0] };
  const corners = spots[facing] ?? spots.z;
  const normal = normals[facing] ?? normals.z;
  const order = [0, 1, 2, 0, 2, 3];
  for (const index of order) {
    const corner = corners[index];
    target.positions.push(cx + corner[0], cy + corner[1], cz + corner[2]);
    target.normals.push(normal[0], normal[1], normal[2]);
  }
  const u = sx / uvScale;
  const v = sy / uvScale;
  const uvs = [[0, 0], [u, 0], [u, v], [0, 0], [u, v], [0, v]];
  for (const [iu, iv] of uvs) target.uvs.push(iu, iv);
  for (let i = 0; i < 6; i++) target.colors.push(color ? color[0] : 1, color ? color[1] : 1, color ? color[2] : 1);
}

/** A box rotated about the Y axis: signs, billboards and anything not aligned to the grid. */
function pushRotatedBox(target, cx, cy, cz, sx, sy, sz, rotationY, options = {}) {
  const hx = sx / 2;
  const hy = sy / 2;
  const hz = sz / 2;
  const { color, uvScale = 1 } = options;
  const cos = Math.cos(rotationY);
  const sin = Math.sin(rotationY);
  const faces = [
    { n: [0, 0, 1], c: [[-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz]], u: sx, v: sy },
    { n: [0, 0, -1], c: [[hx, -hy, -hz], [-hx, -hy, -hz], [-hx, hy, -hz], [hx, hy, -hz]], u: sx, v: sy },
    { n: [1, 0, 0], c: [[hx, -hy, hz], [hx, -hy, -hz], [hx, hy, -hz], [hx, hy, hz]], u: sz, v: sy },
    { n: [-1, 0, 0], c: [[-hx, -hy, -hz], [-hx, -hy, hz], [-hx, hy, hz], [-hx, hy, -hz]], u: sz, v: sy },
    { n: [0, 1, 0], c: [[-hx, hy, hz], [hx, hy, hz], [hx, hy, -hz], [-hx, hy, -hz]], u: sx, v: sz },
    { n: [0, -1, 0], c: [[-hx, -hy, -hz], [hx, -hy, -hz], [hx, -hy, hz], [-hx, -hy, hz]], u: sx, v: sz },
  ];
  const rotate = (x, z) => [x * cos + z * sin, -x * sin + z * cos];
  for (const face of faces) {
    const [nx, nz] = rotate(face.n[0], face.n[2]);
    for (const index of [0, 1, 2, 0, 2, 3]) {
      const corner = face.c[index];
      const [lx, lz] = rotate(corner[0], corner[2]);
      target.positions.push(cx + lx, cy + corner[1], cz + lz);
      target.normals.push(nx, face.n[1], nz);
    }
    const u = face.u / uvScale;
    const v = face.v / uvScale;
    for (const [iu, iv] of [[0, 0], [u, 0], [u, v], [0, 0], [u, v], [0, v]]) target.uvs.push(iu, iv);
    for (let i = 0; i < 6; i++) target.colors.push(color ? color[0] : 1, color ? color[1] : 1, color ? color[2] : 1);
  }
}

/** A n-sided prism (cylinder, cone, palm trunk) with the given radius top and bottom. */
function pushPrism(target, cx, cy, cz, radiusBottom, radiusTop, height, sides = 8, options = {}) {
  const { color, capTop = true, uvScale = 1 } = options;
  const y0 = cy - height / 2;
  const y1 = cy + height / 2;
  const step = (Math.PI * 2) / sides;
  const tint = color ?? [1, 1, 1];

  for (let i = 0; i < sides; i++) {
    const a0 = i * step;
    const a1 = (i + 1) * step;
    const c0 = Math.cos(a0);
    const s0 = Math.sin(a0);
    const c1 = Math.cos(a1);
    const s1 = Math.sin(a1);
    // One normal per side face, taken down the face's middle: cheap, and reads round at 8 sides.
    const slope = (radiusBottom - radiusTop) / Math.max(height, 0.001);
    const normal = new THREE.Vector3(Math.cos(a0 + step / 2), slope, Math.sin(a0 + step / 2)).normalize();
    const corners = [
      [c0 * radiusBottom, y0, s0 * radiusBottom],
      [c1 * radiusBottom, y0, s1 * radiusBottom],
      [c1 * radiusTop, y1, s1 * radiusTop],
      [c0 * radiusTop, y1, s0 * radiusTop],
    ];
    for (const index of [0, 1, 2, 0, 2, 3]) {
      const corner = corners[index];
      target.positions.push(cx + corner[0], corner[1], cz + corner[2]);
      target.normals.push(normal.x, normal.y, normal.z);
    }
    const u = (Math.PI * 2 * radiusBottom) / uvScale;
    const v = height / uvScale;
    for (const [iu, iv] of [[0, 0], [u / sides, 0], [u / sides, v], [0, 0], [u / sides, v], [0, v]]) {
      target.uvs.push(iu, iv);
    }
    for (let t = 0; t < 6; t++) target.colors.push(tint[0], tint[1], tint[2]);
  }

  if (capTop && radiusTop > 0.001) {
    for (let i = 0; i < sides; i++) {
      const a0 = (i / sides) * Math.PI * 2;
      const a1 = ((i + 1) / sides) * Math.PI * 2;
      target.positions.push(
        cx, y1, cz,
        cx + Math.cos(a1) * radiusTop, y1, cz + Math.sin(a1) * radiusTop,
        cx + Math.cos(a0) * radiusTop, y1, cz + Math.sin(a0) * radiusTop,
      );
      for (let k = 0; k < 3; k++) target.normals.push(0, 1, 0);
      target.uvs.push(0.5, 0.5, 0, 1, 1, 0);
      for (let k = 0; k < 3; k++) target.colors.push(tint[0], tint[1], tint[2]);
    }
  }
}

/**
 * A mesh builder: accumulate triangles, then build one geometry and one mesh. Every pushed piece
 * carries a vertex colour, so a single material with vertexColors covers a whole district.
 */
export class MeshBuilder {
  constructor(name = 'mesh') {
    this.name = name;
    this.positions = [];
    this.normals = [];
    this.uvs = [];
    this.colors = [];
    this.extras = {};
  }

  box(cx, cy, cz, sx, sy, sz, options) {
    pushBox(this, cx, cy, cz, sx, sy, sz, options);
    return this;
  }

  /** A box sitting on the ground: cy is derived from its height. */
  block(cx, cz, sx, sy, sz, y0 = 0, options = {}) {
    pushBox(this, cx, y0 + sy / 2, cz, sx, sy, sz, options);
    return this;
  }

  quad(cx, y, cz, sx, sz, options) {
    pushQuad(this, cx, y, cz, sx, sz, options);
    return this;
  }

  wallQuad(cx, cy, cz, sx, sy, facing, options) {
    pushWallQuad(this, cx, cy, cz, sx, sy, facing, options);
    return this;
  }

  prism(cx, cy, cz, rBottom, rTop, height, sides, options) {
    pushPrism(this, cx, cy, cz, rBottom, rTop, height, sides, options);
    return this;
  }

  /** A box turned about the Y axis, for signs and anything off the grid. */
  rotatedBox(cx, cy, cz, sx, sy, sz, rotationY, options) {
    pushRotatedBox(this, cx, cy, cz, sx, sy, sz, rotationY, options);
    return this;
  }

  get isEmpty() {
    return this.positions.length === 0;
  }

  get triangles() {
    return this.positions.length / 9;
  }

  /** The merged geometry. The builder's arrays are copied, so it stays usable afterwards. */
  buildGeometry() {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(this.normals, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(this.uvs, 2));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(this.colors, 3));
    geometry.computeBoundingSphere();
    geometry.computeBoundingBox();
    return geometry;
  }

  /** Builds a mesh with the given material and adds it to `parent`. Returns the mesh. */
  build(material, parent = null, { castShadow = false, receiveShadow = false } = {}) {
    const geometry = this.buildGeometry();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = this.name;
    mesh.castShadow = castShadow;
    mesh.receiveShadow = receiveShadow;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    if (parent) parent.add(mesh);
    return mesh;
  }

  dispose() {
    this.positions.length = 0;
    this.normals.length = 0;
    this.uvs.length = 0;
    this.colors.length = 0;
  }
}

/** Formats a hex colour as a triple of linear-ish floats in 0..1, for vertex colours. */
export function colorTriple(hex, tint = 1) {
  const color = new THREE.Color().setHex(hex, THREE.SRGBColorSpace);
  return [color.r * tint, color.g * tint, color.b * tint];
}

/** A slightly varied version of a colour, for buildings that should not look stamped out. */
export function tintTriple(hex, random, amount = 0.1) {
  const triple = colorTriple(hex);
  const factor = 1 + (random.float() - 0.5) * amount * 2;
  return [clamp(triple[0] * factor, 0, 1), clamp(triple[1] * factor, 0, 1), clamp(triple[2] * factor, 0, 1)];
}

/** A shared MeshStandardMaterial configured for vertex-coloured, textured city geometry. */
export function cityMaterial(texture, options = {}) {
  return new THREE.MeshStandardMaterial({
    map: texture ?? null,
    vertexColors: true,
    roughness: options.roughness ?? 0.86,
    metalness: options.metalness ?? 0.04,
    emissive: new THREE.Color(0x000000),
    emissiveMap: options.emissiveMap ?? null,
    emissiveIntensity: options.emissiveIntensity ?? 1,
    side: options.side ?? THREE.FrontSide,
    transparent: options.transparent ?? false,
    opacity: options.opacity ?? 1,
    depthWrite: options.depthWrite ?? true,
    flatShading: options.flatShading ?? false,
  });
}

export { _v, _n };
