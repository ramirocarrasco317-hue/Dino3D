import { bus } from '../core/Signals.js';
import { profile } from '../game/Profile.js';
import { achievementProgress } from '../game/Achievements.js';
import { POWER_META } from '../game/PowerUps.js';
import { STATE } from '../game/Game.js';
import { audio } from '../audio/AudioEngine.js';

const fmt = (n) => Math.floor(n).toLocaleString('es-AR');

function el(tag, cls, html) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html !== undefined) n.innerHTML = html;
  return n;
}

/**
 * All DOM UI: HUD, menu, pause, game over, achievements and toasts.
 * Talks to the game only through the event bus and a few direct calls.
 */
export class UI {
  constructor(game) {
    this.game = game;
    this.root = document.getElementById('ui');
    this.showAchievements = false;
    this._build();
    this._bind();
    this.setState(STATE.MENU);
  }

  // -- construction ------------------------------------------------------------
  _build() {
    this.root.innerHTML = '';

    // ---- HUD
    this.hud = el('div');
    this.hud.id = 'hud';
    this.hud.innerHTML = `
      <div class="hud-corner hud-tl">
        <div class="hud-score num" data-score>0</div>
        <div class="hud-sub"><span class="num" data-dist>0 m</span><span class="hud-biome" data-biome></span></div>
        <div class="hud-best num" data-best></div>
        <div class="hud-multiplier" data-multi>x2</div>
      </div>
      <div class="hud-corner hud-tr">
        <div class="hud-coins"><span class="dot"></span><span class="num" data-coins>0</span></div>
        <button class="hud-pause" data-pause type="button" aria-label="Pausar partida" title="Pausar partida">
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M8 5v14M16 5v14" stroke="currentColor" stroke-width="4" /></svg>
        </button>
      </div>
      <div id="powers"></div>
      <div id="speedfx"></div>
    `;
    this.root.appendChild(this.hud);

    this.$score = this.hud.querySelector('[data-score]');
    this.$dist = this.hud.querySelector('[data-dist]');
    this.$best = this.hud.querySelector('[data-best]');
    this.$biome = this.hud.querySelector('[data-biome]');
    this.$coins = this.hud.querySelector('[data-coins]');
    this.$multi = this.hud.querySelector('[data-multi]');
    this.$speedfx = this.hud.querySelector('#speedfx');

    this.pills = {};
    const powers = this.hud.querySelector('#powers');
    for (const [key, meta] of Object.entries(POWER_META)) {
      const pill = el('div', 'pill');
      pill.style.setProperty('--c', meta.color);
      pill.innerHTML = `<div class="ring" style="--p:0"><span>${meta.icon}</span></div><span data-t>0.0</span>`;
      powers.appendChild(pill);
      this.pills[key] = { root: pill, ring: pill.querySelector('.ring'), time: pill.querySelector('[data-t]') };
    }

    // ---- toasts
    this.toasts = el('div');
    this.toasts.id = 'toasts';
    this.root.appendChild(this.toasts);

    // ---- menu
    this.menu = el('div', 'screen');
    this.menu.innerHTML = `
      <div class="scrim"></div>
      <div class="panel">
        <h1 class="title"><span class="dino">🦖</span><span>DINO<span class="accent">RUN</span> 3D</span></h1>
        <p class="subtitle">El dinosaurio de la pantalla de "sin conexión", ahora en tres dimensiones.</p>
        <div class="stat-row">
          <div class="stat"><div class="label">Récord</div><div class="value num" data-best>0</div></div>
          <div class="stat"><div class="label">Distancia máx.</div><div class="value num" data-bestdist>0 m</div></div>
          <div class="stat gold"><div class="label">Monedas</div><div class="value num" data-coins>0</div></div>
        </div>
        <div class="btn-row">
          <button class="primary" data-play>Jugar <span class="key">ENTER</span></button>
          <button class="ghost" data-ach>Logros</button>
        </div>
        <div class="controls">
          <div class="ctrl"><kbd>A</kbd><kbd>D</kbd> Cambiar de carril</div>
          <div class="ctrl"><kbd>W</kbd><kbd>␣</kbd> Saltar</div>
          <div class="ctrl"><kbd>S</kbd> Agacharse</div>
          <div class="ctrl"><kbd>ESC</kbd> Pausa</div>
        </div>
        <p class="touch-controls">Deslizá a los lados para cambiar de carril, hacia arriba para saltar y hacia abajo para agacharte. También podés tocar para saltar.</p>
        <div class="settings">
          <label class="toggle clickable"><input type="checkbox" data-sfx checked><span class="track"></span>Efectos de sonido</label>
          <input type="range" class="clickable" data-vol min="0" max="1" step="0.05" value="0.8" aria-label="Volumen">
        </div>
      </div>
    `;
    this.root.appendChild(this.menu);

    // ---- achievements
    this.achScreen = el('div', 'screen');
    this.achScreen.innerHTML = `
      <div class="scrim"></div>
      <div class="panel wide">
        <h1 class="title achievements-title">🏅 Logros</h1>
        <p class="subtitle">Objetivos simples para darle rumbo a cada carrera.</p>
        <div class="ach-list" data-list></div>
        <div class="btn-row"><button class="primary" data-back>Volver</button></div>
      </div>
    `;
    this.root.appendChild(this.achScreen);

    // ---- pause
    this.pauseScreen = el('div', 'screen');
    this.pauseScreen.innerHTML = `
      <div class="scrim"></div>
      <div class="panel">
        <h1 class="title secondary-title">⏸ Pausa</h1>
        <p class="subtitle">Tomate el tiempo que quieras.</p>
        <div class="stat-row">
          <div class="stat"><div class="label">Puntos</div><div class="value num" data-score>0</div></div>
          <div class="stat"><div class="label">Distancia</div><div class="value num" data-dist>0 m</div></div>
          <div class="stat gold"><div class="label">Monedas</div><div class="value num" data-coins>0</div></div>
        </div>
        <div class="btn-row">
          <button class="primary" data-resume>Continuar <span class="key">ESC</span></button>
          <button class="ghost" data-restart>Reiniciar</button>
          <button class="ghost" data-menu>Menú</button>
        </div>
      </div>
    `;
    this.root.appendChild(this.pauseScreen);

    // ---- game over
    this.overScreen = el('div', 'screen');
    this.overScreen.innerHTML = `
      <div class="scrim"></div>
      <div class="panel">
        <div data-badge style="margin-bottom:10px"></div>
        <h1 class="title secondary-title">Fin de la carrera</h1>
        <p class="subtitle" data-flavour>Ese cactus no se movió ni un centímetro.</p>
        <div class="stat-row">
          <div class="stat big"><div class="label">Puntos</div><div class="value num" data-score>0</div></div>
          <div class="stat"><div class="label">Distancia</div><div class="value num" data-dist>0 m</div></div>
          <div class="stat gold"><div class="label">Monedas</div><div class="value num" data-coins>0</div></div>
        </div>
        <div class="stat-row" style="margin-top:-10px">
          <div class="stat"><div class="label">Récord</div><div class="value num" data-best>0</div></div>
          <div class="stat"><div class="label">Total monedas</div><div class="value num" data-total>0</div></div>
          <div class="stat"><div class="label">Esquivados</div><div class="value num" data-dodged>0</div></div>
        </div>
        <div class="unlocked-list" data-unlocked></div>
        <div class="btn-row">
          <button class="primary" data-retry>Reintentar <span class="key">R</span></button>
          <button class="ghost" data-menu>Menú</button>
        </div>
      </div>
    `;
    this.root.appendChild(this.overScreen);

    // Only the contents scroll; primary actions remain reachable at any height.
    for (const [screen, label] of [
      [this.menu, 'Opciones del juego'], [this.achScreen, 'Lista de logros'],
      [this.pauseScreen, 'Datos de la partida'], [this.overScreen, 'Resultados de la carrera'],
    ]) {
      const panel = screen.querySelector('.panel');
      const actions = panel.querySelector('.btn-row');
      actions.classList.add('panel-actions');
      const content = el('div', 'panel-content');
      content.tabIndex = 0;
      content.setAttribute('data-scrollable', '');
      content.setAttribute('role', 'region');
      content.setAttribute('aria-label', label);
      for (const child of [...panel.children]) if (child !== actions) content.appendChild(child);
      panel.replaceChildren(content, actions);
    }

    this.fps = el('div');
    this.fps.id = 'fps';
    this.root.appendChild(this.fps);
  }

