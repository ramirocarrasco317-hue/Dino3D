import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { bakeInPlace } from '../world/bake.js';
import { surfaceTexture } from '../world/SurfaceTexture.js';

/**
 * Obstacle library. Every builder returns a Group whose `userData.col`
 * describes an axis-aligned collider in local space:
 *   { w, h, d, y }  -> half-open box centred on x/z, spanning y..y+h.
 *
 * `kind` tells the spawner how the row must be solved:
 *   'jump'  -> clearable by jumping
 *   'duck'  -> must be ducked under
 *   'either'-> jump or duck both work
 */

const cache = new Map();
const hazardMaterials = new Map();
const nightMaterials = new Map();

function finishHazard(root, type) {
  const tint = type === 'cactus' ? 0xb0d0a8 : type === 'stone' ? 0xc8d4e2 : 0xdfc9ed;
  const texture = surfaceTexture(type);
  root.traverse((node) => {
    if (!node.isMesh) return;
    const key = `${node.material.uuid}:${type}`;
    let material = hazardMaterials.get(key);
    if (!material) {
      material = node.material.clone();
      material.map = texture;
      material.bumpMap = texture;
      material.bumpScale = type === 'stone' ? 0.026 : 0.016;
      material.emissive.setHex(tint);
      material.emissiveIntensity = 0;
      material.needsUpdate = true;
      hazardMaterials.set(key, material);
      nightMaterials.set(material, type);
    }
    node.material = material;
  });
}

/** Soft reflected moonlight preserves obstacle contrast in every biome. */
export function setObstacleNight(night, iceMix = 0) {
  for (const [mat, type] of nightMaterials) {
    const iceShade = type === 'stone' ? 0.56 : type === 'cactus' ? 0.64 : 0.72;
    const shade = 1 - night * iceMix * (1 - iceShade);
    mat.color.setRGB(shade, shade, shade);
    mat.emissiveIntensity = night * (0.22 - iceMix * 0.10);
  }
}
function M(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!cache.has(key)) {
    cache.set(key, new THREE.MeshStandardMaterial({
      color, roughness: opts.roughness ?? 0.75, metalness: opts.metalness ?? 0,
      flatShading: opts.flat ?? false,
      side: opts.side ?? THREE.FrontSide,
      emissive: opts.emissive ?? 0x000000, emissiveIntensity: opts.ei ?? 1,
    }));
  }
  return cache.get(key);
}

const geoCache = new Map();
const g = (k, f) => { if (!geoCache.has(k)) geoCache.set(k, f()); return geoCache.get(k); };
const CYL = (r = 8) => g(`c${r}`, () => new THREE.CylinderGeometry(1, 1, 1, r));
const SPH = () => g('s', () => new THREE.SphereGeometry(1, 10, 8));
const CONE = (r = 6) => g(`k${r}`, () => new THREE.ConeGeometry(1, 1, r));
const ICO = () => g('i', () => new THREE.IcosahedronGeometry(1, 0));
const RBOX = () => g('rb', () => new RoundedBoxGeometry(1, 1, 1, 2, 0.15));

function wingMembrane(side, outer = false) {
  return g(`wing-${side}-${outer}`, () => {
    const span = outer ? 0.54 : 0.62;
    const front = outer ? -0.25 : -0.29;
    const back = outer ? 0.18 : 0.32;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([
      0, 0, front,
      side * span * 0.5, -0.035, front - 0.06,
      side * span, -0.02, -0.17,
      side * span * 0.82, -0.055, back,
      0, -0.055, back,
    ], 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute([
      0, 0, 0.5, 0, 1, 0.18, 0.82, 1, 0, 1,
    ], 2));
    geo.setIndex([0, 1, 4, 1, 3, 4, 1, 2, 3]);
    geo.computeVertexNormals();
    return geo;
  });
}

const CACTUS = 0x3f8f4a;
const CACTUS_DARK = 0x2f6f39;
const SPINE = 0xdfe8c8;

