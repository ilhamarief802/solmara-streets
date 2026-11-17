// WebGL renderer setup: one place that owns tone mapping, colour space, the device
// pixel ratio cap, fog on the materials that should receive it, and resize handling.

export function createRenderer({ canvas, settings }) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: settings.antialias,
    alpha: false,
    stencil: false,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: false,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, settings.pixelRatioCap));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = settings.exposure;
  renderer.shadowMap.enabled = settings.shadows === true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.autoClear = true;
  renderer.setClearColor(0x8fb6d8, 1);
  renderer.info.autoReset = true;
  return renderer;
}

/** Applies the togglable parts of settings to a live renderer. */
export function applyRendererSettings(renderer, settings) {
  renderer.toneMappingExposure = settings.exposure;
  renderer.shadowMap.enabled = settings.shadows === true;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, settings.pixelRatioCap));
  return renderer;
}

/** Keeps the drawing buffer matched to the element (or to a forced shot size). */
export class Viewport {
  constructor({ canvas, renderer, camera, settings }) {
    this.canvas = canvas;
    this.renderer = renderer;
    this.camera = camera;
    this.settings = settings;
    this.fixed = null;
    this.width = 0;
    this.height = 0;
    this._onResize = () => this.apply();
  }

  attach() {
    window.addEventListener('resize', this._onResize);
    this.apply();
    return this;
  }

  dispose() {
    window.removeEventListener('resize', this._onResize);
  }

  /** Forces a size, used by the deterministic shot rig so screenshots are stable. */
  setFixedSize(width, height) {
    this.fixed = width && height ? { width, height } : null;
    this.apply();
  }

  measure() {
    if (this.fixed) return this.fixed;
    return {
      width: Math.max(1, window.innerWidth || this.canvas.clientWidth || 1280),
      height: Math.max(1, window.innerHeight || this.canvas.clientHeight || 577),
    };
  }

  apply() {
    const { width, height } = this.measure();
    const ratio = Math.min(window.devicePixelRatio || 1, this.settings.pixelRatioCap);
    const pixelWidth = Math.max(1, Math.round(width * ratio));
    const pixelHeight = Math.max(1, Math.round(height * ratio));
    if (pixelWidth === this.width && pixelHeight === this.height) return false;
    this.width = pixelWidth;
    this.height = pixelHeight;
    this.renderer.setSize(width, height, false);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    return true;
  }

  resizeTo(width, height) {
    this.fixed = { width, height };
    this.width = 0;
    return this.apply();
  }
}
