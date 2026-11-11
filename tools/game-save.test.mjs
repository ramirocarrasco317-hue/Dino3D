import assert from 'node:assert/strict';
import test from 'node:test';

const storage = new Map();
globalThis.localStorage = {
  getItem: (key) => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, value),
};

const { Game, STATE } = await import('../src/game/Game.js');
const { profile } = await import('../src/game/Profile.js');
const { bus } = await import('../src/core/Signals.js');
const { audio } = await import('../src/audio/AudioEngine.js');
const saved = () => JSON.parse(storage.get('dino3d.profile.v1'));

function setup(t) {
  storage.clear();
  profile._saveTimer = null;
  profile.reset();
  bus.map.clear();
  const timers = [];
  t.mock.method(globalThis, 'setTimeout', (fn) => { timers.push(fn); return 1; });
  t.mock.method(audio, 'unlock', () => {});
  const game = Object.assign(Object.create(Game.prototype), {
    state: STATE.PLAYING,
    run: Game.prototype._blankRun(),
    _pendingGameOver: false,
    _gameOverResult: null,
    player: { x: 0, y: 0, kill() {}, reset() {} },
    rig: { addShake() {}, reset() {} },
    effects: { burstImpact() {}, clear() {} },
    power: { reset() {}, absorbHit: () => false },
    chunks: { reset() {} },
    _emitHud() {},
  });
  Object.assign(game.run, { score: 12345.9, distance: 650.9, coins: 7, dodged: 12, powerups: 2 });
  profile.addCoins(7);
  const results = [];
  const sounds = [];
  bus.on('gameover', (result) => results.push(result));
  bus.on('sfx', (sound) => sounds.push(sound));
  return { game, results, sounds, flushTimers: () => timers.splice(0).forEach((fn) => fn()) };
}

test('an immediate restart preserves the completed run and its achievements', (t) => {
  const { game, results, sounds, flushTimers } = setup(t);
  game.die();
  game.restart();
  assert.equal(game.state, STATE.PLAYING);
  assert.equal(game.run.score, 0);
  const data = saved();
  assert.equal(data.bestScore, 12345);
  assert.equal(data.bestDistance, 650);
  assert.equal(data.runs, 1);
  assert.equal(data.totalDistance, 650);
  assert.equal(data.obstaclesDodged, 12);
  assert.equal(data.powerupsUsed, 2);
  assert.equal(data.coins, 7);
  assert.equal(data.totalCoins, 7);
  assert.ok(data.achievements['first-run']);
  assert.ok(data.achievements['high-score']);
  game._finishRun();
  flushTimers();
  assert.deepEqual(saved(), data);
  assert.equal(results.length, 0);
  assert.deepEqual(sounds, ['hit', 'start']);
});

test('the normal results screen appears once without counting the run again', (t) => {
  const { game, results, sounds, flushTimers } = setup(t);
  game.die();
  const data = saved();
  assert.equal(data.runs, 1);
  assert.equal(results.length, 0);
  game.die();
  game._finishRun();
  game._finishRun();
  assert.deepEqual(saved(), data);
  assert.equal(results.length, 1);
  assert.equal(results[0].run.score, 12345);
  assert.equal(results[0].newBest, true);
  assert.deepEqual(results[0].unlocked.map((a) => a.id), ['first-run', 'high-score']);
  flushTimers();
  assert.ok(sounds.includes('newRecord'));
});

test('returning to the menu keeps the save and cancels delayed results', (t) => {
  const { game, results, sounds, flushTimers } = setup(t);
  game.die();
  game.enterMenu();
  game._finishRun();
  flushTimers();
  assert.equal(game.state, STATE.MENU);
  assert.equal(saved().bestScore, 12345);
  assert.equal(saved().runs, 1);
  assert.equal(results.length, 0);
  assert.deepEqual(sounds, ['hit']);
});

test('consecutive runs accumulate once and retain the higher record', (t) => {
  const { game, results, flushTimers } = setup(t);
  game.die();
  game._finishRun();
  game.restart();
  Object.assign(game.run, { score: 100.8, distance: 80.9, dodged: 3, powerups: 1 });
  game.die();
  game._finishRun();
  flushTimers();
  const data = saved();
  assert.equal(data.runs, 2);
  assert.equal(data.bestScore, 12345);
  assert.equal(data.bestDistance, 650);
  assert.equal(data.totalDistance, 730);
  assert.equal(data.obstaclesDodged, 15);
  assert.equal(data.powerupsUsed, 3);
  assert.equal(data.coins, 7);
  assert.equal(results.length, 2);
  assert.equal(results[1].newBest, false);
  assert.deepEqual(results[1].unlocked, []);
});

test('a fatal collision stops later obstacles from changing the saved run', (t) => {
  const { game } = setup(t);
  game.player.colliderHeight = 1.72;
  const first = { position: { x: 0, y: 0 }, userData: { col: { w: 1, h: 1, d: 1, y: 0 } } };
  const passed = { position: { x: 0, y: 0 }, userData: { col: { w: 1, h: 1, d: 1, y: 0 } } };
  game.chunks.forEachObstacleNear = (_min, _max, visit) => { visit(first, 0); visit(passed, 2); };
  game._checkCollisions({ x: 0, y: 0, h: 1.72 }, 0);
  assert.equal(game.state, STATE.DEAD);
  assert.equal(game.run.dodged, 12);
  assert.equal(saved().obstaclesDodged, 12);
  assert.equal(passed.userData.counted, undefined);
});
