// Playtest for the player/vehicle session. Opens the entry in headless Chromium at
// 1280x577, checks the console, walks the player with a real held W key, steals the parked
// coupe with F, drives it, steps out, and then poses the drive and street shots and checks
// that their subjects are actually inside the frame. Prints one JSON report.
//
//   node serve.ts            (in another terminal)
//   node tools/playtest.mjs [--screenshot out/dir]

import { chromium } from '/home/ilham/.hermes/hermes-agent/node_modules/playwright-core/index.mjs';
import { mkdirSync, statSync } from 'node:fs';

const args = process.argv.slice(2);
const shotIndex = args.indexOf('--screenshot');
const shotDir = shotIndex !== -1 ? args[shotIndex + 1] : null;
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

const report = { errors: [], console: [] };

async function open(path) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 577 }, deviceScaleFactor: 1 });
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') {
      report.console.push(`${message.type()}: ${message.text()}`.slice(0, 300));
    }
  });
  page.on('pageerror', (error) => report.errors.push(`${error.name}: ${error.message}`));
  page.on('requestfailed', (request) => report.errors.push(`request failed: ${request.url()}`));
  await page.goto(`${base}${path}`, { waitUntil: 'load', timeout: 45000 });
  await page.waitForFunction(() => window.__GAME && window.__GAME.player, null, { timeout: 45000 });
  await page.waitForTimeout(900);
  return page;
}

/** Projects a world point into the 1280x577 canvas, for composition checks. */
const projectSnippet = `(point) => {
  const g = window.__GAME;
  const camera = g.camera;
  const v = new THREE.Vector3(point.x, point.y, point.z);
  camera.updateMatrixWorld();
  v.project(camera);
  return { x: Math.round((v.x * 0.5 + 0.5) * 1280), y: Math.round((-v.y * 0.5 + 0.5) * 577), depth: Number(v.z.toFixed(3)), inFrame: v.z > -1 && v.z < 1 && Math.abs(v.x) < 1 && Math.abs(v.y) < 1 };
}`;