  // -- events -------------------------------------------------------------------
  _bind() {
    const click = (root, sel, fn) => {
      const b = root.querySelector(sel);
      if (!b) return;
      b.addEventListener('click', () => { bus.emit('sfx', 'click'); fn(); });
      b.addEventListener('mouseenter', () => bus.emit('sfx', 'hover'));
    };

    click(this.menu, '[data-play]', () => this.game.start());
    click(this.hud, '[data-pause]', () => this.game.pause());
    click(this.menu, '[data-ach]', () => this._openAchievements());
    click(this.achScreen, '[data-back]', () => this._closeAchievements());
    click(this.pauseScreen, '[data-resume]', () => this.game.resume());
    click(this.pauseScreen, '[data-restart]', () => this.game.restart());
    click(this.pauseScreen, '[data-menu]', () => this.game.enterMenu());
    click(this.overScreen, '[data-retry]', () => this.game.restart());
    click(this.overScreen, '[data-menu]', () => this.game.enterMenu());

    const sfxBox = this.menu.querySelector('[data-sfx]');
    sfxBox.checked = profile.data.settings.sfx !== false;
    audio.setEnabled(sfxBox.checked);
    sfxBox.addEventListener('change', () => {
      audio.unlock();
      audio.setEnabled(sfxBox.checked);
      profile.setSetting('sfx', sfxBox.checked);
      if (sfxBox.checked) bus.emit('sfx', 'click');
    });

    const vol = this.menu.querySelector('[data-vol]');
    vol.value = String(profile.data.settings.volume ?? 0.8);
    audio.setVolume(Number(vol.value));
    vol.addEventListener('input', () => {
      audio.unlock();
      audio.setVolume(Number(vol.value));
      profile.setSetting('volume', Number(vol.value));
    });
    vol.addEventListener('change', () => bus.emit('sfx', 'click'));

    bus.on('hud', (d) => this._updateHud(d));
    bus.on('state', (d) => this.setState(d.state));
    bus.on('gameover', (d) => this._showGameOver(d));
    bus.on('toast', (d) => this.toast(d.text, d.kind));
    bus.on('achievement', (a) => this.toast(
      `<span>${a.icon}</span><span>Logro desbloqueado · <span class="ach-name">${a.name}</span></span>`,
      'achievement',
    ));
    bus.on('coin', () => this._bumpCoins());

    bus.on('input', (action) => {
      if (this.showAchievements) {
        if (action === 'confirm' || action === 'pause' || action === 'jump') this._closeAchievements();
        return;
      }
      const s = this.game.state;
      if (s === STATE.MENU && (action === 'confirm' || action === 'jump')) this.game.start();
      else if (s === STATE.DEAD && (action === 'confirm' || action === 'restart' || action === 'jump')) this.game.restart();
      else if (s === STATE.PAUSED && action === 'restart') this.game.restart();
    });
  }

