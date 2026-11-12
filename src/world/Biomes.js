import * as THREE from 'three';
import { pixelMaterial } from './PixelMaterial.js';
import { bakeGroup } from './bake.js';

/**
 * Biome definitions: palette + decorative prop factories.
 *
 * Every prop is built from a tiny set of shared geometries and cached
 * materials, so a full 300 m of visible world stays in the low hundreds of
 * draw calls and allocates nothing per frame.
 */

const matCache = new Map();
export function bmat(color, opts = {}) {
  const key = `${color}|${JSON.stringify(opts)}`;
  let m = matCache.get(key);
  if (!m) {
    m = pixelMaterial({
      color, roughness: opts.roughness ?? 0.9, metalness: opts.metalness ?? 0,
      flatShading: opts.flat ?? false,
      emissive: opts.emissive ?? 0x000000,
      emissiveIntensity: opts.emissiveIntensity ?? 1,
      transparent: opts.transparent ?? false,
      opacity: opts.opacity ?? 1,
    });
    matCache.set(key, m);
  }
  return m;
}

const geoCache = new Map();
function geo(key, build) {
  let g = geoCache.get(key);
  if (!g) { g = build(); geoCache.set(key, g); }
  return g;
}

const G = {
  cone: (rs = 8) => geo(`cone${rs}`, () => new THREE.ConeGeometry(1, 1, 4)),
  cyl: (rs = 8) => geo(`cyl${rs}`, () => new THREE.BoxGeometry(1.6, 1, 1.6)),
  sph: (w = 10, h = 8) => geo(`sph${w}_${h}`, () => new THREE.BoxGeometry(1.65, 1.65, 1.65)),
  ico: (d = 0) => geo(`ico${d}`, () => new THREE.BoxGeometry(1.5, 1.5, 1.5)),
  rbox: () => geo('rbox', () => new THREE.BoxGeometry(1, 1, 1)),
  plane: () => geo('plane', () => new THREE.PlaneGeometry(1, 1)),
};

function mesh(geometry, material, { pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1], shadow = true } = {}) {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(...pos);
  m.rotation.set(...rot);
  m.scale.set(...scale);
  m.castShadow = shadow;
  m.receiveShadow = shadow;
  return m;
}

// ---------------------------------------------------------------------------
// Prop factories
// ---------------------------------------------------------------------------

function deadBush(rng, c) {
  const g = new THREE.Group();
  const m = bmat(c.rockDark, { roughness: 0.95 });
  const n = rng.int(5, 8);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rng.range(-0.3, 0.3);
    const len = rng.range(0.55, 1.0);
    g.add(mesh(G.cyl(5), m, {
      pos: [Math.cos(a) * 0.16, len * 0.44, Math.sin(a) * 0.16],
      rot: [Math.cos(a) * 0.55, 0, -Math.sin(a) * 0.55],
      scale: [0.075, len, 0.075],
    }));
  }
  g.add(mesh(G.sph(7, 5), m, { pos: [0, 0.12, 0], scale: [0.22, 0.14, 0.22] }));
  return g;
}

function rockCluster(rng, c, big = false) {
  const g = new THREE.Group();
  const m = bmat(c.rock, { roughness: 0.95, flat: true });
  const m2 = bmat(c.rockDark, { roughness: 0.95, flat: true });
  const n = rng.int(2, big ? 5 : 3);
  for (let i = 0; i < n; i++) {
    const s = rng.range(big ? 0.9 : 0.35, big ? 2.4 : 0.9);
    g.add(mesh(G.ico(0), i % 2 ? m2 : m, {
      pos: [rng.range(-1, 1) * s, s * rng.range(0.3, 0.55), rng.range(-1, 1) * s],
      rot: [rng.range(0, 3), rng.range(0, 3), rng.range(0, 3)],
      scale: [s, s * rng.range(0.6, 1.0), s * rng.range(0.8, 1.2)],
    }));
  }
  return g;
}

