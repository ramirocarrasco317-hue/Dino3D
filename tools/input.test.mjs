import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

// Run after npm run build. DINO_BROWSER_PATH optionally selects an installed browser.
const root = fileURLToPath(new URL('../dist/', import.meta.url));
let server, browser, page, touch;
const errors = [];

before(async () => {
  server = createServer(async (req, res) => {
    try {
      const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      const file = path.resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
      if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
      const data = await readFile(file);
      res.setHeader('content-type', { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }[path.extname(file)] || 'application/octet-stream');
      res.end(data);
    } catch { res.writeHead(404).end(); }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  browser = await chromium.launch({
    executablePath: process.env.DINO_BROWSER_PATH || undefined,
    args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'],
  });
  page = await browser.newPage({ viewport: { width: 1280, height: 900 }, hasTouch: true, reducedMotion: 'reduce' });
  page.on('pageerror', (err) => errors.push(err.message));
  await page.route('https://fonts.googleapis.com/**', (route) => route.fulfill({ contentType: 'text/css', body: '' }));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.waitForFunction(() => {
    const loading = document.getElementById('loading');
    return !!window.__dino && (!loading || loading.classList.contains('hide'));
  });
  await page.evaluate(() => {
    const d = window.__dino;
    d.engine.stop();
    window.__inputTest = { actions: [], starts: 0 };
    d.bus.on('input', (action) => window.__inputTest.actions.push(action));
    d.bus.on('state', ({ state }) => { if (state === 'playing') window.__inputTest.starts++; });
  });
  await page.waitForFunction(() => !document.getElementById('loading'));
  touch = await page.context().newCDPSession(page);
});

beforeEach(async () => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.evaluate(() => {
    const d = window.__dino;
    window.dispatchEvent(new Event('blur'));
    d.ui._closeAchievements();
    d.game.enterMenu();
    document.activeElement?.blur();
    window.__inputTest.actions.length = 0;
    window.__inputTest.starts = 0;
    for (const side of ['top', 'right', 'bottom', 'left']) document.documentElement.style.removeProperty(`--safe-${side}`);
  });
});

after(async () => {
  await browser?.close();
  if (server) await new Promise((resolve) => server.close(resolve));
  assert.deepEqual(errors, []);
});

const status = () => page.evaluate(() => ({
  state: window.__dino.game.state,
  achievements: window.__dino.ui.showAchievements,
  ...window.__inputTest,
}));

async function swipe(from, to, cancel = false) {
  await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from[0], y: from[1], id: 1 }] });
  await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: to[0], y: to[1], id: 1 }] });
  await touch.send('Input.dispatchTouchEvent', { type: cancel ? 'touchCancel' : 'touchEnd', touchPoints: [] });
}

test('Enter and Space activate achievement buttons without starting a run', async () => {
  for (const key of ['Enter', 'Space']) {
    await page.locator('[data-ach]').press(key);
    assert.deepEqual(await status(), { state: 'menu', achievements: true, actions: [], starts: 0 });
    await page.locator('[data-back]').press(key);
    assert.deepEqual(await status(), { state: 'menu', achievements: false, actions: [], starts: 0 });
  }
});

test('touching menu buttons and sound settings never emits gameplay actions', async () => {
  await page.locator('[data-ach]').tap();
  assert.deepEqual(await status(), { state: 'menu', achievements: true, actions: [], starts: 0 });
  await page.locator('[data-back]').tap();
  const checked = await page.locator('[data-sfx]').isChecked();
  await page.locator('.toggle').tap();
  assert.equal(await page.locator('[data-sfx]').isChecked(), !checked);
  const volume = page.locator('[data-vol]');
  await volume.tap();
  assert.deepEqual(await status(), { state: 'menu', achievements: false, actions: [], starts: 0 });
});

test('volume keeps native keyboard controls and starting play releases button focus', async () => {
  const volume = page.locator('[data-vol]');
  await volume.focus();
  await volume.press('Home');
  await volume.press('ArrowRight');
  assert.equal(await volume.inputValue(), '0.05');
  assert.deepEqual((await status()).actions, []);
  await page.locator('[data-play]').press('Enter');
  assert.deepEqual(await status(), { state: 'playing', achievements: false, actions: [], starts: 1 });
  await page.keyboard.press('a');
  assert.equal(await page.evaluate(() => window.__dino.game.player.targetLane), 0);
  await page.keyboard.press('Escape');
  assert.equal((await status()).state, 'paused');
  await page.locator('[data-resume]').press('Enter');
  assert.equal((await status()).state, 'playing');
  assert.deepEqual((await status()).actions, ['left', 'pause']);
});

