/** Minimal synchronous event bus. */
export class Signals {
  constructor() { this.map = new Map(); }

  on(evt, fn) {
    if (!this.map.has(evt)) this.map.set(evt, new Set());
    this.map.get(evt).add(fn);
    return () => this.off(evt, fn);
  }

  off(evt, fn) { this.map.get(evt)?.delete(fn); }

  emit(evt, payload) {
    const set = this.map.get(evt);
    if (!set) return;
    for (const fn of [...set]) {
      try { fn(payload); } catch (err) { console.error(`[signal:${evt}]`, err); }
    }
  }
}

export const bus = new Signals();