function put(parent, geometry, material, pos, scale, rot) {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(...pos);
  m.scale.set(...scale);
  if (rot) m.rotation.set(...rot);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

/** Rings of tiny spines: cheap detail that reads instantly as "cactus". */
function addSpines(parent, rng, height, radius, count = 6) {
  const mat = M(SPINE, { roughness: 0.6 });
  const geo = CONE(4);
  for (let i = 0; i < count; i++) {
    const y = 0.25 + (i / count) * (height - 0.4);
    const a = rng.range(0, Math.PI * 2);
    put(parent, geo, mat,
      [Math.cos(a) * radius, y, Math.sin(a) * radius],
      [0.035, 0.13, 0.035],
      [Math.sin(a) * 1.35, 0, -Math.cos(a) * 1.35]);
  }
}

/** Vertical ribs give the trunk a saguaro read without extra draw calls. */
function cactusTrunk(parent, rng, h, r) {
  const body = put(parent, CYL(9), M(CACTUS, { roughness: 0.7 }), [0, h / 2, 0], [r, h, r]);
  put(parent, SPH(), M(CACTUS, { roughness: 0.7 }), [0, h, 0], [r, r * 0.95, r]);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    put(parent, CYL(5), M(CACTUS_DARK, { roughness: 0.75 }),
      [Math.cos(a) * r * 0.92, h / 2, Math.sin(a) * r * 0.92], [r * 0.13, h * 0.94, r * 0.13]);
  }
  return body;
}

function cactusArm(parent, rng, side, atY, armH, r) {
  const mat = M(CACTUS, { roughness: 0.7 });
  const x = side * r;
  put(parent, CYL(7), mat, [x + side * 0.16, atY, 0], [r * 0.62, 0.42, r * 0.62], [0, 0, Math.PI / 2]);
  put(parent, SPH(), mat, [x + side * 0.34, atY, 0], [r * 0.62, r * 0.62, r * 0.62]);
  put(parent, CYL(7), mat, [x + side * 0.34, atY + armH / 2, 0], [r * 0.62, armH, r * 0.62]);
  put(parent, SPH(), mat, [x + side * 0.34, atY + armH, 0], [r * 0.62, r * 0.6, r * 0.62]);
}

// --- builders --------------------------------------------------------------

export function cactusSmall(rng) {
  const o = new THREE.Group();
  const h = rng.range(0.72, 0.92);
  const r = 0.2;
  cactusTrunk(o, rng, h, r);
  if (rng.chance(0.5)) cactusArm(o, rng, rng.sign(), h * 0.5, rng.range(0.22, 0.4), r);
  addSpines(o, rng, h, r * 1.02, 5);
  bakeInPlace(o);
  finishHazard(o, 'cactus');
  o.userData.col = { w: 0.62, h: h + 0.1, d: 0.55, y: 0 };
  o.userData.kind = 'jump';
  return o;
}

export function cactusTall(rng) {
  const o = new THREE.Group();
  const h = rng.range(0.92, 1.12);
  const r = 0.24;
  cactusTrunk(o, rng, h, r);
  cactusArm(o, rng, -1, h * rng.range(0.42, 0.55), rng.range(0.2, 0.3), r);
  if (rng.chance(0.7)) cactusArm(o, rng, 1, h * rng.range(0.55, 0.7), rng.range(0.18, 0.28), r);
  addSpines(o, rng, h, r * 1.02, 8);
  bakeInPlace(o);
  finishHazard(o, 'cactus');
  o.userData.col = { w: 0.72, h: h + 0.1, d: 0.6, y: 0 };
  o.userData.kind = 'jump';
  return o;
}

