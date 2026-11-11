/**
 * Procedural sound design with the Web Audio API.
 *
 * Every effect is synthesised at runtime from oscillators and noise, so the
 * game ships with zero audio files, zero network requests and no licensing
 * questions at all - the waveforms are generated here, in code.
 *
 * No background music by design; only interaction feedback.
 */

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.enabled = true;
    this.volume = 0.8;
    this._noiseBuffer = null;
    this._unlocked = false;
    this._lastPlay = new Map();
  }

  init() {
    if (this.ctx) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) { this.enabled = false; return; }
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;

    // Gentle bus compression keeps stacked pickups from clipping.
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 22;
    comp.ratio.value = 7;
    comp.attack.value = 0.003;
    comp.release.value = 0.22;
    this.master.connect(comp);
    comp.connect(this.ctx.destination);
    this.comp = comp;

    this._noiseBuffer = this._makeNoise(1.2);
  }

  /** Browsers require a gesture before audio can start. */
  unlock() {
    this.init();
    if (!this.ctx) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();
    this._unlocked = true;
  }

  setVolume(v) {
    this.volume = clamp01(v);
    if (this.master) this.master.gain.setTargetAtTime(this.enabled ? this.volume : 0, this.ctx.currentTime, 0.02);
  }

  setEnabled(on) {
    this.enabled = on;
    if (this.master) this.master.gain.setTargetAtTime(on ? this.volume : 0, this.ctx.currentTime, 0.02);
  }

  _makeNoise(seconds) {
    const len = Math.floor(this.ctx.sampleRate * seconds);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      // Slight low-pass on the noise: less harsh than pure white.
      last = last * 0.35 + white * 0.65;
      d[i] = last;
    }
    return buf;
  }

  get now() { return this.ctx ? this.ctx.currentTime : 0; }

  _ready() {
    if (!this.enabled) return false;
    if (!this.ctx) this.init();
    if (!this.ctx) return false;
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return true;
  }

  /** Rate-limit a sound id so rapid retriggers do not build a wall of noise. */
  _throttle(id, ms) {
    const t = performance.now();
    const last = this._lastPlay.get(id) ?? -1e9;
    if (t - last < ms) return false;
    this._lastPlay.set(id, t);
    return true;
  }

  // --- primitives ----------------------------------------------------------

  tone({ freq = 440, freq2 = null, type = 'sine', dur = 0.2, gain = 0.3, delay = 0,
    attack = 0.005, decay = null, detune = 0, filter = null, q = 1 } = {}) {
    if (!this._ready()) return;
    const t0 = this.now + delay;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.detune.value = detune;
    osc.frequency.setValueAtTime(freq, t0);
    if (freq2 !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(1, freq2), t0 + dur);

    const g = this.ctx.createGain();
    const rel = decay ?? dur;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + rel);

    let node = osc;
    if (filter) {
      const f = this.ctx.createBiquadFilter();
      f.type = filter.type ?? 'lowpass';
      f.frequency.setValueAtTime(filter.from ?? 2000, t0);
      if (filter.to) f.frequency.exponentialRampToValueAtTime(Math.max(40, filter.to), t0 + dur);
      f.Q.value = q;
      node.connect(f); node = f;
    }
    node.connect(g);
    g.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + attack + rel + 0.05);
  }

  noise({ dur = 0.2, gain = 0.25, delay = 0, from = 3000, to = 300, type = 'lowpass', q = 1, attack = 0.002 } = {}) {
    if (!this._ready()) return;
    const t0 = this.now + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuffer;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(from, t0);
    f.frequency.exponentialRampToValueAtTime(Math.max(40, to), t0 + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t0);
    src.stop(t0 + dur + 0.05);
  }
}

export const audio = new AudioEngine();
