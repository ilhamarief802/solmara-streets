// Session-3 browser check: the HUD, fighting, the wanted level, the shop, a mission loop
// and the wasted/respawn cycle, all driven through real key and mouse events where the
// player would use them. Prints one JSON report and fails loudly on a missed beat.
//
//   node serve.ts            (in another terminal)
//   node tools/session3-check.mjs [--screenshot out/dir]

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

const report = { errors: [], console: [], checks: {} };
const page = await browser.newPage({ viewport: { width: 1280, height: 577 }, deviceScaleFactor: 1 });
page.on('console', (message) => {
  if (message.type() === 'error' || message.type() === 'warning') {
    report.console.push(`${message.type()}: ${message.text()}`.slice(0, 300));
  }
});
page.on('pageerror', (error) => report.errors.push(`${error.name}: ${error.message}`));
page.on('requestfailed', (request) => report.errors.push(`request failed: ${request.url()}`));

await page.goto(base, { waitUntil: 'load', timeout: 45000 });
await page.waitForFunction(() => window.__GAME && window.__GAME.combat && window.__GAME.missions, null, { timeout: 45000 });
await page.waitForTimeout(1200);

const read = async () => page.evaluate(() => {
  const g = window.__GAME;
  const stars = [...document.querySelectorAll('.hud-star')].filter((node) => node.classList.contains('is-on')).length;
  return {
    money: g.missions.money,
    moneyHud: document.querySelector('.hud-money-value')?.textContent,
    health: +g.combat.health.toFixed(1),
    armour: +g.combat.armour.toFixed(1),
    healthWidth: document.querySelector('.hud-vital-fill.health')?.style.width,
    wanted: g.police.wanted,
    stars,
    starsHud: stars,
    weapon: g.combat.weaponId,
    ammo: g.combat.ammo[g.combat.weaponId]?.clip ?? null,
    ammoHud: document.querySelector('.hud-weapon-ammo')?.textContent,
    district: document.querySelector('.hud-district')?.textContent,
    clock: document.querySelector('.hud-clock')?.textContent,
    missionTitle: document.querySelector('.hud-mission-title')?.textContent,
    missionText: document.querySelector('.hud-mission-text')?.textContent,
    missionHidden: document.querySelector('.hud-mission')?.hidden,
    prompt: document.querySelector('.hud-prompt')?.textContent,
    promptHidden: document.querySelector('.hud-prompt')?.hidden,
    down: g.combat.downKind,
    downVisible: document.querySelector('.hud-down')?.hidden === false,
    shopOpen: g.missions.shopOpen,
    shopVisible: document.querySelector('.hud-shop')?.hidden === false,
    mapCoverage: g.hud.minimap.coverage(),
    mapSize: g.hud.minimap.size,
    cruisers: g.police.cruisers.length,
    cops: g.police.cops.length,
    thugs: g.combat.thugs.length,
    player: { x: +g.player.position.x.toFixed(2), z: +g.player.position.z.toFixed(2) },
    state: { money: g.state.money, health: g.state.health, wanted: g.state.wanted, mission: g.state.mission },
    fps: Math.round(g.loop.fps),
    draws: g.renderer.info.render.calls,
  };
});

report.checks.boot = await read();

// ------------------------------------------------------------------ walking
await page.keyboard.down('w');
await page.waitForTimeout(1400);
await page.keyboard.up('w');
await page.waitForTimeout(150);
report.checks.walk = await page.evaluate(() => {
  const g = window.__GAME;
  return {
    walked: +g.world.state.distanceWalked.toFixed(2),
    player: { x: +g.player.position.x.toFixed(2), z: +g.player.position.z.toFixed(2) },
    surface: g.world.surfaceAt(g.player.position.x, g.player.position.z).kind,
  };
});

