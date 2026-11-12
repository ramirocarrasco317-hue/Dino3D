import * as THREE from 'three';

const cache = new Map();
function hash(x, y, seed) {
  let n = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ seed;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}

/** Tiny, tileable pixel tiles; biome colours tint these neutral palettes. */
export function surfaceTexture(type) {
  if (cache.has(type)) return cache.get(type);
  const size = 16;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const seed = { ground: 13, track: 47, stone: 89, cactus: 131, skin: 163 }[type] ?? 7;
  const shades = [216, 232, 240, 248];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let value = shades[Math.floor(hash(x >> 1, y >> 1, seed) * shades.length)];
      if (type === 'track') value = y % 8 === 0 && x % 4 < 2 ? 220 : 242;
      if (type === 'cactus') value = x % 4 === 0 ? 176 : 240;
      if (type === 'skin') value = hash(x, y, seed) > 0.88 ? 176 : 248;
      ctx.fillStyle = 'rgb(' + value + ',' + value + ',' + value + ')';
      ctx.fillRect(x, y, 1, 1);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.NearestFilter;
  // Keep mipmaps on distant ground to avoid shimmering during movement.
  tex.minFilter = THREE.NearestMipmapNearestFilter;
  tex.anisotropy = 1;
  const repeats = { ground: [12, 6], track: [3, 10], cactus: [1, 2] };
  tex.repeat.set(...(repeats[type] ?? [1, 1]));
  cache.set(type, tex);
  return tex;
}
