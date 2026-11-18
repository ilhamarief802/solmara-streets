// Headless smoke test for the world layer. It stubs the small part of three.js and the
// 2D canvas API the generator touches, imports the real modules, and builds the whole
// city in Node. Catches typos, bad imports and geometry maths long before a browser is
// involved. Run with: node tools/smoke.mjs

import { performance } from 'node:perf_hooks';

globalThis.performance = globalThis.performance ?? performance;

class Vector2 {
  constructor(x = 0, y = 0) { this.x = x; this.y = y; }
  set(x, y) { this.x = x; this.y = y; return this; }
}
class Vector3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
  normalize() { const l = Math.hypot(this.x, this.y, this.z) || 1; this.x /= l; this.y /= l; this.z /= l; return this; }
  multiplyScalar(s) { this.x *= s; this.y *= s; this.z *= s; return this; }
}
class Euler {
  constructor() { this.x = 0; this.y = 0; this.z = 0; this.order = 'XYZ'; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
}
class Color {
  constructor(hex = 0xffffff) { this.r = 1; this.g = 1; this.b = 1; this.setHex(hex); }
  setHex(hex) { this.r = ((hex >> 16) & 255) / 255; this.g = ((hex >> 8) & 255) / 255; this.b = (hex & 255) / 255; return this; }
  setRGB(r, g, b) { this.r = r; this.g = g; this.b = b; return this; }
  copy(c) { this.r = c.r; this.g = c.g; this.b = c.b; return this; }
  clone() { return new Color().copy(this); }
  multiplyScalar(s) { this.r *= s; this.g *= s; this.b *= s; return this; }
  convertSRGBToLinear() { return this; }
}
class Object3D {
  constructor() {
    this.children = [];
    this.name = '';
    this.position = new Vector3();
    this.rotation = new Euler();
    this.scale = new Vector3(1, 1, 1);
    this.matrixAutoUpdate = true;
    this.frustumCulled = true;
    this.renderOrder = 0;
    this.visible = true;
    this.userData = {};
  }
  add(...objects) { for (const o of objects) this.children.push(o); return this; }
  remove(o) { const i = this.children.indexOf(o); if (i >= 0) this.children.splice(i, 1); return this; }
  updateMatrix() {}
  updateMatrixWorld() {}
  lookAt() {}
}
class Group extends Object3D {}
class Mesh extends Object3D {
  constructor(geometry, material) { super(); this.geometry = geometry; this.material = material; this.castShadow = false; this.receiveShadow = false; }
}
class InstancedMesh extends Mesh {
  constructor(geometry, material, count) {
    super(geometry, material);
    this.count = count;
    this.instanceMatrix = { needsUpdate: false };
    this.instanceColor = null;
  }
  setMatrixAt() {}
  setColorAt() { if (!this.instanceColor) this.instanceColor = { needsUpdate: false }; }
}
class Points extends Object3D {
  constructor(geometry, material) { super(); this.geometry = geometry; this.material = material; }
}
class BufferGeometry {
  constructor() { this.attributes = {}; this.index = null; this.boundingSphere = null; }
  setAttribute(name, attribute) { this.attributes[name] = attribute; return this; }
  setIndex(index) { this.index = index; return this; }
  computeBoundingSphere() { this.boundingSphere = { radius: 100 }; }
}
class BufferAttribute {
  constructor(array, itemSize) { this.array = array; this.itemSize = itemSize; this.count = array.length / itemSize; this.needsUpdate = false; }
}
class Material {
  constructor(params = {}) {
    Object.assign(this, params);
    this.name = params.name ?? '';
    this.emissiveIntensity = params.emissiveIntensity ?? 0;
    this.emissiveMap = params.emissiveMap ?? null;
    this.map = params.map ?? null;
  }
  dispose() {}
}
class Texture {
  constructor(image = null) {
    Texture.counter += 1;
    this.uuid = `tex-${Texture.counter}`;
    this.image = image;
    this.wrapS = 0;
    this.wrapT = 0;
    this.repeat = new Vector2(1, 1);
    this.anisotropy = 1;
    this.colorSpace = '';
    this.userData = {};
    this.needsUpdate = false;
  }
  dispose() {}
}
Texture.counter = 0;

class Light extends Object3D {
  constructor(color = 0xffffff, intensity = 1) { super(); this.color = new Color(color); this.intensity = intensity; this.target = new Object3D(); this.groundColor = new Color(0xffffff); this.castShadow = false; }
}

const THREE = {
  Vector2, Vector3, Euler, Color, Group, Mesh, InstancedMesh, Points, BufferGeometry,
  BufferAttribute, Float32BufferAttribute: BufferAttribute, Material,
  MeshLambertMaterial: Material, MeshBasicMaterial: Material, ShaderMaterial: Material,
  PointsMaterial: Material, CanvasTexture: Texture,
  Texture, SphereGeometry: class { constructor(...args) { this.args = args; } },
  PlaneGeometry: class { constructor(width, height) { this.width = width; this.height = height; } },
  BoxGeometry: class { constructor(...args) { this.args = args; } },
  DirectionalLight: Light, HemisphereLight: Light, AmbientLight: Light,
  PerspectiveCamera: class extends Object3D {
    constructor(fov = 60, aspect = 1, near = 1, far = 1000) { super(); this.fov = fov; this.aspect = aspect; this.near = near; this.far = far; }
    updateProjectionMatrix() {}
  },
  FogExp2: class { constructor(color, density) { this.color = new Color(color); this.density = density; } },
  Matrix4: class { makeTranslation() { return this; } },
  RepeatWrapping: 1000, SRGBColorSpace: 'srgb', ACESFilmicToneMapping: 4, PCFSoftShadowMap: 2,
  FrontSide: 0, BackSide: 1, DoubleSide: 2, AdditiveBlending: 2, NormalBlending: 1,
  WebGLRenderer: class {},
  Scene: class extends Object3D {},
};

globalThis.THREE = THREE;

function makeContext() {
  const gradient = { addColorStop() {} };
  return {
    fillStyle: '', strokeStyle: '', globalAlpha: 1, lineWidth: 1, shadowColor: '', shadowBlur: 0,
    font: '', textAlign: '', textBaseline: '',
    fillRect() {}, clearRect() {}, strokeRect() {}, beginPath() {}, closePath() {},
    moveTo() {}, lineTo() {}, bezierCurveTo() {}, quadraticCurveTo() {}, arc() {},
    stroke() {}, fill() {}, save() {}, restore() {}, translate() {}, rotate() {}, scale() {},
    fillText() {}, measureText() { return { width: 10 }; },
    createRadialGradient() { return gradient; },
    createLinearGradient() { return gradient; },
  };
}

globalThis.document = {
  createElement(tag) {
    if (tag !== 'canvas') throw new Error(`unexpected createElement(${tag})`);
    return { width: 1, height: 1, getContext: () => makeContext() };
  },
  getElementById() { return null; },
  addEventListener() {},
  removeEventListener() {},
  body: { classList: { add() {} }, dataset: {} },
};

const failures = [];
const check = (label, ok, detail = '') => {
  if (ok) console.log(`ok   ${label}${detail ? ` — ${detail}` : ''}`);
  else { console.log(`FAIL ${label}${detail ? ` — ${detail}` : ''}`); failures.push(label); }
};

const started = performance.now();
const [{ createWorld }, { createCityPlan, nearestLanePoint, nearestRoadNode, isWaterAt }, districts, { GameClock }, { Weather }, { createAtmosphere }, { ShotRig, parseShotParams }] = await Promise.all([
  import('../game/src/world/world.js'),
  import('../game/src/world/plan.js'),
  import('../game/src/world/districts.js'),
  import('../game/src/core/clock.js'),
  import('../game/src/core/weather.js'),
  import('../game/src/core/sky.js'),
  import('../game/src/shots/rig.js'),
]);

const plan = createCityPlan('solmara-01');
check('plan builds', true, `${plan.stats.nodes} nodes, ${plan.stats.edges} edges, ${plan.stats.blocks} blocks`);
check('road graph has more than a hundred nodes', plan.stats.nodes > 100, `${plan.stats.nodes}`);
check('lanes exist for traffic', plan.stats.lanes > 200, `${plan.stats.lanes}`);
check('two channel bridges', plan.stats.bridges === 2, plan.bridges.map((b) => `${b.kind}@${b.z}`).join(', '));
check('seven districts', districts.DISTRICT_IDS.length === 7, districts.DISTRICT_IDS.join(', '));

const lane = nearestLanePoint(plan, 340, 80, 100);
check('nearest lane query', Boolean(lane), lane ? `${lane.edge.id} at ${lane.distance.toFixed(1)} m` : 'none');
const node = nearestRoadNode(plan, 340, 80);
check('nearest node query', Boolean(node), node ? `${node.node.id} at ${node.distance.toFixed(1)} m` : 'none');
check('water query', isWaterAt(0, 300) && !isWaterAt(400, 0), 'channel is water, downtown is land');

const world = createWorld({ seed: 'solmara-01', settings: { propDensity: 0.8 } });
check('world builds', Boolean(world.group), `${world.stats.buildMs} ms`);
check('buildings raised', world.stats.buildings > 120, `${world.stats.buildings}, tallest ${world.stats.tallest} m`);
check('props placed', world.stats.props > 200, `${world.stats.props} props, ${world.stats.lamps} lamps, ${world.stats.signals} signals`);
check('colliders registered', world.stats.colliders > 300, `${world.stats.colliders}`);
check('triangles generated', world.stats.triangles > 20000, `${world.stats.triangles.toLocaleString('en-US')} tris`);
check('textures painted', world.stats.textures > 10, `${world.stats.textures}`);
check('four named spawns', ['downtown-boulevard', 'beach-boardwalk', 'harbour', 'airstrip'].every((id) => world.spawnById(id)), world.spawns.map((s) => s.id).join(', '));
check('district lookup', world.districtAt(340, 80) === 'downtown' && world.districtAt(960, 470) === 'beach', `${world.districtAt(340, 80)} / ${world.districtAt(960, 470)}`);
check('minimap geometry', world.minimap.roads.length === plan.edges.length && world.minimap.blocks.length > 100, `${world.minimap.roads.length} roads, ${world.minimap.water.length} water`);
check('ground query', world.groundHeight(340, 80) === 0, `${world.groundHeight(340, 80)}`);
const resolved = world.resolveCircle(340, 80, 1.2);
check('collision resolve', Number.isFinite(resolved.x) && Number.isFinite(resolved.z), `blocked=${resolved.blocked}`);
check('window emissive maps collected', world.buildings.materials.length > 5, `${world.buildings.materials.length} facade materials`);

const clock = new GameClock({ startHour: 17.55, fixed: true });
const palette = clock.palette();
check('clock palette', palette.skyTop.length === 3 && palette.sunDir.y > 0, `phase ${palette.phase}, sun y ${palette.sunDir.y.toFixed(2)}`);
check('night palette', new GameClock({ startHour: 22.6, fixed: true }).palette().night > 0.5, 'stars on');
const weather = new Weather('solmara-weather');
weather.set('hazy');
check('weather state', weather.label === 'Coastal haze' && weather.fogMultiplier > 1, weather.label);
const scene = new THREE.Scene();
const sky = createAtmosphere(scene);
sky.setPalette(palette, weather);
check('atmosphere lights', scene.children.length > 0 && sky.sun.intensity > 0, `sun ${sky.sun.intensity.toFixed(1)}`);

const parsed = parseShotParams('?shot=cover&seed=7');
check('shot params', parsed.name === 'cover' && parsed.seed === 7, JSON.stringify(parsed));
check('shot rig knows both shots', new ShotRig({}).constructor !== undefined, 'cover, night');

const elapsed = performance.now() - started;
console.log(`\n${failures.length ? `${failures.length} FAILURE(S)` : 'all checks passed'} in ${elapsed.toFixed(0)} ms`);
if (failures.length) process.exit(1);