function duneMound(rng, c) {
  const g = new THREE.Group();
  const m = bmat(c.groundB, { roughness: 1, flat: true });
  const s = rng.range(1.8, 3.6);
  g.add(mesh(G.sph(18, 10), m, {
    pos: [0, -s * 0.42, 0],
    rot: [0, rng.range(0, 6), 0],
    scale: [s * rng.range(1.2, 2.1), s * rng.range(0.34, 0.55), s * rng.range(1.1, 1.9)],
    shadow: false,
  }));
  return g;
}

function decorCactus(rng, c) {
  const g = new THREE.Group();
  const m = bmat(c.accent, { roughness: 0.82 });
  const h = rng.range(1.0, 2.6);
  g.add(mesh(G.cyl(9), m, { pos: [0, h / 2, 0], scale: [0.24, h, 0.24] }));
  g.add(mesh(G.sph(9, 6), m, { pos: [0, h, 0], scale: [0.24, 0.24, 0.24] }));
  if (rng.chance(0.85)) {
    const side = rng.sign();
    const ah = rng.range(0.4, 0.9);
    const ay = h * rng.range(0.4, 0.65);
    g.add(mesh(G.cyl(7), m, { pos: [side * 0.32, ay, 0], rot: [0, 0, Math.PI / 2], scale: [0.15, 0.62, 0.15] }));
    g.add(mesh(G.cyl(7), m, { pos: [side * 0.6, ay + ah / 2, 0], scale: [0.15, ah, 0.15] }));
    g.add(mesh(G.sph(7, 5), m, { pos: [side * 0.6, ay + ah, 0], scale: [0.15, 0.15, 0.15] }));
  }
  return g;
}

function palmTree(rng, c) {
  const g = new THREE.Group();
  const trunk = bmat(c.wood, { roughness: 0.92 });
  const leaf = bmat(c.accent, { roughness: 0.7 });
  const leafDark = bmat(c.accentDark, { roughness: 0.7 });
  const h = rng.range(4.5, 8.5);
  const bend = rng.range(-0.18, 0.18);
  const segs = 5;
  for (let i = 0; i < segs; i++) {
    const t = i / segs;
    g.add(mesh(G.cyl(7), trunk, {
      pos: [Math.sin(t * 1.6) * bend * h * 0.5, h * (t + 0.5 / segs), 0],
      rot: [0, 0, -bend * t],
      scale: [0.26 - t * 0.1, h / segs + 0.05, 0.26 - t * 0.1],
    }));
  }
  const topX = Math.sin(1.6) * bend * h * 0.5;
  const crown = new THREE.Group();
  crown.position.set(topX, h, 0);
  const nl = rng.int(6, 8);
  for (let i = 0; i < nl; i++) {
    const a = (i / nl) * Math.PI * 2;
    const droop = rng.range(0.5, 0.95);
    const frond = mesh(G.cone(5), i % 2 ? leaf : leafDark, {
      pos: [Math.cos(a) * 1.15, -0.15, Math.sin(a) * 1.15],
      rot: [Math.sin(a) * droop, -a, -Math.cos(a) * droop + Math.PI / 2],
      scale: [0.42, 2.5, 0.14],
    });
    crown.add(frond);
  }
  crown.add(mesh(G.sph(8, 6), trunk, { scale: [0.34, 0.3, 0.34] }));
  if (rng.chance(0.5)) {
    for (let i = 0; i < 3; i++) {
      crown.add(mesh(G.sph(7, 5), bmat(c.fruit ?? 0xb8823a), {
        pos: [Math.cos(i * 2.1) * 0.28, -0.3, Math.sin(i * 2.1) * 0.28], scale: [0.16, 0.18, 0.16],
      }));
    }
  }
  g.add(crown);
  return g;
}

function fernBush(rng, c) {
  const g = new THREE.Group();
  const a = bmat(c.accent, { roughness: 0.78 });
  const b = bmat(c.accentDark, { roughness: 0.78 });
  const n = rng.int(4, 7);
  const s = rng.range(0.6, 1.4);
  for (let i = 0; i < n; i++) {
    const ang = (i / n) * Math.PI * 2 + rng.range(-0.4, 0.4);
    g.add(mesh(G.cone(5), i % 2 ? a : b, {
      pos: [Math.cos(ang) * 0.25 * s, s * 0.42, Math.sin(ang) * 0.25 * s],
      rot: [Math.sin(ang) * 0.5, -ang, -Math.cos(ang) * 0.5],
      scale: [0.3 * s, 1.5 * s, 0.12 * s],
    }));
  }
  return g;
}

