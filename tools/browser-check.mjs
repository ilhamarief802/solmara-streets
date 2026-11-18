// Browser verification for Solmara. Opens the entry in headless Chromium at 1280x577,
// collects every console message and page error, inspects window.__GAME and the shot
// readiness flag, and prints a compact report. Run with the static server already up:
//   node serve.ts            (in another terminal)
//   node tools/browser-check.mjs [--shots] [--screenshot out/dir]

import { chromium } from '/home/ilham/.hermes/hermes-agent/node_modules/playwright-core/index.mjs';
import { mkdirSync, statSync } from 'node:fs';

const args = process.argv.slice(2);
const withShots = args.includes('--shots');
const screenshotIndex = args.indexOf('--screenshot');
const screenshotDir = screenshotIndex !== -1 ? args[screenshotIndex + 1] : null;
const base = process.env.SOLMARA_URL ?? 'http://localhost:8080';
const executablePath = process.env.SOLMARA_CHROME ?? `${process.env.HOME}/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`;

const browser = await chromium.launch({
  headless: true,
  executablePath,
  args: [
    '--no-sandbox',
    '--disable-gpu-sandbox',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--hide-scrollbars',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
  ],
});

const results = [];

async function inspect(path, { waitForShot = false, screenshot = null } = {}) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 577 }, deviceScaleFactor: 1 });
  const consoleMessages = [];
  const errors = [];
  page.on('console', (message) => {
    const entry = { type: message.type(), text: message.text() };
    consoleMessages.push(entry);
    if (entry.type === 'error') errors.push(entry.text);
  });
  page.on('pageerror', (error) => errors.push(`${error.name}: ${error.message}`));
  page.on('requestfailed', (request) => errors.push(`request failed: ${request.url()} ${request.failure()?.errorText}`));
  const external = [];
  page.on('request', (request) => {
    const url = request.url();
    if (!url.startsWith(base) && !url.startsWith('data:')) external.push(url);
  });

  const url = `${base}${path.startsWith('/') ? path : `/${path}`}`;
  await page.goto(url, { waitUntil: 'load', timeout: 45000 });
  await page.waitForFunction(() => window.__GAME && window.__GAME.world && window.__GAME.world.roadGraph, null, { timeout: 45000 });
  await page.waitForTimeout(1200);

  if (waitForShot) {
    try {
      await page.waitForFunction(() => window.__SHOT_READY === true, null, { timeout: 20000 });
    } catch {
      errors.push('shot never became ready (window.__SHOT_READY stayed false)');
    }
    await page.waitForTimeout(400);
  }

  const stats = await page.evaluate(() => {
    const g = window.__GAME;
    const info = g.renderer.info;
    return {
      title: document.title,
      shotReady: window.__SHOT_READY,
      shotName: window.__SHOT_NAME ?? null,
      sceneChildren: g.scene.children.length,
      worldChildren: g.world.group.children.length,
      nodeCount: g.world.roadGraph.nodes.length,
      edgeCount: g.world.roadGraph.edges.length,
      laneCount: g.world.roadGraph.lanes.length,
      buildings: g.world.stats.buildings,
      props: g.world.stats.props,
      colliders: g.world.stats.colliders,
      triangles: g.world.stats.triangles,
      textures: g.world.stats.textures,
      drawCalls: info.render.calls,
      renderedTriangles: info.render.triangles,
      camera: [g.camera.position.x, g.camera.position.y, g.camera.position.z].map((n) => Math.round(n)),
      hour: g.clock.label,
      phase: g.clock.phase.id,
      district: g.world.districtAt(g.camera.position.x, g.camera.position.z),
      windowErrors: (window.__SOLMARA_ERRORS ?? []).length,
      errorOverlayVisible: document.getElementById('error-overlay')?.hidden === false,
      bootHidden: document.getElementById('boot')?.hidden === true || document.getElementById('boot')?.classList.contains('is-hidden'),
      fps: Math.round(g.loop.fps),
      frames: g.loop.frames,
      updates: g.loop.updates,
      buildMs: g.world.stats.buildMs,
    };
  });

  if (screenshot) {
    mkdirSync(screenshot.split('/').slice(0, -1).join('/') || '.', { recursive: true });
    await page.screenshot({ path: screenshot, type: 'png' });
    stats.screenshot = `${screenshot} (${(statSync(screenshot).size / 1024).toFixed(0)} KiB)`;
  }

  // The pause switch and the time skip, exercised through real key events.
  if (!waitForShot) {
    await page.keyboard.press('p');
    await page.waitForTimeout(250);
    stats.paused = await page.evaluate(() => window.__GAME?.loop?.paused === true);
    const before = await page.evaluate(() => window.__GAME?.clock?.hour ?? 0);
    await page.keyboard.press('t');
    await page.waitForTimeout(250);
    const after = await page.evaluate(() => window.__GAME?.clock?.hour ?? 0);
    stats.timeSkip = Math.abs(after - before - 1) < 0.02;
    await page.keyboard.press('p');
  }

  await page.close();
  const relevant = consoleMessages.filter((m) => m.type === 'error' || m.type === 'warning').map((m) => `${m.type}: ${m.text}`);
  results.push({ path, url, stats, errors, external, console: relevant });
  return stats;
}

const boot = await inspect('/', { screenshot: screenshotDir ? `${screenshotDir}/smoke-boot.png` : null });
if (withShots) {
  await inspect('?shot=cover&seed=1', { waitForShot: true, screenshot: screenshotDir ? `${screenshotDir}/smoke-cover.png` : null });
  await inspect('?shot=night&seed=1', { waitForShot: true, screenshot: screenshotDir ? `${screenshotDir}/smoke-night.png` : null });
}

await browser.close();

console.log(JSON.stringify(results, null, 2));
const failed = results.some((r) => r.errors.length || r.external.length || r.stats.errorOverlayVisible || r.stats.windowErrors > 0 || r.stats.nodeCount <= 100 || r.stats.paused === false || r.stats.timeSkip === false);
console.log(`\n${failed ? 'VERIFY FAILED' : 'VERIFY OK'}`);
if (!withShots && !boot.shotReady) console.log('note: normal boot, no shot expected');
process.exit(failed ? 1 : 0);
