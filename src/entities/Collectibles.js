import * as THREE from 'three';
import { bakeInPlace } from '../world/bake.js';

/** Coins and power-up orbs. Geometry/material are shared across all instances. */

let coinGeo = null;
let coinMat = null;
let coinCoreMat = null;
let starGeo = null;

function makeStarGeometry(outer = 1, inner = 0.46, points = 5) {
  const shape = new THREE.Shape();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    if (i === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
  }
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.35, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.08, bevelSegments: 1, curveSegments: 1,
  });
  geo.center();
  return geo;
}

function initCoinAssets() {
  if (coinGeo) return;
  coinGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.085, 18);
  coinGeo.rotateX(Math.PI / 2);
  // Same surface parameters on both parts so the baked coin is a single draw
  // call; only the vertex colour differs.
  coinMat = new THREE.MeshStandardMaterial({
    color: 0xffc63d, roughness: 0.26, metalness: 0.8,
    emissive: 0xff9a1f, emissiveIntensity: 0.5,
  });
  coinCoreMat = new THREE.MeshStandardMaterial({
    color: 0xfff3bd, roughness: 0.26, metalness: 0.8,
    emissive: 0xff9a1f, emissiveIntensity: 0.5,
  });
  starGeo = makeStarGeometry(0.19, 0.085, 5);
  // Flattened hard so the emblem sits *in* the coin face, not on a spike.
  starGeo.scale(1, 1, 0.075);
}

export function createCoin() {
  initCoinAssets();
  const g = new THREE.Group();
  const disc = new THREE.Mesh(coinGeo, coinMat);
  disc.castShadow = true;
  g.add(disc);
  for (const sz of [-1, 1]) {
    const star = new THREE.Mesh(starGeo, coinCoreMat);
    star.position.z = sz * 0.045;
    if (sz > 0) star.rotation.y = Math.PI;
    g.add(star);
  }
  bakeInPlace(g);
  g.userData.spin = Math.random() * Math.PI * 2;
  return g;
}

// ---------------------------------------------------------------------------

const POWER_COLORS = {
  shield: { main: 0x38b6ff, glow: 0x8ee6ff },
  magnet: { main: 0xff4f6d, glow: 0xffb0c0 },
  multiplier: { main: 0xb06bff, glow: 0xe3c4ff },
};

let ringGeo = null;
let orbGeo = null;

function shieldIcon(color) {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0.5);
  shape.bezierCurveTo(0.34, 0.46, 0.42, 0.36, 0.42, 0.2);
  shape.bezierCurveTo(0.42, -0.12, 0.24, -0.38, 0, -0.52);
  shape.bezierCurveTo(-0.24, -0.38, -0.42, -0.12, -0.42, 0.2);
  shape.bezierCurveTo(-0.42, 0.36, -0.34, 0.46, 0, 0.5);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.16, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 2, curveSegments: 6,
  });
  geo.center();
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
    color, roughness: 0.25, metalness: 0.55, emissive: color, emissiveIntensity: 0.45,
  }));
  m.castShadow = true;
  return m;
}

function magnetIcon(color) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.TorusGeometry(0.3, 0.12, 8, 16, Math.PI),
    new THREE.MeshStandardMaterial({ color, roughness: 0.3, metalness: 0.6, emissive: color, emissiveIntensity: 0.35 }),
  );
  body.castShadow = true;
  g.add(body);
  const tipMat = new THREE.MeshStandardMaterial({ color: 0xf4f6fa, roughness: 0.25, metalness: 0.8 });
  for (const sx of [-1, 1]) {
    const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.2, 10), tipMat);
    tip.position.set(sx * 0.3, -0.1, 0);
    tip.castShadow = true;
    g.add(tip);
  }
  return g;
}

function starIcon(color) {
  const geo = makeStarGeometry(0.42, 0.19, 5);
  geo.scale(1, 1, 0.55);
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
    color, roughness: 0.22, metalness: 0.6, emissive: color, emissiveIntensity: 0.5,
  }));
  m.castShadow = true;
  return m;
}

export function createPowerUp(type) {
  if (!ringGeo) {
    ringGeo = new THREE.TorusGeometry(0.62, 0.045, 6, 28);
    orbGeo = new THREE.SphereGeometry(0.56, 16, 12);
  }
  const c = POWER_COLORS[type] ?? POWER_COLORS.shield;
  const g = new THREE.Group();

  const icon = type === 'shield' ? shieldIcon(c.glow)
    : type === 'magnet' ? magnetIcon(c.glow)
      : starIcon(c.glow);
  icon.scale.setScalar(0.92);
  g.add(icon);
  g.userData.icon = icon;

  const orb = new THREE.Mesh(orbGeo, new THREE.MeshStandardMaterial({
    color: c.main, transparent: true, opacity: 0.24, roughness: 0.1, metalness: 0,
    emissive: c.main, emissiveIntensity: 0.9, depthWrite: false,
  }));
  g.add(orb);

  const ringMat = new THREE.MeshStandardMaterial({
    color: c.glow, emissive: c.main, emissiveIntensity: 1.4, roughness: 0.3, metalness: 0.2,
  });
  const ringA = new THREE.Mesh(ringGeo, ringMat);
  ringA.rotation.x = Math.PI / 2.2;
  g.add(ringA);
  const ringB = new THREE.Mesh(ringGeo, ringMat);
  ringB.rotation.set(Math.PI / 2.2, 0, Math.PI / 2.4);
  g.add(ringB);
  g.userData.rings = [ringA, ringB];
  g.userData.type = type;
  g.userData.spin = Math.random() * Math.PI * 2;
  return g;
}

export function animateCoin(coin, t) {
  coin.rotation.y = t * 3.1 + coin.userData.spin;
  coin.position.y = coin.userData.baseY + Math.sin(t * 2.6 + coin.userData.spin) * 0.11;
}

export function animatePowerUp(p, t) {
  const s = p.userData.spin;
  p.rotation.y = t * 1.5 + s;
  p.position.y = p.userData.baseY + Math.sin(t * 1.9 + s) * 0.18;
  p.userData.icon.rotation.y = -t * 2.4;
  p.userData.rings[0].rotation.z = t * 1.7;
  p.userData.rings[1].rotation.x = Math.PI / 2.2 + t * 1.3;
  const pulse = 1 + Math.sin(t * 4 + s) * 0.05;
  p.scale.setScalar(pulse);
}