function jungleRock(rng, c) {
  const g = rockCluster(rng, c, rng.chance(0.4));
  const moss = bmat(c.accentDark, { roughness: 0.95, flat: true });
  g.children.forEach((ch, i) => {
    if (i % 2 === 0) {
      const cap = mesh(G.sph(8, 5), moss, {
        pos: [ch.position.x, ch.position.y + ch.scale.y * 0.55, ch.position.z],
        scale: [ch.scale.x * 0.9, ch.scale.y * 0.35, ch.scale.z * 0.9],
      });
      g.add(cap);
    }
  });
  return g;
}

function mesaRock(rng, c) {
  const g = new THREE.Group();
  const layers = rng.int(3, 5);
  const base = rng.range(2.0, 4.2);
  let y = 0;
  for (let i = 0; i < layers; i++) {
    const t = i / layers;
    const h = rng.range(0.7, 1.6);
    const r = base * (1 - t * 0.45);
    g.add(mesh(G.cyl(7), bmat(i % 2 ? c.rock : c.rockDark, { flat: true, roughness: 0.96 }), {
      pos: [rng.range(-0.2, 0.2), y + h / 2, rng.range(-0.2, 0.2)],
      rot: [0, rng.range(0, 1), 0],
      scale: [r, h, r * rng.range(0.85, 1.15)],
    }));
    y += h;
  }
  return g;
}

function basaltSpire(rng, c) {
  const g = new THREE.Group();
  const n = rng.int(2, 4);
  for (let i = 0; i < n; i++) {
    const h = rng.range(2.5, 7);
    const r = rng.range(0.35, 0.9);
    g.add(mesh(G.cyl(6), bmat(i % 2 ? c.rock : c.rockDark, { flat: true, roughness: 0.85 }), {
      pos: [rng.range(-1.4, 1.4), h / 2, rng.range(-1.4, 1.4)],
      rot: [rng.range(-0.06, 0.06), rng.range(0, 2), rng.range(-0.06, 0.06)],
      scale: [r, h, r],
    }));
  }
  return g;
}

function lavaPool(rng, c) {
  const g = new THREE.Group();
  const s = rng.range(1.6, 4.0);
  const lava = bmat(c.emissive, { emissive: c.emissive, emissiveIntensity: 1.6, roughness: 0.5 });
  const pool = mesh(G.sph(10, 6), lava, { pos: [0, 0.04, 0], scale: [s, 0.12, s * 0.8], shadow: false });
  g.add(pool);
  const crust = bmat(c.rockDark, { flat: true, roughness: 0.95 });
  const n = rng.int(4, 7);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    g.add(mesh(G.ico(0), crust, {
      pos: [Math.cos(a) * s * 0.95, 0.1, Math.sin(a) * s * 0.78],
      rot: [rng.range(0, 3), rng.range(0, 3), rng.range(0, 3)],
      scale: [rng.range(0.3, 0.7), rng.range(0.2, 0.45), rng.range(0.3, 0.7)],
    }));
  }
  return g;
}

function charredStump(rng, c) {
  const g = new THREE.Group();
  const m = bmat(c.wood, { flat: true, roughness: 0.98 });
  const h = rng.range(1.0, 2.6);
  g.add(mesh(G.cyl(6), m, { pos: [0, h / 2, 0], rot: [rng.range(-0.1, 0.1), 0, rng.range(-0.1, 0.1)], scale: [0.3, h, 0.3] }));
  if (rng.chance(0.6)) {
    g.add(mesh(G.cyl(5), m, { pos: [0.35, h * 0.75, 0], rot: [0, 0, -0.9], scale: [0.12, 0.8, 0.12] }));
  }
  return g;
}