test('touch gestures operate only during play and canceled gestures stay canceled', async () => {
  await page.touchscreen.tap(80, 650);
  await swipe([900, 650], [750, 650]);
  assert.deepEqual(await status(), { state: 'menu', achievements: false, actions: [], starts: 0 });
  await page.locator('[data-play]').tap();
  assert.deepEqual(await status(), { state: 'playing', achievements: false, actions: [], starts: 1 });
  await page.touchscreen.tap(80, 650);
  await swipe([900, 650], [750, 650]);
  await swipe([750, 650], [900, 650]);
  await swipe([900, 650], [900, 500]);
  await swipe([900, 500], [900, 650]);
  assert.deepEqual((await status()).actions, ['jump', 'left', 'right', 'jump', 'down']);
  await swipe([900, 650], [750, 650], true);
  assert.equal((await status()).actions.length, 5);
  await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 900, y: 650, id: 1 }] });
  await page.evaluate(() => { window.__dino.game.pause(); window.__dino.game.resume(); });
  await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  assert.equal((await status()).actions.length, 5);
});

test('held keys release correctly when keyboard focus moves to a menu', async () => {
  await page.keyboard.press('Enter');
  await page.keyboard.down('Space');
  await page.keyboard.down('w');
  await page.keyboard.up('Space');
  assert.equal(await page.evaluate(() => window.__dino.input.held.jump), true);
  await page.keyboard.press('Escape');
  await page.locator('[data-resume]').focus();
  await page.keyboard.up('w');
  assert.equal(await page.evaluate(() => window.__dino.input.held.jump), false);
  await page.keyboard.press('Enter');
  assert.equal((await status()).state, 'playing');
  await page.keyboard.down('Space');
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await page.keyboard.up('Space');
  assert.equal(await page.evaluate(() => window.__dino.input.held.jump), false);
  assert.equal((await status()).state, 'paused');
});

test('Escape still closes achievements and game shortcuts work away from controls', async () => {
  await page.locator('[data-ach]').click();
  await page.locator('[data-back]').focus();
  await page.keyboard.press('Escape');
  assert.equal((await status()).achievements, false);
  await page.keyboard.press('Enter');
  assert.equal((await status()).state, 'playing');
  await page.evaluate(() => window.__dino.game.die());
  await page.keyboard.press('r');
  assert.equal((await status()).state, 'playing');
  assert.equal((await status()).starts, 2);
});

async function assertPanelFits() {
  await page.locator('.screen.show').evaluate(async (screen) => {
    const animations = [...screen.getAnimations(), ...screen.querySelector('.panel').getAnimations()];
    await Promise.all(animations.map((animation) => animation.finished.catch(() => {})));
  });
  const layout = await page.evaluate(() => {
    const panel = document.querySelector('.screen.show .panel');
    const content = panel.querySelector('.panel-content');
    const bounds = panel.getBoundingClientRect();
    return {
      viewport: { width: innerWidth, height: innerHeight },
      panel: { top: bounds.top, left: bounds.left, bottom: bounds.bottom, right: bounds.right },
      fits: bounds.left >= 0 && bounds.top >= 0 && bounds.right <= innerWidth && bounds.bottom <= innerHeight,
      noHorizontalOverflow: !!content && content.scrollWidth <= content.clientWidth + 1,
      buttons: [...panel.querySelectorAll('.btn-row button')].map((button) => {
        const r = button.getBoundingClientRect();
        return { text: button.textContent.trim(), visible: r.top >= bounds.top && r.bottom <= Math.min(bounds.bottom, innerHeight) && r.left >= 0 && r.right <= innerWidth, height: r.height };
      }),
    };
  });
  assert.equal(layout.fits, true, JSON.stringify(layout));
  assert.equal(layout.noHorizontalOverflow, true, JSON.stringify(layout));
  for (const button of layout.buttons) {
    assert.equal(button.visible, true, JSON.stringify(button));
    assert.ok(button.height >= 44, JSON.stringify(button));
  }
}

test('menus and ten unlocked achievements keep their action buttons on small screens', async () => {
  for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 568, height: 320 }]) {
    await page.setViewportSize(viewport);
    await page.evaluate(() => window.__dino.game.enterMenu());
    await assertPanelFits();
    await page.evaluate(() => window.__dino.ui._openAchievements());
    await assertPanelFits();
    await page.evaluate(() => {
      const d = window.__dino;
      const unlocked = [...d.ui.achScreen.querySelectorAll('.ach')].map((row) => ({
        icon: row.querySelector('.icon').textContent,
        name: row.querySelector('.name').textContent,
        desc: row.querySelector('.desc').textContent,
      }));
      d.ui._closeAchievements();
      d.game.start();
      d.game.pause();
      window.__layoutAchievements = unlocked;
    });
    await assertPanelFits();
    await page.evaluate(() => {
      const d = window.__dino;
      d.game.resume();
      Object.assign(d.game.run, { score: 20000, distance: 2400 });
      d.game.die(); d.sim(0.9);
      d.ui._showGameOver({ ...d.game._gameOverResult, unlocked: window.__layoutAchievements });
    });
    assert.equal(await page.locator('.screen.show .unlocked').count(), 10);
    await assertPanelFits();
    const score = await page.locator('.screen.show [data-score]').evaluate((el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      return { text: el.textContent, lines: range.getClientRects().length };
    });
    assert.equal(score.lines, 1, JSON.stringify({ viewport, score }));
    await page.locator('.screen.show [data-menu]').tap();
    assert.equal((await status()).state, 'menu');
  }
});

