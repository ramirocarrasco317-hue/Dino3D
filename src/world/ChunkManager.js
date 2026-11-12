import * as THREE from 'three';
import { CFG, LANE_COUNT } from '../core/Config.js';
import { clamp, lerp, invLerp } from '../core/MathUtils.js';
import { BIOMES, spawnProp, bmat } from './Biomes.js';
import { makeBiomeMaterial, setBiomeColors } from './GroundMaterial.js';
import { surfaceTexture } from './SurfaceTexture.js';
import {
  cactusSmall, cactusTall, cactusCluster, boulder, rockWall, pterodactyl,
  FLYER_Y, animateObstacle,
} from '../entities/Obstacles.js';
import { createCoin, createPowerUp, animateCoin, animatePowerUp } from '../entities/Collectibles.js';

const TRACK_HALF = 4.3;
const GROUND_HALF = 30;
const BERM_INNER = 5.0;
const BERM_SEGS = 8;

const GROUND_BUILDERS = [
  { fn: cactusSmall, w: 4 },
  { fn: cactusTall, w: 3 },
  { fn: cactusCluster, w: 2.5 },
  { fn: boulder, w: 1.6 },
  { fn: rockWall, w: 1.4 },
];

/** Smooth value noise over one dimension - used for the roadside hills. */
function hash1(n) {
  const s = Math.sin(n * 127.1) * 43758.5453;
  return s - Math.floor(s);
}
function hills(x) {
  const i = Math.floor(x), f = x - i;
  const u = f * f * (3 - 2 * f);
  return lerp(hash1(i), hash1(i + 1), u);
}
function terrainHeight(dist, side) {
  const d = dist * 0.02 + (side > 0 ? 31.7 : 0);
  return (hills(d) * 0.65 + hills(d * 2.7) * 0.25 + hills(d * 6.1) * 0.1);
}

/** Berm cross-section: flat at the track edge, a ridge, then a gentle plain. */
const BERM_X = [BERM_INNER, BERM_INNER + 7.5, GROUND_HALF];
function bermProfile(h) { return [0, h * 5.4 + 0.45, h * 2.2 + 0.15]; }

/** Ground height at an arbitrary point, so scenery sits on the terrain. */
function groundHeightAt(x, dist, side) {
  const ax = Math.abs(x);
  const ys = bermProfile(terrainHeight(dist, side));
  if (ax <= BERM_X[0]) return 0;
  if (ax >= BERM_X[2]) return ys[2];
  if (ax <= BERM_X[1]) return lerp(ys[0], ys[1], invLerp(BERM_X[0], BERM_X[1], ax));
  return lerp(ys[1], ys[2], invLerp(BERM_X[1], BERM_X[2], ax));
}

class Chunk {
  constructor(index, materials) {
    this.index = index;
    this.group = new THREE.Group();
    this.distStart = 0;
    this.obstacles = [];
    this.coins = [];
    this.powerups = [];
    this.props = [];
    const L = CFG.world.chunkLength;

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(GROUND_HALF * 2, L, 1, 1), materials.ground);
    ground.rotation.x = -Math.PI / 2;
    ground.position.z = -L / 2;
    ground.receiveShadow = true;
    this.group.add(ground);

    const track = new THREE.Mesh(new THREE.PlaneGeometry(TRACK_HALF * 2, L, 1, 1), materials.track);
    track.rotation.x = -Math.PI / 2;
    track.position.set(0, 0.012, -L / 2);
    track.receiveShadow = true;
    this.group.add(track);