  // -- state --------------------------------------------------------------------
  setState(state) {
    const show = (node, on) => node.classList.toggle('show', on);
    show(this.menu, state === STATE.MENU && !this.showAchievements);
    show(this.achScreen, this.showAchievements);
    show(this.pauseScreen, state === STATE.PAUSED);
    show(this.overScreen, false);
    this.hud.classList.toggle('visible', state === STATE.PLAYING || state === STATE.PAUSED || state === STATE.DEAD);
    this.hud.classList.toggle('playing', state === STATE.PLAYING && !this.showAchievements);
    if (state === STATE.MENU) this._refreshMenu();
    if (state === STATE.PAUSED) this._refreshPause();
    if (state === STATE.PLAYING) this.toasts.innerHTML = '';
    this.game.input.setTouchEnabled(state === STATE.PLAYING && !this.showAchievements);
    // A hidden button must not keep capturing keys after its screen closes.
    const active = document.activeElement;
    if (active && this.root.contains(active) && !active.getClientRects().length) active.blur();
  }

  _refreshMenu() {
    const d = profile.data;
    this.menu.querySelector('[data-best]').textContent = fmt(d.bestScore);
    this.menu.querySelector('[data-bestdist]').textContent = `${fmt(d.bestDistance)} m`;
    this.menu.querySelector('[data-coins]').textContent = fmt(d.coins);
  }

  _refreshPause() {
    const r = this.game.run;
    this.pauseScreen.querySelector('[data-score]').textContent = fmt(r.score);
    this.pauseScreen.querySelector('[data-dist]').textContent = `${fmt(r.distance)} m`;
    this.pauseScreen.querySelector('[data-coins]').textContent = fmt(r.coins);
  }

