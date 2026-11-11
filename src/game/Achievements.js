import { profile } from './Profile.js';
import { bus } from '../core/Signals.js';

/**
 * Small, readable goal list. Each entry checks either the live run stats or
 * the lifetime profile; `progress` powers the bars on the menu screen.
 */
export const ACHIEVEMENTS = [
  {
    id: 'first-run', icon: '🦖', name: 'Primeros pasos', desc: 'Recorré 500 m en una partida',
    check: (r) => r.distance >= 500,
    progress: (r, p) => Math.min(1, Math.max(p.bestDistance, r?.distance ?? 0) / 500),
  },
  {
    id: 'marathon', icon: '🏃', name: 'Maratón', desc: 'Recorré 2.000 m en una partida',
    check: (r) => r.distance >= 2000,
    progress: (r, p) => Math.min(1, Math.max(p.bestDistance, r?.distance ?? 0) / 2000),
  },
  {
    id: 'collector', icon: '🪙', name: 'Coleccionista', desc: 'Juntá 100 monedas en total',
    check: (r, p) => p.totalCoins >= 100,
    progress: (r, p) => Math.min(1, p.totalCoins / 100),
  },
  {
    id: 'gold-rush', icon: '💰', name: 'Fiebre del oro', desc: 'Juntá 1.000 monedas en total',
    check: (r, p) => p.totalCoins >= 1000,
    progress: (r, p) => Math.min(1, p.totalCoins / 1000),
  },
  {
    id: 'high-score', icon: '⭐', name: 'Cazarrécords', desc: 'Superá los 10.000 puntos',
    check: (r) => r.score >= 10000,
    progress: (r, p) => Math.min(1, p.bestScore / 10000),
  },
  {
    id: 'dodger', icon: '🌵', name: 'Esquivador', desc: 'Esquivá 50 obstáculos en una partida',
    check: (r) => r.dodged >= 50,
    progress: (r, p) => Math.min(1, (r?.dodged ?? 0) / 50),
  },
  {
    id: 'tourist', icon: '🗺️', name: 'Turista', desc: 'Visitá 3 biomas en una sola partida',
    check: (r) => r.biomes.size >= 3,
    progress: (r) => Math.min(1, (r?.biomes.size ?? 0) / 3),
  },
  {
    id: 'charged', icon: '⚡', name: 'Cargado', desc: 'Usá los 3 power-ups en una partida',
    check: (r) => r.powerTypes.size >= 3,
    progress: (r) => Math.min(1, (r?.powerTypes.size ?? 0) / 3),
  },
  {
    id: 'nightrunner', icon: '🌙', name: 'Corredor nocturno', desc: 'Recorré 400 m de noche',
    check: (r) => r.nightDistance >= 400,
    progress: (r) => Math.min(1, (r?.nightDistance ?? 0) / 400),
  },
  {
    id: 'max-speed', icon: '🚀', name: 'Imparable', desc: 'Alcanzá la velocidad máxima',
    check: (r) => r.maxSpeedReached,
    progress: (r) => (r?.maxSpeedReached ? 1 : Math.min(1, (r?.topSpeed ?? 0) / 44)),
  },
];

/** Evaluate every achievement against the current run; emits `achievement`. */
export function evaluateAchievements(run) {
  const unlocked = [];
  for (const a of ACHIEVEMENTS) {
    if (profile.isUnlocked(a.id)) continue;
    let hit = false;
    try { hit = !!a.check(run, profile.data); } catch { hit = false; }
    if (hit && profile.unlock(a.id)) {
      unlocked.push(a);
      bus.emit('achievement', a);
    }
  }
  return unlocked;
}

export function achievementProgress(run) {
  return ACHIEVEMENTS.map((a) => ({
    ...a,
    unlocked: profile.isUnlocked(a.id),
    value: profile.isUnlocked(a.id) ? 1 : Math.max(0, Math.min(1, a.progress(run, profile.data) || 0)),
  }));
}