    // Lane seams: subtle, but they make the three lanes instantly legible.
    for (const sx of [-1, 1]) {
      const seam = new THREE.Mesh(new THREE.PlaneGeometry(0.07, L, 1, 1), materials.seam);
      seam.rotation.x = -Math.PI / 2;
      seam.position.set(sx * 1.225, 0.022, -L / 2);
      this.group.add(seam);

      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.34, L), materials.rail);
      rail.position.set(sx * (TRACK_HALF + 0.1), 0.15, -L / 2);
      rail.castShadow = true;
      rail.receiveShadow = true;
      this.group.add(rail);
    }

    this.berms = [];
    for (const side of [-1, 1]) {
      const geo = new THREE.BufferGeometry();
      const rows = 3;                       // inner, mid, outer
      const cols = BERM_SEGS + 1;
      const pos = new Float32Array(rows * cols * 3);
      const uv = new Float32Array(rows * cols * 2);
      const idx = [];
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const i = (r * cols + c) * 2;
          uv[i] = (side * BERM_X[r] + GROUND_HALF) / (GROUND_HALF * 2);
          uv[i + 1] = c / BERM_SEGS;
        }
      }
      for (let r = 0; r < rows - 1; r++) {
        for (let c = 0; c < cols - 1; c++) {
          const a = r * cols + c, b = a + 1, cc = a + cols, d = cc + 1;
          if (side < 0) idx.push(a, cc, b, b, cc, d);
          else idx.push(a, b, cc, b, d, cc);
        }
      }
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      geo.setIndex(idx);
      const m = new THREE.Mesh(geo, materials.ground);
      m.receiveShadow = true;
      m.frustumCulled = false;
      this.group.add(m);
      this.berms.push({ mesh: m, side, geo });
    }
  }

  /** Rebuild the roadside hills so they stay continuous across chunk seams. */
  refreshBerms() {
    const L = CFG.world.chunkLength;
    const cols = BERM_SEGS + 1;
    for (const b of this.berms) {
      const pos = b.geo.attributes.position;
      const arr = pos.array;
      for (let c = 0; c < cols; c++) {
        const t = c / BERM_SEGS;
        const z = -t * L;
        const dist = this.distStart + t * L;
        const ys = bermProfile(terrainHeight(dist, b.side));
        for (let r = 0; r < 3; r++) {
          const i = (r * cols + c) * 3;
          arr[i] = b.side * BERM_X[r];
          arr[i + 1] = ys[r];
          arr[i + 2] = z;
        }
      }
      pos.needsUpdate = true;
      b.geo.computeVertexNormals();
      b.geo.computeBoundingSphere();
    }
  }
}

/**
 * Streams the endless track: ground chunks, biome scenery, obstacle rows,
 * coins and power-ups. Also owns the solvability rules that keep every
 * generated pattern beatable.
 */
