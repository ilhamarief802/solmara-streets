// Captures the four shipped screenshots from the deterministic shot rig. Each page is
// loaded at exactly 1280x720 with ?capture=1, which hides the pointer and freezes the
// simulation once window.__SHOT_READY rises; the shutter waits a further 700 ms so the
// HUD has drawn and the last frame is settled. JPEG quality is stepped down until every
// file is comfortably under the 256 KiB cap.
//
//   node serve.ts                 (in another terminal)
//   node tools/capture-shots.mjs
//
// The four names are the ones the dossier reads: 1-cover, 2-chase, 3-mission, 4-night.

import { chromium } from '/home/ilham/.hermes/hermes-agent/node_modules/playwright-core/index.mjs';
import { mkdirSync, readdirSync, rmSync, statSync, unlinkSync } from 'node:fs';

const base = process.env.SOLMARA_URL ?? 'http://localhost:8080';
const executablePath =
  process.env.SOLMARA_CHROME ?? `${process.env.HOME}/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`;
const targets = [
  { shot: 'cover', file: '1-cover.jpg' },
  { shot: 'chase', file: '2-chase.jpg' },
  { shot: 'mission', file: '3-mission.jpg' },
  { shot: 'night', file: '4-night.jpg' },
];
const LIMIT = 262144;

const browser = await chromium.launch({
  headless: true,
  executablePath,
  args: [
    '--no-sandbox',
    '--disable-gpu-sandbox',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--hide-scrollbars',
    '--force-device-scale-factor=1',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
  ],
});
mkdirSync('screenshots', { recursive: true });
// A stale shot from an earlier run would push the set over the four-file cap.
for (const name of readdirSync('screenshots')) {
  if (!targets.some((target) => target.file === name)) unlinkSync(`screenshots/${name}`);
}

const report = [];
for (const target of targets) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  await page.goto(`${base}/?shot=${target.shot}&seed=1&capture=1`, { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(() => window.__SHOT_READY === true, null, { timeout: 60000 });
  await page.waitForTimeout(700);
  const path = `screenshots/${target.file}`;
  let quality = 90;
  await page.screenshot({ path, type: 'jpeg', quality, animations: 'disabled' });
  while (statSync(path).size > LIMIT && quality > 55) {
    quality -= 5;
    await page.screenshot({ path, type: 'jpeg', quality, animations: 'disabled' });
  }
  const info = await page.evaluate(() => ({
    title: document.title,
    ready: window.__SHOT_READY,
    hold: window.__SHOT_HOLD,
    size: [window.innerWidth, window.innerHeight],
    paused: window.__GAME?.loop?.paused,
    counts: window.__GAME?.counts?.(),
  }));
  report.push({ ...target, ...info, bytes: statSync(path).size, quality, errors });
  await page.close();
}
await browser.close();

let failed = false;
for (const row of report) {
  const kib = (row.bytes / 1024).toFixed(1);
  console.log(
    `${row.file.padEnd(14)} ${String(row.bytes).padStart(7)} B  ${kib.padStart(6)} KiB  jpeg q${row.quality}  ` +
      `${row.size[0]}x${row.size[1]}  ready=${row.ready} hold=${row.hold} paused=${row.paused}` +
      `${row.errors.length ? `  ERRORS: ${row.errors.join(' | ')}` : ''}`,
  );
  if (!row.ready || row.errors.length || row.bytes > LIMIT) failed = true;
}
for (const name of readdirSync('screenshots').sort()) {
  console.log(`screenshots/${name}`);
}
if (failed) process.exit(1);
