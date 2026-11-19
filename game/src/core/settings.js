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

const MAX_TRAFFIC = 48;
const MAX_PEDESTRIANS = 48;
const SENSITIVITY = { min: 0.55, max: 2.4 };
const DRAW_DISTANCE = { min: 1200, max: 4500 };

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
    this.trafficCount = clamp(Number(params.get('traffic')) || 30, 0, MAX_TRAFFIC);
    this.pedestrianCount = clamp(Number(params.get('peds')) || 32, 0, MAX_PEDESTRIANS);
    this.cameraSensitivity = clamp(Number(params.get('sens')) || 1, SENSITIVITY.min, SENSITIVITY.max);
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
   * Applies a stored knobs record. Returns true when at least one value changed; the
   * settings screen uses that to decide whether a rebuild is needed.
   */
  apply(values) {
    if (!values || typeof values !== 'object') return false;
    let changed = false;

    /** Stores a clamped numeric knob; notes a change when the value moves. */
    const setIfChanged = (key, raw, min, max, round = false) => {
      const value = Number(raw);
      if (!Number.isFinite(value)) return;
      const next = round ? Math.round(clamp(value, min, max)) : clamp(value, min, max);
      if (next === this[key]) return;
      this[key] = next;
      changed = true;
    };

    setIfChanged('drawDistance', values.drawDistance, DRAW_DISTANCE.min, DRAW_DISTANCE.max);
    setIfChanged('trafficCount', values.traffic, 0, MAX_TRAFFIC, true);
    setIfChanged('pedestrianCount', values.pedestrians, 0, MAX_PEDESTRIANS, true);
    setIfChanged('cameraSensitivity', values.sensitivity, SENSITIVITY.min, SENSITIVITY.max);

    if (values.shadows === 'off' || values.shadows === 'low') {
      if (values.shadows !== this.shadowQuality) {
        this.shadowQuality = values.shadows;
        this.shadows = values.shadows !== 'off';
        changed = true;
      }
    }
    if (typeof values.post === 'boolean' && values.post !== this.postProcessing) {
      this.postProcessing = values.post;
      changed = true;
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
