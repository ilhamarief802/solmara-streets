// WebGL renderer setup. One canvas, sRGB output, ACES tone mapping, a pixel ratio cap
// and a resize handler that keeps the drawing buffer in step with the window. Shadow
// maps stay off unless the quality preset explicitly allows them; nothing else in the
// render path costs a second pass.

/**
 * Probes the renderer string on a throwaway context. Software rasterisers (SwiftShader,
 * llvmpipe) need a smaller drawing buffer and no MSAA to stay playable, and knowing that
 * before the real context exists is the only way to skip antialiasing at construction.
 */
function detectSoftwareRenderer() {
  try {
    const probe = document.createElement('canvas');
    probe.width = 8;
    probe.height = 8;
    const gl = probe.getContext('webgl2') || probe.getContext('webgl');
    if (!gl) return true;
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    const name = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : '';
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /swiftshader|llvmpipe|software|softpipe|mesa offscreen/i.test(name);
  } catch {
    return false;
  }
}

export function createRenderer(canvas, settings) {
  // A shot may render at 0.85 on software for a cleaner capture; normal play drops to
  // 0.55 so a CPU rasteriser can still hold a useful frame rate.
  const software = detectSoftwareRenderer();
  if (software) {
    settings.software = true;
    settings.pixelRatioCap = Math.min(settings.pixelRatioCap, 1);
    settings.renderScale = Math.min(settings.renderScale, settings.shot ? 0.85 : 0.55);
  }

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: !software,
    alpha: false,
    powerPreference: 'high-performance',
    stencil: false,
    depth: true,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, settings.pixelRatioCap) * settings.renderScale);
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = Boolean(settings.shadows);
  if (renderer.shadowMap.enabled) renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.autoClear = true;
  renderer.setClearColor(0x0a0d14, 1);
  if (!renderer.userData) renderer.userData = {};
  renderer.userData.software = software;

  const resize = () => {
    const width = Math.max(320, window.innerWidth);
    const height = Math.max(240, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, settings.pixelRatioCap) * settings.renderScale);
    renderer.setSize(width, height, false);
    const camera = renderer.userData.camera;
    if (camera) {
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    }
  };
  window.addEventListener('resize', resize);
  renderer.userData.resize = resize;
  return renderer;
}

export function setExposure(renderer, exposure) {
  // Only touch the renderer when it would actually change: this runs every frame.
  if (Math.abs(renderer.toneMappingExposure - exposure) > 0.002) renderer.toneMappingExposure = exposure;
}

/** Renderer.info in the shape the perf overlay and the smoke test print. */
export function drawnTriangles(renderer) {
  const info = renderer.info;
  const render = info?.render ?? {};
  const memory = info?.memory ?? {};
  return {
    calls: render.calls,
    triangles: render.triangles,
    geometries: memory.geometries,
    textures: memory.textures,
  };
}
