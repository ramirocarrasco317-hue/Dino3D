import * as THREE from 'three';
import { CFG } from '../core/Config.js';
import { bus } from '../core/Signals.js';
import { rng } from '../core/Random.js';
import { clamp, invLerp, lerp } from '../core/MathUtils.js';
import { Environment } from '../world/Environment.js';
import { ChunkManager } from '../world/ChunkManager.js';
import { setObstacleNight } from '../entities/Obstacles.js';
import { BIOMES } from '../world/Biomes.js';
import { Player } from './Player.js';
import { CameraRig } from './CameraRig.js';
import { Effects } from './Effects.js';
import { PowerUps } from './PowerUps.js';
import { profile } from './Profile.js';
import { evaluateAchievements } from './Achievements.js';
import { audio } from '../audio/AudioEngine.js';
import { updateSfx } from '../audio/sfx.js';

export const STATE = {
  MENU: 'menu',
  PLAYING: 'playing',
  PAUSED: 'paused',
  DEAD: 'dead',
};

const MILESTONE = 500;

export class Game {
  constructor(engine, input) {
    this.engine = engine;
    this.input = input;
    this.scene = engine.scene;

    this.env = new Environment(this.scene, engine.camera);
    this.chunks = new ChunkManager(this.scene, rng);
    this.player = new Player(this.scene);
    this.effects = new Effects(this.scene, this.player);
    this.power = new PowerUps(this.effects);
    this.rig = new CameraRig(engine.camera);

    this.state = STATE.MENU;
    this.speed = CFG.run.startSpeed;
    this.time = 0;
    this.deadTime = 0;
    this._pendingGameOver = false;

    this.run = this._blankRun();
    this.aiTick = null;
    this._hudAccum = 0;
    this._nextMilestone = MILESTONE;
    this._pickupCentre = new THREE.Vector3();

    this._bindInput();
    this.enterMenu(true);
  }

  _blankRun() {
    return {
      score: 0, distance: 0, coins: 0, dodged: 0, powerups: 0,
      biomes: new Set(), powerTypes: new Set(), nightDistance: 0,
      topSpeed: 0, maxSpeedReached: false, bestCombo: 0,
    };
  }

  // -- state machine ---------------------------------------------------------
  enterMenu(initial = false) {
    this.state = STATE.MENU;
    this.speed = CFG.run.startSpeed * 0.62;
    this.player.reset();
    this.effects.clear();
    this.power.reset();
    this.rig.reset(true);
    if (!initial) this.chunks.reset();
    bus.emit('state', { state: this.state });
  }

  start() {
    audio.unlock();
    this.run = this._blankRun();
    this._nextMilestone = MILESTONE;
    this.speed = CFG.run.startSpeed;
    this.deadTime = 0;
    this._pendingGameOver = false;
    this.chunks.reset((Math.random() * 0xffffffff) >>> 0);
    this.player.reset();
    this.effects.clear();
    this.power.reset();
    this.rig.reset(true);
    this.state = STATE.PLAYING;
    bus.emit('sfx', 'start');
    bus.emit('state', { state: this.state });
    this._emitHud(true);
  }

  pause() {
    if (this.state !== STATE.PLAYING) return;
    this.state = STATE.PAUSED;
    bus.emit('sfx', 'pause');
    bus.emit('state', { state: this.state });
  }

  resume() {
    if (this.state !== STATE.PAUSED) return;
    this.state = STATE.PLAYING;
    bus.emit('sfx', 'resume');
    bus.emit('state', { state: this.state });
  }

  togglePause() {
    if (this.state === STATE.PLAYING) this.pause();
    else if (this.state === STATE.PAUSED) this.resume();
  }

  die(cause = 'obstacle') {
    if (this.state !== STATE.PLAYING) return;
    this.state = STATE.DEAD;
    this.deadTime = 0;
    this._pendingGameOver = true;
    this.player.kill();
    this.rig.addShake(1.1);
    this.effects.burstImpact(this.player.x, this.player.y + 0.8, 0, 0xffd9a0);
    bus.emit('sfx', 'hit');
    setTimeout(() => bus.emit('sfx', 'death'), 90);
    bus.emit('state', { state: this.state, cause });
  }

  _finishRun() {
    this._pendingGameOver = false;
    this.run.score = Math.floor(this.run.score);
    this.run.distance = Math.floor(this.run.distance);
    const { newBest } = profile.commitRun(this.run);
    const unlocked = evaluateAchievements(this.run);
    if (newBest) setTimeout(() => bus.emit('sfx', 'newRecord'), 260);
    else bus.emit('sfx', 'gameover');
    bus.emit('gameover', {
      run: this.run,
      newBest,
      unlocked,
      best: profile.data.bestScore,
      coins: profile.data.coins,
    });
  }

  restart() { this.start(); }