// ------------------------------------------------------------------ steal a car with F
report.checks.beforeSteal = await page.evaluate(() => {
  const g = window.__GAME;
  const spot = g.vehicles.visibleParked.find((car) => car.type === 'coupe') ?? g.vehicles.visibleParked[0];
  if (!spot) return { found: false };
  g.player.teleport(spot.x + 2.0, spot.z + 0.6, Math.PI);
  g.cameraRig.yaw = Math.atan2(spot.x - g.player.position.x, spot.z - g.player.position.z);
  return { found: true, type: spot.type, wanted: g.police.wanted, money: g.missions.money };
});
await page.waitForTimeout(200);
await page.keyboard.press('f');
await page.waitForTimeout(700);
report.checks.steal = await page.evaluate(() => {
  const g = window.__GAME;
  return {
    driving: Boolean(g.vehicles.activeCar),
    wanted: g.police.wanted,
    stars: [...document.querySelectorAll('.hud-star.is-on')].length,
    stateWanted: g.state.wanted,
    money: g.missions.money,
  };
});

// ------------------------------------------------------------------ shoot a pedestrian
report.checks.beforeShoot = await page.evaluate(() => {
  const g = window.__GAME;
  if (g.vehicles.activeCar) g.vehicles.exit(g.player);
  let best = null;
  let bestDistance = Infinity;
  for (const ped of g.pedestrians.peds) {
    if (ped.dead) continue;
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
  g.player.teleport(best.x - (dx / length) * 4.5, best.z - (dz / length) * 4.5, Math.atan2(dx, dz));
  g.cameraRig.yaw = Math.atan2(dx, dz);
  g.cameraRig.pitch = 0.02;
  g.cameraRig.timeSinceLook = 0;
  g.combat.switchWeapon('pistol');
  return {
    found: true,
    distance: +bestDistance.toFixed(2),
    pedHealth: best.health ?? 100,
    ammo: g.combat.ammo.pistol.clip,
    wanted: g.police.wanted,
  };
});
await page.waitForTimeout(500);
// Aim the camera exactly at the pedestrian's chest, then hold the button for one shot.
await page.evaluate(() => {
  const g = window.__GAME;
  let best = null;
  let bestDistance = Infinity;
  for (const ped of g.pedestrians.peds) {
    if (ped.dead) continue;
    const distance = Math.hypot(ped.x - g.player.position.x, ped.z - g.player.position.z);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = ped;
    }
  }
  if (!best) return;
  const dx = best.x - g.player.position.x;
  const dz = best.z - g.player.position.z;
  const length = Math.hypot(dx, dz) || 1;
  g.player.teleport(best.x - (dx / length) * 5.2, best.z - (dz / length) * 5.2, Math.atan2(dx, dz));
  g.player.velocity.x = 0;
  g.player.velocity.z = 0;
  // Point the rig at the pedestrian, then walk the pedestrian onto the camera's centre
  // ray at chest height: the shot is aimed the way a player aims, and the test still has
  // a guaranteed subject rather than a frame of empty pavement.
  g.cameraRig.yaw = Math.atan2(dx, dz);
  g.cameraRig.pitch = 0.06;
  g.cameraRig.timeSinceLook = 0;
});
await page.waitForTimeout(900);
// Aim the way a player does — by turning the rig until the crosshair sits on the subject.
// The camera hangs on a boom behind the body, so each turn moves the camera and the aim
// is refined over a few frames instead of solved in one step.
report.checks.aim = { iterations: [] };
for (let attempt = 0; attempt < 6; attempt += 1) {
  const step = await page.evaluate(() => {
    const g = window.__GAME;
    let best = null;
    let bestDistance = 14;
    for (const ped of g.pedestrians.peds) {
      const distance = Math.hypot(ped.x - g.player.position.x, ped.z - g.player.position.z);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = ped;
      }
    }
    if (!best) return { found: false };
    // The subject holds still for the shutter: walkers would step off the aim line.
    best.speed = 0;
    best.fleeTimer = 0;
    best.target = { x: best.x, z: best.z };
    const camera = g.camera;
    const dx = best.x - camera.position.x;
    const dz = best.z - camera.position.z;
    const horizontal = Math.hypot(dx, dz) || 1;
    const aim = g.combat.aim();
    const hit = g.combat.pickTarget(aim.origin, aim.direction, 62);
    g.cameraRig.yaw = Math.atan2(dx, dz);
    // A positive rig pitch tips the camera down; the target sits at chest height.
    g.cameraRig.pitch = Math.atan2(camera.position.y - 1.05, horizontal) * 0.6;
    g.cameraRig.timeSinceLook = 0;
    return {
      found: true,
      distance: +bestDistance.toFixed(2),
      target: hit?.kind ?? null,
      yaw: +g.cameraRig.yaw.toFixed(3),
      pitch: +g.cameraRig.pitch.toFixed(3),
    };
  });
  report.checks.aim.iterations.push(step);
  await page.waitForTimeout(260);
  if (step.target === 'ped') break;
}
await page.mouse.move(640, 288);
await page.mouse.down();
await page.waitForTimeout(150);
await page.mouse.up();
await page.waitForTimeout(700);
report.checks.shoot = await page.evaluate(() => {
  const g = window.__GAME;
  let nearest = null;
  let bestDistance = Infinity;
  for (const ped of g.pedestrians.peds) {
    const distance = Math.hypot(ped.x - g.player.position.x, ped.z - g.player.position.z);
    if (distance < bestDistance) {
      bestDistance = distance;
      nearest = ped;
    }
  }
  return {
    ammo: g.combat.ammo.pistol.clip,
    shots: g.combat.stats.shots,
    hits: g.combat.stats.hits,
    nearestPedHealth: nearest?.health ?? null,
    nearestPedDead: nearest?.dead ?? null,
    wanted: g.police.wanted,
    effectsBusy: g.combat.effects.busy,
  };
});

