import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { clamp, lerp, damp } from '../core/MathUtils.js';

/**
 * Procedural cartoon T-rex: the Chrome offline dino re-read as a chunky,
 * rounded 3D character. Everything is built from rounded boxes and spheres so
 * it stays a couple hundred triangles and needs no asset pipeline.
 *
 * Rig (all local groups, animated procedurally):
 *   root -> tilt -> body -> { neck -> head -> jaw, tailSegs[], arms, legs }
 */

// The Chrome dino is flat grey; lifted here toward a sage green-grey so the
// silhouette still reads as "that dinosaur" but survives a bright desert and a
// dark volcanic night without turning into a blob.
const SKIN = 0x668f77;
const SKIN_DARK = 0x426b59;
const SKIN_LIGHT = 0x729a7f;
const SCALE_DARK = 0x5a816b;
const BELLY = 0xf1dfbd;
const EYE_WHITE = 0xf7f7f4;
const EYE_DARK = 0x1d2220;
const TOOTH = 0xfbf8ef;
const CLAW = 0xd8cdb6;

function mat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: opts.roughness ?? 0.78,
    metalness: opts.metalness ?? 0.0,
    ...opts,
  });
}

function box(w, h, d, material, radius = 0.09, seg = 3) {
  const r = Math.min(radius, Math.min(w, h, d) * 0.45);
  const g = new RoundedBoxGeometry(w, h, d, seg, r);
  const m = new THREE.Mesh(g, material);
  m.castShadow = true;
  return m;
}

function sphere(r, material, wseg = 14, hseg = 10) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, wseg, hseg), material);
  m.castShadow = true;
  return m;
}

function makeSkinTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(128, 128);
  for (let y = 0; y < 128; y++) {
    for (let x = 0; x < 128; x++) {
      const u = x / 128, v = y / 128;
      const broad = Math.sin(u * Math.PI * 6) * Math.sin(v * Math.PI * 4) * 9;
      const grain = Math.sin(u * Math.PI * 36 + Math.sin(v * Math.PI * 8))
        * Math.cos(v * Math.PI * 32) * 4;
      const speckle = Math.sin(x * 47.17 + y * 91.31) * 3;
      const value = Math.round(clamp(237 + broad + grain + speckle, 211, 255));
      const i = (y * 128 + x) * 4;
      image.data[i] = value;
      image.data[i + 1] = value;
      image.data[i + 2] = value;
      image.data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2, 2);
  texture.anisotropy = 2;
  return texture;
}

export class DinoModel {
  constructor() {
    this.root = new THREE.Group();
    this.root.name = 'dino';
    // Built at a comfortable "1 unit ≈ 1 metre" scale, then trimmed so the
    // silhouette matches the gameplay collider.
    this.root.scale.setScalar(0.78);

    const hide = makeSkinTexture();
    this.materials = {
      skin: mat(SKIN, { roughness: 0.82, map: hide, bumpMap: hide, bumpScale: 0.018 }),
      skinDark: mat(SKIN_DARK, { roughness: 0.88, map: hide, bumpMap: hide, bumpScale: 0.012 }),
      skinLight: mat(SKIN_LIGHT, { roughness: 0.82 }),
      scaleDark: mat(SCALE_DARK, { roughness: 0.9 }),
      belly: mat(BELLY, { roughness: 0.86 }),
      eyeWhite: mat(EYE_WHITE, { roughness: 0.35 }),
      eyeDark: mat(EYE_DARK, { roughness: 0.28 }),
      tooth: mat(TOOTH, { roughness: 0.4 }),
      claw: mat(CLAW, { roughness: 0.5 }),
    };

    this.tilt = new THREE.Group();
    this.root.add(this.tilt);

    this.body = new THREE.Group();
    this.body.position.y = 1.06;
    this.tilt.add(this.body);

    this._buildTorso();
    this._buildHead();
    this._buildTail();
    this._buildArms();
    this._buildLegs();
    this._buildBlobShadow();

    // Animation state
    this.phase = 0;
    this.state = 'run';
    this._blink = 2.5;
    this._blinkAmt = 0;
    this._duckAmt = 0;
    this._airAmt = 0;
    this._wasGrounded = true;
    this._landPulse = 0;
    this._deadT = 0;
    this._hurtFlash = 0;
    this._baseColor = new THREE.Color(SKIN);
  }

