// Opens each shipped shot with ?capture=1, waits for the rig, and reports console errors,
// pixel statistics and the frame time. Writes a PNG into out/verify so a human can look.
// This is the audit behind the final screenshot capture, not the capture itself.

import { chromium } from '/home/ilham/.hermes/hermes-agent/node_modules/playwright-core/index.mjs';
import { mkdirSync } from 'node:fs';

const base = process.env.SOLMARA_URL ?? 'http://localhost:8080';
const executablePath =
  process.env.SOLMARA_CHROME ?? `${process.env.HOME}/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`;
const shots = process.argv.slice(2).length ? process.argv.slice(2) : ['cover', 'chase', 'mission', 'night'];
mkdirSync('out/verify', { recursive: true });

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

for (const shot of shots) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  await page.goto(`${base}/?shot=${shot}&seed=1&capture=1`, { waitUntil: 'load', timeout: 60000 });
  try {
    await page.waitForFunction(() => window.__SHOT_READY === true, null, { timeout: 60000 });
  } catch {
    errors.push('TIMEOUT waiting for __SHOT_READY');
  }
  await page.waitForTimeout(700);
  const state = await page.evaluate(() => {
    const game = window.__GAME;
    const canvas = document.getElementById('viewport');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    const pixels = new Uint8Array(64 * 36 * 4);
    if (gl) gl.readPixels(0, 0, 64, 36, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    let sum = 0;
    let nonBlack = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      const v = pixels[i] + pixels[i + 1] + pixels[i + 2];
      sum += v;
      if (v > 24) nonBlack += 1;
    }
    return {
      title: document.title,
      ready: window.__SHOT_READY,
      hold: window.__SHOT_HOLD,
      paused: game?.loop?.paused,
      car: Boolean(game?.vehicles?.activeCar),
      wanted: game?.police?.wanted,
      mission: game?.missions?.active?.def?.id ?? null,
      objective: game?.missions?.objective?.text ?? null,
      counts: game?.counts?.(),
      menu: game?.menus?.screen ?? null,
      glMean: sum / (pixels.length / 4) / 3,
      glNonBlackPct: Math.round((nonBlack / (pixels.length / 4)) * 100),
    };
  });
  await page.screenshot({ path: `out/verify/audit-${shot}.png`, type: 'png' });
  // 120-frame frame time with the traffic and crowd live. Measuring at 1280x720.
  const timing = await page.evaluate(
    (frameCount) =>
      new Promise((resolve) => {
        const samples = [];
        let last = performance.now();
        let remaining = frameCount;
        const tick = (now) => {
          samples.push(now - last);
          last = now;
          remaining -= 1;
          if (remaining > 0) requestAnimationFrame(tick);
          else {
            const sorted = samples.slice(5).sort((a, b) => a - b);
            const mean = sorted.reduce((s, v) => s + v, 0) / sorted.length;
            resolve({
              meanMs: Number(mean.toFixed(2)),
              medianMs: Number(sorted[Math.floor(sorted.length / 2)].toFixed(2)),
              p95Ms: Number(sorted[Math.floor(sorted.length * 0.95)].toFixed(2)),
              fps: Number((1000 / mean).toFixed(1)),
              frames: sorted.length,
            });
          }
        };
        requestAnimationFrame(tick);
      }),
    Number(process.env.SOLMARA_AUDIT_FRAMES ?? 120),
  );
  console.log(
    JSON.stringify({ shot, ...state, timing, errors }, null, 2),
  );
  await page.close();
}
await browser.close();
