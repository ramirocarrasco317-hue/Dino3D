import { audio } from './AudioEngine.js';
import { bus } from '../core/Signals.js';

/**
 * The game's sound palette. Each entry is a tiny synth patch; they are tuned
 * to sit together without a music bed - short, bright, and never masking the
 * hit/death cues that actually matter.
 */
export const SFX = {
  jump() {
    audio.tone({ freq: 300, freq2: 720, type: 'triangle', dur: 0.17, gain: 0.26, attack: 0.004 });
    audio.noise({ dur: 0.09, gain: 0.06, from: 1800, to: 500 });
  },

  land() {
    if (!audio._throttle('land', 60)) return;
    audio.noise({ dur: 0.14, gain: 0.14, from: 900, to: 120 });
    audio.tone({ freq: 150, freq2: 70, type: 'sine', dur: 0.12, gain: 0.16 });
  },

  slam() {
    audio.tone({ freq: 520, freq2: 90, type: 'sawtooth', dur: 0.16, gain: 0.14, filter: { from: 2200, to: 300 } });
  },

  lane() {
    if (!audio._throttle('lane', 55)) return;
    audio.noise({ dur: 0.1, gain: 0.075, from: 4200, to: 1100, type: 'bandpass', q: 1.4 });
    audio.tone({ freq: 620, freq2: 900, type: 'sine', dur: 0.07, gain: 0.07 });
  },

  laneBlocked() {
    if (!audio._throttle('blocked', 140)) return;
    audio.tone({ freq: 190, freq2: 150, type: 'square', dur: 0.07, gain: 0.045 });
  },

  duck() {
    if (!audio._throttle('duck', 90)) return;
    audio.noise({ dur: 0.13, gain: 0.1, from: 2600, to: 380, type: 'bandpass', q: 0.9 });
  },

  coin(streak = 0) {
    // Rising arpeggio as the streak grows: satisfying without being shrill.
    const steps = [0, 2, 4, 7, 9, 12, 14, 16];
    const semis = steps[Math.min(streak, steps.length - 1)];
    const base = 880 * Math.pow(2, semis / 12);
    audio.tone({ freq: base, type: 'triangle', dur: 0.075, gain: 0.16, attack: 0.002 });
    audio.tone({ freq: base * 1.5, type: 'sine', dur: 0.11, gain: 0.1, delay: 0.035, attack: 0.002 });
  },

  power(type) {
    if (type === 'shield') {
      audio.tone({ freq: 300, freq2: 780, type: 'sine', dur: 0.32, gain: 0.2 });
      audio.tone({ freq: 450, freq2: 1170, type: 'triangle', dur: 0.34, gain: 0.12, delay: 0.04 });
      audio.noise({ dur: 0.3, gain: 0.06, from: 600, to: 4200, type: 'bandpass', q: 1.2 });
    } else if (type === 'magnet') {
      audio.tone({ freq: 220, freq2: 660, type: 'sawtooth', dur: 0.28, gain: 0.13, filter: { from: 800, to: 3400 } });
      audio.tone({ freq: 330, freq2: 990, type: 'sine', dur: 0.3, gain: 0.1, delay: 0.05 });
    } else {
      for (let i = 0; i < 4; i++) {
        audio.tone({ freq: 523.25 * Math.pow(2, i / 4), type: 'triangle', dur: 0.13, gain: 0.14, delay: i * 0.055 });
      }
    }
  },

  powerEnd() {
    audio.tone({ freq: 620, freq2: 240, type: 'sine', dur: 0.24, gain: 0.11 });
  },

  shieldBreak() {
    audio.noise({ dur: 0.34, gain: 0.24, from: 5200, to: 700, type: 'bandpass', q: 1.1 });
    audio.tone({ freq: 900, freq2: 220, type: 'square', dur: 0.2, gain: 0.12, filter: { from: 3200, to: 600 } });
    audio.tone({ freq: 1400, freq2: 500, type: 'sine', dur: 0.28, gain: 0.09, delay: 0.03 });
  },

  hit() {
    audio.noise({ dur: 0.26, gain: 0.3, from: 1600, to: 90 });
    audio.tone({ freq: 180, freq2: 48, type: 'square', dur: 0.24, gain: 0.22, filter: { from: 1400, to: 200 } });
  },

  death() {
    audio.tone({ freq: 420, freq2: 90, type: 'sawtooth', dur: 0.75, gain: 0.2, filter: { from: 2400, to: 240 } });
    audio.tone({ freq: 210, freq2: 45, type: 'triangle', dur: 0.9, gain: 0.16, delay: 0.06 });
    audio.noise({ dur: 0.5, gain: 0.1, from: 900, to: 80, delay: 0.02 });
  },

  start() {
    audio.tone({ freq: 392, type: 'triangle', dur: 0.13, gain: 0.16 });
    audio.tone({ freq: 523.25, type: 'triangle', dur: 0.13, gain: 0.16, delay: 0.09 });
    audio.tone({ freq: 784, type: 'triangle', dur: 0.24, gain: 0.18, delay: 0.18 });
  },

  gameover() {
    const notes = [523.25, 415.3, 349.23, 261.63];
    notes.forEach((f, i) => audio.tone({ freq: f, type: 'triangle', dur: 0.3, gain: 0.14, delay: i * 0.14 }));
  },

  pause() { audio.tone({ freq: 660, freq2: 440, type: 'sine', dur: 0.12, gain: 0.12 }); },
  resume() { audio.tone({ freq: 440, freq2: 660, type: 'sine', dur: 0.12, gain: 0.12 }); },

  click() {
    audio.tone({ freq: 700, freq2: 980, type: 'triangle', dur: 0.06, gain: 0.14, attack: 0.001 });
    audio.noise({ dur: 0.04, gain: 0.05, from: 5000, to: 2000, type: 'bandpass', q: 2 });
  },

  hover() {
    if (!audio._throttle('hover', 70)) return;
    audio.tone({ freq: 1100, type: 'sine', dur: 0.045, gain: 0.05, attack: 0.001 });
  },

  achievement() {
    const notes = [659.25, 830.61, 987.77, 1318.51];
    notes.forEach((f, i) => audio.tone({ freq: f, type: 'triangle', dur: 0.22, gain: 0.13, delay: i * 0.085 }));
  },

  milestone() {
    audio.tone({ freq: 880, freq2: 1320, type: 'triangle', dur: 0.18, gain: 0.12 });
    audio.tone({ freq: 1320, type: 'sine', dur: 0.2, gain: 0.09, delay: 0.1 });
  },

  newRecord() {
    const notes = [523.25, 659.25, 783.99, 1046.5, 1318.51];
    notes.forEach((f, i) => audio.tone({ freq: f, type: 'triangle', dur: 0.26, gain: 0.15, delay: i * 0.1 }));
  },
};

let coinStreak = 0;
let coinStreakTimer = 0;

export function initSfx() {
  bus.on('sfx', (name) => {
    if (name === 'coin') {
      SFX.coin(coinStreak);
      coinStreak = Math.min(coinStreak + 1, 7);
      coinStreakTimer = 0.55;
      return;
    }
    const fn = SFX[name];
    if (fn) fn();
    else console.warn('[sfx] unknown cue', name);
  });
  bus.on('sfx:power', (type) => SFX.power(type));
}

export function updateSfx(dt) {
  if (coinStreakTimer > 0) {
    coinStreakTimer -= dt;
    if (coinStreakTimer <= 0) coinStreak = 0;
  }
}
