import { CFG } from '../core/Config.js';
import { bus } from '../core/Signals.js';

export const POWER_META = {
  shield: { label: 'Escudo', icon: '🛡️', color: '#38b6ff' },
  magnet: { label: 'Imán', icon: '🧲', color: '#ff4f6d' },
  multiplier: { label: 'x2', icon: '✨', color: '#b06bff' },
};

/** Timed power-up state. Emits `power:start`, `power:end`, `power:refresh`. */
export class PowerUps {
  constructor(effects) {
    this.effects = effects;
    this.timers = { shield: 0, magnet: 0, multiplier: 0 };
  }

  reset() {
    for (const k of Object.keys(this.timers)) this.timers[k] = 0;
    this.effects.setShield(false);
    this.effects.setMagnet(false);
    this.effects.setMultiplier(false);
  }

  activate(type) {
    const cfg = CFG.powerups[type];
    if (!cfg) return;
    const already = this.timers[type] > 0;
    this.timers[type] = cfg.duration;
    if (type === 'shield') this.effects.setShield(true);
    if (type === 'magnet') this.effects.setMagnet(true);
    if (type === 'multiplier') this.effects.setMultiplier(true);
    bus.emit(already ? 'power:refresh' : 'power:start', { type, duration: cfg.duration });
  }

  isActive(type) { return this.timers[type] > 0; }
  remaining(type) { return this.timers[type]; }
  ending(type) { return this.timers[type] > 0 && this.timers[type] < 2.2; }

  get scoreMultiplier() {
    return this.timers.multiplier > 0 ? CFG.powerups.multiplier.factor : 1;
  }

  /** Absorb one hit. @returns true if the hit was blocked. */
  absorbHit() {
    if (this.timers.shield <= 0) return false;
    this.timers.shield = 0;
    this.effects.setShield(false);
    bus.emit('power:end', { type: 'shield', consumed: true });
    return true;
  }

  update(dt) {
    for (const type of Object.keys(this.timers)) {
      if (this.timers[type] <= 0) continue;
      this.timers[type] -= dt;
      if (this.timers[type] <= 0) {
        this.timers[type] = 0;
        if (type === 'shield') this.effects.setShield(false);
        if (type === 'magnet') this.effects.setMagnet(false);
        if (type === 'multiplier') this.effects.setMultiplier(false);
        bus.emit('power:end', { type, consumed: false });
      }
    }
  }
}