  _buildTorso() {
    // A single tapered capsule-ish trunk reads far cleaner than a box plus
    // bulging spheres: the silhouette stays a dinosaur from every angle.
    const torso = box(0.86, 0.9, 1.3, this.materials.skin, 0.4, 5);
    torso.position.set(0, 0.04, 0.0);
    this.body.add(torso);
    this.torso = torso;

    const chest = sphere(0.42, this.materials.skin, 16, 12);
    chest.position.set(0, 0.12, -0.5);
    chest.scale.set(1.0, 1.02, 0.86);
    this.body.add(chest);

    const hips = sphere(0.44, this.materials.skin, 16, 12);
    hips.position.set(0, -0.02, 0.46);
    hips.scale.set(1.02, 1.0, 0.94);
    this.body.add(hips);

    // Cream underside, pushed forward and down so it actually shows.
    const belly = box(0.62, 0.5, 1.06, this.materials.belly, 0.24, 4);
    belly.position.set(0, -0.3, -0.12);
    belly.castShadow = false;
    this.body.add(belly);

    const chestPatch = sphere(0.3, this.materials.belly, 14, 10);
    chestPatch.position.set(0, -0.12, -0.62);
    chestPatch.scale.set(0.92, 1.05, 0.62);
    chestPatch.castShadow = false;
    this.body.add(chestPatch);

    // Low-profile flank scales add texture without looking like beads.
    const scaleGeo = new THREE.SphereGeometry(1, 8, 6);
    for (const side of [-1, 1]) {
      for (let row = 0; row < 2; row++) {
        for (let i = 0; i < 5; i++) {
          const scale = new THREE.Mesh(scaleGeo,
            (row + i) % 3 === 0 ? this.materials.skinLight : this.materials.scaleDark);
          scale.position.set(side * (0.426 + row * 0.004),
            0.24 - row * 0.14, -0.41 + i * 0.22 + (row % 2) * 0.1);
          scale.scale.set(0.009, 0.022, 0.038);
          scale.rotation.x = -0.25;
          scale.castShadow = false;
          this.body.add(scale);
        }
      }
    }

    // Spine scutes: a strong, cheap silhouette cue from behind and the side.
    const scuteGeo = new THREE.ConeGeometry(1, 1, 4);
    for (let i = 0; i < 6; i++) {
      const t = i / 5;
      const s = 0.13 - Math.abs(t - 0.35) * 0.09;
      const scute = new THREE.Mesh(scuteGeo, this.materials.skinDark);
      scute.castShadow = true;
      scute.position.set(0, 0.44 - t * 0.06, -0.5 + i * 0.2);
      scute.scale.set(s * 1.1, s * 1.7, s * 1.8);
      scute.rotation.x = -0.12;
      scute.rotation.y = Math.PI / 4;
      this.body.add(scute);
    }
  }

