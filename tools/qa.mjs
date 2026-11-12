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
import assert from 'node:assert/strict';
import { parseArgs } from 'node:util';
import { serveBuild } from './serve-build.mjs';

const { values } = parseArgs({ options: {
  url: { type: 'string' }, out: { type: 'string', default: 'shots' },
  only: { type: 'string' }, width: { type: 'string', default: '1280' },
  height: { type: 'string', default: '720' }, production: { type: 'boolean', default: false },
} });
const OUT = path.resolve(process.cwd(), values.out);
const WIDTH = Number(values.width), HEIGHT = Number(values.height);

/** Each scenario: { name, setup } - setup runs in the page against window.__dino. */
const SCENARIOS = [
  {
    name: '00-dino-rear',
    setup: () => {
      const d = window.__dino;
      d.sim(1.2);
      d.cam(1.6, 2.1, 4.6, 0, 1.0, 0, 34);
    },
  },
  {
    name: '00-dino-side',
    setup: () => {
      const d = window.__dino;
      d.sim(1.35);
      d.cam(5.2, 1.7, 0.2, 0, 0.95, 0, 32);
    },
  },
  {
    name: '00-dino-jump',
    setup: () => {
      const d = window.__dino;
      d.sim(1.0);
      d.press('jump'); d.sim(0.24);
      d.cam(5.2, 2.6, 0.2, 0, 1.9, 0, 34);
    },
  },
  {
    name: '00-dino-duck',
    setup: () => {
      const d = window.__dino;
      d.sim(1.0);
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
    setup: () => { const d = window.__dino; d.sim(3.5); },
  },
  {
    name: '03-run-desert',
    setup: () => { const d = window.__dino; d.game.chunks.warpTo(280); d.sim(4); },
  },
  {
    name: '04-run-jungle',
    setup: () => { const d = window.__dino; d.game.chunks.warpTo(900); d.sim(4); },
  },
  {
    name: '05-run-rocky',
    setup: () => { const d = window.__dino; d.game.chunks.warpTo(1660); d.sim(4); },
  },
  {
    name: '06-run-volcanic',
    setup: () => { const d = window.__dino; d.game.chunks.warpTo(2420); d.sim(4); },
  },
  {
    name: '07-run-ice',
    setup: () => { const d = window.__dino; d.game.chunks.warpTo(3180); d.sim(4); },
  },
  {
    name: '08-biome-transition',
    setup: () => { const d = window.__dino; d.game.chunks.warpTo(660); d.sim(4); },
  },
  {
    name: '09-night',
    setup: () => {
      const d = window.__dino;
      d.game.chunks.warpTo(400);
      d.game.env.dayT = 0.92; d.sim(4);
    },
  },
  {
    name: '10-sunset',
    setup: () => {
      const d = window.__dino;
      d.game.chunks.warpTo(1200);
      d.game.env.dayT = 0.78; d.sim(4);
    },
  },
  {
    name: '11-jump',
    setup: () => {
      const d = window.__dino;
      d.game.chunks.warpTo(500); d.sim(2);
      d.press('jump'); d.sim(0.22);
    },
  },
  {
    name: '12-duck',
    setup: () => {
      const d = window.__dino;
      d.game.chunks.warpTo(500); d.sim(2);
      d.press('down'); d.sim(0.2);
    },
  },
  {
    name: '13-lane-change',
    setup: () => {
      const d = window.__dino;
      d.game.chunks.warpTo(500); d.sim(2);
      d.press('left'); d.sim(0.09);
    },
  },
  {
    name: '14-powerups',
    setup: () => {
      const d = window.__dino;
      d.game.chunks.warpTo(700); d.sim(2);
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
      d.game.chunks.warpTo(4200); d.game.speed = 44; d.sim(3);
    },
  },
  {
    name: '16-pause',
    setup: () => {
      const d = window.__dino;
      d.game.chunks.warpTo(760); d.sim(3);
      d.game.run.score = 18420; d.game.run.distance = 1310; d.game.run.coins = 87;
      d.game.pause(); d.sim(0.4);
    },
  },
  {
    name: '17-gameover',
    setup: () => {
      const d = window.__dino;
      d.game.chunks.warpTo(760); d.sim(3);
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
      d.game.chunks.warpTo(500); d.sim(2);
      d.game.die(); d.sim(0.45);
    },
  },
  {
    name: '20-close-behind',
    setup: () => {
      const d = window.__dino;
      d.game.chunks.warpTo(180); d.sim(2.5);
    },
  },
];

const logs = [];

async function main() {
  const list = values.only ? SCENARIOS.filter((s) => s.name.includes(values.only)) : SCENARIOS;
  assert.ok(list.length, `No scenarios match --only ${values.only}`);
  assert.ok(Number.isInteger(WIDTH) && WIDTH > 0 && Number.isInteger(HEIGHT) && HEIGHT > 0, 'Viewport dimensions must be positive integers');
  assert.ok(!(values.production && values.url), 'Choose --production or --url, not both');
  fs.mkdirSync(OUT, { recursive: true });
  const results = [];
  let browser, server;
  try {
    if (values.production) server = await serveBuild();
    browser = await chromium.launch({
      executablePath: process.env.DINO_BROWSER_PATH || undefined,
      args: [
        '--enable-unsafe-swiftshader',
        '--use-gl=angle',
        '--use-angle=swiftshader',
        '--ignore-gpu-blocklist',
        '--enable-webgl',
      ],
    });
    const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, reducedMotion: 'reduce' });

    page.on('console', (msg) => {
      const type = msg.type();
      if (type === 'error' || type === 'warning') logs.push(`[${type}] ${msg.text()}`);
    });
    page.on('pageerror', (err) => logs.push(`[pageerror] ${err.message}`));

    // Fonts are optional; the checks cover the game's own production assets.
    await page.route('https://fonts.googleapis.com/**', (route) => route.fulfill({ contentType: 'text/css', body: '' }));
    await page.goto(server?.url || values.url || 'http://localhost:5173', { waitUntil: 'load' });
    await page.waitForFunction(() => {
      const loading = document.getElementById('loading');
      return !!window.__dino && (!loading || loading.classList.contains('hide')) || !document.getElementById('startup-error')?.hidden;
    }, null, { timeout: 30000 });
    assert.equal(await page.getByRole('alert').isVisible(), false, 'The game failed to start');
    await page.waitForFunction(() => !document.getElementById('loading'));
    // Freeze before interacting too: software rendering must not starve the
    // input event while the harness prepares its deterministic scenarios.
    await page.evaluate(() => window.__dino.engine.stop());
    await page.locator('[data-play]').click();

    for (const sc of list) {
      let stats;
      try {
        await page.evaluate(async () => {
          const d = window.__dino;
          d.ui._closeAchievements();
          d.freeCam(false);
          d.game.start();
          d.game.chunks.reset(0xd103d);
          await d.auto(true, { react: 0.23 });
        });
        await page.evaluate(sc.setup);
        await page.evaluate(() => { const d = window.__dino; d.engine.renderer.render(d.engine.scene, d.engine.camera); });
        const file = path.join(OUT, `${sc.name}.png`);
        await page.screenshot({ path: file });
        stats = await page.evaluate(() => ({ ...window.__dino.stats(), playerState: window.__dino.game.player.state }));
        const expectedState = ['01-menu', '18-achievements'].includes(sc.name) ? 'menu'
          : sc.name === '16-pause' ? 'paused'
            : ['17-gameover', '19-death-cam'].includes(sc.name) ? 'dead' : 'playing';
        assert.equal(stats.state, expectedState, `${sc.name} ended in the wrong state`);
        for (const field of ['score', 'distance', 'speed', 'coins', 'calls', 'triangles']) assert.ok(Number.isFinite(stats[field]), `${sc.name}: ${field} is not finite`);
        const playerState = { '00-dino-jump': 'air', '11-jump': 'air', '00-dino-duck': 'duck', '12-duck': 'duck' }[sc.name];
        if (playerState) assert.equal(stats.playerState, playerState, `${sc.name}: the requested movement did not occur`);
        results.push({ name: sc.name, passed: true, ...stats });
        console.log(`✓ ${sc.name}`, JSON.stringify(stats));
      } catch (err) {
        console.error(`✗ ${sc.name}: ${err.message}`);
        logs.push(`[scenario:${sc.name}] ${err.message}`);
        results.push({ name: sc.name, passed: false, ...stats, error: err.message });
      }
    }

  } catch (err) {
    logs.push(`[fatal] ${err.message}`);
  } finally {
    await browser?.close();
    await server?.close();
  }

  const errors = logs.filter((l) => !l.startsWith('[warning]'));
  const passed = errors.length === 0 && results.length === list.length && results.every((result) => result.passed);
  fs.writeFileSync(path.join(OUT, '_report.json'), JSON.stringify({ passed, results, logs }, null, 2));
  logs.slice(0, 60).forEach((l) => console.log(l));
  console.log(`\n${errors.length} error-level messages, ${logs.length - errors.length} warnings`);
  process.exitCode = passed ? 0 : 1;
}

main().catch((err) => { console.error(err); process.exitCode = 1; });