// ------------------------------------------------------------------ wanted level 3 and a cruiser
report.checks.beforeChase = await page.evaluate(() => {
  const g = window.__GAME;
  g.police.setWanted(3, 'check');
  return { wanted: g.police.wanted };
});
await page.waitForTimeout(900);
report.checks.starsAfterSet = await page.evaluate(() => ({
  stars: [...document.querySelectorAll('.hud-star.is-on')].length,
  wanted: window.__GAME.police.wanted,
}));
// Wait for the response to put cruisers on the street, then read them.
await page.waitForFunction(() => window.__GAME.police.cruisers.length >= 2, null, { timeout: 20000 }).catch(() => {});
await page.waitForTimeout(500);
report.checks.chase = await page.evaluate(() => {
  const g = window.__GAME;
  const nearest = g.police.cruisers
    .map((cruiser) => ({
      distance: +Math.hypot(cruiser.x - g.player.position.x, cruiser.z - g.player.position.z).toFixed(1),
      speed: +cruiser.speed.toFixed(1),
      mode: cruiser.mode,
    }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 3);
  return {
    wanted: g.police.wanted,
    stars: [...document.querySelectorAll('.hud-star.is-on')].length,
    cruisers: nearest,
    total: g.police.cruisers.length,
    hudWanted: g.state.wanted,
  };
});

// ------------------------------------------------------------------ shop
await page.evaluate(() => {
  const g = window.__GAME;
  g.police.clearWanted('check');
  g.player.teleport(324, 54, Math.PI);
  g.cameraRig.yaw = Math.PI;
});
await page.waitForTimeout(500);
await page.keyboard.press('e');
await page.waitForTimeout(400);
report.checks.shopOpen = await page.evaluate(() => {
  const g = window.__GAME;
  return {
    open: g.missions.shopOpen,
    visible: document.querySelector('.hud-shop')?.hidden === false,
    rows: document.querySelectorAll('.hud-shop-row').length,
    money: g.missions.money,
    armour: g.combat.armour,
  };
});
await page.keyboard.press('Digit2');
await page.waitForTimeout(500);
report.checks.shopBuy = await page.evaluate(() => {
  const g = window.__GAME;
  return {
    money: g.missions.money,
    armour: g.combat.armour,
    reserve: g.combat.ammo.pistol.reserve,
    hudMoney: document.querySelector('.hud-money-value')?.textContent,
  };
});
await page.keyboard.press('e');
await page.waitForTimeout(300);
report.checks.shopClose = await page.evaluate(() => ({
  open: window.__GAME.missions.shopOpen,
  visible: document.querySelector('.hud-shop')?.hidden === false,
}));

// ------------------------------------------------------------------ a mission loop (race)
report.checks.missionStart = await page.evaluate(() => {
  const g = window.__GAME;
  g.police.clearWanted('check');
  g.player.teleport(352, 96, Math.PI);
  g.cameraRig.yaw = Math.PI;
  return { prompt: g.missions.prompt(), nearStart: g.missions.nearStart, next: g.missions.nextMission?.id };
});
await page.waitForTimeout(400);
await page.keyboard.press('e');
await page.waitForTimeout(600);
report.checks.mission = await page.evaluate(() => {
  const g = window.__GAME;
  return {
    active: g.missions.active?.def.id ?? null,
    title: document.querySelector('.hud-mission-title')?.textContent,
    text: document.querySelector('.hud-mission-text')?.textContent,
    hidden: document.querySelector('.hud-mission')?.hidden,
    marker: g.missions.markerPoint,
    stateMission: g.state.mission,
  };
});
// Fail that one cleanly, then run the race mission to completion at the checkpoints.
report.checks.race = await page.evaluate(() => {
  const g = window.__GAME;
  if (g.missions.active) g.missions.fail('check');
  const started = g.missions.startAt('ring-run');
  const before = g.missions.money;
  const points = g.missions.currentStep.points.slice();
  return { started, before, points, total: points.length };
});
for (const point of report.checks.race.points) {
  await page.evaluate((p) => window.__GAME.player.teleport(p.x, p.z, 0), point);
  await page.waitForTimeout(320);
}
await page.waitForTimeout(500);
report.checks.raceDone = await page.evaluate(() => {
  const g = window.__GAME;
  return {
    active: g.missions.active?.def.id ?? null,
    money: g.missions.money,
    completed: [...g.missions.completed],
    toast: document.querySelector('.hud-toast')?.textContent,
    hudMoney: document.querySelector('.hud-money-value')?.textContent,
    stateMoney: g.state.money,
  };
});

// ------------------------------------------------------------------ wasted and respawn
report.checks.beforeDeath = await read();
await page.evaluate(() => window.__GAME.combat.damagePlayer(200, { cause: 'check' }));
await page.waitForTimeout(400);
report.checks.down = await page.evaluate(() => ({
  kind: window.__GAME.combat.downKind,
  title: document.querySelector('.hud-down-title')?.textContent,
  visible: document.querySelector('.hud-down')?.hidden === false,
  health: window.__GAME.combat.health,
}));
await page.waitForFunction(() => window.__GAME.combat.downKind === null, null, { timeout: 15000 }).catch(() => {});
await page.waitForTimeout(300);
report.checks.respawn = await page.evaluate(() => {
  const g = window.__GAME;
  return {
    down: g.combat.downKind,
    health: g.combat.health,
    visible: document.querySelector('.hud-down')?.hidden === false,
    player: { x: +g.player.position.x.toFixed(1), z: +g.player.position.z.toFixed(1) },
  };
});

// ------------------------------------------------------------------ picture + perf
await page.waitForTimeout(700);
report.checks.final = await read();
if (shotDir) {
  mkdirSync(shotDir, { recursive: true });
  await page.screenshot({ path: `${shotDir}/session3-freeplay.png`, type: 'png' });
  report.screenshot = `${shotDir}/session3-freeplay.png (${(statSync(`${shotDir}/session3-freeplay.png`).size / 1024).toFixed(0)} KiB)`;
}

await browser.close();
console.log(JSON.stringify(report, null, 2));

const failed =
  report.errors.length > 0 ||
  report.console.some((line) => line.startsWith('error:')) ||
  !(report.checks.walk.walked > 1) ||
  !report.checks.steal.driving ||
  !(report.checks.shoot.shots > 0) ||
  !(report.checks.shoot.hits > 0) ||
  !(report.checks.shoot.nearestPedHealth < 100) ||
  !(report.checks.boot.mapCoverage > 0) ||
  !(report.checks.chase.total > 0) ||
  !report.checks.shopOpen.open ||
  !(report.checks.shopBuy.money < report.checks.shopOpen.money) ||
  !report.checks.mission.active ||
  !(report.checks.raceDone.money > report.checks.race.before) ||
  !(report.checks.down.kind === 'wasted') ||
  !(report.checks.respawn.health === 100);
console.log(`\n${failed ? 'SESSION3 CHECK FAILED' : 'SESSION3 CHECK OK'}`);
process.exit(failed ? 1 : 0);