test('achievement contents scroll with a mouse wheel and a finger without starting play', async () => {
  await page.setViewportSize({ width: 390, height: 600 });
  await page.locator('[data-ach]').tap();
  const content = page.locator('.screen.show .panel-content');
  const bounds = await content.boundingBox();
  assert.ok(bounds);
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.wheel(0, 500);
  await page.waitForFunction(() => document.querySelector('.screen.show .panel-content').scrollTop > 0);
  await content.evaluate((el) => { el.scrollTop = 0; });
  const x = bounds.x + bounds.width / 2;
  const y = bounds.y + bounds.height - 20;
  await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
  for (let i = 1; i <= 6; i++) {
    await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - i * 30, id: 1 }] });
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForFunction(() => document.querySelector('.screen.show .panel-content').scrollTop > 0);
  assert.deepEqual((await status()).actions, []);
  assert.equal((await status()).state, 'menu');
  await page.locator('[data-back]').tap();
});

test('the touch pause button freezes a run and resumes it in both orientations', async () => {
  for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport);
    await page.locator('[data-play]').tap();
    const pause = page.getByRole('button', { name: 'Pausar partida' });
    const r = await pause.boundingBox();
    assert.ok(r && r.width >= 44 && r.height >= 44 && r.x >= 0 && r.y >= 0 && r.x + r.width <= viewport.width && r.y + r.height <= viewport.height);
    await pause.tap();
    assert.equal((await status()).state, 'paused');
    assert.equal(await pause.isVisible(), false);
    const frozen = await page.evaluate(() => { const d = window.__dino; d.sim(2); return { score: d.game.run.score, distance: d.game.run.distance }; });
    assert.deepEqual(frozen, { score: 0, distance: 0 });
    await page.locator('[data-resume]').tap();
    assert.equal((await status()).state, 'playing');
    assert.deepEqual((await status()).actions, []);
    await pause.tap();
    await page.locator('.screen.show [data-menu]').tap();
  }
});

test('scrollable menus and sound toggles remain usable with a keyboard', async () => {
  await page.setViewportSize({ width: 390, height: 568 });
  await page.locator('[data-ach]').click();
  const content = page.locator('.screen.show .panel-content');
  await content.focus();
  await page.keyboard.press('ArrowDown');
  await page.waitForFunction(() => document.querySelector('.screen.show .panel-content').scrollTop > 0);
  await page.keyboard.press('Escape');
  const sound = page.locator('[data-sfx]');
  const checked = await sound.isChecked();
  await sound.focus();
  await page.keyboard.press('Space');
  assert.equal(await sound.isChecked(), !checked);
  assert.equal((await status()).state, 'menu');
  assert.deepEqual((await status()).actions, ['pause']);
});

test('panels and pause controls respect display cutouts and the home indicator', async () => {
  await page.setViewportSize({ width: 844, height: 390 });
  await page.evaluate(() => {
    for (const [side, value] of Object.entries({ left: 44, right: 44, bottom: 21, top: 0 })) document.documentElement.style.setProperty(`--safe-${side}`, `${value}px`);
  });
  await assertPanelFits();
  await page.locator('[data-play]').tap();
  const r = await page.getByRole('button', { name: 'Pausar partida' }).boundingBox();
  assert.ok(r && r.x >= 44 && r.x + r.width <= 800 && r.y + r.height <= 369);
});

async function startupPage(t, init) {
  const fresh = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  t.after(() => fresh.close());
  fresh.on('pageerror', (error) => errors.push(error.message));
  await fresh.route('https://fonts.googleapis.com/**', (route) => route.fulfill({ contentType: 'text/css', body: '' }));
  if (init) await fresh.addInitScript(init);
  return fresh;
}

async function expectStartupError(fresh, text) {
  const alert = fresh.getByRole('alert');
  await alert.waitFor({ state: 'visible' });
  assert.match(await alert.textContent(), text);
  assert.equal(await fresh.locator('#loading').count(), 0);
  const retry = fresh.getByRole('link', { name: 'Reintentar' });
  assert.equal(await retry.isVisible(), true);
  return retry;
}

