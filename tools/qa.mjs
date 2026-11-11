/**
 * Headless capture + smoke-test harness.
 *
 *   node tools/qa.mjs [--url http://localhost:5173] [--out shots] [--only name]
 *
 * Drives the running game through a list of scenarios, screenshots each one and
 * reports every console error / page exception it saw. Used by the visual and
 * QA review passes so the reviewers look at real frames, not just code.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const getArg = (flag, def) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : def;
};

const URL = getArg('--url', 'http://localhost:5173');
const OUT = path.resolve(process.cwd(), getArg('--out', 'shots'));
const ONLY = getArg('--only', null);
const WIDTH = Number(getArg('--width', 1600));
const HEIGHT = Number(getArg('--height', 900));

fs.mkdirSync(OUT, { recursive: true });

/** Each scenario: { name, setup } - setup runs in the page against window.__dino. */
const SCENARIOS = [
  {
    name: '00-dino-rear',
    setup: () => {
      const d = window.__dino;
      d.game.start(); d.sim(1.2);
      d.cam(1.6, 2.1, 4.6, 0, 1.0, 0, 34);
    },
  },
  {
    name: '00-dino-side',
    setup: () => {
      const d = window.__dino;
      d.game.start(); d.sim(1.35);
      d.cam(5.2, 1.7, 0.2, 0, 0.95, 0, 32);
    },
  },
  {
    name: '00-dino-jump',
    setup: () => {
      const d = window.__dino;
      d.game.start(); d.sim(1.0);
      d.press('jump'); d.sim(0.24);
      d.cam(5.2, 2.6, 0.2, 0, 1.9, 0, 34);
    },
  },
  {
    name: '00-dino-duck',
    setup: () => {
      const d = window.__dino;
      d.game.start(); d.sim(1.0);
      d.press('down'); d.sim(0.25);
      d.cam(5.0, 1.5, 0.2, 0, 0.7, 0, 32);
    },
  },
  {
    name: '01-menu',
    setup: () => { window.__dino.game.enterMenu(); window.__dino.sim(2.5); },
  },
  {
    name: '02-run-start',
    setup: () => { const d = window.__dino; d.game.start(); d.sim(3.5); },
  },
  {
    name: '03-run-desert',
    setup: () => { const d = window.__dino; d.game.start(); d.game.chunks.warpTo(280); d.sim(4); },
  },
  {
    name: '04-run-jungle',
    setup: () => { const d = window.__dino; d.game.start(); d.game.chunks.warpTo(900); d.sim(4); },
  },
  {
    name: '05-run-rocky',
    setup: () => { const d = window.__dino; d.game.start(); d.game.chunks.warpTo(1660); d.sim(4); },
  },
  {
    name: '06-run-volcanic',
    setup: () => { const d = window.__dino; d.game.start(); d.game.chunks.warpTo(2420); d.sim(4); },
  },
  {
    name: '07-run-ice',
    setup: () => { const d = window.__dino; d.game.start(); d.game.chunks.warpTo(3180); d.sim(4); },
  },
  {
    name: '08-biome-transition',
    setup: () => { const d = window.__dino; d.game.start(); d.game.chunks.warpTo(660); d.sim(4); },
  },
  {
    name: '09-night',
    setup: () => {
      const d = window.__dino;
      d.game.start(); d.game.chunks.warpTo(400);
      d.game.env.dayT = 0.92; d.sim(4);
    },
  },
  {
    name: '10-sunset',
    setup: () => {
      const d = window.__dino;
      d.game.start(); d.game.chunks.warpTo(1200);
      d.game.env.dayT = 0.78; d.sim(4);
    },
  },
  {
    name: '11-jump',
    setup: () => {
      const d = window.__dino;
      d.game.start(); d.game.chunks.warpTo(500); d.sim(2);
      d.press('jump'); d.sim(0.22);
    },
  },
  {
    name: '12-duck',
    setup: () => {
      const d = window.__dino;
      d.game.start(); d.game.chunks.warpTo(500); d.sim(2);
      d.press('down'); d.sim(0.2);
    },
  },
  {
    name: '13-lane-change',
    setup: () => {
      const d = window.__dino;
      d.game.start(); d.game.chunks.warpTo(500); d.sim(2);
      d.press('left'); d.sim(0.09);
    },
  },
  {
    name: '14-powerups',
    setup: () => {
      const d = window.__dino;
      d.game.start(); d.game.chunks.warpTo(700); d.sim(2);
      d.game.power.activate('shield');
      d.game.power.activate('magnet');
      d.game.power.activate('multiplier');
      d.sim(1.2);
    },
  },
  {
    name: '15-max-speed',
    setup: () => {
      const d = window.__dino;
      d.game.start(); d.game.chunks.warpTo(4200); d.game.speed = 44; d.sim(3);
    },
  },
  {
    name: '16-pause',
    setup: () => {
      const d = window.__dino;
      d.game.start(); d.game.chunks.warpTo(760); d.sim(3);
      d.game.run.score = 18420; d.game.run.distance = 1310; d.game.run.coins = 87;
      d.game.pause(); d.sim(0.4);
    },
  },
  {
    name: '17-gameover',
    setup: () => {
      const d = window.__dino;
      d.game.start(); d.game.chunks.warpTo(760); d.sim(3);
      d.game.run.score = 18420; d.game.run.distance = 1310;
      d.game.run.coins = 87; d.game.run.dodged = 64;
      d.game.die(); d.sim(1.6);
    },
  },
  {
    name: '18-achievements',
    setup: () => {
      const d = window.__dino;
      d.game.enterMenu(); d.sim(1);
      d.ui._openAchievements();
    },
  },
  {
    name: '19-death-cam',
    setup: () => {
      const d = window.__dino;
      d.game.start(); d.game.chunks.warpTo(500); d.sim(2);
      d.game.die(); d.sim(0.45);
    },
  },
  {
    name: '20-close-behind',
    setup: () => {
      const d = window.__dino;
      d.game.start(); d.game.chunks.warpTo(180); d.sim(2.5);
    },
  },
];

