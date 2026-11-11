const loading = document.getElementById('loading');
const errorScreen = document.getElementById('startup-error');
let app;
let failed = false;
let ready = false;
let timeout;

const messages = {
  download: ['No pudimos cargar el juego', 'Revisá tu conexión a Internet y volvé a intentarlo.'],
  startup: ['No pudimos iniciar el juego', 'Volvé a intentarlo. Si el problema continúa, probá con otro navegador.'],
  graphics: ['No se pudieron activar los gráficos 3D', 'Probá actualizar el navegador o habilitar la aceleración gráfica. Si el problema sigue, intentá con otro navegador.'],
  context: ['Se interrumpieron los gráficos del juego', 'El navegador perdió temporalmente los gráficos 3D. Reintentá para volver al menú.'],
  timeout: ['El juego está tardando demasiado en cargar', 'Revisá tu conexión y volvé a intentarlo.'],
};

function stopWaiting() {
  clearTimeout(timeout);
  document.removeEventListener('visibilitychange', watchStartup);
}

function fail(kind, error) {
  if (failed) return;
  failed = true;
  stopWaiting();
  const [title, message] = messages[kind];
  document.getElementById('startup-title').textContent = title;
  document.getElementById('startup-message').textContent = message;
  loading?.remove();
  errorScreen.hidden = false;
  errorScreen.querySelector('a').focus({ preventScroll: true });
  if (app) {
    app.engine.stop();
    app.input.enabled = false;
    app.input.dispose();
    try {
      app.game.pause();
      app.engine.dispose();
    } catch (cleanupError) {
      console.warn('[startup] cleanup failed', cleanupError);
    }
  }
  if (error) console.error('[startup]', error);
}

function reportError(error) {
  const kind = error?.code === 'WEBGL_UNAVAILABLE' ? 'graphics'
    : error?.code === 'WEBGL_CONTEXT_LOST' ? 'context' : 'startup';
  fail(kind, error);
}

function showGame() {
  if (failed) return;
  ready = true;
  stopWaiting();
  loading?.classList.add('hide');
  setTimeout(() => loading?.remove(), 600);
}

function watchStartup() {
  clearTimeout(timeout);
  // Hidden tabs may defer the first frame; give them time once visible again.
  if (!failed && !ready && !document.hidden) timeout = setTimeout(() => fail('timeout'), 30000);
}

document.addEventListener('visibilitychange', watchStartup);
watchStartup();

import('./main.js').then(({ boot }) => {
  if (!failed) app = boot({ onReady: showGame, onError: reportError });
}, (error) => fail('download', error)).catch(reportError);