async function expectRecovered(fresh, retry) {
  await Promise.all([fresh.waitForEvent('load'), retry.click()]);
  await fresh.waitForFunction(() => !!window.__dino && !document.getElementById('loading'));
  assert.equal(await fresh.getByRole('alert').isVisible(), false);
  assert.equal(await fresh.evaluate(() => window.__dino.game.state), 'menu');
  await fresh.evaluate(() => window.__dino.engine.stop());
}

test('missing WebGL shows an explanation and retry preserves the saved profile', async (t) => {
  const fresh = await startupPage(t, () => {
    if (sessionStorage.getItem('graphics-failed-once')) return;
    sessionStorage.setItem('graphics-failed-once', '1');
    localStorage.setItem('dino3d.profile.v1', JSON.stringify({ bestScore: 12345, coins: 87, achievements: { 'first-run': 123 } }));
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (kind, ...args) {
      return String(kind).includes('webgl') ? null : original.call(this, kind, ...args);
    };
  });
  await fresh.goto(page.url());
  const retry = await expectStartupError(fresh, /gráficos 3D/);
  for (const viewport of [{ width: 320, height: 568 }, { width: 568, height: 320 }]) {
    await fresh.setViewportSize(viewport);
    await retry.scrollIntoViewIfNeeded();
    const r = await retry.boundingBox();
    assert.ok(r && r.y >= 0 && r.y + r.height <= viewport.height);
  }
  await expectRecovered(fresh, retry);
  const saved = await fresh.evaluate(() => JSON.parse(localStorage.getItem('dino3d.profile.v1')));
  assert.equal(saved.bestScore, 12345);
  assert.equal(saved.coins, 87);
  assert.equal(saved.achievements['first-run'], 123);
});

test('an exception during setup replaces the loader with a recoverable error', async (t) => {
  const fresh = await startupPage(t, () => {
    CanvasRenderingContext2D.prototype.createImageData = () => { throw new Error('Simulated setup failure'); };
  });
  await fresh.goto(page.url());
  await expectStartupError(fresh, /No pudimos iniciar/);
  assert.equal(await fresh.evaluate(() => !!window.__dino), false);
});

test('a missing game dependency can be downloaded again with retry', async (t) => {
  const fresh = await startupPage(t);
  let blocked = true;
  await fresh.route('**/assets/three-*.js', (route) => blocked ? route.abort() : route.continue());
  await fresh.goto(page.url());
  const retry = await expectStartupError(fresh, /conexión a Internet/);
  blocked = false;
  await expectRecovered(fresh, retry);
});

test('a missing entry script still leaves a working retry link', async (t) => {
  const fresh = await startupPage(t);
  let blocked = true;
  await fresh.route('**/assets/index-*.js', (route) => blocked ? route.abort() : route.continue());
  await fresh.goto(page.url());
  const retry = await expectStartupError(fresh, /No pudimos cargar/);
  blocked = false;
  await expectRecovered(fresh, retry);
});

test('failure on the first rendered frame cannot leave a loading screen', async (t) => {
  const fresh = await startupPage(t, () => {
    const original = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (callback) => original((time) => {
      if (window.__dino) window.__dino.engine.renderer.render = () => { throw new Error('Simulated render failure'); };
      callback(time);
    });
  });
  await fresh.goto(page.url());
  await expectStartupError(fresh, /No pudimos iniciar/);
  assert.equal(await fresh.evaluate(() => window.__dino.engine.running), false);
  assert.equal(await fresh.evaluate(() => window.__dino.input.enabled), false);
});

test('loss of the graphics context stops play and offers recovery', async (t) => {
  const fresh = await startupPage(t);
  await fresh.goto(page.url());
  await fresh.waitForFunction(() => !!window.__dino && !document.getElementById('loading'));
  await fresh.evaluate(() => {
    const d = window.__dino;
    d.engine.stop();
    d.game.start();
    const extension = d.engine.renderer.getContext().getExtension('WEBGL_lose_context');
    if (!extension) throw new Error('WebGL context-loss testing is unavailable');
    extension.loseContext();
  });
  const retry = await expectStartupError(fresh, /interrumpieron los gráficos/);
  assert.equal(await fresh.evaluate(() => window.__dino.engine.running), false);
  assert.equal(await fresh.evaluate(() => window.__dino.input.enabled), false);
  await expectRecovered(fresh, retry);
});

test('an interrupted download eventually replaces the loading message', async (t) => {
  const fresh = await startupPage(t, () => {
    const original = window.setTimeout.bind(window);
    window.setTimeout = (fn, delay, ...args) => original(fn, delay === 30000 ? 0 : delay, ...args);
  });
  await fresh.goto(page.url());
  await expectStartupError(fresh, /tardando demasiado/);
  assert.equal(await fresh.evaluate(() => !!window.__dino), false);
});
