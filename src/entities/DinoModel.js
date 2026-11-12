import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { clamp, lerp, damp } from '../core/MathUtils.js';
import { surfaceTexture } from '../world/SurfaceTexture.js';

const SKIN = 0x68b86e;
const boxGeo = new THREE.BoxGeometry(1, 1, 1);
function mat(color, textured = false) {
  return new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: 0.1, map: textured ? surfaceTexture('skin') : null });
}
function block(parent, material, size, position) {
  const mesh = new THREE.Mesh(boxGeo, material);
  mesh.scale.set(...size);
  mesh.position.set(...position);
  parent.add(mesh);
  return mesh;
}
function joint(parent, position) {
  const group = new THREE.Group();
  group.position.set(...position);
  parent.add(group);
  return group;
}

// Merge only rigid siblings with the same material. Animation pivots and the
// skin material used by hurt feedback stay intact.
function mergeRigidParts(group) {
  const buckets = new Map();
  for (const mesh of [...group.children]) {
    if (!mesh.isMesh) continue;
    mesh.updateMatrix();
    const list = buckets.get(mesh.material) ?? [];
    list.push(mesh.geometry.clone().applyMatrix4(mesh.matrix));
    buckets.set(mesh.material, list);
    group.remove(mesh);
  }
  for (const [material, geometries] of buckets) {
    const geometry = mergeGeometries(geometries, false);
    for (const part of geometries) part.dispose();
    group.add(new THREE.Mesh(geometry, material));
  }
}

/** Block-built T-rex, retaining the original movement rig and animation. */
export class DinoModel {
  constructor() {
    this.root = new THREE.Group();
    this.root.name = 'dino';
    this.root.scale.setScalar(0.78);
    this.materials = {
      skin: mat(SKIN, true), skinDark: mat(0x34734d), belly: mat(0xf7df9a),
      eyeWhite: mat(0xfff4dc), eyeDark: mat(0x182634), tooth: mat(0xfff4dc),
    };
    const m = this.materials;
    this.tilt = joint(this.root, [0, 0, 0]);
    this.body = joint(this.tilt, [0, 1.06, 0]);
    block(this.body, m.skin, [0.86, 0.84, 1.24], [0, 0.04, 0]);
    block(this.body, m.belly, [0.64, 0.22, 1.04], [0, -0.32, -0.08]);
    block(this.body, m.belly, [0.52, 0.42, 0.06], [0, -0.08, -0.64]);
    for (let i = 0; i < 4; i++) {
      block(this.body, m.skinDark, [0.18, 0.18, 0.18], [0, 0.53, -0.36 + i * 0.28]);
    }
    this.neck = joint(this.body, [0, 0.4, -0.56]);
    block(this.neck, m.skin, [0.44, 0.58, 0.44], [0, 0.2, -0.08]);
    this.head = joint(this.neck, [0, 0.5, -0.3]);
    this.head.scale.setScalar(1.12);
    block(this.head, m.skin, [0.66, 0.56, 0.76], [0, 0.06, -0.16]);
    block(this.head, m.skin, [0.54, 0.28, 0.44], [0, -0.02, -0.66]);
    block(this.head, m.skinDark, [0.3, 0.08, 0.6], [0, 0.38, -0.16]);
    this.eyes = [];
    for (const side of [-1, 1]) {
      const eye = joint(this.head, [side * 0.34, 0.16, -0.34]);
      block(eye, m.eyeWhite, [0.04, 0.17, 0.2], [0, 0, 0]);
      block(eye, m.eyeDark, [0.045, 0.09, 0.09], [side * 0.025, -0.01, -0.035]);
      this.eyes.push(eye);
      block(this.head, m.eyeDark, [0.025, 0.035, 0.09], [side * 0.275, 0.04, -0.76]);
    }
    this.jaw = joint(this.head, [0, -0.14, -0.2]);
    block(this.jaw, m.skinDark, [0.52, 0.14, 0.7], [0, -0.03, -0.28]);
    block(this.jaw, m.belly, [0.4, 0.06, 0.46], [0, -0.13, -0.38]);
    this.tailSegs = [];
    let parent = this.body;
    for (const [i, s] of [[0.54, 0.5, 0.6, 0.68], [0.4, 0.36, 0.54, 0.5],
      [0.28, 0.25, 0.5, 0.46], [0.16, 0.14, 0.42, 0.42]].entries()) {
      const tail = joint(parent, [0, i === 0 ? 0.06 : 0, s[3]]);
      block(tail, i === 3 ? m.skinDark : m.skin, s.slice(0, 3), [0, 0, s[2] * 0.35]);
      this.tailSegs.push(tail);
      parent = tail;
    }
    this.arms = [];
    this.legs = [];
    for (const side of [-1, 1]) {
      const shoulder = joint(this.body, [side * 0.5, 0.18, -0.32]);
      block(shoulder, m.skin, [0.18, 0.34, 0.18], [0, -0.16, 0]);
      const elbow = joint(shoulder, [0, -0.32, 0]);
      block(elbow, m.skin, [0.15, 0.26, 0.15], [0, -0.12, 0]);
      this.arms.push({ shoulder, elbow, side });
      const hip = joint(this.body, [side * 0.34, -0.2, 0.13]);
      block(hip, m.skin, [0.4, 0.56, 0.46], [0, -0.2, 0]);
      const knee = joint(hip, [0, -0.42, 0]);
      block(knee, m.skin, [0.24, 0.4, 0.26], [0, -0.18, 0]);
      const ankle = joint(knee, [0, -0.34, 0]);
      block(ankle, m.skinDark, [0.32, 0.15, 0.56], [0, -0.035, -0.14]);
      this.legs.push({ hip, knee, ankle, side });
    }
    const rigGroups = [];
    this.tilt.traverse(node => { if (node.isGroup) rigGroups.push(node); });
    for (const group of rigGroups) mergeRigidParts(group);
    this._buildBlobShadow();
    this.phase = 0;
    this.state = 'run';
    this._blink = 2.5;
    this._blinkAmt = this._duckAmt = this._airAmt = this._landPulse = this._deadT = this._hurtFlash = 0;
    this._wasGrounded = true;
    this._baseColor = new THREE.Color(SKIN);
    this._hurtColor = new THREE.Color(0xff5a4a);
  }

