// The car the player has to catch. It is not a traffic agent: it commits to a lane, runs to
// the end of it, and takes a random turn at each junction, so its route is a readable chase
// rather than a loop. The mission system moves its marker with it.

import { Random } from '../core/rng.js';
import { buildCarGroup } from '../vehicles/models.js';

/** A coupe cannot outrun a player on the straights forever; this is the pace it keeps. */
const CRUISE = 13.5;

export class ChaseCar {
  constructor({ world, scene, x, z, heading = 0, color = 0x9a2028, seed = 1 }) {
    this.world = world;
    this.scene = scene;
    this.random = new Random(`${seed}:chase`);
    this.color = color;
    this.speed = CRUISE;
    this.x = x;
    this.z = z;
    this.y = world.walk.surfaceAt(x, z).y;
    this.heading = heading;
    this.lane = this.findLane(x, z, heading);
    this.s = 0;

    // Lanes indexed by the node they leave, so a junction is one map lookup.
    this.lanesFrom = new Map();
    for (const lane of world.plan.lanes) {
      const start = lane.startNode ?? (lane.offset > 0 ? lane.edge.a : lane.edge.b);
      const list = this.lanesFrom.get(start);
      if (list) list.push(lane);
      else this.lanesFrom.set(start, [lane]);
    }

    this.view = buildCarGroup('coupe', color);
    scene.add(this.view.group);
    if (this.lane) {
      // Snap to the lane mouth, so the first frame is already on the road.
      this.x = this.lane.from.x;
      this.z = this.lane.from.z;
      this.heading = Math.atan2(this.lane.dirX, this.lane.dirZ);
    }
    this.sync(0);
  }

  /** The lane under the car, pointing the way it is already facing. */
  findLane(x, z, heading) {
    const fx = Math.sin(heading);
    const fz = Math.cos(heading);
    let best = null;
    let bestScore = Infinity;

    for (const lane of this.world.plan.lanes) {
      // Ignore lanes running against the car.
      if (lane.dirX * fx + lane.dirZ * fz < 0.4) continue;
      const px = x - lane.from.x;
      const pz = z - lane.from.z;
      const along = px * lane.dirX + pz * lane.dirZ;
      const perp = Math.abs(px * lane.dirZ - pz * lane.dirX);
      if (perp > 10 || along < -4 || along > lane.length + 4) continue;
      // Closest to the car, and behind it counts against the lane.
      const score = perp + Math.max(0, -along);
      if (score >= bestScore) continue;
      bestScore = score;
      best = lane;
    }
    return best;
  }

  chooseNext() {
    const end = this.lane?.endNode ?? this.lane?.edge?.b;
    // No lane leaves this junction: fall back to any lane so the chase never freezes.
    const options = (this.lanesFrom.get(end) ?? []).filter((lane) => lane !== this.lane);
    if (!options.length) return this.world.plan.lanes[this.random.int(0, this.world.plan.lanes.length - 1)];

    // Prefer the straightest option, but not always: the chase should turn.
    const straight = options.filter((lane) => lane.dirX * this.lane.dirX + lane.dirZ * this.lane.dirZ > 0.5);
    if (straight.length && this.random.chance(0.55)) return this.random.pick(straight);
    return this.random.pick(options);
  }

  update(dt) {
    this.s += this.speed * dt;
    let guard = 0;
    // A long lane can be crossed more than once in a slow frame.
    while (this.lane && this.s >= this.lane.length && guard < 4) {
      guard += 1;
      this.s -= this.lane.length;
      this.lane = this.chooseNext();
    }
    if (!this.lane) return;

    this.x = this.lane.from.x + this.lane.dirX * this.s;
    this.z = this.lane.from.z + this.lane.dirZ * this.s;
    this.heading = Math.atan2(this.lane.dirX, this.lane.dirZ);
    this.y = this.world.walk.surfaceAt(this.x, this.z).y;
    this.sync(dt);
  }

  sync(dt) {
    if (!this.view) return;
    this.view.group.position.set(this.x, this.y, this.z);
    this.view.group.rotation.y = this.heading;
    // The stolen car is always driving, so its wheels always turn.
    for (const wheel of this.view.wheels) wheel.rotation.x += (this.speed / 0.35) * dt;
  }

  dispose() {
    if (this.view) this.scene.remove(this.view.group);
    this.view = null;
  }
}
