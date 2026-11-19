// Assembles Solmara. Given one seed, this builds the plan, paints the textures, raises the
// terrain, streets, highway, buildings, landmarks, props and sea, registers every
// collider, and returns the single object the rest of the game builds on: the road graph,
// named spawns, district lookup, collision and ground queries, minimap geometry, and the
// update hook that turns window lights and street lamps on at dusk.

import {
  createCityPlan,
  nearestLanePoint,
  nearestRoadNode,
  isWaterAt,
  isOnLand,
  GRID,
  WATER,
  HIGHWAY,
} from './plan.js';
import { DISTRICTS, DISTRICT_IDS, LAND_BOUNDS, districtIdAt, districtOf } from './districts.js';
import { TextureLibrary } from './textures.js';
import { createColliders } from './colliders.js';
import { buildTerrain } from './terrain.js';
import { buildRoads, buildHighway } from './roads.js';
import { buildBuildings } from './buildings.js';
import { buildLandmarks } from './landmarks.js';
import { buildProps } from './props.js';
import { createWater } from './water.js';
import { createWalkNetwork } from './sidewalks.js';

/**
 * Builds the whole city.
 * @param {object} options { seed, renderer, settings, lite, onStage }
 */
export function createWorld(options = {}) {
  const seed = options.seed ?? 'solmara-01';
  const settings = options.settings ?? { propDensity: 1 };
  const onStage = options.onStage ?? (() => {});
  // `lite` drops the costly facade passes; the software-rasteriser path in main.js sets it.
  const lite = Boolean(options.lite);
  const started = performance.now();

  onStage('planning the districts');
  const plan = createCityPlan(seed);
  const textures = new TextureLibrary(options.renderer ?? null);
  const colliders = createColliders();
  const group = new THREE.Group();
  group.name = 'solmara';

  onStage('painting the surfaces');
  const terrain = buildTerrain(plan, textures, { detail: settings.propDensity });
  group.add(terrain.group);

  onStage('laying the streets');
  const roads = buildRoads(plan, textures);
  group.add(roads.group);

  onStage('raising the skyline');
  const buildings = buildBuildings(plan, textures, colliders, { detail: settings.propDensity, lite });
  group.add(buildings.group);

  onStage('building the landmarks');
  const landmarks = buildLandmarks(plan, textures, colliders, { lite });
  group.add(landmarks.group);

  onStage('stretching the ring highway');
  const highway = buildHighway(plan, textures, colliders);
  group.add(highway.group);

  onStage('dressing the streets');
  const props = buildProps(plan, textures, colliders, {
    // Half the furniture is enough to read as a street on a software rasteriser.
    detail: lite ? Math.min(settings.propDensity, 0.5) : settings.propDensity,
    parkedCars: false,
  });
  group.add(props.group);

  onStage('filling the harbour');
  const water = createWater(plan);
  group.add(water.mesh);

  // The pedestrian and parking layer sits on top of the colliders, so a kerbside space is
  // never placed inside a lamp post, a palm or a wall.
  onStage('marking the pavements');
  const walk = createWalkNetwork(plan, colliders);

  // Every material with a lit-window emissive map, so dusk can turn them up together. The
  // buildings own theirs; the landmarks only contribute the glass they share.
  const windowMaterials = [...buildings.materials];
  for (const material of Object.values(landmarks.materials)) {
    if (material.emissiveMap) windowMaterials.push(material);
  }

  // ---------------------------------------------------------------- minimap data
  const landmarkBlock = (key) => plan.blocks.find((block) => block.id === plan.landmarkBlocks[key]);
  const tower = landmarkBlock('tower');
  const stadium = landmarkBlock('stadium');
  const minimap = {
    bounds: { ...LAND_BOUNDS },
    water: [
      { x0: -1300, z0: -1100, x1: WATER.seaWestX, z1: 900, kind: 'sea' },
      { x0: -1300, z0: WATER.seaSouthZ, x1: 1400, z1: 1000, kind: 'sea' },
      { x0: WATER.channelX0, z0: WATER.channelZ0, x1: WATER.channelX1, z1: WATER.seaSouthZ, kind: 'channel' },
    ],
    roads: plan.edges.map((edge) => ({
      x0: edge.ax,
      z0: edge.az,
      x1: edge.bx,
      z1: edge.bz,
      width: edge.width,
      bridge: edge.bridge,
    })),
    blocks: plan.blocks.map((block) => ({
      x0: block.x0,
      z0: block.z0,
      x1: block.x1,
      z1: block.z1,
      district: block.district,
      park: block.park,
    })),
    bridges: plan.bridges.map((bridge) => ({
      x0: bridge.x0,
      z0: bridge.z - bridge.width / 2,
      x1: bridge.x1,
      z1: bridge.z + bridge.width / 2,
      kind: bridge.kind,
    })),
    highway: plan.highway.segments.map((segment) => ({ x0: segment.ax, z0: segment.az, x1: segment.bx, z1: segment.bz })),
    landmarks: [
      { id: 'spire', x: tower?.cx ?? 180, z: tower?.cz ?? -140, label: 'Solmara Spire' },
      { id: 'stadium', x: stadium?.cx ?? 600, z: stadium?.cz ?? 300, label: 'Verano Arena' },
      { id: 'pier', x: 930, z: 470, label: 'Pier 9' },
      { id: 'cranes', x: -600, z: 560, label: 'Harbour Works' },
      { id: 'airstrip', x: -660, z: -780, label: 'Marsh Airstrip' },
    ],
    spawns: plan.spawns.map((spawn) => ({ id: spawn.id, x: spawn.x, z: spawn.z, district: spawn.district })),
  };

  // ---------------------------------------------------------------- update
  let night = 0;
  let elapsed = 0;

  function update(dt, context = {}) {
    elapsed += dt;
    const { palette } = context;
    if (palette) {
      night = palette.night ?? 0;
      for (const material of windowMaterials) {
        // Curtain walls read as one sheet of light, punched windows need less.
        const glass = material.name?.includes('glass');
        material.emissiveIntensity = night * (glass ? 1.35 : 0.9);
      }
    }
    water.update(dt, palette, context.weather);
    props.update(dt, { night, palette, camera: context.camera });
  }

  const stats = {
    files: 0,
    buildings: buildings.count,
    tallest: buildings.tallest,
    props: props.count,
    lamps: props.lamps,
    signals: props.signalsCount,
    nodes: plan.stats.nodes,
    edges: plan.stats.edges,
    lanes: plan.stats.lanes,
    blocks: plan.stats.blocks,
    bridges: plan.stats.bridges,
    colliders: colliders.boxes.length,
    parkingSpots: walk.parking.length,
    crossings: walk.stats.crossings,
    triangles:
      terrain.triangles +
      roads.triangles +
      buildings.triangles +
      landmarks.triangles +
      highway.triangles +
      props.triangles,
    textures: textures.list().length,
    buildMs: Math.round(performance.now() - started),
  };

  // The play state the HUD and the systems read. They write it, nothing here simulates:
  // one shared shape, and no imports back up the stack.
  const state = {
    mode: 'foot',
    vehicle: null,
    speed: 0,
    topSpeed: 0,
    distanceWalked: 0,
    distanceDriven: 0,
    carsStolen: 0,
    score: 0,
    nearbyTraffic: 0,
    nearbyPeds: 0,
    district: plan.spawns[0]?.district ?? 'downtown',
    hour: 0,
    prompt: '',
  };

  const world = {
    seed,
    group,
    plan,
    textures,
    colliders,
    terrain,
    roads,
    buildings,
    landmarks,
    highway,
    props,
    water,
    walk,
    minimap,
    stats,
    state,
    notes: landmarks.notes,
    spawns: plan.spawns,
    districts: DISTRICTS,
    districtIds: DISTRICT_IDS,
    roadGraph: {
      nodes: plan.nodes,
      edges: plan.edges,
      lanes: plan.lanes,
      nodeById: plan.nodeById,
      edgeById: plan.edgeById,
      nearestLanePoint: (x, z, maxDistance) => nearestLanePoint(plan, x, z, maxDistance),
      nearestNode: (x, z) => nearestRoadNode(plan, x, z),
    },
    districtAt: (x, z) => districtIdAt(x, z, isWaterAt(x, z)),
    districtOf,
    isWaterAt,
    isOnLand,
    nearestLanePoint: (x, z, maxDistance) => nearestLanePoint(plan, x, z, maxDistance),
    nearestRoadNode: (x, z) => nearestRoadNode(plan, x, z),
    groundHeight: (x, z) => colliders.groundHeight(x, z),
    surfaceAt: (x, z) => walk.surfaceAt(x, z),
    isSidewalk: (x, z) => walk.isSidewalk(x, z),
    parkingSpots: walk.parking,
    resolveCircle: (x, z, radius) => colliders.resolveCircle(x, z, radius),
    spawnById: (id) => plan.spawns.find((spawn) => spawn.id === id) ?? null,
    update,
    get night() {
      return night;
    },
    get elapsed() {
      return elapsed;
    },
    grid: GRID,
    highwayLayout: HIGHWAY,
  };

  return world;
}