  _buildBlobShadow() {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 16;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#26303d';
    ctx.fillRect(3, 2, 10, 12);
    ctx.fillRect(1, 4, 14, 8);
    const texture = new THREE.CanvasTexture(canvas);
    texture.magFilter = texture.minFilter = THREE.NearestFilter;
    this.blobShadow = new THREE.Mesh(new THREE.PlaneGeometry(1.55, 1.15),
      new THREE.MeshBasicMaterial({ map: texture, transparent: true, opacity: 0.3, depthWrite: false }));
    this.blobShadow.rotation.x = -Math.PI / 2;
    this.blobShadow.position.y = 0.015;
    this.blobShadow.renderOrder = 2;
    this.root.add(this.blobShadow);
  }

  setShadowCasting() { /* The pixel contact sprite replaces shadow maps. */ }

  flashHurt() { this._hurtFlash = 1; }

  reset() {
    this.phase = 0;
    this.state = 'run';
    this._duckAmt = 0;
    this._airAmt = 0;
    this._wasGrounded = true;
    this._landPulse = 0;
    this._deadT = 0;
    this._hurtFlash = 0;
    this.root.rotation.set(0, 0, 0);
    this.tilt.rotation.set(0, 0, 0);
    this.body.rotation.set(0, 0, 0);
    this.body.position.set(0, 1.06, 0);
    this.body.scale.set(1, 1, 1);
    this.neck.rotation.set(0, 0, 0);
    this.head.position.set(0, 0.5, -0.3);
    this.head.rotation.set(0, 0, 0);
    for (const leg of this.legs) {
      leg.hip.rotation.set(0, 0, 0);
      leg.knee.rotation.set(0, 0, 0);
      leg.ankle.rotation.set(0, 0, 0);
    }
    for (const tail of this.tailSegs) tail.rotation.set(0, 0, 0);
  }