export class ChunkManager {
  constructor(scene, rng) {
    this.scene = scene;
    this.rng = rng;
    this.group = new THREE.Group();
    scene.add(this.group);

    this.materials = {
      ground: makeBiomeMaterial({ roughness: 1, extra: {
        map: surfaceTexture('ground'),
      } }),
      track: makeBiomeMaterial({ roughness: 0.92, extra: {
        map: surfaceTexture('track'),
      } }),
      seam: new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.19, depthWrite: false }),
      rail: makeBiomeMaterial({ roughness: 0.85 }),
    };

    this._biomeA = new THREE.Color();
    this._biomeB = new THREE.Color();
    this.chunks = [];
    for (let i = 0; i < CFG.world.activeChunks; i++) {
      const c = new Chunk(i, this.materials);
      this.group.add(c.group);
      this.chunks.push(c);
    }

    this.pools = new Map();
    this.coinPool = [];
    this.powerPool = new Map();
    this.propPool = new Map();

    this.reset();
  }

  // -- pooling ---------------------------------------------------------------
  _take(key, build) {
    let pool = this.pools.get(key);
    if (!pool) { pool = []; this.pools.set(key, pool); }
    const o = pool.pop();
    return o ?? build();
  }
  _give(key, obj) {
    obj.parent?.remove(obj);
    let pool = this.pools.get(key);
    if (!pool) { pool = []; this.pools.set(key, pool); }
    if (pool.length < 24) pool.push(obj);
    else obj.traverse?.((n) => n.geometry?.dispose?.());
  }

  // -- lifecycle -------------------------------------------------------------
  reset(seed) {
    if (seed !== undefined) this.rng.reset(seed);
    this.distance = 0;
    this.biomeCursor = 0;
    this._rowDist = 60;                 // first 60 m are a clean warm-up
    this._reachable = new Set([0, 1, 2]);
    this._prevRowDist = 0;
    this._nextPowerDist = this.rng.range(...CFG.spawn.powerupEvery) + 120;
    this._lastPattern = '';
    this._time = 0;

    const L = CFG.world.chunkLength;
    for (let i = 0; i < this.chunks.length; i++) {
      const c = this.chunks[i];
      this._clearChunk(c);
      c.group.position.z = CFG.world.despawnZ - i * L;
      c.distStart = -(c.group.position.z);
      c.refreshBerms();
      this._populate(c);
    }
  }

  /** Debug/QA helper: rebuild the world as if the player had run `dist` metres. */
  warpTo(dist) {
    const L = CFG.world.chunkLength;
    this.distance = dist;
    this._rowDist = dist + 40;
    this._prevRowDist = dist;
    this._reachable = new Set([0, 1, 2]);
    this._nextPowerDist = dist + 200;
    for (let i = 0; i < this.chunks.length; i++) {
      const c = this.chunks[i];
      this._clearChunk(c);
      c.group.position.z = CFG.world.despawnZ - i * L;
      c.distStart = this.distance - c.group.position.z;
      c.refreshBerms();
      this._populate(c);
    }
  }

  _clearChunk(c) {
    for (const o of c.obstacles) this._give(o.userData.poolKey, o);
    for (const o of c.coins) { o.parent?.remove(o); this.coinPool.push(o); }
    for (const o of c.powerups) {
      o.parent?.remove(o);
      const k = o.userData.type;
      if (!this.powerPool.has(k)) this.powerPool.set(k, []);
      this.powerPool.get(k).push(o);
    }
    for (const o of c.props) {
      o.parent?.remove(o);
      const k = o.userData.propKey;
      if (!this.propPool.has(k)) this.propPool.set(k, []);
      const pool = this.propPool.get(k);
      if (pool.length < 20) pool.push(o);
      // Baked scenery owns its geometry; its materials are shared by live props.
      else o.traverse((node) => node.geometry?.dispose());
    }
    c.obstacles.length = 0;
    c.coins.length = 0;
    c.powerups.length = 0;
    c.props.length = 0;
  }

  // -- biome ------------------------------------------------------------------
  /** @returns {{a:number,b:number,t:number}} biome pair for a travelled distance. */
  biomeAt(dist) {
    const span = CFG.world.biomeLength;
    const blend = CFG.world.blendLength;
    const total = span + blend;
    // The first chunk sits slightly behind the player, so distance can start
    // negative; clamp before indexing.
    const d = Math.max(0, dist);
    const i = Math.floor(d / total);
    const local = d - i * total;
    const a = i % BIOMES.length;
    const b = (i + 1) % BIOMES.length;
    const t = local <= span ? 0 : (local - span) / blend;
    return { a, b, t };
  }

  /** World-space Z where the current biome boundary sits. */
  boundaryZ() {
    const span = CFG.world.biomeLength;
    const blend = CFG.world.blendLength;
    const total = span + blend;
    const i = Math.floor(Math.max(0, this.distance) / total);
    const startDist = i * total + span;
    // Distance ahead of the player -> world Z is negative forward.
    const zNear = -(startDist - this.distance);
    const zFar = zNear - blend;
    return { zNear, zFar, a: i % BIOMES.length, b: (i + 1) % BIOMES.length };
  }

  // -- generation --------------------------------------------------------------
  _difficultyAt(dist) {
    const v = Math.min(
      CFG.run.maxSpeed,
      Math.sqrt(CFG.run.startSpeed ** 2 + 2 * CFG.run.accel * dist),
    );
    return { v, diff: invLerp(CFG.run.diffFrom, CFG.run.diffTo, v) };
  }

  _pickGroundBuilder(diff) {
    // Bigger obstacles become more common as difficulty rises.
    let total = 0;
    const weights = GROUND_BUILDERS.map((b, i) => {
      const w = b.w * (i >= 2 ? 0.4 + diff * 1.5 : 1);
      total += w;
      return w;
    });
    let r = this.rng.next() * total;
    for (let i = 0; i < GROUND_BUILDERS.length; i++) {
      r -= weights[i];
      if (r <= 0) return GROUND_BUILDERS[i];
    }
    return GROUND_BUILDERS[0];
  }

  _expandReachable(prev, shift) {
    if (shift >= LANE_COUNT - 1) return new Set([0, 1, 2]);
    const out = new Set();
    for (const l of prev) {
      for (let d = -shift; d <= shift; d++) {
        const n = l + d;
        if (n >= 0 && n < LANE_COUNT) out.add(n);
      }
    }
    return out.size ? out : new Set([0, 1, 2]);
  }

  /**
   * Emit every obstacle row that falls inside a chunk's distance window.
   * Guarantees at least one lane the player can physically reach and clear.
   */
  _generateRows(chunk) {
    const L = CFG.world.chunkLength;
    const dEnd = chunk.distStart + L;

    while (this._rowDist < dEnd) {
      const d = this._rowDist;
      if (d < chunk.distStart) { this._rowDist = chunk.distStart; continue; }

      const { v, diff } = this._difficultyAt(d);
      const gapTime = (d - this._prevRowDist) / v;
      const maxShift = Math.max(0, Math.floor(gapTime / (CFG.lanes.changeTime + 0.075)));
      let reachable = this._expandReachable(this._reachable, maxShift);

      // --- choose a pattern --------------------------------------------------
      const blocked = new Map();   // lane -> 'ground' | 'duck' | 'lowAir'
      const roll = this.rng.next();
      const pDouble = lerp(...CFG.spawn.doubleChance, diff);
      const pFlyer = lerp(...CFG.spawn.flyerChance, diff);
      const pTriple = lerp(...CFG.spawn.tripleAirChance, diff);

      const lanes = [0, 1, 2];
      const shuffled = lanes.slice().sort(() => this.rng.next() - 0.5);

      let pattern;
      if (roll < pFlyer) {
        pattern = this.rng.chance(0.62) ? 'flyerDuck' : 'flyerLow';
      } else if (roll < pFlyer + pTriple) {
        pattern = 'groundPlusFlyer';
      } else if (roll < pFlyer + pTriple + pDouble) {
        pattern = 'double';
      } else {
        pattern = 'single';
      }
      // Never repeat the hardest patterns back to back.
      if (pattern === this._lastPattern && (pattern === 'double' || pattern === 'groundPlusFlyer')) {
        pattern = 'single';
      }

      if (pattern === 'single') {
        blocked.set(shuffled[0], 'ground');
      } else if (pattern === 'double') {
        blocked.set(shuffled[0], 'ground');
        blocked.set(shuffled[1], 'ground');
      } else if (pattern === 'flyerDuck') {
        blocked.set(shuffled[0], 'duck');
        if (diff > 0.45 && this.rng.chance(0.35)) blocked.set(shuffled[1], 'duck');
      } else if (pattern === 'flyerLow') {
        blocked.set(shuffled[0], 'lowAir');
      } else {
        blocked.set(shuffled[0], 'ground');
        blocked.set(shuffled[1], 'duck');
      }

      // --- solvability: keep at least one reachable lane clear ---------------
      const freeOf = (lane) => !blocked.has(lane) || blocked.get(lane) !== 'ground';
      let ok = false;
      for (const l of reachable) { if (freeOf(l)) { ok = true; break; } }
      if (!ok) {
        // Free the reachable lane closest to the middle.
        const candidates = [...reachable].sort((a, b) => Math.abs(a - 1) - Math.abs(b - 1));
        blocked.delete(candidates[0]);
      }
      // A row must never block all three lanes with ground obstacles.
      const groundCount = [...blocked.values()].filter((k) => k === 'ground').length;
      if (groundCount >= LANE_COUNT) blocked.delete([...blocked.keys()][0]);

      // Update the reachability frontier: lanes the player can be in *after*
      // this row (ground blocks remove a lane, air hazards do not).
      const next = new Set();
      for (const l of reachable) if (freeOf(l)) next.add(l);
      this._reachable = next.size ? next : new Set([1]);

      // --- instantiate --------------------------------------------------------
      const localZ = -(d - chunk.distStart);
      const rowInfo = { d, lanes: [] };
      for (const [lane, kind] of blocked) {
        let obj, key;
        if (kind === 'ground') {
          const b = this._pickGroundBuilder(diff);
          key = b.fn.name;
          obj = this._take(key, () => b.fn(this.rng));
          obj.position.set(CFG.lanes.x[lane], 0, localZ);
          obj.rotation.y = this.rng.range(-0.35, 0.35);
        } else {
          const tier = kind === 'duck' ? 1 : 0;
          key = `ptero${tier}`;
          obj = this._take(key, () => pterodactyl(this.rng, tier));
          obj.userData.baseY = FLYER_Y[tier];
          obj.position.set(CFG.lanes.x[lane], FLYER_Y[tier], localZ);
          obj.rotation.y = 0;
        }
        obj.userData.poolKey = key;
        obj.userData.lane = lane;
        obj.userData.hit = false;
        obj.userData.counted = false;
        obj.visible = true;
        chunk.group.add(obj);
        chunk.obstacles.push(obj);
        rowInfo.lanes.push(lane);
      }

      // --- coins --------------------------------------------------------------
      const freeLanes = [0, 1, 2].filter((l) => !blocked.has(l));
      if (freeLanes.length && this.rng.chance(CFG.spawn.coinRunChance)) {
        const lane = this.rng.pick(freeLanes);
        this._addCoinRun(chunk, d + 2.5, lane, this.rng.int(4, 7), false);
      }
      // Arc of coins over a jumpable obstacle - rewards committing to the jump.
      for (const [lane, kind] of blocked) {
        if (kind === 'ground' && this.rng.chance(0.32)) {
          this._addCoinRun(chunk, d - 3.0, lane, 5, true);
        }
      }

      // --- power-up -----------------------------------------------------------
      if (d > this._nextPowerDist && freeLanes.length) {
        this._nextPowerDist = d + this.rng.range(...CFG.spawn.powerupEvery);
        const lane = this.rng.pick(freeLanes);
        const type = this.rng.pick(['shield', 'magnet', 'multiplier']);
        let p = this.powerPool.get(type)?.pop();
        if (!p) p = createPowerUp(type);
        p.userData.baseY = 1.35;
        p.userData.taken = false;
        p.visible = true;
        p.position.set(CFG.lanes.x[lane], 1.35, -(d + 6 - chunk.distStart));
        chunk.group.add(p);
        chunk.powerups.push(p);
      }

      this._prevRowDist = d;
      this._lastPattern = pattern;

      // --- next row distance ---------------------------------------------------
      let gap = lerp(...CFG.spawn.rowGapTime, diff) * v;
      // Occasional breather so the run has rhythm instead of a constant wall.
      if (this.rng.chance(0.14)) gap *= this.rng.range(1.6, 2.4);
      gap *= this.rng.range(0.94, 1.14);
      this._rowDist = d + Math.max(9, gap);
    }
  }

  _addCoinRun(chunk, startDist, lane, count, arc) {
    const L = CFG.world.chunkLength;
    const spacing = arc ? 1.5 : 1.7;
    for (let i = 0; i < count; i++) {
      const d = startDist + i * spacing;
      const localZ = -(d - chunk.distStart);
      // Coins that would land outside this chunk are simply skipped; the next
      // chunk's own runs keep the track populated.
      if (localZ > 0 || localZ < -L) continue;
      let coin = this.coinPool.pop();
      if (!coin) coin = createCoin();
      const t = count > 1 ? i / (count - 1) : 0.5;
      const y = arc ? 0.75 + Math.sin(t * Math.PI) * 1.85 : 0.95;
      coin.userData.baseY = y;
      coin.userData.taken = false;
      coin.userData.magnet = false;
      coin.visible = true;
      coin.scale.setScalar(1);
      coin.position.set(CFG.lanes.x[lane], y, localZ);
      chunk.group.add(coin);
      chunk.coins.push(coin);
    }
  }

  _populate(chunk) {
    const L = CFG.world.chunkLength;
    const { a, b, t } = this.biomeAt(chunk.distStart + L * 0.5);
    const biome = this.rng.next() < t ? BIOMES[b] : BIOMES[a];

    const count = Math.round(L * 0.26 * biome.density);
    for (let i = 0; i < count; i++) {
      const key = biome.id;
      let obj = null;
      const pool = this.propPool.get(key);
      if (pool && pool.length && this.rng.chance(0.55)) obj = pool.pop();
      if (!obj) {
        obj = spawnProp(biome, this.rng);
        if (!obj) continue;
        obj.userData.propKey = key;
      }
      const side = this.rng.sign();
      const x = side * this.rng.range(BERM_INNER + 1.4, GROUND_HALF - 3);
      const z = -this.rng.range(0.5, L - 0.5);
      const dist = chunk.distStart + (-z);
      obj.position.set(x, groundHeightAt(x, dist, side) - 0.12, z);
      obj.visible = true;
      chunk.group.add(obj);
      chunk.props.push(obj);
    }

    this._generateRows(chunk);
  }

  // -- per frame ----------------------------------------------------------------
  update(dt, speed, paused) {
    const L = CFG.world.chunkLength;
    if (!paused) {
      this.distance += speed * dt;
      this._time += dt;
      for (const c of this.chunks) c.group.position.z += speed * dt;
    }

    // Recycle chunks that have passed behind the camera.
    let minZ = Infinity;
    for (const c of this.chunks) minZ = Math.min(minZ, c.group.position.z);
    for (const c of this.chunks) {
      if (c.group.position.z - L > CFG.world.despawnZ) {
        this._clearChunk(c);
        c.group.position.z = minZ - L;
        minZ = c.group.position.z;
        c.distStart = this.distance - c.group.position.z;
        c.refreshBerms();
        this._populate(c);
      }
    }

    // Animate live content (only what is plausibly on screen).
    const t = this._time;
    for (const c of this.chunks) {
      const cz = c.group.position.z;
      if (cz - L > 40 || cz < -CFG.world.fogFar) continue;
      for (const o of c.obstacles) animateObstacle(o, t);
      for (const co of c.coins) if (!co.userData.taken && !co.userData.magnet) animateCoin(co, t);
      for (const p of c.powerups) if (!p.userData.taken) animatePowerUp(p, t);
    }
  }

  /** Update biome tint uniforms + return the active blend for the environment. */
  syncBiome() {
    const { zNear, zFar, a, b } = this.boundaryZ();
    const A = BIOMES[a], B = BIOMES[b];
    setBiomeColors(this.materials.ground, this._biomeA.set(A.ground), this._biomeB.set(B.ground), zFar, zNear);
    setBiomeColors(this.materials.track, this._biomeA.set(A.track), this._biomeB.set(B.track), zFar, zNear);
    setBiomeColors(this.materials.rail, this._biomeA.set(A.trackEdge), this._biomeB.set(B.trackEdge), zFar, zNear);
    return this.biomeAt(this.distance);
  }

  /** Iterate obstacles whose world Z is inside [zMin, zMax]. */
  forEachObstacleNear(zMin, zMax, fn) {
    for (const c of this.chunks) {
      const cz = c.group.position.z;
      if (cz + 2 < zMin - CFG.world.chunkLength || cz - CFG.world.chunkLength - 2 > zMax) continue;
      for (const o of c.obstacles) {
        const wz = cz + o.position.z;
        if (wz >= zMin && wz <= zMax) fn(o, wz);
      }
    }
  }

  forEachPickupNear(zMin, zMax, fn) {
    for (const c of this.chunks) {
      const cz = c.group.position.z;
      if (cz + 2 < zMin - CFG.world.chunkLength || cz - CFG.world.chunkLength - 2 > zMax) continue;
      for (const o of c.coins) {
        if (o.userData.taken) continue;
        const wz = cz + o.position.z;
        if (wz >= zMin && wz <= zMax) fn(o, wz, 'coin', cz);
      }
      for (const o of c.powerups) {
        if (o.userData.taken) continue;
        const wz = cz + o.position.z;
        if (wz >= zMin && wz <= zMax) fn(o, wz, 'power', cz);
      }
    }
  }
}