  _buildHead() {
    this.neck = new THREE.Group();
    this.neck.position.set(0, 0.4, -0.56);
    this.body.add(this.neck);

    const neckMesh = box(0.46, 0.6, 0.46, this.materials.skin, 0.2, 3);
    neckMesh.position.set(0, 0.22, -0.09);
    neckMesh.rotation.x = 0.24;
    this.neck.add(neckMesh);

    // Shoulder blend: without it the neck reads as a separate block bolted on.
    const shoulder = sphere(0.36, this.materials.skin, 16, 12);
    shoulder.position.set(0, -0.02, 0.06);
    shoulder.scale.set(1.05, 0.95, 1.0);
    this.neck.add(shoulder);

    this.head = new THREE.Group();
    this.head.position.set(0, 0.5, -0.3);
    // Slightly oversized head: the cartoon read the whole character hangs on.
    this.head.scale.setScalar(1.12);
    this.neck.add(this.head);

    const skull = box(0.62, 0.56, 0.78, this.materials.skin, 0.22, 4);
    skull.position.set(0, 0.06, -0.16);
    this.head.add(skull);

    const snout = box(0.5, 0.3, 0.46, this.materials.skin, 0.13, 3);
    snout.position.set(0, -0.02, -0.66);
    this.head.add(snout);

    for (const side of [-1, 1]) {
      const mouthSeam = box(0.015, 0.018, 0.35, this.materials.skinDark, 0.005, 2);
      mouthSeam.position.set(side * 0.253, -0.153, -0.61);
      mouthSeam.castShadow = false;
      this.head.add(mouthSeam);
    }

    const nostrilGeo = new THREE.SphereGeometry(0.035, 8, 6);
    for (const sx of [-1, 1]) {
      const n = new THREE.Mesh(nostrilGeo, this.materials.eyeDark);
      n.position.set(sx * 0.13, 0.06, -0.87);
      this.head.add(n);
    }

    // A darker crest along the top of the skull instead of a brow ridge: it
    // shapes the head without reading as a horn from the side.
    const crest = box(0.3, 0.1, 0.62, this.materials.skinDark, 0.045, 2);
    crest.position.set(0, 0.3, -0.2);
    crest.rotation.x = -0.06;
    this.head.add(crest);

    this.eyes = [];
    for (const sx of [-1, 1]) {
      const eye = new THREE.Group();
      eye.position.set(sx * 0.26, 0.13, -0.38);
      // Angled outward so the pupil is visible from behind AND from the side.
      eye.rotation.y = sx * 0.62;
      const socket = sphere(0.105, this.materials.skinDark, 12, 10);
      socket.castShadow = false;
      eye.add(socket);
      const white = sphere(0.076, this.materials.eyeWhite, 12, 10);
      white.position.set(sx * 0.027, 0, -0.025);
      white.castShadow = false;
      eye.add(white);
      const pupil = sphere(0.044, this.materials.eyeDark, 10, 8);
      pupil.position.set(sx * 0.072, 0.004, -0.042);
      pupil.castShadow = false;
      eye.add(pupil);
      const glint = sphere(0.014, this.materials.eyeWhite, 8, 6);
      glint.position.set(sx * 0.092, 0.025, -0.053);
      glint.castShadow = false;
      eye.add(glint);
      this.head.add(eye);
      this.eyes.push(eye);
    }

    this.jaw = new THREE.Group();
    this.jaw.position.set(0, -0.14, -0.2);
    this.head.add(this.jaw);
    const jawMesh = box(0.5, 0.2, 0.72, this.materials.skin, 0.08, 3);
    jawMesh.position.set(0, -0.03, -0.28);
    this.jaw.add(jawMesh);

    // Two small teeth peeking out - pure cartoon charm, ~20 tris.
    const toothGeo = new THREE.ConeGeometry(0.045, 0.13, 5);
    for (const sx of [-1, 1]) {
      const t = new THREE.Mesh(toothGeo, this.materials.tooth);
      t.position.set(sx * 0.16, -0.06, -0.58);
      t.rotation.x = Math.PI;
      this.head.add(t);
    }
  }

  _buildTail() {
    this.tailSegs = [];
    let parent = this.body;
    const segs = [
      { w: 0.56, h: 0.56, d: 0.6, z: 0.72 },
      { w: 0.44, h: 0.44, d: 0.56, z: 0.5 },
      { w: 0.32, h: 0.32, d: 0.52, z: 0.46 },
      { w: 0.2, h: 0.2, d: 0.46, z: 0.42 },
    ];
    for (let i = 0; i < segs.length; i++) {
      const s = segs[i];
      const g = new THREE.Group();
      g.position.set(0, i === 0 ? 0.06 : 0, s.z);
      const mesh = sphere(1, i > 2 ? this.materials.skinDark : this.materials.skin, 16, 12);
      mesh.scale.set(s.w * 0.56, s.h * 0.54, s.d * 0.75);
      mesh.position.z = s.d * 0.35;
      g.add(mesh);
      parent.add(g);
      parent = g;
      this.tailSegs.push(g);
    }
  }

