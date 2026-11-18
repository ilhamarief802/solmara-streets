// Assembles the city: one plan, one texture factory, one material set, one set of
// geometry buckets drained into a single group, plus the systems that live on top of
// it. Everything the rest of the game needs is reached from the World object: the
// road graph, the collider registry, spawn points, district lookup and the minimap
// geometry the HUD will draw in the next phase.

import { Rng } from '../core/random.js';
import { BuildGroups } from '../core/geometry.js';
import { createTextureFactory } from './textures.js';
import { createMaterials } from './materials.js';
import { CITY, createCityPlan, districtAt, landKindAt, planSummary } from './cityplan.js';
import { districtById } from './districts.js';
import { createRoadGraph } from './roadgraph.js';
import { createHeightField, buildTerrain, buildTerrainDetail } from './terrain.js';
import { buildRoadNetwork } from './roads.js';
import { buildBuildings } from './buildings.js';
import { buildLandmarks } from './landmarks.js';
import { buildProps } from './props.js';
import { createTrafficSystem } from './traffic.js';
import { createWater } from './water.js';
import { createColliders } from './colliders.js';

const MINIMAP_CELL = 20;

/** Named spawn points: where later phases drop the player, cars and cameras. */
function buildSpawnPoints({ plan, colliders, heightField, anchors, rng, roadGraph }) {
  const request = [
    { name: 'downtownBoulevard', label: 'Downtown boulevard', x: 3.2, z: 46, lookX: 3.2, lookZ: -160, kind: 'street' },
    { name: 'neonStrip', label: 'Neon Strip', x: 144, z: -46, lookX: 320, lookZ: -60, kind: 'street' },
    { name: 'marinaPier', label: 'Marina pier', x: -508, z: 150, lookX: -700, lookZ: 150, kind: 'pier' },
    { name: 'beachBoardwalk', label: 'Beach boardwalk', x: 36, z: 372, lookX: 40, lookZ: 470, kind: 'beach' },
    { name: 'harbourDocks', label: 'Harbour docks', x: -450, z: -190, lookX: -560, lookZ: -260, kind: 'harbour' },
    { name: 'airstrip', label: 'Marsh airstrip', x: 240, z: -384, lookX: 480, lookZ: -384, kind: 'airstrip' },
    { name: 'stadiumGate', label: 'Stadium gate', x: -180, z: 148, lookX: -180, lookZ: 120, kind: 'stadium' },
    { name: 'plaza', label: 'Solmara plaza', x: 36, z: 60, lookX: 36, lookZ: 36, kind: 'plaza' },
    { name: 'towerForecourt', label: 'Tower forecourt', x: 108, z: -216, lookX: 108, lookZ: -252, kind: 'tower' },
    { name: 'oldBridge', label: 'The Old Bridge', x: 0, z: 236, lookX: 0, lookZ: 300, kind: 'bridge' },
    { name: 'veranoMarket', label: 'Verano market', x: -108, z: 180, lookX: -108, lookZ: 180, kind: 'street' },
  ];

  return request.map((entry) => {
    const spot = colliders.findFreeSpot(entry.x, entry.z, 1.4, 10, rng);
    const y = colliders.groundAt(spot.x, spot.z);
    const yaw = Math.atan2(-(entry.lookX - spot.x), -(entry.lookZ - spot.z));
    const district = districtById(districtAt(spot.x, spot.z));
    const hit = roadGraph ? roadGraph.nearestEdge(spot.x, spot.z) : null;
    return {
      name: entry.name,
      label: entry.label,
      kind: entry.kind,
      x: spot.x,
      y: Math.max(y, CITY.seaLevel + 0.6),
      z: spot.z,
      yaw,
      district: district.id,
      districtName: district.name,
      onRoad: hit ? hit.distance <= hit.edge.width / 2 + 0.5 : false,
      roadDistance: hit ? hit.distance : null,
    };
  });
}