  _openAchievements() {
    this.showAchievements = true;
    const list = this.achScreen.querySelector('[data-list]');
    list.innerHTML = '';
    for (const a of achievementProgress(this.game.run)) {
      const row = el('div', `ach${a.unlocked ? ' done' : ''}`);
      row.innerHTML = `
        <div class="icon">${a.icon}</div>
        <div class="txt">
          <div class="name">${a.name}</div>
          <div class="desc">${a.desc}</div>
          ${a.unlocked ? '' : `<div class="bar"><i style="width:${Math.round(a.value * 100)}%"></i></div>`}
        </div>
        ${a.unlocked ? '<div class="check">✓</div>' : ''}
      `;
      list.appendChild(row);
    }
    this.setState(this.game.state);
  }

  _closeAchievements() {
    this.showAchievements = false;
    this.setState(this.game.state);
  }

  _showGameOver(d) {
    const p = this.overScreen;
    p.querySelector('[data-score]').textContent = fmt(d.run.score);
    p.querySelector('[data-dist]').textContent = `${fmt(d.run.distance)} m`;
    p.querySelector('[data-coins]').textContent = `+${fmt(d.run.coins)}`;
    p.querySelector('[data-best]').textContent = fmt(d.best);
    p.querySelector('[data-total]').textContent = fmt(d.coins);
    p.querySelector('[data-dodged]').textContent = fmt(d.run.dodged);
    p.querySelector('[data-badge]').innerHTML = d.newBest
      ? '<span class="record-badge">🏆 Nuevo récord</span>' : '';

    const flavours = [
      'Ese cactus no se movió ni un centímetro.',
      'El pterodáctilo te vio venir.',
      'Casi. Muy casi.',
      'La próxima, un carril más a la izquierda.',
      'La velocidad es una gran maestra.',
    ];
    p.querySelector('[data-flavour]').textContent = d.newBest
      ? '¡Mejor carrera hasta ahora!'
      : flavours[Math.floor(Math.random() * flavours.length)];

    const ul = p.querySelector('[data-unlocked]');
    ul.innerHTML = '';
    for (const a of d.unlocked) {
      ul.appendChild(el('div', 'unlocked', `<span>${a.icon}</span><span><b>${a.name}</b> · ${a.desc}</span>`));
    }
    p.classList.add('show');
  }

  // -- HUD ----------------------------------------------------------------------
  _updateHud(d) {
    this.$score.textContent = fmt(d.score);
    this.$dist.textContent = `${fmt(d.distance)} m`;
    this.$coins.textContent = fmt(d.coins);
    this.$biome.textContent = d.biome ?? '';
    const best = profile.data.bestScore;
    this.$best.textContent = best > 0 ? `Récord ${fmt(best)}` : '';
    this.$multi.classList.toggle('on', d.multiplier > 1);

    for (const [key, pill] of Object.entries(this.pills)) {
      const v = d.powers[key] ?? 0;
      const on = v > 0;
      pill.root.classList.toggle('on', on);
      pill.root.classList.toggle('ending', on && v < 0.24);
      if (on) {
        pill.ring.style.setProperty('--p', v.toFixed(3));
        const secs = v * (key === 'shield' ? 9 : key === 'magnet' ? 9.5 : 10);
        pill.time.textContent = `${secs.toFixed(1)}s`;
      }
    }

    this.$speedfx.style.opacity = String(Math.max(0, (d.speed01 - 0.45) * 0.85));
  }

  _bumpCoins() {
    const n = this.$coins.parentElement;
    n.animate(
      [{ transform: 'scale(1)' }, { transform: 'scale(1.16)' }, { transform: 'scale(1)' }],
      { duration: 220, easing: 'cubic-bezier(0.2,1.6,0.4,1)' },
    );
  }

  toast(html, kind = '') {
    const t = el('div', `toast ${kind}`, html);
    this.toasts.appendChild(t);
    setTimeout(() => t.remove(), 2100);
    while (this.toasts.children.length > 3) this.toasts.firstChild.remove();
  }

  setFps(value, show) {
    this.fps.classList.toggle('show', show);
    if (show) this.fps.textContent = `${Math.round(value)} fps`;
  }
}