  _buildArms() {
    this.arms = [];
    for (const sx of [-1, 1]) {
      const shoulder = new THREE.Group();
      shoulder.position.set(sx * 0.5, 0.18, -0.32);
      this.body.add(shoulder);

      const upper = box(0.18, 0.34, 0.18, this.materials.skin, 0.07, 2);
      upper.position.y = -0.16;
      shoulder.add(upper);

      const elbow = new THREE.Group();
      elbow.position.y = -0.32;
      shoulder.add(elbow);

      const fore = box(0.15, 0.26, 0.15, this.materials.skin, 0.06, 2);
      fore.position.y = -0.12;
      elbow.add(fore);

      const clawGeo = new THREE.ConeGeometry(0.035, 0.12, 5);
      for (let c = -1; c <= 1; c += 2) {
        const cl = new THREE.Mesh(clawGeo, this.materials.claw);
        cl.position.set(c * 0.05, -0.3, -0.03);
        cl.rotation.x = -2.4;
        elbow.add(cl);
      }
      this.arms.push({ shoulder, elbow, side: sx });
    }
  }

  /**
   * Leg lengths are set so the sole lands on local y = 0 with the body at its
   * rest height - no floating, no feet through the floor.
   * body 0.94 -> hip 0.70 -> knee 0.34 -> ankle 0.07 -> sole ~0.
   */
  _buildLegs() {
    this.legs = [];
    for (const sx of [-1, 1]) {
      const hip = new THREE.Group();
      hip.position.set(sx * 0.34, -0.2, 0.13);
      this.body.add(hip);

      const thigh = box(0.42, 0.58, 0.5, this.materials.skin, 0.19, 3);
      thigh.position.y = -0.2;
      hip.add(thigh);

      const knee = new THREE.Group();
      knee.position.y = -0.42;
      hip.add(knee);

      const shin = box(0.25, 0.42, 0.28, this.materials.skin, 0.1, 3);
      shin.position.y = -0.18;
      knee.add(shin);

      const ankle = new THREE.Group();
      ankle.position.y = -0.34;
      knee.add(ankle);

      const foot = box(0.32, 0.15, 0.58, this.materials.skinDark, 0.07, 2);
      foot.position.set(0, -0.035, -0.14);
      ankle.add(foot);

      const toeGeo = new THREE.ConeGeometry(0.04, 0.1, 5);
      for (let t = -1; t <= 1; t++) {
        const toe = new THREE.Mesh(toeGeo, this.materials.claw);
        toe.position.set(t * 0.09, -0.06, -0.4);
        toe.rotation.x = -1.9;
        ankle.add(toe);
      }
      this.legs.push({ hip, knee, ankle, side: sx });
    }
  }

  /** Soft contact shadow so the dino never looks like it floats. */
  _buildBlobShadow() {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const ctx = c.getContext('2d');
    const grd = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
    grd.addColorStop(0, 'rgba(0,0,0,0.55)');
    grd.addColorStop(0.55, 'rgba(0,0,0,0.22)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, 128, 128);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1.55, 1.15),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.85 }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = 0.015;
    mesh.renderOrder = 2;
    this.blobShadow = mesh;
    this.root.add(mesh);
  }

  setShadowCasting(on) {
    this.root.traverse((o) => { if (o.isMesh) o.castShadow = on && o !== this.blobShadow; });
    if (this.blobShadow) this.blobShadow.castShadow = false;
  }

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
      this.materials.skin.color.copy(this._baseColor).lerp(new THREE.Color(0xff5a4a), k * this._hurtFlash * 0.8);
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
      this.blobShadow.material.opacity = 0.85 * k;
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