/** A coarse map of the city for the HUD: land kinds, streets, blocks and landmarks. */
function buildMinimap({ plan, heightField }) {
  const extent = 1320;
  const size = Math.floor(extent / MINIMAP_CELL);
  const cells = new Uint8Array(size * size);
  const legend = {
    water: 0,
    city: 1,
    beach: 2,
    marsh: 3,
    sand: 4,
    grass: 5,
  };
  const codes = Object.fromEntries(Object.entries(legend).map(([key, value]) => [value, key]));
  for (let iz = 0; iz < size; iz += 1) {
    for (let ix = 0; ix < size; ix += 1) {
      const x = (ix + 0.5) * MINIMAP_CELL - extent / 2;
      const z = (iz + 0.5) * MINIMAP_CELL - extent / 2;
      const height = heightField(x, z);
      let code;
      if (height < CITY.seaLevel) code = legend.water;
      else {
        const kind = landKindAt(x, z);
        code = kind === 'beach' ? legend.beach
          : kind === 'marsh' ? legend.marsh
            : kind === 'sand' ? legend.sand
              : kind === 'city' ? legend.city
                : legend.grass;
      }
      cells[iz * size + ix] = code;
    }
  }

  const colours = {
    water: '#123c58',
    city: '#8f8b84',
    beach: '#dcc79a',
    marsh: '#6d7350',
    sand: '#d8c49a',
    grass: '#7a8a5c',
  };

  return {
    origin: { x: -extent / 2, z: -extent / 2 },
    extent,
    cell: MINIMAP_CELL,
    size,
    cells,
    codes,
    colours,
    legend,
    roads: plan.edges.map((edge) => ({
      x1: edge.ax,
      z1: edge.az,
      x2: edge.bx,
      z2: edge.bz,
      width: edge.width,
      wide: edge.wide,
      bridge: edge.bridge,
      district: edge.district,
    })),
    nodes: plan.nodes.map((node) => ({ x: node.x, z: node.z, signals: node.signals })),
    blocks: plan.blocks.map((block) => ({ x: block.cx, z: block.cz, size: block.size, district: block.districtId, kind: block.kind })),
    bridges: plan.bridges.map((bridge) => ({ x: bridge.x, z: bridge.midpoint.z, width: bridge.width, name: bridge.name })),
    sources: {
      roads: plan.edges.length,
      nodes: plan.nodes.length,
      blocks: plan.blocks.length,
    },
  };
}