// ---------------------------------------------------------------- free play
{
  const page = await open('/');
  report.boot = await page.evaluate(() => {
    const g = window.__GAME;
    return {
      title: document.title,
      traffic: g.traffic.cars.length,
      peds: g.pedestrians.peds.length,
      parkedNear: g.vehicles.visibleParked.length,
      fleet: g.vehicles.fleet.drawn,
      player: { x: +g.player.position.x.toFixed(2), y: +g.player.position.y.toFixed(2), z: +g.player.position.z.toFixed(2) },
      surface: g.world.surfaceAt(g.player.position.x, g.player.position.z),
      draws: g.renderer.info.render.calls,
      triangles: g.renderer.info.render.triangles,
      fps: Math.round(g.loop.fps),
    };
  });

  // Walk north for 1.6 s with W held.
  const before = await page.evaluate(() => ({ ...window.__GAME.player.position }));
  await page.keyboard.down('w');
  await page.waitForTimeout(1600);
  await page.keyboard.up('w');
  const after = await page.evaluate(() => ({
    ...window.__GAME.player.position,
    speed: window.__GAME.player.speed,
    heading: window.__GAME.player.heading,
    grounded: window.__GAME.player.grounded,
    walked: window.__GAME.world.state.distanceWalked,
  }));
  report.walk = {
    before: { x: +before.x.toFixed(2), z: +before.z.toFixed(2) },
    after: { x: +after.x.toFixed(2), z: +after.z.toFixed(2) },
    metres: +Math.hypot(after.x - before.x, after.z - before.z).toFixed(2),
    speed: +after.speed.toFixed(2),
    grounded: after.grounded,
  };

  // Jump: Space, then sample the greatest height over the next half second.
  await page.keyboard.press('Space');
  let jumpPeak = 0;
  for (let sample = 0; sample < 8; sample += 1) {
    await page.waitForTimeout(70);
    const height = await page.evaluate(() => window.__GAME.player.position.y - window.__GAME.world.surfaceAt(window.__GAME.player.position.x, window.__GAME.player.position.z).y);
    jumpPeak = Math.max(jumpPeak, height);
  }
  report.jumpPeak = +jumpPeak.toFixed(2);
  await page.waitForTimeout(700);

  // Sprint at the nearest pedestrian: the crowd should scatter.
  report.flee = await page.evaluate(() => {
    const g = window.__GAME;
    let best = null;
    let bestDistance = Infinity;
    for (const ped of g.pedestrians.peds) {
      const distance = Math.hypot(ped.x - g.player.position.x, ped.z - g.player.position.z);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = ped;
      }
    }
    if (!best) return { found: false };
    const dx = best.x - g.player.position.x;
    const dz = best.z - g.player.position.z;
    const length = Math.hypot(dx, dz) || 1;
    g.player.teleport(best.x - (dx / length) * 4, best.z - (dz / length) * 4, Math.atan2(dx, dz));
    g.cameraRig.yaw = Math.atan2(dx, dz);
    return { found: true, distance: +bestDistance.toFixed(1) };
  });
  await page.keyboard.down('Shift');
  await page.keyboard.down('w');
  await page.waitForTimeout(1600);
  await page.keyboard.up('w');
  await page.keyboard.up('Shift');
  report.flee.running = await page.evaluate(() => window.__GAME.pedestrians.peds.filter((ped) => ped.fleeTimer > 0).length);
  report.flee.playerSpeed = await page.evaluate(() => +window.__GAME.player.speed.toFixed(2));

  // Sneak up to the parked coupe and press F.
  report.steal = await page.evaluate(() => {
    const g = window.__GAME;
    const spot = g.vehicles.visibleParked.find((car) => car.type === 'coupe') ?? g.vehicles.visibleParked[0];
    if (!spot) return { found: false };
    g.player.teleport(spot.x + 2.2, spot.z + 0.4, Math.PI);
    g.cameraRig.yaw = 0.4;
    return { found: true, x: spot.x, z: spot.z, type: spot.type, prompt: g.vehicles.prompt() };
  });
  await page.waitForTimeout(150);
  await page.keyboard.press('f');
  await page.waitForTimeout(300);
  report.afterF = await page.evaluate(() => {
    const g = window.__GAME;
    return {
      driving: Boolean(g.vehicles.activeCar),
      car: g.vehicles.activeCar && {
        type: g.vehicles.activeCar.type,
        x: +g.vehicles.activeCar.x.toFixed(2),
        z: +g.vehicles.activeCar.z.toFixed(2),
        speed: +g.vehicles.activeCar.speed.toFixed(2),
      },
      playerMode: g.player.mode,
      hud: document.querySelector('.hud-mode-label')?.textContent,
      state: { ...g.world.state },
    };
  });

  // Drive forward for 1.5 s.
  const carBefore = await page.evaluate(() => ({ x: window.__GAME.vehicles.activeCar?.x ?? 0, z: window.__GAME.vehicles.activeCar?.z ?? 0 }));
  await page.keyboard.down('w');
  await page.waitForTimeout(2600);
  await page.keyboard.up('w');
  const carAfter = await page.evaluate(() => ({
    x: window.__GAME.vehicles.activeCar?.x ?? 0,
    z: window.__GAME.vehicles.activeCar?.z ?? 0,
    speed: window.__GAME.vehicles.activeCar?.speed ?? 0,
    surface: window.__GAME.vehicles.activeCar?.surface,
    hudSpeed: document.querySelector('.hud-speed-value')?.textContent,
  }));
  report.freeDrive = {
    metres: +Math.hypot(carAfter.x - carBefore.x, carAfter.z - carBefore.z).toFixed(2),
    speed: +carAfter.speed.toFixed(2),
    surface: carAfter.surface,
    hudSpeed: carAfter.hudSpeed,
  };

  // Steer left and handbrake for a moment, then step out.
  await page.keyboard.down('a');
  await page.waitForTimeout(500);
  await page.keyboard.up('a');
  await page.keyboard.press('f');
  await page.waitForTimeout(300);
  report.exit = await page.evaluate(() => {
    const g = window.__GAME;
    return {
      driving: Boolean(g.vehicles.activeCar),
      mode: g.player.mode,
      surface: g.world.surfaceAt(g.player.position.x, g.player.position.z).kind,
      player: { x: +g.player.position.x.toFixed(2), z: +g.player.position.z.toFixed(2) },
      parkedNear: g.vehicles.visibleParked.length,
    };
  });

  // V toggles the close camera.
  await page.keyboard.press('v');
  await page.waitForTimeout(250);
  report.firstPerson = await page.evaluate(() => window.__GAME.cameraRig.firstPerson);
  await page.keyboard.press('v');

  // Steady-state frame rate with everything alive.
  await page.waitForTimeout(1200);
  report.perf = await page.evaluate(() => ({
    fps: Math.round(window.__GAME.loop.fps),
    draws: window.__GAME.renderer.info.render.calls,
    triangles: window.__GAME.renderer.info.render.triangles,
    traffic: window.__GAME.traffic.cars.length,
    peds: window.__GAME.pedestrians.peds.length,
  }));

  if (shotDir) {
    mkdirSync(shotDir, { recursive: true });
    await page.screenshot({ path: `${shotDir}/play-foot.png`, type: 'png' });
  }
  await page.close();
}

