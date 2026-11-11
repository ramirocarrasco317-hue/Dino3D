import * as THREE from 'three';

const cache = new Map();

function hash(x, y, seed) {
  let n = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ seed;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}

function noise(u, v, period, seed) {
  const x = u * period, y = v * period;
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const x0 = ix % period, x1 = (ix + 1) % period;
  const y0 = iy % period, y1 = (iy + 1) % period;
  const a = hash(x0, y0, seed), b = hash(x1, y0, seed);
  const c = hash(x0, y1, seed), d = hash(x1, y1, seed);
  return (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
}

/** Tileable, neutral surface grain. Biome colours still come from the palette. */
export function surfaceTexture(type) {
  if (cache.has(type)) return cache.get(type);

  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(256, 256);
  const seed = { ground: 13, track: 47, stone: 89, cactus: 131 }[type] ?? 7;

  for (let y = 0; y < 256; y++) {
    for (let x = 0; x < 256; x++) {
      const u = x / 256, v = y / 256;
      const broad = noise(u, v, 5, seed);
      const medium = noise(u, v, 17, seed + 19);
      const fine = noise(u, v, 53, seed + 71);
      const value = Math.max(198, Math.min(255,
        Math.round(238 + (broad - 0.5) * 20 + (medium - 0.5) * 17 + (fine - 0.5) * 11),
      ));
      const i = (y * 256 + x) * 4;
      image.data[i] = image.data[i + 1] = image.data[i + 2] = value;
      image.data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  const repeats = { ground: [8, 4], track: [2, 8], stone: [1, 1], cactus: [1, 2] };
  tex.repeat.set(...(repeats[type] ?? [1, 1]));
  tex.anisotropy = 4;
  cache.set(type, tex);
  return tex;
}