const logs = [];

async function main() {
  const browser = await chromium.launch({
    args: [
      '--enable-unsafe-swiftshader',
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--ignore-gpu-blocklist',
      '--enable-webgl',
    ],
  });
  const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });

  page.on('console', (msg) => {
    const type = msg.type();
    if (type === 'error' || type === 'warning') logs.push(`[${type}] ${msg.text()}`);
  });
  page.on('pageerror', (err) => logs.push(`[pageerror] ${err.message}`));

  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.__dino, null, { timeout: 30000 });
  // Let the first frames settle so shaders are compiled.
  await page.waitForTimeout(1500);
  // The bot keeps the captures showing a live run rather than a wipeout.
  await page.evaluate(() => window.__dino.auto(true));

  const list = ONLY ? SCENARIOS.filter((s) => s.name.includes(ONLY)) : SCENARIOS;
  const results = [];

  for (const sc of list) {
    try {
      await page.evaluate(() => window.__dino.freeCam(false));
      await page.evaluate(sc.setup);
      // Software WebGL paints slowly here; give CSS transitions time to land.
      await page.waitForTimeout(1400);
      const file = path.join(OUT, `${sc.name}.png`);
      await page.screenshot({ path: file });
      const stats = await page.evaluate(() => window.__dino.stats());
      results.push({ name: sc.name, ...stats });
      console.log(`✓ ${sc.name}`, JSON.stringify(stats));
    } catch (err) {
      console.error(`✗ ${sc.name}: ${err.message}`);
      logs.push(`[scenario:${sc.name}] ${err.message}`);
    }
  }

  await browser.close();

  const errors = logs.filter((l) => !l.includes('[warning]'));
  fs.writeFileSync(path.join(OUT, '_report.json'), JSON.stringify({ results, logs }, null, 2));
  console.log('\n--- console output ---');
  if (logs.length === 0) console.log('(clean)');
  else logs.slice(0, 60).forEach((l) => console.log(l));
  console.log(`\n${errors.length} error-level messages, ${logs.length - errors.length} warnings`);
}

main().catch((err) => { console.error(err); process.exit(1); });
