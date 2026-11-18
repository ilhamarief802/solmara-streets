// The shot rig: reads ?shot= and &seed=, poses the camera for a named scenario, runs
// a fixed number of warm-up frames so textures and the signal cycle have settled, then
// raises window.__SHOT_READY and puts the scenario name in document.title. With no
// shot parameter the game just starts normally.

import { SCENARIOS, shotNames, scenarioFor, scenariosSummary } from './scenarios.js';

export { SCENARIOS, shotNames, scenarioFor, scenariosSummary };

/** Reads the URL parameters the shot rig understands. */
export function readShotParams(search = '') {
  const params = new URLSearchParams(search ?? '');
  const shot = params.get('shot');
  return {
    shot: shot && shot.length ? shot : null,
    seed: params.get('seed'),
    width: params.get('w') ? Number(params.get('w')) : null,
    height: params.get('h') ? Number(params.get('h')) : null,
    all: params,
    describe() {
      return `shot=${this.shot ?? 'none'}${this.seed ? ` seed=${this.seed}` : ''}`;
    },
  };
}

export class ShotRig {
  constructor(options = {}) {
    this.params = options.params ?? readShotParams('');
    this.camera = options.camera;
    this.clock = options.clock;
    this.weather = options.weather;
    this.world = options.world;
    this.debug = options.debug;
    this.freeCamera = options.freeCamera;
    this.viewport = options.viewport ?? null;
    this.loop = options.loop ?? null;
    this.scenario = this.params.shot ? scenarioFor(this.params.shot) : null;
    this.active = Boolean(this.scenario);
    this.frames = 0;
    this.warmup = this.scenario?.warmup ?? 0;
    this.ready = false;
    this.unknown = Boolean(this.params.shot) && !this.scenario;

    if (this.unknown) {
      // An unknown scenario must not leave a blank screen: report it and carry on.
      window.__REPORT_ERROR?.(`unknown shot scenario "${this.params.shot}" (known: ${shotNames().join(', ')})`, 'shot');
    }

    if (this.active) this.arm();
  }

  /** Applies the scenario: clock, weather, camera and any forced viewport size. */
  arm() {
    const scenario = this.scenario;
    if (this.clock) {
      this.clock.setHour(scenario.hour);
      this.clock.setTimeScale(scenario.timeScale ?? 0);
    }
    if (this.weather) {
      this.weather.set(scenario.weather ?? 'clear');
      // Weather eases in over time, so snap it: a shot must be reproducible.
      const target = this.weather;
      for (let i = 0; i < 240; i += 1) target.update(1 / 30);
    }
    if (this.freeCamera) {
      this.freeCamera.enabled = false;
      this.freeCamera.setPose(scenario.camera.position, scenario.camera.target);
    } else if (this.camera) {
      this.camera.position.set(scenario.camera.position.x, scenario.camera.position.y, scenario.camera.position.z);
      this.camera.lookAt(scenario.camera.target.x, scenario.camera.target.y, scenario.camera.target.z);
    }
    if (scenario.fov && this.camera) {
      this.camera.fov = scenario.fov;
      this.camera.updateProjectionMatrix();
    }
    if (this.viewport && this.params.width && this.params.height) {
      this.viewport.setFixedSize(this.params.width, this.params.height);
    }
    if (this.debug) {
      this.debug.setVisible(false);
      this.debug.setShotInfo(`${scenario.name} warm-up 0/${this.warmup}`);
    }
    document.title = `${scenario.title} (loading)`;
    return this;
  }

  /** Called once per rendered frame; declares readiness after the warm-up. */
  update() {
    if (!this.active || this.ready) return false;
    this.frames += 1;
    if (this.debug) this.debug.setShotInfo(`${this.scenario.name} warm-up ${this.frames}/${this.warmup}`);
    // Re-assert the pose: nothing else in this phase should move the camera, but a
    // shot must be identical even if something does.
    if (this.freeCamera) this.freeCamera.setPose(this.scenario.camera.position, this.scenario.camera.target);
    if (this.frames < this.warmup) return false;
    this.ready = true;
    window.__SHOT_READY = true;
    document.title = this.scenario.title;
    if (this.debug) this.debug.setShotInfo(`${this.scenario.name} ready after ${this.frames} frames`);
    console.info(`[shot] ${this.scenario.name} ready: ${this.scenario.title}`);
    return true;
  }

  describe() {
    if (!this.active) return 'shot rig idle (no ?shot= parameter)';
    return `${this.scenario.name} @ ${this.scenario.hour}h ${this.scenario.weather}, ${this.frames}/${this.warmup} frames${this.ready ? ' (ready)' : ''}`;
  }
}

export function createShotRig(options) {
  return new ShotRig(options);
}