function snowPine(rng, c) {
  const g = new THREE.Group();
  const trunk = bmat(c.wood, { roughness: 0.92 });
  const needle = bmat(c.accent, { roughness: 0.8, flat: true });
  const snow = bmat(c.snow ?? 0xffffff, { roughness: 0.65, flat: true });
  const h = rng.range(4, 9);
  g.add(mesh(G.cyl(6), trunk, { pos: [0, h * 0.16, 0], scale: [0.22, h * 0.34, 0.22] }));
  const tiers = rng.int(3, 5);
  for (let i = 0; i < tiers; i++) {
    const t = i / tiers;
    const r = (1.7 - t * 1.1) * (h / 6);
    const th = (h * 0.75) / tiers + 0.5;
    const y = h * 0.28 + t * h * 0.62;
    g.add(mesh(G.cone(8), needle, { pos: [0, y + th * 0.4, 0], scale: [r, th, r] }));
    g.add(mesh(G.cone(8), snow, { pos: [0, y + th * 0.52, 0], scale: [r * 0.78, th * 0.5, r * 0.78] }));
  }
  return g;
}

function iceSpike(rng, c) {
  const g = new THREE.Group();
  const m = bmat(c.accent, { roughness: 0.24, metalness: 0.05, flat: true, transparent: true, opacity: 0.92 });
  const n = rng.int(2, 4);
  for (let i = 0; i < n; i++) {
    const h = rng.range(1.4, 4.5);
    g.add(mesh(G.cone(5), m, {
      pos: [rng.range(-1, 1), h / 2, rng.range(-1, 1)],
      rot: [rng.range(-0.12, 0.12), rng.range(0, 3), rng.range(-0.12, 0.12)],
      scale: [rng.range(0.35, 0.8), h, rng.range(0.35, 0.8)],
    }));
  }
  return g;
}

function snowMound(rng, c) {
  const g = new THREE.Group();
  const s = rng.range(1.4, 3.6);
  g.add(mesh(G.sph(9, 6), bmat(c.groundB, { roughness: 1, flat: true }), {
    pos: [0, -s * 0.25, 0], scale: [s * 1.4, s * 0.55, s * 1.2], shadow: false,
  }));
  return g;
}

function grassTuft(rng, c) {
  const g = new THREE.Group();
  const m = bmat(c.accentDark, { roughness: 0.9, flat: true });
  const n = rng.int(3, 6);
  for (let i = 0; i < n; i++) {
    const a = rng.range(0, Math.PI * 2);
    const h = rng.range(0.35, 0.9);
    g.add(mesh(G.cone(4), m, {
      pos: [Math.cos(a) * 0.15, h * 0.5, Math.sin(a) * 0.15],
      rot: [Math.sin(a) * 0.35, a, -Math.cos(a) * 0.35],
      scale: [0.1, h, 0.06],
    }));
  }
  return g;
}

// ---------------------------------------------------------------------------
// Biome table
// ---------------------------------------------------------------------------

/**
 * `props` entries: [weight, factory, minScale, maxScale]
 * Colours are plain hex; the environment lerps between neighbouring biomes.
 */
