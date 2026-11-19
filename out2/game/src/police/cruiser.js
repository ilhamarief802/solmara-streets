// One police cruiser. It is a real body on the road graph, not a traffic agent: it picks
// the lane that points most directly at the player, takes the junction that shortens the
// chase, and only leaves the graph for the last thirty metres, when it steers straight at
// the player. That keeps it on the road (no wall-grinding) while the final approach feels
// like a pursuit. Roadblock cruisers are the same class with `mode = 'block'`.

import { clamp, dampAngle, angleDelta, yawToward } from '../core/math.js';

export class PursuitCruiser {
  constructor({ world, x, z, heading, lane = null, mode = 'chase', speed = 0 }) {
    this.world = world;
    this.x = x;
    this.z = z;
    this.y = world.walk.surfaceAt(x, z).y;
    this.heading = heading;
    this.speed = speed;
    this.lane = lane;
    this.mode = mode;
    this.health = 100;
    this.dead = false;
    this.waypoint = { x, z };
    this.retarget = 0;
    this.ramCooldown = 0;
    this.blink = Math.random() * 10;
    this.stuckClock = 0;
    this.lastX = x;
    this.lastZ = z;
    this.view = null;
    this.lights = null;
    this.radius = 1.35;
    this.sirenClock = 0;
    if (lane) this.waypoint = this.laneEnd(lane);
  }

  laneEnd(lane) {
    return { x: lane.from.x + lane.dirX * lane.length, z: lane.from.z + lane.dirZ * lane.length };
  }

