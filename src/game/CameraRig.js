import * as THREE from 'three';
import { CFG } from '../core/Config.js';
import { clamp, lerp, damp } from '../core/MathUtils.js';

/**
 * Chase camera: sits behind and slightly to the side of the dino, drifts with
 * lane changes, widens with speed and adds impact shake.
 */
export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.base = new THREE.Vector3(...CFG.camera.offset);
    this.lookBase = new THREE.Vector3(...CFG.camera.lookAt);
    this.pos = this.base.clone();
    this.look = this.lookBase.clone();
    this.shake = 0;
    this.shakeSeed = Math.random() * 100;
    this.intro = 0;
    this._target = new THREE.Vector3();
    this._lookTarget = new THREE.Vector3();
    this._tmp = new THREE.Vector3();
  }

  reset(instant = true) {
    this.shake = 0;
    this.intro = 1;
    if (instant) {
      this.pos.copy(this.base);
      this.look.copy(this.lookBase);
      this.camera.position.copy(this.pos);
      this.camera.lookAt(this.look);
      this.camera.fov = CFG.camera.fov;
      this.camera.updateProjectionMatrix();
    }
  }

  addShake(amount) { this.shake = Math.min(1.4, this.shake + amount); }

  /**
   * @param {object} s { dt, playerX, playerY, speed01, dead, deadTime, menu }
   */
  update(s) {
    if (this.frozen) return;
    const dt = s.dt;
    const c = CFG.camera;

    // Follow the dino laterally, but only partially - a fixed-ish camera reads
    // the three lanes better than a hard lock.
    const followX = s.playerX * 0.62;
    const followY = clamp(s.playerY * 0.32, 0, 1.4);

    this._target.set(
      c.offset[0] + followX,
      c.offset[1] + followY + s.speed01 * 0.18,
      c.offset[2] - s.speed01 * 0.35,
    );
    this._lookTarget.set(
      c.lookAt[0] + s.playerX * 0.72,
      c.lookAt[1] + followY * 0.7,
      c.lookAt[2] - s.speed01 * 2.2,
    );

    if (s.dead) {
      // Pull back and drop slightly for a clean "wipeout" read.
      const k = clamp(s.deadTime / 1.1, 0, 1);
      this._target.x += Math.sin(k * Math.PI * 0.5) * 1.4;
      this._target.y += k * 0.9;
      this._target.z += k * 3.0;
      this._lookTarget.x = lerp(this._lookTarget.x, s.playerX, k);
      this._lookTarget.y = lerp(this._lookTarget.y, 1.1, k);
      this._lookTarget.z = lerp(this._lookTarget.z, 0.5, k);
    }

    if (this.intro > 0) {
      this.intro = Math.max(0, this.intro - dt / 1.1);
      const e = this.intro * this.intro;
      this._target.z += e * 7.5;
      this._target.y += e * 2.6;
      this._target.x -= e * 2.2;
    }

    const rate = s.dead ? 3.2 : c.lagPos;
    this.pos.x = damp(this.pos.x, this._target.x, rate, dt);
    this.pos.y = damp(this.pos.y, this._target.y, rate, dt);
    this.pos.z = damp(this.pos.z, this._target.z, rate, dt);
    this.look.x = damp(this.look.x, this._lookTarget.x, c.lagLook, dt);
    this.look.y = damp(this.look.y, this._lookTarget.y, c.lagLook, dt);
    this.look.z = damp(this.look.z, this._lookTarget.z, c.lagLook, dt);

    this.camera.position.copy(this.pos);

    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * CFG.camera.shakeDecay);
      const a = this.shake * this.shake;
      const t = performance.now() * 0.001;
      this.camera.position.x += Math.sin(t * 47 + this.shakeSeed) * a * 0.42;
      this.camera.position.y += Math.sin(t * 39 + this.shakeSeed * 2) * a * 0.34;
      this.camera.position.z += Math.sin(t * 53 + this.shakeSeed * 3) * a * 0.2;
    }

    this.camera.lookAt(this.look);
    // A touch of roll while strafing sells the momentum.
    this.camera.rotation.z += -s.laneT * 0.035;

    const fov = CFG.camera.fov + s.speed01 * CFG.camera.fovBoost + this.shake * 2.5;
    if (Math.abs(this.camera.fov - fov) > 0.01) {
      this.camera.fov = damp(this.camera.fov, fov, 5, dt);
      this.camera.updateProjectionMatrix();
    }
  }
}
