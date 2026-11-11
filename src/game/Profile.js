const KEY = 'dino3d.profile.v1';

const DEFAULT = {
  coins: 0,
  bestScore: 0,
  bestDistance: 0,
  runs: 0,
  totalDistance: 0,
  totalCoins: 0,
  obstaclesDodged: 0,
  powerupsUsed: 0,
  achievements: {},          // id -> unlocked timestamp
  settings: { sfx: true, volume: 0.8, quality: 'auto' },
};

/** Persistent player profile. Degrades gracefully if storage is unavailable. */
export class Profile {
  constructor() {
    this.data = { ...DEFAULT };
    this._available = true;
    this.load();
  }

  load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        this.data = {
          ...DEFAULT,
          ...parsed,
          achievements: { ...(parsed.achievements || {}) },
          settings: { ...DEFAULT.settings, ...(parsed.settings || {}) },
        };
      }
    } catch (err) {
      console.warn('[profile] could not read save, starting fresh', err);
      this._available = false;
      this.data = { ...DEFAULT };
    }
  }

  save() {
    if (!this._available) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(this.data));
    } catch (err) {
      console.warn('[profile] save failed', err);
      this._available = false;
    }
  }

  addCoins(n) {
    this.data.coins += n;
    this.data.totalCoins += n;
    this.saveSoon();
  }

  /** Debounced write so a coin rush does not hammer localStorage. */
  saveSoon() {
    if (this._saveTimer) return;
    this._saveTimer = setTimeout(() => {
      this._saveTimer = null;
      this.save();
    }, 1200);
  }

  /** Commit an end-of-run summary. @returns {{newBest:boolean}} */
  commitRun(run) {
    this.data.runs++;
    this.data.totalDistance += Math.floor(run.distance);
    this.data.obstaclesDodged += run.dodged;
    this.data.powerupsUsed += run.powerups;
    const newBest = run.score > this.data.bestScore;
    if (newBest) this.data.bestScore = Math.floor(run.score);
    if (run.distance > this.data.bestDistance) this.data.bestDistance = Math.floor(run.distance);
    this.save();
    return { newBest };
  }

  unlock(id) {
    if (this.data.achievements[id]) return false;
    this.data.achievements[id] = Date.now();
    this.save();
    return true;
  }

  isUnlocked(id) { return !!this.data.achievements[id]; }

  setSetting(k, v) {
    this.data.settings[k] = v;
    this.save();
  }

  reset() {
    this.data = { ...DEFAULT, achievements: {}, settings: { ...DEFAULT.settings } };
    this.save();
  }
}

export const profile = new Profile();