export const BIOMES = [
  {
    id: 'desert',
    name: 'Desierto',
    ground: 0xe3bd82, groundB: 0xd6ab6d, track: 0xc9a066, trackEdge: 0x936d3f,
    rock: 0xc08f5e, rockDark: 0x9d7047, wood: 0x8a6a44,
    accent: 0x4f9a52, accentDark: 0x3d7b41,
    sky: 0x7ec6f5, skyHorizon: 0xf7dfae, fog: 0xe8d3ac,
    sun: 0xfff2d0, sunIntensity: 2.5, ambient: 0x9fb8d8, ambientIntensity: 0.65,
    fruit: 0xd06a5a,
    props: [[3, decorCactus, 0.8, 1.5], [2, rockCluster, 0.8, 1.5], [3, duneMound, 0.8, 1.4], [2, deadBush, 0.8, 1.4]],
    density: 0.75,
  },
  {
    id: 'jungle',
    name: 'Jungla',
    ground: 0x5a9a52, groundB: 0x3f8148, track: 0x8a7350, trackEdge: 0x5a4630,
    rock: 0x6f7a63, rockDark: 0x53604c, wood: 0x6b4a32,
    accent: 0x37a05c, accentDark: 0x217a45,
    sky: 0x69c2d6, skyHorizon: 0xcfeccd, fog: 0xa8d6b4,
    sun: 0xfaf5d8, sunIntensity: 2.2, ambient: 0x8fd0a4, ambientIntensity: 0.8,
    fruit: 0xd8b23a,
    props: [[4, palmTree, 0.8, 1.3], [3, fernBush, 0.9, 1.6], [2, jungleRock, 0.8, 1.3], [3, grassTuft, 0.9, 1.7]],
    density: 1.15,
  },
  {
    id: 'rocky',
    name: 'Cañón',
    ground: 0xc98a5e, groundB: 0xb3744d, track: 0xa8683f, trackEdge: 0x6f4227,
    rock: 0xb56b45, rockDark: 0x8c4f34, wood: 0x7a5238,
    accent: 0x6f8f5a, accentDark: 0x55703f,
    sky: 0x8ec0e8, skyHorizon: 0xf0c39a, fog: 0xdca987,
    sun: 0xffeacc, sunIntensity: 2.4, ambient: 0xb090a0, ambientIntensity: 0.62,
    props: [[4, mesaRock, 0.7, 1.4], [3, rockCluster, 1.0, 2.0], [2, deadBush, 0.8, 1.3], [1, decorCactus, 0.7, 1.1]],
    density: 0.9,
  },
  {
    id: 'volcanic',
    name: 'Volcán',
    ground: 0x4a3f42, groundB: 0x372f33, track: 0x33272b, trackEdge: 0x1b1416,
    rock: 0x4d4348, rockDark: 0x322b2f, wood: 0x2b2325,
    accent: 0xff6a2b, accentDark: 0xc03d16, emissive: 0xff5522,
    sky: 0x3a2740, skyHorizon: 0xd4562c, fog: 0x6b3b34,
    sun: 0xffb27a, sunIntensity: 1.9, ambient: 0xb8503a, ambientIntensity: 0.75,
    props: [[4, basaltSpire, 0.8, 1.4], [2, lavaPool, 0.8, 1.5], [3, rockCluster, 0.9, 1.7], [2, charredStump, 0.9, 1.4]],
    density: 0.95,
  },
  {
    id: 'ice',
    name: 'Hielo',
    ground: 0xdfeefb, groundB: 0xc4ddf2, track: 0xb9d5ed, trackEdge: 0x84a8c8,
    rock: 0xb9cfe2, rockDark: 0x93aec6, wood: 0x6d5a52,
    accent: 0x9fd8f0, accentDark: 0x2f7f74, snow: 0xffffff,
    sky: 0x9cd0f2, skyHorizon: 0xf2f8ff, fog: 0xd9ecfb,
    sun: 0xf0f8ff, sunIntensity: 2.3, ambient: 0xbcd8f0, ambientIntensity: 0.85,
    props: [[4, snowPine, 0.8, 1.3], [3, iceSpike, 0.8, 1.5], [3, snowMound, 0.9, 1.5], [1, rockCluster, 0.8, 1.2]],
    density: 1.0,
  },
];

// Guard against typos in the palette table above.
for (const b of BIOMES) {
  for (const k of ['ground', 'groundB', 'track', 'trackEdge', 'rock', 'rockDark', 'wood', 'accent', 'accentDark', 'sky', 'skyHorizon', 'fog', 'sun', 'ambient']) {
    if (typeof b[k] !== 'number' || !Number.isFinite(b[k])) {
      throw new Error(`Biome "${b.id}" has an invalid colour for "${k}"`);
    }
  }
}

/**
 * Weighted pick of a decorative prop, baked down to one draw call.
 * Scenery is static, so flattening it costs nothing and saves hundreds of
 * draw calls across a full view distance.
 */
export function spawnProp(biome, rng) {
  let total = 0;
  for (const p of biome.props) total += p[0];
  let r = rng.next() * total;
  for (const [w, factory, lo, hi] of biome.props) {
    r -= w;
    if (r <= 0) {
      const raw = factory(rng, biome);
      const obj = bakeGroup(raw);
      const s = rng.range(lo, hi);
      obj.scale.multiplyScalar(s);
      obj.rotation.y = rng.range(0, Math.PI * 2);
      return obj;
    }
  }
  return null;
}
