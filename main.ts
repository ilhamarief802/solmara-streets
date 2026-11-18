// Solmara Streets: a make.fun gta6-01 entry. The game is this directory's game/
// folder: plain static files a desktop browser loads with no build step, no network
// request and no runtime dependency beyond the three.js build vendored beside them.
// This program checks that the entry is intact, copies game/ and screenshots/ beside
// itself to /output, and writes /output/dossier.json, the summary the judge reads,
// using the vendored make.fun library.
//
// Serve it locally with `node serve.ts`, then open http://localhost:8080.
// Screenshots come from the deterministic shot rig: `?shot=cover&seed=1` and
// `?shot=night&seed=1`, both of which raise window.__SHOT_READY once warm.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier, readGameTree } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
const gameDir = join(here, 'game');
const indexPath = join(gameDir, 'index.html');
const threePath = join(gameDir, 'vendor', 'three.min.js');
const mainModulePath = join(gameDir, 'src', 'main.js');

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the bytes; the others refuse an entry the
// scorer would refuse (more than 4 screenshots or one over 256 KiB; more than 993 files in game/ or 48 MiB of game
// files, in all, or a path under game/ over 1000 bytes: game/ counts beside /output's own 1000-entry cap, its
// screenshots/ and dossier.json).
const CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

function kib(bytes) {
  return `${(bytes / 1024).toFixed(1)} KiB`;
}

function mib(bytes) {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
}

/** Fails the build with a message a human can act on. */
function fail(problems) {
  process.stderr.write('solmara: entry is not buildable:\n');
  for (const problem of problems) {
    process.stderr.write(`  - ${problem.what}: ${problem.why}\n`);
    process.stderr.write(`    fix: ${problem.fix}\n`);
  }
  process.exit(1);
}

// ------------------------------------------------------------------ preflight
// An entry that cannot boot is worse than no entry, so the two files the page cannot
// do without are checked before anything is copied.
const problems = [];
const required = [
  {
    path: indexPath,
    what: 'game/index.html is missing',
    fix: 'restore the entry page; it must reference ./vendor/three.min.js and ./src/main.js with relative paths',
  },
  {
    path: threePath,
    what: 'game/vendor/three.min.js is missing',
    fix: 'curl -fsSL https://unpkg.com/three@0.160.0/build/three.min.js -o game/vendor/three.min.js',
  },
  {
    path: mainModulePath,
    what: 'game/src/main.js is missing',
    fix: 'restore the entry module that boots the renderer, scene, world and loop',
  },
];
for (const entry of required) {
  if (!existsSync(entry.path)) problems.push(entry);
}

let html = '';
if (!problems.length) {
  html = readFileSync(indexPath, 'utf8');
  for (const reference of ['./vendor/three.min.js', './src/main.js']) {
    if (!html.includes(reference)) {
      problems.push({
        what: `game/index.html does not reference ${reference}`,
        why: 'the page would load nothing',
        fix: `add a tag for ${reference} back into game/index.html`,
      });
    }
  }
  const three = readFileSync(threePath, 'utf8');
  if (!three.includes('THREE') || !three.includes('WebGLRenderer')) {
    problems.push({
      what: 'game/vendor/three.min.js does not look like a three.js build',
      why: 'the global THREE object would be missing at run time',
      fix: 're-fetch three@0.160.0 build/three.min.js into game/vendor/',
    });
  }
}
if (problems.length) fail(problems);

// ------------------------------------------------------------------ the game tree
const tree = readGameTree(gameDir, CAPS);
const sources = tree.files.filter((file) => file.cls === 'source');
const vendored = tree.files.filter((file) => file.cls === 'vendored');
const assets = tree.files.filter((file) => file.cls === 'asset');
const modules = sources.filter((file) => file.path.endsWith('.js'));
const biggest = sources.slice().sort((a, b) => b.bytes - a.bytes)[0];

// The one build summary line: what was checked, how big the entry is, what it is made of.
process.stdout.write(
  `solmara: build ok — ${tree.files.length} files, ${mib(tree.totalBytes)} under game/` +
    ` (${modules.length} own ES modules, ${sources.length} source files, ${vendored.length} vendored, ${assets.length} assets)` +
    `; index.html ${kib(statSync(indexPath).size)}` +
    `${biggest ? `, largest source ${biggest.path} ${kib(biggest.bytes)}` : ''}\n`,
);

// ------------------------------------------------------------------ modules
// Every own ES module in boot order, with the line count a reviewer can scan. The
// listing is read from game/ itself, so it can never drift from what ships.
const moduleRows = modules
  .slice()
  .sort((a, b) => a.path.localeCompare(b.path))
  .map((file) => {
    const source = readFileSync(join(gameDir, file.path), 'utf8');
    const lines = source.endsWith('\n') ? source.split('\n').length - 1 : source.split('\n').length;
    return { path: file.path, lines, bytes: file.bytes };
  });
const totalLines = moduleRows.reduce((sum, row) => sum + row.lines, 0);
process.stdout.write(`solmara: ${moduleRows.length} own modules, ${totalLines.toLocaleString('en-US')} lines\n`);
for (const row of moduleRows) {
  process.stdout.write(`  ${row.path.padEnd(34)} ${String(row.lines).padStart(5)} lines  ${kib(row.bytes).padStart(8)}\n`);
}

// ------------------------------------------------------------------ screenshots
const screenshotsDir = join(here, 'screenshots');
let shotRows = [];
if (existsSync(screenshotsDir)) {
  shotRows = readdirSync(screenshotsDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && !entry.name.startsWith('.'))
    .map((entry) => ({ name: entry.name, bytes: statSync(join(screenshotsDir, entry.name)).size }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
const shotBytes = shotRows.reduce((sum, row) => sum + row.bytes, 0);
process.stdout.write(
  shotRows.length
    ? `solmara: screenshots: ${shotRows.length} files, ${kib(shotBytes)} (cover ${shotRows[0].name})\n`
    : 'solmara: screenshots: none yet — capture ?shot=cover and ?shot=night before handing in\n',
);
for (const row of shotRows) process.stdout.write(`  ${row.name.padEnd(28)} ${kib(row.bytes).padStart(8)}\n`);

// ------------------------------------------------------------------ hand it in
mkdirSync(out, { recursive: true });
cpSync(gameDir, join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });

try {
  writeFileSync(join(out, 'dossier.json'), buildDossier(out, CAPS));
  process.stdout.write(`solmara: wrote ${join(out, 'dossier.json')}\n`);
} catch (error) {
  // The usual reason here is an empty screenshots/: the shot rig, not a mock, is what
  // produces them (node serve.ts, then ?shot=cover and ?shot=night).
  process.stderr.write(`solmara: could not write the dossier: ${error.message}\n`);
  process.stderr.write(
    'solmara: capture the shots first — node serve.ts, then open\n' +
      '  http://localhost:8080/?shot=cover&seed=1\n' +
      '  http://localhost:8080/?shot=night&seed=1\n' +
      'waiting for window.__SHOT_READY and saving each as a screenshot in screenshots/, then re-run.\n',
  );
  process.exit(1);
}
