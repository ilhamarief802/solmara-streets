// The renderer and its resize behaviour. One WebGL context, a sRGB pipeline, ACES tone mapping so
// the low sun and the neon both keep their colour, and pixels capped at a sane ratio so a 4K
// monitor does not quietly turn into a slideshow. No shadow maps by default: the game is lit by a
// directional sun plus hemisphere fill, which is far cheaper and reads better at low sun angles.

import { clamp } from './math.js';

const BASE_WIDTH = 1280;
const BASE_HEIGHT = 720;

/** Creates the renderer on the page's canvas and sizes it to the window. */
export function createRenderer(canvas, settings) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: settings.get('antialias'),
    powerPreference: 'high-performance',
    stencil: false,
    alpha: false,
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = false;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(0x0a1620, 1);
  renderer.info.autoReset = true;

  const state = { width: BASE_WIDTH, height: BASE_HEIGHT, ratio: 1 };

  function resize() {
    const width = Math.max(320, window.innerWidth || BASE_WIDTH);
    const height = Math.max(240, window.innerHeight || BASE_HEIGHT);
    const cap = settings.get('pixelRatioCap');
    const ratio = Math.min(window.devicePixelRatio || 1, cap);
    state.width = width;
    state.height = height;
    state.ratio = ratio;
    renderer.setPixelRatio(ratio);
    renderer.setSize(width, height, false);
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    settings.set('viewport', { width, height, ratio, aspect: width / height });
  }

  let pending = 0;
  function onResize() {
    if (pending) return;
    pending = requestAnimationFrame(() => {
      pending = 0;
      resize();
    });
  }

  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', onResize);
  resize();

  return {
    renderer,
    canvas,
    state,
    resize,
    dispose() {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
      renderer.dispose();
    },
  };
}

/** Tone-mapping exposure with a settings-side clamp, so a wrong slider cannot white out the city. */
export function setExposure(renderer, exposure) {
  renderer.toneMappingExposure = clamp(exposure, 0.35, 2.2);
}

/** How many triangles the last frame drew, for the perf overlay. */
export function drawnTriangles(renderer) {
  return renderer.info.render.triangles;
}