  attach(view) {
    this.view = view;
    view.group.position.set(this.x, this.y, this.z);
    view.group.rotation.y = this.heading;
    // Two additive pips over the roof bar, so the lights flash beyond the static paint.
    const geometry = new THREE.BoxGeometry(0.44, 0.1, 0.24);
    const red = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: 0xff2a1f, transparent: true, opacity: 0.9 }));
    const blue = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: 0x2a6bff, transparent: true, opacity: 0.9 }));
    red.position.set(-0.3, 1.66, -0.12);
    blue.position.set(0.3, 1.66, -0.12);
    view.group.add(red, blue);
    this.lights = { red, blue };
  }

  /** The lane mouth nearest this body, used when a cruiser is placed by hand. */
  static nearestLane(world, x, z) {
    let best = null;
    let bestDistance = Infinity;
    for (const lane of world.plan.lanes) {
      const midX = lane.from.x + lane.dirX * lane.length * 0.5;
      const midZ = lane.from.z + lane.dirZ * lane.length * 0.5;
      const distance = Math.hypot(midX - x, midZ - z);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = lane;
      }
    }
    return { lane: best, distance: bestDistance };
  }

  /** Picks the lane leaving the current one's end that brings the cruiser closer. */
  chooseNext(player) {
    const lanes = this.world.plan.lanes;
    const endNode = this.lane?.endNode ?? this.lane?.edge?.b;
    let best = null;
    let bestScore = Infinity;
    for (const lane of lanes) {
      const start = lane.startNode;
      if (endNode && start !== endNode) continue;
      if (lane === this.lane) continue;
      const end = this.laneEnd(lane);
      const distance = Math.hypot(end.x - player.x, end.z - player.z);
      const dot = this.lane ? lane.dirX * this.lane.dirX + lane.dirZ * this.lane.dirZ : 0;
      const score = distance - dot * 16;
      if (score < bestScore) {
        bestScore = score;
        best = lane;
      }
    }
    if (!best) {
      // No lane leaves this node (a bridgehead, say): aim at the nearest lane in the city.
      best = PursuitCruiser.nearestLane(this.world, player.x, player.z).lane;
    }
    return best;
  }

  /** Puts the cruiser at the start of a lane, pointing down it. */
  static fromLane(world, lane, along = null, mode = 'chase') {
    const s = along ?? lane.length * 0.5;
    return new PursuitCruiser({
      world,
      x: lane.from.x + lane.dirX * s,
      z: lane.from.z + lane.dirZ * s,
      heading: Math.atan2(lane.dirX, lane.dirZ),
      lane,
      mode,
      speed: mode === 'block' ? 0 : 9,
    });
  }

  update(dt, player, { wanted = 1, cameraPosition = null } = {}) {
    this.blink += dt;
    this.ramCooldown = Math.max(0, this.ramCooldown - dt);
    if (this.mode === 'block') {
      this.speed = 0;
      this.syncView(dt);
      this.updateLights();
      return;
    }
    const playerX = player.position.x;
    const playerZ = player.position.z;
    const distance = Math.hypot(playerX - this.x, playerZ - this.z);

    let targetX;
    let targetZ;
    if (distance < 32) {
      // Close enough: leave the graph and go for the body itself.
      targetX = playerX;
      targetZ = playerZ;
      this.waypoint.x = targetX;
      this.waypoint.z = targetZ;
    } else {
      // The lane end is the waypoint; once it is reached, take the next lane.
      const end = this.laneEnd(this.lane);
      if (Math.hypot(end.x - this.x, end.z - this.z) < 9 && this.retarget <= 0) {
        this.retarget = 0.5;
        this.lane = this.chooseNext(player);
        if (this.lane) this.waypoint = this.laneEnd(this.lane);
      }
      this.retarget = Math.max(0, this.retarget - dt);
      targetX = this.waypoint.x;
      targetZ = this.waypoint.z;
    }

    const desired = yawToward(this.x, this.z, targetX, targetZ);
    const turn = angleDelta(this.heading, desired);
    const turnRate = clamp(1.2 + Math.abs(this.speed) * 0.055, 1.2, 2.4);
    this.heading = dampAngle(this.heading, desired, turnRate * 2.2, dt);

    // Faster with more stars, but brake hard into a sharp turn so it stays on the road.
    const aggressive = clamp(0.55 + wanted * 0.13, 0.6, 1.25);
    let wantedSpeed = clamp(11 + wanted * 2.4, 12, 23) * aggressive;
    if (Math.abs(turn) > 0.7) wantedSpeed = Math.min(wantedSpeed, 8);
    if (distance < 8) wantedSpeed = Math.min(wantedSpeed, 9);
    if (this.stuckClock > 1.2) wantedSpeed = 4;
    this.speed += clamp(wantedSpeed - this.speed, -13 * dt, 7.5 * dt);

    const nx = this.x + Math.sin(this.heading) * this.speed * dt;
    const nz = this.z + Math.cos(this.heading) * this.speed * dt;
    const resolved = this.world.resolveCircle(nx, nz, this.radius);
    if (Math.hypot(resolved.x - nx, resolved.z - nz) > 0.02) this.speed *= 0.55;
    this.x = resolved.x;
    this.z = resolved.z;
    const surface = this.world.walk.surfaceAt(this.x, this.z);
    this.y = surface.y;

    // A cruiser wedged on a kerb or wall backs off after a moment and re-enters the graph.
    const moved = Math.hypot(this.x - this.lastX, this.z - this.lastZ);
    if (moved < 0.4 * dt * 10) this.stuckClock += dt;
    else this.stuckClock = 0;
    this.lastX = this.x;
    this.lastZ = this.z;
    if (this.stuckClock > 2.4) {
      const found = PursuitCruiser.nearestLane(this.world, this.x, this.z);
      if (found.lane) {
        this.lane = found.lane;
        this.waypoint = this.laneEnd(found.lane);
      }
      this.stuckClock = 0;
    }

    this.syncView(dt);
    this.updateLights();
  }

  syncView(dt) {
    if (!this.view) return;
    this.view.group.position.set(this.x, this.y, this.z);
    this.view.group.rotation.y = this.heading;
    for (const wheel of this.view.wheels) wheel.rotation.x += (this.speed / 0.35) * dt;
  }

  updateLights() {
    if (!this.lights) return;
    const on = Math.sin(this.blink * 7.5) > 0;
    this.lights.red.visible = on;
    this.lights.blue.visible = !on;
  }

  get mapDot() {
    return { x: this.x, z: this.z, speed: this.speed, mode: this.mode };
  }
}