  /**
   * @param {object} s  { state, dt, speed01, laneT, grounded, vy, height }
   */
  update(s) {
    const dt = s.dt;
    this.state = s.state;

    const targetDuck = s.state === 'duck' ? 1 : 0;
    this._duckAmt = damp(this._duckAmt, targetDuck, 16, dt);
    const air = s.grounded ? 0 : 1;
    this._airAmt = damp(this._airAmt, air, 14, dt);
    if (s.grounded && !this._wasGrounded && s.state !== 'dead') this._landPulse = 1;
    this._wasGrounded = s.grounded;
    this._landPulse = Math.max(0, this._landPulse - dt * 5);

    // Stride frequency scales with speed but compresses at the top end so the
    // legs never turn into a blur.
    const stride = lerp(6.8, 10.8, Math.pow(s.speed01, 0.75));
    if (s.state !== 'dead') this.phase += dt * stride * (1 - this._airAmt * 0.85);
    const p = this.phase;

    if (s.state === 'dead') { this._animDead(dt); return; }

    const runW = (1 - this._airAmt) * (1 - this._duckAmt * 0.78);

    // --- legs -------------------------------------------------------------
    for (let i = 0; i < 2; i++) {
      const leg = this.legs[i];
      const ph = p + (i === 0 ? 0 : Math.PI);
      const swing = Math.sin(ph);
      const lift = Math.max(0, Math.sin(ph + 0.6));

      let hipRot = swing * 0.66 * runW;
      let kneeRot = (0.22 + lift * 0.92) * runW;
      let ankleRot = (-0.14 - lift * 0.28) * runW;

      // Airborne tuck / landing reach.
      const vy = s.vy ?? 0;
      const tuck = clamp(vy / 12, -1, 1);
      hipRot = lerp(hipRot, i === 0 ? 0.55 - tuck * 0.5 : -0.15 + tuck * 0.35, this._airAmt);
      kneeRot = lerp(kneeRot, 0.95 - tuck * 0.35, this._airAmt);
      ankleRot = lerp(ankleRot, -0.25, this._airAmt);

      // Tuck the thigh forward and the shin back. The ankle counters both
      // rotations so the sole stays planted instead of dangling in mid-air.
      const duckStep = Math.sin(ph) * 0.09;
      hipRot = lerp(hipRot, 1.3 + duckStep, this._duckAmt);
      kneeRot = lerp(kneeRot, -2.4 + Math.max(0, duckStep) * 0.12, this._duckAmt);
      ankleRot = lerp(ankleRot, 1.28 - duckStep * 0.5, this._duckAmt);
      kneeRot += this._landPulse * 0.28 * (1 - this._duckAmt);

      leg.hip.rotation.x = hipRot;
      leg.knee.rotation.x = kneeRot;
      leg.ankle.rotation.x = ankleRot;
    }

    // --- body bob / lean ----------------------------------------------------
    const bob = Math.sin(p * 2) * 0.038 * runW;
    const duckDrop = this._duckAmt * 0.5;
    this.body.position.y = 1.06 + bob - duckDrop - this._airAmt * 0.04
      - this._landPulse * 0.075 * (1 - this._duckAmt);
    this.body.position.z = this._duckAmt * 0.03;

    const leanRun = 0.035 + s.speed01 * 0.065;
    const leanAir = clamp(-(s.vy ?? 0) * 0.012, -0.22, 0.3);
    this.body.rotation.x = lerp(leanRun + Math.sin(p * 2 + 1.2) * 0.02 * runW, leanAir + 0.05, this._airAmt);
    this.body.rotation.x = lerp(this.body.rotation.x, -0.18, this._duckAmt);
    this.body.rotation.z = Math.sin(p) * 0.035 * runW;
    this.body.rotation.y = Math.sin(p) * 0.05 * runW;

    // --- arms ---------------------------------------------------------------
    for (let i = 0; i < 2; i++) {
      const a = this.arms[i];
      const ph = p + (i === 0 ? Math.PI : 0);
      let sh = -0.42 + Math.sin(ph) * 0.32 * runW;
      let el = 1.05 + Math.cos(ph) * 0.14 * runW;
      sh = lerp(sh, -1.15, this._airAmt);
      el = lerp(el, 0.85, this._airAmt);
      sh = lerp(sh, -0.78, this._duckAmt);
      el = lerp(el, 1.4, this._duckAmt);
      a.shoulder.rotation.x = sh;
      a.shoulder.rotation.z = a.side * (0.18 + this._airAmt * 0.2);
      a.elbow.rotation.x = el;
    }

    // --- tail (whip chain) --------------------------------------------------
    for (let i = 0; i < this.tailSegs.length; i++) {
      const t = this.tailSegs[i];
      const off = i * 0.62;
      const amp = 0.1 + i * 0.055;
      let tailYaw = Math.sin(p - off) * amp * (0.4 + runW * 0.9);
      // A tail that sweeps up and back is what makes the runner read as a dino
      // from directly behind - flat out, it just disappears into the camera.
      const runTail = (i === 0 ? -0.34 : -0.13)
        + Math.sin(p * 2 - off) * 0.05 * runW
        - this._airAmt * (0.16 + i * 0.06);
      const tailPitch = lerp(runTail, i === 0 ? 0.26 : 0.02, this._duckAmt);
      // Lane changes make the tail swing wide - reads great from behind.
      tailYaw += (s.laneT ?? 0) * (0.18 + i * 0.1);
      t.rotation.y = damp(t.rotation.y, tailYaw, 13 - i * 1.6, dt);
      t.rotation.x = damp(t.rotation.x, tailPitch, 15 - i * 1.4, dt);
    }

    // --- head / neck --------------------------------------------------------
    this.neck.rotation.x = -0.06 - Math.sin(p * 2 + 0.4) * 0.03 * runW
      + this._airAmt * 0.1 - this._duckAmt * 0.38;
    this.head.position.y = 0.5 - this._duckAmt * 0.28;
    this.head.rotation.x = 0.1 + Math.sin(p * 2) * 0.035 * runW - this._airAmt * 0.12 + this._duckAmt * 0.16;
    this.head.rotation.y = (s.laneT ?? 0) * -0.22;

    // Jaw opens a little at speed and while jumping (effort read).
    const jawOpen = 0.06 + s.speed01 * 0.08 + this._airAmt * 0.22;
    this.jaw.rotation.x = jawOpen;

    // --- blinking -----------------------------------------------------------
    this._blink -= dt;
    if (this._blink <= 0) { this._blink = 2 + Math.random() * 3.5; this._blinkAmt = 1; }
    this._blinkAmt = Math.max(0, this._blinkAmt - dt * 9);
    const eyeScale = 1 - this._blinkAmt * 0.92;
    for (const e of this.eyes) e.scale.y = eyeScale;

    // --- hurt flash ---------------------------------------------------------
    if (this._hurtFlash > 0) {
      this._hurtFlash = Math.max(0, this._hurtFlash - dt * 3.2);
      const k = Math.sin(this._hurtFlash * 30) * 0.5 + 0.5;
      this.materials.skin.color.copy(this._baseColor).lerp(this._hurtColor, k * this._hurtFlash * 0.8);
    } else {
      this.materials.skin.color.copy(this._baseColor);
    }

    if (this.blobShadow) {
      const h = this.root.position.y;
      const k = clamp(1 - h / 4.2, 0.18, 1);
      // The blob lives under the (scaled) root, so undo the scale to keep it
      // pinned to the ground plane while the dino is in the air.
      this.blobShadow.position.y = (0.015 - h) / this.root.scale.y;
      this.blobShadow.scale.setScalar(lerp(0.55, 1, k));
      this.blobShadow.material.opacity = 0.3 * k;
    }
  }

