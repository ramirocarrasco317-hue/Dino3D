import { bus } from './Signals.js';

const KEY_MAP = {
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  ArrowUp: 'jump', KeyW: 'jump', Space: 'jump',
  ArrowDown: 'down', KeyS: 'down',
  Escape: 'pause', KeyP: 'pause',
  Enter: 'confirm', KeyR: 'restart',
};

/**
 * Keyboard + pointer input. Emits discrete `input` actions and exposes a held
 * state for continuous checks (variable jump height, hold-to-duck).
 */
export class Input {
  constructor(target = window) {
    this.held = { left: false, right: false, jump: false, down: false };
    this.enabled = true;
    this._target = target;
    this._onKeyDown = this._onKeyDown.bind(this);
    this._onKeyUp = this._onKeyUp.bind(this);
    this._onBlur = this._onBlur.bind(this);
    target.addEventListener('keydown', this._onKeyDown, { passive: false });
    target.addEventListener('keyup', this._onKeyUp);
    target.addEventListener('blur', this._onBlur);
    this._initTouch();
  }

  _onKeyDown(e) {
    const action = KEY_MAP[e.code];
    if (!action) return;
    // Space / arrows must not scroll the page or re-trigger a focused button.
    if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
    if (e.repeat) return;
    if (!this.enabled) return;
    if (action in this.held) this.held[action] = true;
    bus.emit('input', action);
  }

  _onKeyUp(e) {
    const action = KEY_MAP[e.code];
    if (!action) return;
    if (action in this.held) this.held[action] = false;
    bus.emit('input:up', action);
  }

  _onBlur() {
    for (const k of Object.keys(this.held)) this.held[k] = false;
    bus.emit('window:blur');
  }

  /** Swipe support: cheap to add, keeps the game playable on a touch laptop. */
  _initTouch() {
    const el = document.getElementById('app') || document.body;
    let sx = 0, sy = 0, st = 0, active = false;
    el.addEventListener('touchstart', (e) => {
      const t = e.changedTouches[0];
      sx = t.clientX; sy = t.clientY; st = performance.now(); active = true;
    }, { passive: true });
    el.addEventListener('touchend', (e) => {
      if (!active || !this.enabled) return;
      active = false;
      const t = e.changedTouches[0];
      const dx = t.clientX - sx, dy = t.clientY - sy;
      if (performance.now() - st > 700) return;
      const adx = Math.abs(dx), ady = Math.abs(dy);
      if (Math.max(adx, ady) < 32) { bus.emit('input', 'jump'); return; }
      if (adx > ady) bus.emit('input', dx > 0 ? 'right' : 'left');
      else bus.emit('input', dy > 0 ? 'down' : 'jump');
    }, { passive: true });
  }

  dispose() {
    this._target.removeEventListener('keydown', this._onKeyDown);
    this._target.removeEventListener('keyup', this._onKeyUp);
    this._target.removeEventListener('blur', this._onBlur);
  }
}