  // -- input ------------------------------------------------------------------
  _bindInput() {
    bus.on('input', (action) => {
      if (action === 'pause') {
        if (this.state === STATE.PLAYING || this.state === STATE.PAUSED) this.togglePause();
        return;
      }
      if (this.state !== STATE.PLAYING) return;
      switch (action) {
        case 'left': this.player.moveLane(-1); break;
        case 'right': this.player.moveLane(1); break;
        case 'jump': this.player.requestJump(); break;
        case 'down': this.player.requestDuck(); break;
        default: break;
      }
    });
    bus.on('input:up', (action) => {
      if (action === 'down') this.player.releaseDuck();
      if (action === 'jump') this.player.releaseJump();
    });
    bus.on('window:blur', () => { if (this.state === STATE.PLAYING) this.pause(); });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === STATE.PLAYING) this.pause();
    });
  }

  get speed01() {
    return clamp(invLerp(CFG.run.startSpeed, CFG.run.maxSpeed, this.speed), 0, 1);
  }

  // -- main loop ---------------------------------------------------------------
  update(dt) {
    const playing = this.state === STATE.PLAYING;
    const paused = this.state === STATE.PAUSED;
    const prevPlayer = playing ? {
      x: this.player.x, y: this.player.y, h: this.player.colliderHeight,
    } : null;
    this.time += paused ? 0 : dt;
    updateSfx(dt);

    // Optional scripted driver (QA autopilot). Never set in normal play.
    if (this.aiTick && playing) this.aiTick(dt, this);

    if (playing) {
      this.speed = Math.min(CFG.run.maxSpeed, this.speed + CFG.run.accel * dt);
      if (this.speed >= CFG.run.maxSpeed - 0.01) this.run.maxSpeedReached = true;
      this.run.topSpeed = Math.max(this.run.topSpeed, this.speed);
    } else if (this.state === STATE.DEAD) {
      // Skid to a stop instead of freezing the world dead.
      this.speed = Math.max(0, this.speed - 26 * dt);
    }

    const worldSpeed = paused ? 0 : this.speed;

    // World + environment
    this.chunks.update(dt, worldSpeed, paused);
    const biome = this.chunks.syncBiome();
    this.env.setBiome(biome.a, biome.b, biome.t);
    this.env.update(dt, paused);
    const iceMix = (biome.a === 4 ? 1 - biome.t : 0) + (biome.b === 4 ? biome.t : 0);
    setObstacleNight(this.env.night, iceMix);
    this.env.fog.near = lerp(CFG.world.fogNear, CFG.world.fogNear + 18, this.speed01);
    this.env.fog.far = CFG.world.fogFar;

    if (!paused) {
      this.player.update(dt, this.speed01, this.input.held);
    }

    if (playing) {
      this.run.distance = this.chunks.distance;
      this.run.score += this.speed * dt * CFG.score.perMetre * this.power.scoreMultiplier;
      this.run.biomes.add(BIOMES[biome.a].id);
      if (biome.t > 0.5) this.run.biomes.add(BIOMES[biome.b].id);
      if (this.env.night > 0.55) this.run.nightDistance += this.speed * dt;

      this.power.update(dt);
      this._checkCollisions(prevPlayer, this.speed * dt);
      this._checkPickups(dt);

      if (this.run.distance >= this._nextMilestone) {
        this._nextMilestone += MILESTONE;
        bus.emit('sfx', 'milestone');
        bus.emit('toast', { text: `${Math.floor(this.run.distance / MILESTONE) * MILESTONE} m`, kind: 'milestone' });
      }

      // Speed trail once the run gets genuinely fast.
      if (this.speed01 > 0.35) {
        this.effects.trail(this.player.x, this.player.y + 0.7, 0, this.speed01, this.env.skyTint.getHex());
      }
    }

    if (this.state === STATE.DEAD) {
      this.deadTime += dt;
      if (this._pendingGameOver && this.deadTime > 0.85) this._finishRun();
    }

    // Menu attract mode: the world keeps drifting behind the title.
    if (this.state === STATE.MENU) {
      this.player.update(dt, 0.15, { left: false, right: false, jump: false, down: false });
    }

    this.effects.update(dt, paused ? 0 : this.speed, {
      time: this.time,
      shieldEnding: this.power.ending('shield'),
      magnetEnding: this.power.ending('magnet'),
    });

    this.rig.update({
      dt,
      playerX: this.player.x,
      playerY: this.player.y,
      laneT: this.player.laneT,
      speed01: this.speed01,
      dead: this.state === STATE.DEAD,
      deadTime: this.deadTime,
    });

    this._hudAccum += dt;
    if (this._hudAccum > 0.06) { this._hudAccum = 0; this._emitHud(); }
  }

  _emitHud(force = false) {
    bus.emit('hud', {
      score: Math.floor(this.run.score),
      distance: Math.floor(this.run.distance),
      coins: this.run.coins,
      speed01: this.speed01,
      multiplier: this.power.scoreMultiplier,
      biome: BIOMES[this.chunks.biomeAt(this.chunks.distance).a].name,
      night: this.env.night,
      powers: {
        shield: this.power.remaining('shield') / CFG.powerups.shield.duration,
        magnet: this.power.remaining('magnet') / CFG.powerups.magnet.duration,
        multiplier: this.power.remaining('multiplier') / CFG.powerups.multiplier.duration,
      },
      force,
    });
  }

  // -- collisions ----------------------------------------------------------------
  _checkCollisions(prev, travel) {
    const p = this.player;
    const ph = p.colliderHeight;
    const pxHalf = CFG.player.width / 2 - 0.05;
    const pzHalf = CFG.player.depth / 2 - 0.04;

    this.chunks.forEachObstacleNear(-4, 4, (o, wz) => {
      const col = o.userData.col;
      if (!col) return;
      if (!o.userData.counted && wz > 1.2) {
        o.userData.counted = true;
        this.run.dodged++;
      }
      if (o.userData.hit) return;
      // A touch of forgiveness on every axis - near misses should feel like
      // near misses, not deaths.
      const hw = col.w / 2 - 0.07;
      const hd = col.d / 2 - 0.07;
      const oy0 = o.position.y + col.y + 0.05;
      const oy1 = oy0 + col.h - 0.1;

      // Sweep the frame's forward travel. At top speed a single slow frame
      // can move farther than a small cactus is deep, so endpoint-only tests
      // occasionally let the player pass straight through it.
      const reach = pzHalf + hd;
      const zBefore = wz - travel;
      if (zBefore > reach || wz < -reach) return;
      const enter = travel > 0 ? clamp((-reach - zBefore) / travel, 0, 1) : 1;
      const exit = travel > 0 ? clamp((reach - zBefore) / travel, 0, 1) : 1;
      let touched = false;
      for (const t of [enter, (enter + exit) * 0.5, exit]) {
        const x = lerp(prev.x, p.x, t);
        const y = lerp(prev.y, p.y, t);
        const h = lerp(prev.h, ph, t);
        if (Math.abs(x - o.position.x) > pxHalf + hw) continue;
        if (y + h - 0.06 <= oy0 || y + 0.06 >= oy1) continue;
        touched = true;
        break;
      }
      if (!touched) return;

      o.userData.hit = true;
      this._onHit(o, wz);
    });
  }

  _onHit(o, wz) {
    if (this.power.absorbHit()) {
      this.rig.addShake(0.55);
      this.effects.burstImpact(o.position.x, o.position.y + 0.6, wz, 0x7fd8ff);
      this.player.model.flashHurt();
      bus.emit('sfx', 'shieldBreak');
      bus.emit('toast', { text: 'Escudo roto', kind: 'shield' });
      // Clear the obstacle so the player runs through it.
      o.visible = false;
      return;
    }
    this.die();
  }

  // -- pickups ---------------------------------------------------------------------
  _checkPickups(dt) {
    const p = this.player;
    const magnet = this.power.isActive('magnet');
    const cx = p.x;
    const cy = p.y + p.colliderHeight * 0.55;
    const R = magnet ? CFG.coins.magnetRadius : 5;

    this.chunks.forEachPickupNear(-R, 3.2, (obj, wz, kind, chunkZ) => {
      const dx = obj.position.x - cx;
      const dy = obj.position.y - cy;
      const dz = wz;

      if (kind === 'coin') {
        if (magnet) {
          const d = Math.hypot(dx, dy, dz);
          if (d < CFG.coins.magnetRadius) {
            obj.userData.magnet = true;
            const k = (CFG.coins.magnetSpeed + this.speed * 0.35) * dt / Math.max(d, 0.001);
            obj.position.x -= dx * Math.min(1, k);
            obj.position.y -= dy * Math.min(1, k);
            obj.position.z -= dz * Math.min(1, k);
            obj.rotation.y += dt * 14;
          }
        }
        const d2 = dx * dx + dy * dy + (wz) * (wz);
        if (d2 < 1.15 * 1.15) this._collectCoin(obj, chunkZ);
      } else {
        const d2 = dx * dx + dy * dy + wz * wz;
        if (d2 < 1.45 * 1.45) this._collectPower(obj, wz);
      }
    });
  }

  _collectCoin(coin, chunkZ) {
    coin.userData.taken = true;
    coin.userData.magnet = false;
    coin.visible = false;
    this.run.coins++;
    this.run.score += CFG.score.perCoin * this.power.scoreMultiplier;
    profile.addCoins(1);
    this.effects.burstCoin(coin.position.x, coin.position.y, chunkZ + coin.position.z);
    bus.emit('sfx', 'coin');
    bus.emit('coin', { total: profile.data.coins, run: this.run.coins });
  }

  _collectPower(p, wz) {
    p.userData.taken = true;
    p.visible = false;
    const type = p.userData.type;
    this.power.activate(type);
    this.run.powerups++;
    this.run.powerTypes.add(type);
    const color = type === 'shield' ? 0x7fd8ff : type === 'magnet' ? 0xff8fa4 : 0xd8b0ff;
    this.effects.burstPower(p.position.x, p.position.y, wz, color);
    this.rig.addShake(0.22);
    bus.emit('sfx:power', type);
  }
}
