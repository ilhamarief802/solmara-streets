// The road graph: the street network as nodes and edges, with the queries later
// phases need. Walking, traffic and navigation all ask this object "where is the
// nearest street, and which way does it run", so the lookups are bucketed into a
// coarse grid rather than scanning every edge.

import { pointSegment, clamp } from '../core/math.js';

const CELL = 96;
const LANE_OFFSET = 3.6; // metres from the street centre to a lane centre

export class RoadGraph {
  constructor(plan) {
    this.plan = plan;
    this.nodes = plan.nodes;
    this.edges = plan.edges;
    this.nodeById = new Map(this.nodes.map((node) => [node.id, node]));
    this.edgeById = new Map(this.edges.map((edge) => [edge.id, edge]));
    this.cell = CELL;
    this.buckets = new Map();
    this.pad = (plan.city.roadWidth / 2) + 2;
    this.index();
  }

  index() {
    for (const edge of this.edges) {
      const minX = Math.min(edge.ax, edge.bx) - this.pad;
      const maxX = Math.max(edge.ax, edge.bx) + this.pad;
      const minZ = Math.min(edge.az, edge.bz) - this.pad;
      const maxZ = Math.max(edge.az, edge.bz) + this.pad;
      for (let cx = Math.floor(minX / CELL); cx <= Math.floor(maxX / CELL); cx += 1) {
        for (let cz = Math.floor(minZ / CELL); cz <= Math.floor(maxZ / CELL); cz += 1) {
          const key = `${cx}:${cz}`;
          let bucket = this.buckets.get(key);
          if (!bucket) {
            bucket = [];
            this.buckets.set(key, bucket);
          }
          bucket.push(edge);
        }
      }
    }
  }

  get stats() {
    return {
      nodes: this.nodes.length,
      edges: this.edges.length,
      bridges: this.edges.filter((edge) => edge.bridge).length,
      cells: this.buckets.size,
    };
  }

  /** Candidates near a point, falling back to every edge if the point is offshore. */
  candidates(x, z) {
    const found = [];
    const seen = new Set();
    const cx = Math.floor(x / CELL);
    const cz = Math.floor(z / CELL);
    for (let ix = cx - 1; ix <= cx + 1; ix += 1) {
      for (let iz = cz - 1; iz <= cz + 1; iz += 1) {
        const bucket = this.buckets.get(`${ix}:${iz}`);
        if (!bucket) continue;
        for (const edge of bucket) {
          if (seen.has(edge.id)) continue;
          seen.add(edge.id);
          found.push(edge);
        }
      }
    }
    return found.length ? found : this.edges;
  }

  node(id) {
    return this.nodeById.get(id) ?? null;
  }

  /** The closest street junction to a world point. */
  nearestNode(x, z) {
    let best = null;
    let bestDistSq = Infinity;
    for (const node of this.nodes) {
      const distSq = (node.x - x) ** 2 + (node.z - z) ** 2;
      if (distSq < bestDistSq) {
        bestDistSq = distSq;
        best = node;
      }
    }
    return best ? { node: best, distance: Math.sqrt(bestDistSq) } : null;
  }

  /** Every junction inside a radius, nearest first. */
  nodesWithin(x, z, radius) {
    const out = [];
    for (const node of this.nodes) {
      const distance = Math.hypot(node.x - x, node.z - z);
      if (distance <= radius) out.push({ node, distance });
    }
    out.sort((a, b) => a.distance - b.distance);
    return out;
  }

  /** The closest point on the street network, with the edge and parameter. */
  nearestEdge(x, z) {
    let best = null;
    let bestDist = Infinity;
    for (const edge of this.candidates(x, z)) {
      const hit = pointSegment(x, z, edge.ax, edge.az, edge.bx, edge.bz);
      if (hit.dist < bestDist) {
        bestDist = hit.dist;
        best = { edge, t: hit.t, x: hit.x, z: hit.z, distance: hit.dist };
      }
    }
    return best;
  }

  /**
   * The nearest point in a driving lane rather than on the street centre line.
   * `side` is +1 for the right hand lane in the edge's own direction, -1 for the
   * opposite carriageway.
   */
  nearestLanePoint(x, z, side = 1) {
    const hit = this.nearestEdge(x, z);
    if (!hit) return null;
    const dx = hit.edge.bx - hit.edge.ax;
    const dz = hit.edge.bz - hit.edge.az;
    const length = Math.hypot(dx, dz) || 1;
    // Right hand normal of the edge direction.
    const nx = (dz / length) * side;
    const nz = (-dx / length) * side;
    const offset = (hit.edge.width / 2 - LANE_OFFSET) * (hit.edge.wide ? 1.35 : 1);
    return {
      x: hit.x + nx * offset,
      z: hit.z + nz * offset,
      direction: { x: dx / length, z: dz / length },
      edge: hit.edge,
      t: hit.t,
      distance: hit.distance,
      onBridge: hit.edge.bridge === true,
    };
  }

  /** Distance from a point to the nearest street surface. */
  distanceToRoad(x, z) {
    const hit = this.nearestEdge(x, z);
    return hit ? hit.distance : Infinity;
  }

  /** True when a point is on a carriageway (used by spawn and traffic placement). */
  onRoad(x, z, tolerance = 1) {
    const hit = this.nearestEdge(x, z);
    if (!hit) return false;
    return hit.distance <= hit.edge.width / 2 + tolerance;
  }

  /** Edges leaving a node, optionally filtered by axis. */
  edgesFrom(nodeIdValue, axis = null) {
    const node = this.node(nodeIdValue);
    if (!node) return [];
    const out = [];
    for (const id of node.links) {
      const edge = this.edgeById.get(id);
      if (!edge) continue;
      if (axis && edge.axis !== axis) continue;
      out.push({ edge, other: edge.a === nodeIdValue ? edge.b : edge.a });
    }
    return out;
  }

  /** A/B read of a point along an edge, handy for animating traffic later. */
  lerpOnEdge(edgeIdValue, t) {
    const edge = this.edgeById.get(edgeIdValue);
    if (!edge) return null;
    const clamped = clamp(t, 0, 1);
    return {
      x: edge.ax + (edge.bx - edge.ax) * clamped,
      z: edge.az + (edge.bz - edge.az) * clamped,
      axis: edge.axis,
      district: edge.district,
    };
  }

  /** The lanes of a bridge, so later phases can drive across the channel. */
  bridgeEdges() {
    return this.edges.filter((edge) => edge.bridge === true);
  }
}

export function createRoadGraph(plan) {
  return new RoadGraph(plan);
}