export function cactusCluster(rng) {
  const o = new THREE.Group();
  const n = rng.int(2, 3);
  const spread = 0.34;
  let maxH = 0;
  for (let i = 0; i < n; i++) {
    const sub = new THREE.Group();
    const h = rng.range(0.72, 0.98);
    const r = rng.range(0.15, 0.21);
    cactusTrunk(sub, rng, h, r);
    if (rng.chance(0.4)) cactusArm(sub, rng, rng.sign(), h * 0.5, 0.3, r);
    addSpines(sub, rng, h, r * 1.02, 4);
    sub.position.set((i - (n - 1) / 2) * spread * 2, 0, rng.range(-0.12, 0.12));
    sub.rotation.y = rng.range(0, Math.PI);
    o.add(sub);
    maxH = Math.max(maxH, h);
  }
  bakeInPlace(o);
  finishHazard(o, 'cactus');
  o.userData.col = { w: Math.min(1.62, n * spread * 2 + 0.4), h: maxH + 0.1, d: 0.66, y: 0 };
  o.userData.kind = 'jump';
  return o;
}

export function boulder(rng) {
  const o = new THREE.Group();
  const h = rng.range(0.62, 0.82);
  const base = M(0x8d8377, { flat: true, roughness: 0.95 });
  const dark = M(0x6e655c, { flat: true, roughness: 0.95 });
  put(o, ICO(), base, [0, h * 0.5, 0], [h * 0.62, h * 0.5, h * 0.6], [rng.range(0, 3), rng.range(0, 3), rng.range(0, 3)]);
  put(o, ICO(), dark, [rng.range(-0.25, 0.25), h * 0.2, rng.range(-0.2, 0.2)], [h * 0.36, h * 0.3, h * 0.34], [rng.range(0, 3), 0, rng.range(0, 3)]);
  bakeInPlace(o);
  finishHazard(o, 'stone');
  o.userData.col = { w: 0.95, h: h * 0.95, d: 0.85, y: 0 };
  o.userData.kind = 'jump';
  return o;
}

/** A low wall of stacked stones - reads clearly as "jump this". */
export function rockWall(rng) {
  const o = new THREE.Group();
  const h = rng.range(0.55, 0.72);
  const mats = [M(0x8d8377, { flat: true, roughness: 0.95 }), M(0x776d63, { flat: true, roughness: 0.95 })];
  for (let i = 0; i < 4; i++) {
    const bw = rng.range(0.3, 0.44);
    put(o, RBOX(), mats[i % 2],
      [(i - 1.5) * 0.36, h * (i % 2 ? 0.34 : 0.28) + 0.06, rng.range(-0.06, 0.06)],
      [bw, h * (i % 2 ? 0.68 : 0.56), 0.5], [0, rng.range(-0.2, 0.2), 0]);
  }
  put(o, RBOX(), mats[0], [0, h * 0.78, 0], [1.1, h * 0.32, 0.44], [0, rng.range(-0.1, 0.1), 0]);
  bakeInPlace(o);
  finishHazard(o, 'stone');
  o.userData.col = { w: 1.35, h: h + 0.1, d: 0.55, y: 0 };
  o.userData.kind = 'jump';
  return o;
}

/**
 * Pterodactyl. `tier` picks the flight height:
 *   0 -> low  (jump over it)
 *   1 -> mid  (duck under it)
 *   2 -> high (decoration, no collider)
 */
