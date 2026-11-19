// Settings read once from the URL, then owned by the settings screen. The defaults are
// the safe ones: no shadow maps, no post processing, a capped pixel ratio, thirty cars
// and thirty-two people. Nothing here is required for the game to run, but the shot rig,
// the menus and the save file all read and write the same object.

import { clamp } from './math.js';

const QUALITY_PRESETS = {
  low: { pixelRatio: 1, renderScale: 0.85, shadows: false, skySegments: 16, propDensity: 0.55, drawDistance: 2000 },
  medium: { pixelRatio: 1.25, renderScale: 1, shadows: false, skySegments: 24, propDensity: 0.8, drawDistance: 2600 },
  high: { pixelRatio: 1.6, renderScale: 1, shadows: true, skySegments: 32, propDensity: 1, drawDistance: 3000 },
};

export class Settings {
  constructor(search = '') {
    const params = new URLSearchParams(search);
    const requested = (params.get('quality') ?? 'medium').toLowerCase();
    this.quality = QUALITY_PRESETS[requested] ? requested : 'medium';
    const preset = QUALITY_PRESETS[this.quality];
    this.pixelRatioCap = preset.pixelRatio;
    this.renderScale = preset.renderScale;
    this.shadows = preset.shadows && params.get('shadows') !== '0';
    this.shadowQuality = this.shadows ? 'low' : 'off';
    this.postProcessing = params.get('post') === '1';
    this.skySegments = preset.skySegments;
    this.propDensity = clamp(Number(params.get('props')) || preset.propDensity, 0.2, 1.4);
    this.drawDistance = preset.drawDistance;
    this.trafficCount = clamp(Number(params.get('traffic')) || 30, 0, 48);
    this.pedestrianCount = clamp(Number(params.get('peds')) || 32, 0, 48);
    this.cameraSensitivity = clamp(Number(params.get('sens')) || 1, 0.55, 2.4);
    this.muted = params.get('mute') === '1';
    this.showFps = params.get('fps') === '1';
    this.fov = clamp(Number(params.get('fov')) || 62, 45, 90);
    this.paused = params.get('paused') === '1';
    this.still = params.get('still') === '1';
    this.seed = params.get('seed') ?? 'solmara-01';
    this.shot = params.get('shot');
    this.capture = params.get('capture') === '1';
    this.reduceMotion = params.get('motion') === '0';
  }

  /**
   * Applies a stored knobs record. Returns true when at least one value changed; main.js
   * uses that to resize the crowd and rebuild the renderer only when it must.
   */
  apply(values) {
    if (!values || typeof values !== 'object') return false;
    let changed = false;
    if (Number.isFinite(Number(values.drawDistance))) {
      const next = clamp(Number(values.drawDistance), 1200, 4500);
      if (next !== this.drawDistance) {
        this.drawDistance = next;
        changed = true;
      }
    }
    if (Number.isFinite(Number(values.traffic))) {
      const next = Math.round(clamp(Number(values.traffic), 0, 48));
      if (next !== this.trafficCount) {
        this.trafficCount = next;
        changed = true;
      }
    }
    if (Number.isFinite(Number(values.pedestrians))) {
      const next = Math.round(clamp(Number(values.pedestrians), 0, 48));
      if (next !== this.pedestrianCount) {
        this.pedestrianCount = next;
        changed = true;
      }
    }
    if (values.shadows === 'off' || values.shadows === 'low') {
      const next = values.shadows;
      if (next !== this.shadowQuality) {
        this.shadowQuality = next;
        this.shadows = next !== 'off';
        changed = true;
      }
    }
    if (typeof values.post === 'boolean' && values.post !== this.postProcessing) {
      this.postProcessing = values.post;
      changed = true;
    }
    if (Number.isFinite(Number(values.sensitivity))) {
      const next = clamp(Number(values.sensitivity), 0.55, 2.4);
      if (next !== this.cameraSensitivity) {
        this.cameraSensitivity = next;
        changed = true;
      }
    }
    if (typeof values.mute === 'boolean' && values.mute !== this.muted) {
      this.muted = values.mute;
      changed = true;
    }
    if (typeof values.showFps === 'boolean' && values.showFps !== this.showFps) {
      this.showFps = values.showFps;
      changed = true;
    }
    return changed;
  }

  /** A plain object, handy for window.__GAME.settings and the dossier. */
  snapshot() {
    return {
      quality: this.quality,
      pixelRatioCap: this.pixelRatioCap,
      renderScale: this.renderScale,
      software: this.software ?? false,
      shadows: this.shadows,
      shadowQuality: this.shadowQuality,
      postProcessing: this.postProcessing,
      propDensity: this.propDensity,
      drawDistance: this.drawDistance,
      trafficCount: this.trafficCount,
      pedestrianCount: this.pedestrianCount,
      cameraSensitivity: this.cameraSensitivity,
      muted: this.muted,
      showFps: this.showFps,
      fov: this.fov,
      seed: this.seed,
      shot: this.shot,
      capture: this.capture,
    };
  }
}

export const settings = new Settings(typeof location === 'undefined' ? '' : location.search);