// ---------------------------------------------------------------- the two new shots
for (const name of ['drive', 'street']) {
  const page = await open(`/?shot=${name}&seed=1`);
  await page.waitForFunction(() => window.__SHOT_READY === true, null, { timeout: 25000 });
  await page.waitForTimeout(400);
  const shot = await page.evaluate((snippet) => {
    const g = window.__GAME;
    const project = eval(snippet);
    const player = g.player;
    const car = g.vehicles.activeCar;
    const subject = car ? { x: car.x, y: car.y + 0.7, z: car.z } : { x: player.position.x, y: player.position.y + 1, z: player.position.z };
    let nearestPed = null;
    let bestPed = Infinity;
    for (const ped of g.pedestrians.peds) {
      const d = Math.hypot(ped.x - player.position.x, ped.z - player.position.z);
      if (d < bestPed) {
        bestPed = d;
        nearestPed = ped;
      }
    }
    let nearestCar = null;
    let bestCar = Infinity;
    let carInFrame = 0;
    let nearestInFrame = null;
    for (const trafficCar of g.traffic.cars) {
      const d = Math.hypot(trafficCar.x - player.position.x, trafficCar.z - player.position.z);
      if (d < bestCar) {
        bestCar = d;
        nearestCar = trafficCar;
      }
      const screen = project({ x: trafficCar.x, y: trafficCar.y + 0.7, z: trafficCar.z });
      if (screen.inFrame) {
        carInFrame += 1;
        if (!nearestInFrame || d < nearestInFrame.metres) nearestInFrame = { metres: +d.toFixed(1), screen };
      }
    }
    const feet = project({ x: player.position.x, y: player.position.y, z: player.position.z });
    const head = project({ x: player.position.x, y: player.position.y + 1.85, z: player.position.z });
    return {
      title: document.title,
      ready: window.__SHOT_READY,
      name: window.__SHOT_NAME,
      driving: Boolean(car),
      subject: project(subject),
      playerScreen: project({ x: player.position.x, y: player.position.y + 1, z: player.position.z }),
      camera: [+g.camera.position.x.toFixed(1), +g.camera.position.y.toFixed(1), +g.camera.position.z.toFixed(1)],
      cameraDistance: +Math.hypot(g.camera.position.x - subject.x, g.camera.position.z - subject.z).toFixed(2),
      nearestPed: nearestPed && { metres: +bestPed.toFixed(1), screen: project({ x: nearestPed.x, y: 1, z: nearestPed.z }) },
      nearestTraffic: nearestCar && { metres: +bestCar.toFixed(1), screen: project({ x: nearestCar.x, y: 1, z: nearestCar.z }) },
      carsInFrame: carInFrame,
      nearestInFrame,
      playerHeightPx: Math.abs(head.y - feet.y),
      counts: g.counts(),
      hud: {
        district: document.querySelector('.hud-district')?.textContent,
        mode: document.querySelector('.hud-mode-label')?.textContent,
        speed: document.querySelector('.hud-speed-value')?.textContent,
        visible: document.querySelector('.hud') !== null,
      },
      fps: Math.round(g.loop.fps),
      draws: g.renderer.info.render.calls,
    };
  }, projectSnippet);
  if (shotDir) {
    await page.screenshot({ path: `${shotDir}/shot-${name}.png`, type: 'png' });
    shot.screenshot = `${shotDir}/shot-${name}.png (${(statSync(`${shotDir}/shot-${name}.png`).size / 1024).toFixed(0)} KiB)`;
  }
  report[name] = shot;
  await page.close();
}

await browser.close();
console.log(JSON.stringify(report, null, 2));
let failed = report.errors.length > 0 || report.console.some((line) => line.startsWith('error:'));
if (report.boot) {
  if (!(report.boot.traffic >= 20 && report.boot.traffic <= 40)) failed = true;
  if (!(report.boot.peds >= 20 && report.boot.peds <= 40)) failed = true;
  if (!(report.walk.metres > 2)) failed = true;
}
if (report.freeDrive && !(report.freeDrive.metres > 1.5)) failed = true;
for (const name of ['drive', 'street']) {
  if (!report[name]?.ready) failed = true;
}
console.log(`\n${failed ? 'PLAYTEST FAILED' : 'PLAYTEST OK'}`);
process.exit(failed ? 1 : 0);
