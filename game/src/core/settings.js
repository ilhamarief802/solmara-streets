// Settings read once from the URL. The defaults are the safe ones: no shadow maps, no
// post processing, a capped pixel ratio. Nothing here is required for the game to run,
// but the shot rig and later sessions use the same flags.

import { clamp } from './math.js';

const QUALITY_PRESETS = {
  low: { pixelRatio: 1, renderScale: 0.85, shadows: false, skySegments: 16, propDensity: 0.55, drawDistance: 2600 },
  medium: { pixelRatio: 1.25, renderScale: 1, shadows: false, skySegments: 24, propDensity: 0.8, drawDistance: 3200 },
  high: { pixelRatio: 1.6, renderScale: 1, shadows: true, skySegments: 32, propDensity: 1, drawDistance: 3800 },
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
    this.postProcessing = params.get('post') === '1';
    this.skySegments = preset.skySegments;
    this.propDensity = clamp(Number(params.get('props')) || preset.propDensity, 0.2, 1.4);
    this.drawDistance = preset.drawDistance;
    this.fov = clamp(Number(params.get('fov')) || 62, 45, 90);
    this.paused = params.get('paused') === '1';
    this.still = params.get('still') === '1';
    this.seed = params.get('seed') ?? 'solmara-01';
    this.shot = params.get('shot');
    this.reduceMotion = params.get('motion') === '0';
  }

  /** A plain object, handy for window.__GAME.settings and the dossier. */
  snapshot() {
    return {
      quality: this.quality,
      pixelRatioCap: this.pixelRatioCap,
      renderScale: this.renderScale,
      software: this.software ?? false,
      shadows: this.shadows,
      postProcessing: this.postProcessing,
      propDensity: this.propDensity,
      drawDistance: this.drawDistance,
      fov: this.fov,
      seed: this.seed,
      shot: this.shot,
    };
  }
}

export const settings = new Settings(typeof location === 'undefined' ? '' : location.search);