  _animDead(dt) {
    this._deadT += dt;
    const t = Math.min(1, this._deadT / 0.55);
    const e = 1 - Math.pow(1 - t, 3);
    this.body.rotation.x = lerp(this.body.rotation.x, -0.9, e * 0.25);
    this.body.rotation.z = lerp(this.body.rotation.z, 0.5, e * 0.2);
    this.neck.rotation.x = lerp(this.neck.rotation.x, 0.5, e * 0.2);
    this.jaw.rotation.x = lerp(this.jaw.rotation.x, 0.6, e * 0.2);
    for (const leg of this.legs) {
      leg.hip.rotation.x = lerp(leg.hip.rotation.x, -0.7, e * 0.2);
      leg.knee.rotation.x = lerp(leg.knee.rotation.x, 1.6, e * 0.2);
    }
    for (const a of this.arms) {
      a.shoulder.rotation.x = lerp(a.shoulder.rotation.x, -1.6, e * 0.2);
    }
    for (const eye of this.eyes) eye.scale.y = 0.12; // X_X
    for (let i = 0; i < this.tailSegs.length; i++) {
      this.tailSegs[i].rotation.x = lerp(this.tailSegs[i].rotation.x, -0.3, e * 0.15);
    }
    this.materials.skin.color.copy(this._baseColor);
  }
}
