import * as THREE from 'three';
import { CFG, LANE_COUNT } from '../core/Config.js';
import { clamp, lerp, damp, easeInOutCubic } from '../core/MathUtils.js';
import { DinoModel } from '../entities/DinoModel.js';
import { bus } from '../core/Signals.js';

/**
 * Lane-based runner controller. Owns movement, the jump arc, the crouch and
 * the collider box the collision system reads. Rendering lives in DinoModel.
 */
export class Player {
  constructor(scene) {
    this.model = new DinoModel();
    scene.add(this.model.root);

    this.lane = 1;
    this.targetLane = 1;
    this.laneProgress = 1;       // 0..1 through the current slide
    this.laneFrom = CFG.lanes.x[1];
    this.x = CFG.lanes.x[1];
    this.y = 0;
    this.vy = 0;
    this.grounded = true;
    this.state = 'run';          // run | air | duck | dead
    this.duckTimer = 0;
    this.coyote = 0;
    this.jumpBuffer = 0;
    this.jumpHeld = false;
    this.alive = true;
    this.laneT = 0;              // -1..1 lateral blend, used for lean/tail

    this.box = new THREE.Box3();
    this._size = new THREE.Vector3();
    this._center = new THREE.Vector3();
  }

  reset() {
    this.lane = this.targetLane = 1;
    this.laneProgress = 1;
    this.laneFrom = this.x = CFG.lanes.x[1];
    this.y = 0; this.vy = 0;
    this.grounded = true;
    this.state = 'run';
    this.duckTimer = 0;
    this.coyote = 0; this.jumpBuffer = 0;
    this.alive = true;
    this.laneT = 0;
    this.model.reset();
    this.model.root.position.set(this.x, 0, 0);
    this.model.root.visible = true;
  }

  get colliderHeight() {
    return this.state === 'duck' ? CFG.player.duckHeight : CFG.player.standHeight;
  }

  moveLane(dir) {
    if (!this.alive) return;
    const next = clamp(this.targetLane + dir, 0, LANE_COUNT - 1);
    if (next === this.targetLane) {
      bus.emit('sfx', 'laneBlocked');
      return;
    }
    this.laneFrom = this.x;
    this.targetLane = next;
    this.laneProgress = 0;
    bus.emit('sfx', 'lane');
  }

  requestJump() {
    if (!this.alive) return;
    this.jumpBuffer = CFG.jump.bufferTime;
  }

  requestDuck() {
    if (!this.alive) return;
    if (this.grounded) {
      this.state = 'duck';
      this.duckTimer = CFG.duck.minTime;
      bus.emit('sfx', 'duck');
    } else {
      // Air-slam: ducking mid-jump drops you fast, a real skill expression.
      this.vy -= 6;
      this._slamming = true;
      bus.emit('sfx', 'slam');
    }
  }

  releaseDuck() {
    if (this.state === 'duck' && this.duckTimer <= 0) this.state = 'run';
  }

  releaseJump() { this.jumpHeld = false; }

  _doJump() {
    this.vy = CFG.jump.velocity;
    this.grounded = false;
    this.state = 'air';
    this.coyote = 0;
    this.jumpBuffer = 0;
    this.jumpHeld = true;
    this._slamming = false;
    bus.emit('sfx', 'jump');
    bus.emit('fx:jumpDust', { x: this.x });
  }

  kill() {
    if (!this.alive) return;
    this.alive = false;
    this.state = 'dead';
    this.vy = Math.max(this.vy, 6.5);
  }

  update(dt, speed01, inputHeld) {
    // --- lane slide ---------------------------------------------------------
    if (this.laneProgress < 1) {
      this.laneProgress = Math.min(1, this.laneProgress + dt / CFG.lanes.changeTime);
      const t = easeInOutCubic(this.laneProgress);
      this.x = lerp(this.laneFrom, CFG.lanes.x[this.targetLane], t);
      if (this.laneProgress >= 1) this.lane = this.targetLane;
    } else {
      this.x = CFG.lanes.x[this.targetLane];
      this.lane = this.targetLane;
    }

    const laneCentre = CFG.lanes.x[this.targetLane];
    const dx = (laneCentre - this.x) / (CFG.lanes.x[2] - CFG.lanes.x[1] || 1);
    this.laneT = damp(this.laneT, clamp(-dx, -1, 1), 12, dt);

    if (!this.alive) {
      // Death arc: pop up then fall away.
      this.vy -= CFG.jump.gravity * 0.9 * dt;
      this.y = Math.max(0, this.y + this.vy * dt);
      this.model.root.position.set(this.x, this.y, 0);
      this.model.update({ state: 'dead', dt, speed01, grounded: this.y <= 0, vy: this.vy, laneT: 0 });
      return;
    }

    // --- vertical -----------------------------------------------------------
    this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);
    this.coyote = Math.max(0, this.coyote - dt);

    if (this.jumpBuffer > 0 && (this.grounded || this.coyote > 0)) {
      if (this.state === 'duck' && this.duckTimer > 0) {
        // Let the crouch finish; the buffer keeps the input alive.
      } else {
        this._doJump();
      }
    }

    if (!this.grounded) {
      let g = CFG.jump.gravity;
      if (this.vy < 0) g *= CFG.jump.fallMultiplier;
      else if (!inputHeld.jump) g *= CFG.jump.cutMultiplier;
      if (this._slamming) g *= CFG.duck.airSlamGravityMul;
      this.vy -= g * dt;
      this.y += this.vy * dt;
      if (this.y <= 0) {
        this.y = 0;
        const impact = -this.vy;
        this.vy = 0;
        this.grounded = true;
        this._slamming = false;
        this.state = inputHeld.down ? 'duck' : 'run';
        if (this.state === 'duck') this.duckTimer = CFG.duck.minTime;
        bus.emit('sfx', 'land');
        bus.emit('fx:landDust', { x: this.x, power: clamp(impact / 22, 0.3, 1.4) });
      } else {
        this.state = 'air';
      }
    } else {
      this.coyote = CFG.jump.coyoteTime;
      if (this.state === 'duck') {
        this.duckTimer -= dt;
        if (this.duckTimer <= 0 && !inputHeld.down) this.state = 'run';
      } else if (this.state !== 'run') {
        this.state = 'run';
      }
    }

    // --- transform + animation ---------------------------------------------
    this.model.root.position.set(this.x, this.y, 0);
    this.model.tilt.rotation.z = -this.laneT * CFG.lanes.tiltMax;
    this.model.tilt.rotation.y = this.laneT * 0.16;
    this.model.update({
      state: this.state === 'air' ? 'air' : this.state,
      dt, speed01, grounded: this.grounded, vy: this.vy, laneT: this.laneT,
    });

    this._updateCollider();
  }

  _updateCollider() {
    const h = this.colliderHeight;
    const w = CFG.player.width, d = CFG.player.depth;
    this._center.set(this.x, this.y + h / 2, 0);
    this._size.set(w, h, d);
    this.box.setFromCenterAndSize(this._center, this._size);
  }
}
