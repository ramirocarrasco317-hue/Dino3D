import * as THREE from 'three';
import { pixelMaterial } from '../world/PixelMaterial.js';
import { CFG } from '../core/Config.js';
import { clamp, lerp } from '../core/MathUtils.js';

const MAX_PARTICLES = 192;

function softDot() {
  const c = document.createElement('canvas');
  c.width = c.height = 4;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 4, 4);
  const texture = new THREE.CanvasTexture(c);
  texture.magFilter = texture.minFilter = THREE.NearestFilter;
  return texture;
}

const PARTICLE_VERT = /* glsl */`
attribute float aSize;
attribute float aAlpha;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vColor = color;
  vAlpha = aAlpha;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * (260.0 / -mv.z);
  gl_Position = projectionMatrix * mv;
}
`;

const PARTICLE_FRAG = /* glsl */`
uniform sampler2D uMap;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec4 tex = texture2D(uMap, gl_PointCoord);
  if (tex.a < 0.01) discard;
  gl_FragColor = vec4(vColor, tex.a * vAlpha);
}
`;

/**
 * One pooled Points cloud drives every particle in the game (dust, sparkles,
 * debris, embers). Zero allocations per frame.
 */
export class Effects {
  constructor(scene, player) {
    this.scene = scene;
    this.player = player;

    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(MAX_PARTICLES * 3);
    this.col = new Float32Array(MAX_PARTICLES * 3);
    this.size = new Float32Array(MAX_PARTICLES);
    this.alpha = new Float32Array(MAX_PARTICLES);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1));
    geo.setDrawRange(0, MAX_PARTICLES);
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, -20), 200);

    this.material = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: softDot() } },
      vertexShader: PARTICLE_VERT,
      fragmentShader: PARTICLE_FRAG,
      transparent: true,
      depthWrite: false,
      vertexColors: true,
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    scene.add(this.points);

    this.parts = new Array(MAX_PARTICLES).fill(null).map(() => ({
      life: 0, maxLife: 1, vx: 0, vy: 0, vz: 0, drag: 2, grav: -8, size0: 1, size1: 0, alpha0: 1,
    }));
    this.cursor = 0;
    this._tmp = new THREE.Color();

    this._buildAuras();
  }

  _buildAuras() {
    // Shield bubble
    const shieldGeo = new THREE.IcosahedronGeometry(1.35, 0);
    this.shield = new THREE.Mesh(shieldGeo, pixelMaterial({
      color: 0x53c8ff, emissive: 0x2aa5ff, emissiveIntensity: 0.85,
      transparent: true, opacity: 0.22, roughness: 0.1, metalness: 0.1,
      side: THREE.DoubleSide, depthWrite: false,
    }));
    this.shield.visible = false;
    this.shield.renderOrder = 4;
    this.scene.add(this.shield);

    const wireGeo = new THREE.IcosahedronGeometry(1.38, 0);
    this.shieldWire = new THREE.LineSegments(
      new THREE.WireframeGeometry(wireGeo),
      new THREE.LineBasicMaterial({ color: 0x9ce8ff, transparent: true, opacity: 0.45 }),
    );
    this.shieldWire.visible = false;
    this.scene.add(this.shieldWire);

    // Magnet aura: a flat pulsing ring on the ground
    this.magnetRing = new THREE.Mesh(
      new THREE.RingGeometry(CFG.coins.magnetRadius * 0.55, CFG.coins.magnetRadius * 0.6, 8),
      new THREE.MeshBasicMaterial({ color: 0xff6f8a, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }),
    );
    this.magnetRing.rotation.x = -Math.PI / 2;
    this.magnetRing.visible = false;
    this.scene.add(this.magnetRing);

    // Score multiplier aura: warm rising glow at the feet
    this.multiRing = new THREE.Mesh(
      new THREE.RingGeometry(0.7, 1.05, 8),
      new THREE.MeshBasicMaterial({ color: 0xc98bff, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false }),
    );
    this.multiRing.rotation.x = -Math.PI / 2;
    this.multiRing.visible = false;
    this.scene.add(this.multiRing);
  }

  emit(x, y, z, opts) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % MAX_PARTICLES;
    const p = this.parts[i];
    p.life = p.maxLife = opts.life ?? 0.6;
    p.vx = opts.vx ?? 0; p.vy = opts.vy ?? 0; p.vz = opts.vz ?? 0;
    p.drag = opts.drag ?? 2.2;
    p.grav = opts.grav ?? -9;
    p.size0 = opts.size ?? 12;
    p.size1 = opts.sizeEnd ?? 0;
    p.alpha0 = opts.alpha ?? 0.9;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    const c = this._tmp.set(opts.color ?? 0xffffff);
    this.col[i * 3] = c.r; this.col[i * 3 + 1] = c.g; this.col[i * 3 + 2] = c.b;
    this.size[i] = p.size0;
    this.alpha[i] = p.alpha0;
  }

  burstDust(x, y, z, power = 1, color = 0xd9c39a) {
    const n = Math.round(6 + power * 8);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = (0.6 + Math.random()) * power;
      this.emit(x + Math.cos(a) * 0.25, y + 0.08, z + Math.sin(a) * 0.2, {
        vx: Math.cos(a) * 2.4 * s, vy: 1.4 + Math.random() * 2.2 * s, vz: Math.sin(a) * 1.8 * s + 2,
        life: 0.45 + Math.random() * 0.35, size: 12 + Math.random() * 16 * power, sizeEnd: 2,
        color, alpha: 0.55, grav: -5.5, drag: 3.2,
      });
    }
  }

  burstCoin(x, y, z) {
    // A small, warm mint sparkle around the pickup. Point size is in screen
    // pixels, so keep this deliberately restrained near the chase camera.
    for (let i = 0; i < 7; i++) {
      const a = Math.random() * Math.PI * 2;
      this.emit(x, y, z, {
        vx: Math.cos(a) * 1.35, vy: 1.1 + Math.random() * 1.3, vz: Math.sin(a) * 1.15,
        life: 0.22 + Math.random() * 0.08, size: 0.9 + Math.random() * 0.55, sizeEnd: 0,
        color: Math.random() < 0.5 ? 0x69f0c0 : 0xc5ffe8, alpha: 0.82, grav: -5.2, drag: 3.4,
      });
    }
  }

  burstPower(x, y, z, color) {
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 0.4 + Math.random() * 0.5;
      this.emit(x + Math.cos(a) * r, y + (Math.random() - 0.5) * 0.9, z + Math.sin(a) * r, {
        vx: Math.cos(a) * 4.5, vy: 2 + Math.random() * 3, vz: Math.sin(a) * 4.5,
        life: 0.5 + Math.random() * 0.3, size: 12 + Math.random() * 12, sizeEnd: 0,
        color, alpha: 1, grav: -4, drag: 3,
      });
    }
  }

  burstImpact(x, y, z, color = 0xffffff) {
    for (let i = 0; i < 30; i++) {
      const a = Math.random() * Math.PI * 2;
      const e = Math.random() * Math.PI - Math.PI / 2;
      const sp = 4 + Math.random() * 8;
      this.emit(x, y, z, {
        vx: Math.cos(a) * Math.cos(e) * sp, vy: Math.abs(Math.sin(e)) * sp * 0.8 + 2, vz: Math.sin(a) * Math.cos(e) * sp,
        life: 0.5 + Math.random() * 0.45, size: 10 + Math.random() * 18, sizeEnd: 1,
        color, alpha: 0.95, grav: -16, drag: 2.4,
      });
    }
  }

  /** Faint speed trail behind the dino - only fires above a speed threshold. */
  trail(x, y, z, speed01, color) {
    if (Math.random() > speed01 * 0.8) return;
    this.emit(x + (Math.random() - 0.5) * 0.6, y + Math.random() * 0.6, z + 0.4, {
      vx: 0, vy: 0.5, vz: 6 + speed01 * 10,
      life: 0.28, size: 7 + Math.random() * 6, sizeEnd: 0, color, alpha: 0.32, grav: 0, drag: 0.5,
    });
  }

  update(dt, worldSpeed, state) {
    const pos = this.pos, size = this.size, alpha = this.alpha;
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = this.parts[i];
      if (p.life <= 0) { if (alpha[i] !== 0) alpha[i] = 0; continue; }
      p.life -= dt;
      if (p.life <= 0) { alpha[i] = 0; continue; }
      const k = 1 - p.life / p.maxLife;
      const d = Math.exp(-p.drag * dt);
      p.vx *= d; p.vz *= d;
      p.vy = p.vy * d + p.grav * dt;
      const i3 = i * 3;
      pos[i3] += p.vx * dt;
      pos[i3 + 1] += p.vy * dt;
      pos[i3 + 2] += (p.vz + worldSpeed) * dt;
      size[i] = lerp(p.size0, p.size1, k);
      alpha[i] = p.alpha0 * (1 - k * k);
    }
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.aSize.needsUpdate = true;
    g.attributes.aAlpha.needsUpdate = true;

    // --- auras ---------------------------------------------------------------
    const px = this.player.x, py = this.player.y;
    const t = state.time;
    if (this.shield.visible) {
      this.shield.position.set(px, py + 0.95, 0);
      this.shieldWire.position.copy(this.shield.position);
      const pulse = 1 + Math.sin(t * 5) * 0.045;
      const fade = state.shieldEnding ? 0.5 + Math.sin(t * 22) * 0.5 : 1;
      this.shield.scale.setScalar(pulse);
      this.shieldWire.scale.setScalar(pulse * 1.01);
      this.shield.material.opacity = 0.2 * fade;
      this.shieldWire.material.opacity = 0.42 * fade;
      this.shieldWire.rotation.y += dt * 0.7;
      this.shieldWire.rotation.x += dt * 0.35;
    }
    if (this.magnetRing.visible) {
      this.magnetRing.position.set(px, 0.06, 0);
      const s = 1 + Math.sin(t * 3.4) * 0.06;
      this.magnetRing.scale.setScalar(s);
      this.magnetRing.material.opacity = (state.magnetEnding ? 0.18 + Math.sin(t * 20) * 0.16 : 0.3);
    }
    if (this.multiRing.visible) {
      this.multiRing.position.set(px, 0.05, 0);
      this.multiRing.scale.setScalar(1 + (Math.sin(t * 4) * 0.5 + 0.5) * 0.5);
      this.multiRing.material.opacity = 0.45 * (1 - (Math.sin(t * 4) * 0.5 + 0.5) * 0.6);
    }
  }

  setShield(on) { this.shield.visible = on; this.shieldWire.visible = on; }
  setMagnet(on) { this.magnetRing.visible = on; }
  setMultiplier(on) { this.multiRing.visible = on; }

  clear() {
    for (const p of this.parts) p.life = 0;
    this.alpha.fill(0);
    this.points.geometry.attributes.aAlpha.needsUpdate = true;
    this.setShield(false); this.setMagnet(false); this.setMultiplier(false);
  }
}