export function pterodactyl(rng, tier = 1) {
  const o = new THREE.Group();
  const skin = M(0xa792ae, { roughness: 0.78 });
  const skinDark = M(0x806b89, { roughness: 0.83 });
  const wingSkin = M(0x9f88a8, { roughness: 0.85, side: THREE.DoubleSide });
  const beak = M(0xe8b24a, { roughness: 0.55 });
  const eyeW = M(0xf8f8f4, { roughness: 0.3 });
  const eyeD = M(0x1c1a20, { roughness: 0.25 });

  const bodyG = new THREE.Group();
  o.add(bodyG);
  put(bodyG, SPH(), skin, [0, 0, 0], [0.28, 0.26, 0.52]);
  put(bodyG, SPH(), skin, [0, 0.1, -0.42], [0.2, 0.19, 0.24]);
  // Beak
  put(bodyG, CONE(6), beak, [0, 0.06, -0.78], [0.09, 0.42, 0.09], [-Math.PI / 2, 0, 0]);
  put(bodyG, CONE(6), beak, [0, -0.02, -0.74], [0.075, 0.34, 0.075], [-Math.PI / 2, 0, 0]);
  // Head crest - the pterodactyl silhouette cue.
  put(bodyG, CONE(4), skinDark, [0, 0.22, -0.3], [0.06, 0.34, 0.2], [0.7, 0, 0]);
  for (const sx of [-1, 1]) {
    put(bodyG, SPH(), eyeW, [sx * 0.11, 0.14, -0.52], [0.058, 0.058, 0.058]);
    put(bodyG, SPH(), eyeD, [sx * 0.125, 0.145, -0.565], [0.031, 0.031, 0.031]);
  }
  // Tail
  put(bodyG, CONE(5), skinDark, [0, 0.02, 0.62], [0.07, 0.5, 0.07], [Math.PI / 2, 0, 0]);
  put(bodyG, CONE(4), skinDark, [0, 0.02, 0.92], [0.14, 0.2, 0.03], [Math.PI / 2, 0, 0]);
  // Feet
  for (const sx of [-1, 1]) {
    put(bodyG, CYL(5), skinDark, [sx * 0.12, -0.24, 0.06], [0.035, 0.2, 0.035], [0.3, 0, 0]);
  }

  // Wingspan is deliberately kept just under one lane wide so a flyer never
  // visually bleeds into the lane beside it.
  const wings = [];
  for (const sx of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(sx * 0.18, 0.08, -0.04);
    o.add(pivot);
    put(pivot, wingMembrane(sx), wingSkin, [0, 0, 0], [1, 1, 1]);
    const outer = new THREE.Group();
    outer.position.set(sx * 0.6, 0, 0);
    pivot.add(outer);
    put(outer, wingMembrane(sx, true), wingSkin, [0, 0, 0.02], [1, 1, 1], [0, sx * 0.12, 0]);
    put(outer, CONE(4), skinDark, [sx * 0.58, 0, 0.14], [0.13, 0.34, 0.045], [Math.PI / 2, 0, sx * 1.35]);
    wings.push({ pivot, outer, side: sx });
  }

  // Bake the static parts; the two wing joints stay live for the flap.
  bakeInPlace(bodyG);
  for (const w of wings) bakeInPlace(w.outer);
  finishHazard(o, 'flyer');

  o.userData.wings = wings;
  o.userData.body = bodyG;
  o.userData.flapPhase = rng.range(0, Math.PI * 2);
  o.userData.tier = tier;
  o.userData.animate = 'flyer';

  // `col.y` is always an offset from the object's own Y, so the collider
  // follows the wing-flap bob instead of drifting away from the body.
  if (tier === 0) {
    o.userData.col = { w: 1.35, h: 0.78, d: 0.9, y: -0.34 };
    o.userData.kind = 'jump';
  } else if (tier === 1) {
    o.userData.col = { w: 1.5, h: 0.78, d: 0.9, y: -0.34 };
    o.userData.kind = 'duck';
  } else {
    o.userData.col = null;
  }
  return o;
}

/** Height (world Y) the flyer body should sit at for each tier. */
export const FLYER_Y = [0.6, 1.56, 4.4];

export const OBSTACLE_BUILDERS = {
  cactusSmall, cactusTall, cactusCluster, boulder, rockWall, pterodactyl,
};

/** Per-frame animation for obstacles that need it (wing flap). */
export function animateObstacle(obj, t) {
  if (obj.userData.animate !== 'flyer') return;
  const ph = t * 8.5 + obj.userData.flapPhase;
  // Faster downstroke, softer recovery, with the outer joint trailing behind.
  const flap = Math.sin(ph + 0.18 * Math.sin(ph));
  for (const w of obj.userData.wings) {
    w.pivot.rotation.z = -w.side * (flap * 0.48 + 0.07);
    w.outer.rotation.z = -w.side * (Math.sin(ph - 0.58) * 0.36 + 0.04);
  }
  obj.position.y = obj.userData.baseY + Math.sin(ph - 0.65) * 0.07;
  obj.userData.body.rotation.x = Math.sin(ph + 0.35) * 0.045;
  obj.rotation.x = Math.sin(ph - 1.2) * 0.04;
}
