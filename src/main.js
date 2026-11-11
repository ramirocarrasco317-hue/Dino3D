import { Engine } from './core/Engine.js';
import { Input } from './core/Input.js';
import { Game } from './game/Game.js';
import { UI } from './ui/UI.js';
import { initSfx } from './audio/sfx.js';
import { audio } from './audio/AudioEngine.js';
import { bus } from './core/Signals.js';
import { QualityController } from './core/Quality.js';

function boot() {
  const canvas = document.getElementById('scene');
  const engine = new Engine(canvas);
  const input = new Input(window);

  initSfx();
  const game = new Game(engine, input);
  const ui = new UI(game);
  const quality = new QualityController(engine, game);

  // Audio can only start after a real gesture.
  const unlock = () => audio.unlock();
  window.addEventListener('pointerdown', unlock, { once: true });
  window.addEventListener('keydown', unlock, { once: true });

  let showFps = false;
  window.addEventListener('keydown', (e) => {
    if (e.code === 'F3' || (e.code === 'KeyF' && e.shiftKey)) {
      showFps = !showFps;
      e.preventDefault();
    }
  });

  engine.onUpdate((dt) => {
    game.update(dt);
    quality.update(dt);
    ui.setFps(engine.fps, showFps);
  });

  engine.start();

  const loading = document.getElementById('loading');
  if (loading) {
    requestAnimationFrame(() => {
      loading.classList.add('hide');
      setTimeout(() => loading.remove(), 600);
    });
  }

  // Debug surface: used by the QA / visual-review passes and handy in the
  // console. Everything here is inert unless something calls it.
  window.__dino = {
    engine, game, ui, input, bus, quality,
    shot: (name) => import('./dev/capture.js').then((m) => m.capture(name, engine)),
    press: (a) => bus.emit('input', a),
    release: (a) => bus.emit('input:up', a),
    /** Park the camera for model inspection shots. */
    cam(px, py, pz, lx = 0, ly = 1, lz = 0, fov = 40) {
      game.rig.frozen = true;
      engine.camera.position.set(px, py, pz);
      engine.camera.fov = fov;
      engine.camera.updateProjectionMatrix();
      engine.camera.lookAt(lx, ly, lz);
    },
    freeCam(on = false) { game.rig.frozen = on; },
    /** Enable/disable the QA autopilot. */
    async auto(on = true, options) {
      if (!on) { game.aiTick = null; return false; }
      const { makeAutopilot } = await import('./dev/autopilot.js');
      game.aiTick = makeAutopilot(options);
      return true;
    },
    /** Advance the simulation without waiting for real time. */
    sim(seconds, step = 1 / 60) {
      const n = Math.round(seconds / step);
      for (let i = 0; i < n; i++) game.update(step);
      return { distance: game.chunks.distance, speed: game.speed, state: game.state };
    },
    stats() {
      const r = engine.renderer.info.render;
      return {
        fps: Math.round(engine.fps), calls: r.calls, triangles: r.triangles,
        state: game.state, speed: +game.speed.toFixed(2),
        distance: Math.round(game.chunks.distance),
        score: Math.round(game.run.score), coins: game.run.coins,
      };
    },
  };

}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
