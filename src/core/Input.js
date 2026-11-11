import { bus } from './Signals.js';

const KEY_MAP = {
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  ArrowUp: 'jump', KeyW: 'jump', Space: 'jump',
  ArrowDown: 'down', KeyS: 'down',
  Escape: 'pause', KeyP: 'pause',
  Enter: 'confirm', KeyR: 'restart',
};

const UI_CONTROL = 'button, input, select, textarea, a[href], label, [contenteditable]:not([contenteditable="false"]), [role="button"], [role="slider"], [data-scrollable], .clickable';
const isControl = (target) => !!target?.closest?.(UI_CONTROL);

/**
 * Keyboard + pointer input. Emits discrete `input` actions and exposes a held
 * state for continuous checks (variable jump height, hold-to-duck).
 */
export class Input {
  constructor(target = window) {
    this.held = { left: false, right: false, jump: false, down: false };
    this.enabled = true;
    this.touchEnabled = true;
    this._pressedKeys = new Set();
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
    if (!action || !this.enabled || e.defaultPrevented || e.isComposing || e.ctrlKey || e.metaKey || e.altKey) return;
    // Focused controls keep their native activation and editing keys.
    // Escape remains available to close a screen or resume a paused run.
    if (isControl(e.target) && e.code !== 'Escape') return;
    // Gameplay keys must not scroll the page.
    if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
    if (e.repeat) return;
    this._pressedKeys.add(e.code);
    if (action in this.held) this.held[action] = true;
    bus.emit('input', action);
  }

  _onKeyUp(e) {
    const action = KEY_MAP[e.code];
    if (!action || !this._pressedKeys.delete(e.code)) return;
    if (action in this.held) {
      this.held[action] = [...this._pressedKeys].some((code) => KEY_MAP[code] === action);
      if (this.held[action]) return;
    }
    bus.emit('input:up', action);
  }

  _onBlur() {
    this._pressedKeys.clear();
    this._touchStart = null;
    for (const k of Object.keys(this.held)) this.held[k] = false;
    bus.emit('window:blur');
  }

  setTouchEnabled(enabled) {
    this.touchEnabled = !!enabled;
    this._touchStart = null;
  }

  /** Swipe support: cheap to add, keeps the game playable on a touch laptop. */
  _initTouch() {
    const el = this._touchElement = document.getElementById('app') || document.body;
    this._touchStart = null;
    this._onTouchStart = (e) => {
      this._touchStart = null;
      if (!this.enabled || !this.touchEnabled || e.defaultPrevented || isControl(e.target) || e.touches.length !== 1) return;
      const t = e.changedTouches[0];
      if (t) this._touchStart = { id: t.identifier, x: t.clientX, y: t.clientY, time: performance.now() };
    };
    this._onTouchEnd = (e) => {
      const start = this._touchStart;
      if (!start) return;
      const t = [...e.changedTouches].find((touch) => touch.identifier === start.id);
      if (!t) return;
      this._touchStart = null;
      if (!this.enabled || !this.touchEnabled || e.defaultPrevented || isControl(e.target)) return;
      const dx = t.clientX - start.x, dy = t.clientY - start.y;
      if (performance.now() - start.time > 700) return;
      const adx = Math.abs(dx), ady = Math.abs(dy);
      if (Math.max(adx, ady) < 32) { bus.emit('input', 'jump'); return; }
      if (adx > ady) bus.emit('input', dx > 0 ? 'right' : 'left');
      else bus.emit('input', dy > 0 ? 'down' : 'jump');
    };
    this._onTouchCancel = () => { this._touchStart = null; };
    el.addEventListener('touchstart', this._onTouchStart, { passive: true });
    el.addEventListener('touchend', this._onTouchEnd, { passive: true });
    el.addEventListener('touchcancel', this._onTouchCancel, { passive: true });
  }

  dispose() {
    this._target.removeEventListener('keydown', this._onKeyDown);
    this._target.removeEventListener('keyup', this._onKeyUp);
    this._target.removeEventListener('blur', this._onBlur);
    this._touchElement.removeEventListener('touchstart', this._onTouchStart);
    this._touchElement.removeEventListener('touchend', this._onTouchEnd);
    this._touchElement.removeEventListener('touchcancel', this._onTouchCancel);
    this._pressedKeys.clear();
    this._touchStart = null;
    for (const key of Object.keys(this.held)) this.held[key] = false;
  }
}
