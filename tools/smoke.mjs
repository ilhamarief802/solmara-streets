// A Node-side smoke test for the world modules: a tiny stub of the browser and three.js globals,
// just enough to import the modules and build the city headlessly. It is a development tool, not
// part of the game: game/ holds no reference to it.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

// ---------------------------------------------------------------- a canvas stub
function makeCanvas() {
  const ctx = new Proxy(
    {
      canvas: null,
      getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
      putImageData: () => {},
      createLinearGradient: () => ({ addColorStop: () => {} }),
      createRadialGradient: () => ({ addColorStop: () => {} }),
      measureText: () => ({ width: 10 }),
      getTransform: () => ({}),
      save: () => {},
      restore: () => {},
      setTransform: () => {},
    },
    {
      get(target, prop) {
        if (prop in target) return target[prop];
        return () => {};
      },
      set(target, prop, value) {
        target[prop] = value;
        return true;
      },
    },
  );
  const canvas = {
    width: 1,
    height: 1,
    style: {},
    getContext: () => ctx,
    addEventListener: () => {},
    requestPointerLock: () => {},
  };
  ctx.canvas = canvas;
  return canvas;
}

globalThis.document = {
  createElement: (tag) => (tag === 'canvas' ? makeCanvas() : { style: {}, addEventListener: () => {} }),
  getElementById: () => null,
  addEventListener: () => {},
  removeEventListener: () => {},
  pointerLockElement: null,
  exitPointerLock: () => {},
  title: '',
};
globalThis.window = {
  addEventListener: () => {},
  removeEventListener: () => {},
  innerWidth: 1280,
  innerHeight: 720,
  devicePixelRatio: 1,
  location: { search: '' },
};
globalThis.performance = globalThis.performance ?? { now: () => Date.now() };
globalThis.requestAnimationFrame = (fn) => setTimeout(() => fn(performance.now()), 0);
globalThis.cancelAnimationFrame = () => {};
globalThis.CanvasTexture = undefined;

// ---------------------------------------------------------------- a three.js stub
class Vector2 {
  constructor(x = 0, y = 0) { this.x = x; this.y = y; }
  set(x, y) { this.x = x; this.y = y; return this; }
  clone() { return new Vector2(this.x, this.y); }
  addScaledVector(v, s) { this.x += v.x * s; this.y += v.y * s; return this; }
}
class Vector3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  copy(v) { this.set(v.x, v.y, v.z); return this; }
  clone() { return new Vector3(this.x, this.y, this.z); }
  add(v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; }
  multiplyScalar(s) { this.x *= s; this.y *= s; this.z *= s; return this; }
  normalize() { const l = Math.hypot(this.x, this.y, this.z) || 1; return this.multiplyScalar(1 / l); }
  length() { return Math.hypot(this.x, this.y, this.z); }
  setRGB(r, g, b) { this.x = r; this.y = g; this.z = b; return this; }
  setHex(h) { this.x = ((h >> 16) & 255) / 255; this.y = ((h >> 8) & 255) / 255; this.z = (h & 255) / 255; return this; }
  lerp() { return this; }
}
class Color {
  constructor(hex) { this.r = 1; this.g = 1; this.b = 1; if (typeof hex === 'number') this.setHex(hex); }
  setRGB(r, g, b) { this.r = r; this.g = g; this.b = b; return this; }
  setHex(h) { return this.setRGB(((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255); }
  copy(c) { this.r = c.r; this.g = c.g; this.b = c.b; return this; }
  lerp() { return this; }
}
class Obj3D {
  constructor() { this.children = []; this.position = new Vector3(); this.rotation = { x: 0, y: 0, z: 0 }; this.scale = new Vector3(1, 1, 1); this.name = ''; this.matrixAutoUpdate = true; }
  add(o) { this.children.push(o); return this; }
  updateMatrix() {}
  traverse(fn) { fn(this); for (const c of this.children) if (c.traverse) c.traverse(fn); }
}
class Group extends Obj3D {}
class Scene extends Obj3D { constructor() { super(); this.fog = null; this.background = null; } }
class Mesh extends Obj3D { constructor(g, m) { super(); this.geometry = g; this.material = m; } }
class BufferAttribute { constructor(a, n) { this.array = a; this.itemSize = n; this.count = a.length / n; } }
class BufferGeometry {
  constructor() { this.attributes = {}; }
  setAttribute(name, attr) { this.attributes[name] = attr; return this; }
  computeBoundingSphere() { this.boundingSphere = { radius: 1 }; }
  computeBoundingBox() { this.boundingBox = {}; }
  dispose() {}
}
class Material {
  constructor(p = {}) { Object.assign(this, p); this.color = new Color(); this.emissive = new Color(); }
  dispose() {}
}
class Texture {
  constructor(canvas) { this.image = canvas; this.repeat = new Vector2(1, 1); }
  dispose() {}
}
const THREE = {
  Vector2, Vector3, Color, Group, Scene, Mesh, BufferAttribute, BufferGeometry,
  Object3D: Obj3D,
  Points: class extends Obj3D { constructor(g, m) { super(); this.geometry = g; this.material = m; } },
  PointsMaterial: Material,
  MeshStandardMaterial: Material,
  MeshBasicMaterial: Material,
  ShaderMaterial: Material,
  FogExp2: class { constructor(c, d) { this.color = new Color(c); this.density = d; } },
  CanvasTexture: Texture,
  SRGBColorSpace: 'srgb',
  NoColorSpace: '',
  LinearMipmapLinearFilter: 1,
  RepeatWrapping: 1,
  ClampToEdgeWrapping: 2,
  FrontSide: 0,
  DoubleSide: 2,
  BackSide: 1,
  AdditiveBlending: 2,
  DirectionalLight: class extends Obj3D { constructor(c, i) { super(); this.color = new Color(c); this.intensity = i; this.target = new Obj3D(); } },
  HemisphereLight: class extends Obj3D { constructor(a, b, i) { super(); this.color = new Color(a); this.groundColor = new Color(b); this.intensity = i; } },
  SphereGeometry: class {},
  BufferAttribute: BufferAttribute,
  Float32BufferAttribute: BufferAttribute,
  MathUtils: { seededRandom: () => () => 0.5 },
};
globalThis.THREE = THREE;

// ---------------------------------------------------------------- import and build
const root = process.argv[2] ?? 'game/src';
const modules = [];
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else if (name.endsWith('.js') && !name.endsWith('main.js')) modules.push(path);
  }
}
walk(root);