export class World {
  constructor(options = {}) {
    const started = performance.now();
    this.seed = options.seed ?? 'solmara-01';
    this.settings = options.settings ?? {};
    this.rng = new Rng(this.seed);
    this.parent = options.parent ?? null;

    this.textures = options.textures ?? createTextureFactory({ seed: this.seed, rng: this.rng.fork('textures') });
    this.plan = createCityPlan({ seed: this.seed, rng: this.rng.fork('plan') });
    this.roadGraph = createRoadGraph(this.plan);
    this.heightField = createHeightField(this.plan);
    this.colliders = createColliders({ plan: this.plan, heightField: this.heightField });
    this.materials = createMaterials(this.textures, this.settings);
    this.groups = new BuildGroups(this.materials.buckets);

    this.group = new THREE.Group();
    this.group.name = 'solmara-city';

    const terrainRng = this.rng.fork('terrain');
    this.terrain = buildTerrain({
      plan: this.plan,
      groups: this.groups,
      rng: terrainRng,
      heightField: this.heightField,
      segments: this.settings.terrainSegments ?? 120,
    });
    this.terrainDetail = buildTerrainDetail({
      plan: this.plan,
      groups: this.groups,
      rng: terrainRng.fork('detail'),
      heightField: this.heightField,
    });

    this.roads = buildRoadNetwork({
      plan: this.plan,
      groups: this.groups,
      rng: this.rng.fork('roads'),
      colliders: this.colliders,
      heightField: this.heightField,
    });

    this.buildings = buildBuildings({
      plan: this.plan,
      groups: this.groups,
      rng: this.rng.fork('buildings'),
      colliders: this.colliders,
      materials: this.materials,
    });

    this.landmarks = buildLandmarks({
      plan: this.plan,
      groups: this.groups,
      rng: this.rng.fork('landmarks'),
      colliders: this.colliders,
      heightField: this.heightField,
    });

    this.props = buildProps({
      plan: this.plan,
      groups: this.groups,
      rng: this.rng.fork('props'),
      colliders: this.colliders,
      materials: this.materials,
      heightField: this.heightField,
      signRequests: this.buildings.signRequests,
    });

    this.water = createWater({ plan: this.plan, textures: this.textures, rng: this.rng.fork('water') });
    this.water.attach(this.group);

    this.traffic = createTrafficSystem({
      plan: this.plan,
      groups: this.groups,
      rng: this.rng.fork('traffic'),
      colliders: this.colliders,
    });
    this.group.add(this.traffic.lampMesh);

    // Drain every bucket into one merged mesh per material. The counts have to be
    // taken before draining, because draining frees the builders' buffers.
    const bucketSummary = this.groups.summary();
    const totalTriangles = this.groups.triangles;
    this.meshes = this.groups.drain(this.group, {
      receiveShadow: true,
      castShadow: this.settings.shadows === true,
    });

    if (this.parent) this.parent.add(this.group);

    this.spawnPoints = buildSpawnPoints({
      plan: this.plan,
      colliders: this.colliders,
      heightField: this.heightField,
      anchors: this.landmarks.anchors,
      rng: this.rng.fork('spawns'),
      roadGraph: this.roadGraph,
    });
    this.spawnByName = new Map(this.spawnPoints.map((spawn) => [spawn.name, spawn]));
    this.minimap = buildMinimap({ plan: this.plan, heightField: this.heightField });

    this.stats = {
      buildMs: performance.now() - started,
      triangles: totalTriangles,
      meshes: this.meshes.length,
      buckets: bucketSummary.length,
      bucketRows: bucketSummary.slice(0, 8),
      buildings: this.buildings.records.length,
      blocks: this.plan.blocks.length,
      roadNodes: this.roadGraph.nodes.length,
      roadEdges: this.roadGraph.edges.length,
      colliderBoxes: this.colliders.boxes.length,
      trafficJunctions: this.traffic.junctions.length,
      landmarks: this.landmarks.count,
      lamps: this.props.lamps,
      palms: this.props.palms,
      cars: this.props.cars,
      textures: this.textures.cache.size,
      terrainTriangles: this.terrain.triangles,
      skippedTerrainCells: this.terrain.skipped,
    };
  }

  /** Solmara's district at a world position, as the district record. */
  districtAt(x, z) {
    return districtById(districtAt(x, z));
  }

  /** A named spawn point, or the boulevard if the name is unknown. */
  spawn(name) {
    return this.spawnByName.get(name) ?? this.spawnPoints[0];
  }

  /** Per frame: water swell, signal cycle and the glow channels. */
  update(dt, state = {}) {
    this.traffic.update(dt);
    this.water.update(dt, state);
    if (state.palette) this.materials.update(state.palette);
    return this;
  }

  /** A one line build summary for the console and the boot overlay. */
  summary() {
    return `${planSummary(this.plan)} | ${this.stats.buildings} buildings, ${this.stats.triangles.toLocaleString()} tris in ${this.stats.meshes} meshes, ${this.stats.colliderBoxes} colliders, ${this.stats.trafficJunctions} signalled junctions, built in ${this.stats.buildMs.toFixed(0)}ms`;
  }

  dispose() {
    this.groups.dispose?.();
    this.materials.dispose();
    this.textures.dispose();
    if (this.parent) this.parent.remove(this.group);
  }
}

export function createWorld(options) {
  return new World(options);
}

export { CITY, districtAt, planSummary };
