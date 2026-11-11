import { CFG } from './Config.js';

const TIERS = [
  { scale: 1.0, shadows: true, shadowSize: 2048 },
  { scale: 0.88, shadows: true, shadowSize: 1536 },
  { scale: 0.78, shadows: true, shadowSize: 1024 },
  { scale: 0.7, shadows: false, shadowSize: 1024 },
];

/**
 * Keeps the frame rate honest on weaker GPUs: drops render scale, then shadow
 * resolution, then shadows entirely - and climbs back when there is headroom.
 * Changes are rate-limited so it never oscillates visibly.
 */
export class QualityController {
  constructor(engine, game) {
    this.engine = engine;
    this.game = game;
    this.tier = 0;
    this._lowTime = 0;
    this._highTime = 0;
    this._cooldown = 3;
    this._apply();
  }

  _apply() {
    const t = TIERS[this.tier];
    this.engine.setRenderScale(t.scale);
    const r = this.engine.renderer;
    if (r.shadowMap.enabled !== t.shadows) {
      r.shadowMap.enabled = t.shadows;
      r.shadowMap.needsUpdate = true;
      this.game.scene.traverse((o) => { if (o.isMesh && o.material) o.material.needsUpdate = true; });
    }
    const sun = this.game.env?.sun;
    if (sun && sun.shadow.mapSize.width !== t.shadowSize) {
      sun.shadow.mapSize.set(t.shadowSize, t.shadowSize);
      sun.shadow.map?.dispose();
      sun.shadow.map = null;
    }
  }

  update(dt) {
    this._cooldown -= dt;
    if (this._cooldown > 0) return;
    const fps = this.engine.fps;

    if (fps < 48) { this._lowTime += dt; this._highTime = 0; }
    else if (fps > 57) { this._highTime += dt; this._lowTime = 0; }
    else { this._lowTime = Math.max(0, this._lowTime - dt * 0.5); }

    if (this._lowTime > 2.2 && this.tier < TIERS.length - 1) {
      this.tier++;
      this._apply();
      this._lowTime = 0;
      this._cooldown = 4;
      console.info(`[quality] stepped down to tier ${this.tier} (${fps.toFixed(0)} fps)`);
    } else if (this._highTime > 8 && this.tier > 0) {
      this.tier--;
      this._apply();
      this._highTime = 0;
      this._cooldown = 6;
      console.info(`[quality] stepped up to tier ${this.tier}`);
    }
  }
}