let failed = 0;
for (const path of modules) {
  try {
    await import(pathToFileURL(path).href);
  } catch (error) {
    failed++;
    console.error(`FAIL import ${path}\n  ${error.stack?.split('\n').slice(0, 4).join('\n  ')}`);
  }
}

if (!failed) {
  const { createCityPlan, nearestLanePoint, nearestRoadNode } = await import(pathToFileURL(join(root, 'world/plan.js')).href);
  const plan = createCityPlan('solmara-01');
  console.log(`plan ok: ${plan.blocks.length} blocks, ${plan.nodes.length} nodes, ${plan.edges.length} edges, ${plan.bridges.length} bridges`);
  const lane = nearestLanePoint(plan, 60, -60);
  console.log(`nearest lane from spawn: ${lane?.edge.id} at ${lane?.distance.toFixed(1)} m`);
  const node = nearestRoadNode(plan, 60, -60);
  console.log(`nearest node: ${node.node.id} at ${node.distance.toFixed(1)} m`);

  const { TextureLibrary } = await import(pathToFileURL(join(root, 'world/textures.js')).href);
  const textures = new TextureLibrary('solmara-01');
  // Touch every texture so a drawing bug surfaces here, not in the browser.
  const names = ['asphalt', 'pavement', 'boardwalk', 'siding', 'container', 'grass', 'sand', 'marsh', 'concrete', 'rooftop', 'glow', 'frond', 'burst', 'facadeTower', 'facadeOffice', 'facadeLowrise', 'facadeStrip', 'facadeHarbour'];
  for (const name of names) {
    if (!textures[name]) throw new Error(`texture ${name} missing`);
  }
  console.log(`textures ok: ${textures.count} built`);

  const { ColliderWorld } = await import(pathToFileURL(join(root, 'world/colliders.js')).href);
  const colliders = new ColliderWorld();
  const { buildRoads, buildHighway, buildKerbs } = await import(pathToFileURL(join(root, 'world/roads.js')).href);
  const roads = buildRoads(plan, textures);
  console.log(`roads ok: ${roads.group.children.length} meshes, ${roads.bridges.length} decks`);
  for (const deck of roads.bridges) colliders.addBox(deck.walkable.minX, deck.walkable.minZ, deck.walkable.maxX, deck.walkable.maxZ, deck.walkable.top, 'bridge', { walkable: true });
  const highway = buildHighway(plan, textures);
  for (const w of highway.walkables) colliders.addBox(w.walkable.minX, w.walkable.minZ, w.walkable.maxX, w.walkable.maxZ, w.walkable.top, 'highway', { walkable: true });
  buildKerbs(plan, colliders);

  const { buildBuildings } = await import(pathToFileURL(join(root, 'world/buildings.js')).href);
  const buildings = buildBuildings(plan, textures, colliders, { detail: 1 });
  console.log(`buildings ok: ${buildings.count} raised, ${buildings.triangleCount} triangles`);
  console.log(`colliders: ${colliders.count}`);
  const probe = colliders.resolveCircle(0, 0, 0.4);
  console.log(`resolve at origin: ${probe.x.toFixed(1)},${probe.z.toFixed(1)} blocked=${probe.blocked}`);
  console.log(`ground at 60,-60: ${colliders.groundHeight(60, -60).toFixed(2)}`);
}

process.exit(failed ? 1 : 0);
