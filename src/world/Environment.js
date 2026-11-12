import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CFG } from '../core/Config.js';
import { clamp, lerp, smoothstep } from '../core/MathUtils.js';
import { BIOMES } from './Biomes.js';

const PALETTE_B = new THREE.Color();
const NIGHT_TOP = new THREE.Color(0x101b34);
const NIGHT_HORIZON = new THREE.Color(0x35435e);
const DUSK = new THREE.Color(0xff8a4a);
const SUNSET = new THREE.Color(0xff9a55);
const MOON = new THREE.Color(0x9db8ff);
const NIGHT_FILL = new THREE.Color(0x8198c4);
const WHITE = new THREE.Color(0xffffff);

const SKY_VERT = /* glsl */`
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
}
`;

const SKY_FRAG = /* glsl */`
precision highp float;
varying vec3 vDir;
uniform vec3 uTop;
uniform vec3 uHorizon;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uMoonColor;
uniform float uNight;

float hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}

float starField(vec3 d) {
  return step(0.998, hash13(floor(d * 100.0))) * 0.8;
}

void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  float t = floor(smoothstep(-0.18, 0.62, h) * 6.0) / 6.0;
  vec3 col = mix(uHorizon, uTop, t);

  float sd = max(dot(d, uSunDir), 0.0);
  float day = 1.0 - uNight;
  // Warm halo + hard-ish disc for the sun.
  col += uSunColor * pow(sd, 6.0) * 0.30 * day;
  col += uSunColor * smoothstep(0.9985, 0.99925, sd) * 2.2 * day;

  // Moon sits opposite the sun.
  float md = max(dot(d, -uSunDir), 0.0);
  col += uMoonColor * smoothstep(0.9988, 0.99945, md) * 2.0 * uNight;
  col += uMoonColor * pow(md, 24.0) * 0.16 * uNight;

  if (uNight > 0.02) {
    float s = starField(d) * uNight * smoothstep(-0.02, 0.30, h);
    col += vec3(s) * 1.15;
  }

  gl_FragColor = vec4(col, 1.0);
}
`;

/**
 * Sky, lighting, fog and the day/night cycle. Also owns the biome colour blend
 * that every other system samples from.
 */
export class Environment {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;

    this.fog = new THREE.Fog(0xe8d3ac, CFG.world.fogNear, CFG.world.fogFar);
    scene.fog = this.fog;

    this.skyUniforms = {
      uTop: { value: new THREE.Color(0x7ec6f5) },
      uHorizon: { value: new THREE.Color(0xf7dfae) },
      uSunDir: { value: new THREE.Vector3(0.3, 0.7, -0.6).normalize() },
      uSunColor: { value: new THREE.Color(0xfff0cf) },
      uMoonColor: { value: new THREE.Color(0xd8e6ff) },
      uNight: { value: 0 },
    };
    this.sky = new THREE.Mesh(
      new THREE.SphereGeometry(300, 12, 8),
      new THREE.ShaderMaterial({
        vertexShader: SKY_VERT,
        fragmentShader: SKY_FRAG,
        uniforms: this.skyUniforms,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
      }),
    );
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -1000;
    scene.add(this.sky);

    // One key light plus hemisphere fill: clear block faces without shadows.
    this.hemi = new THREE.HemisphereLight(0xbcd8f0, 0x8a6a44, 0.85);
    scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff2d0, 1.6);
    this.sun.castShadow = false;
    this.sun.target.position.set(0, 0, -16);
    scene.add(this.sun, this.sun.target);

    this._clouds = this._buildClouds();
    scene.add(this._clouds);

    this.dayT = 0.40;            // 0 = midnight, 0.25 = sunrise, 0.5 = noon
    this.cycleSeconds = 190;
    this.night = 0;

    this.biomeIndex = 0;
    this.nextBiomeIndex = 1;
    this.blend = 0;
    this.current = this._mixPalette(BIOMES[0], BIOMES[1], 0);

    this._tmpA = new THREE.Color();
    this._tmpB = new THREE.Color();
    this._fogTint = new THREE.Color();
  }

  _buildClouds() {
    const g = new THREE.Group();
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false });
    this.cloudMat = mat;
    for (let i = 0; i < 6; i++) {
      const cloud = new THREE.Group();
      const puffs = 3 + ((i * 7) % 3);
      const parts = [];
      for (let p = 0; p < puffs; p++) {
        const g2 = geo.clone();
        const s = 5 + ((i + p) % 3) * 2.2;
        g2.scale(s * 1.8, s * 0.65, s * 0.9);
        g2.translate((p - puffs / 2) * 6 + Math.sin(i + p) * 2, Math.cos(i * 2 + p) * 1.8, Math.sin(i * 3 + p) * 3);
        parts.push(g2);
      }
      // Six merged block clouds, with opaque unlit faces.
      const merged = mergeGeometries(parts, false);
      cloud.add(new THREE.Mesh(merged, mat));
      const a = (i / 6) * Math.PI * 2;
      const r = 150 + (i % 3) * 30;
      cloud.position.set(Math.cos(a) * r, 55 + (i % 4) * 12, Math.sin(a) * r);
      cloud.userData.speed = 0.6 + (i % 5) * 0.25;
      g.add(cloud);
    }
    return g;
  }

  _mixPalette(a, b, t) {
    const out = this.current ?? {};
    const keys = ['ground', 'groundB', 'track', 'trackEdge', 'rock', 'rockDark', 'sky', 'skyHorizon', 'fog', 'sun', 'ambient'];
    for (const k of keys) {
      (out[k] ??= new THREE.Color()).set(a[k]).lerp(PALETTE_B.set(b[k]), t);
    }
    out.sunIntensity = lerp(a.sunIntensity, b.sunIntensity, t);
    out.ambientIntensity = lerp(a.ambientIntensity, b.ambientIntensity, t);
    out.name = t < 0.5 ? a.name : b.name;
    out.id = t < 0.5 ? a.id : b.id;
    return out;
  }

  /** Biome pair + blend factor, driven by distance travelled. */
  setBiome(indexA, indexB, t) {
    this.biomeIndex = indexA;
    this.nextBiomeIndex = indexB;
    this.blend = t;
    this.current = this._mixPalette(BIOMES[indexA], BIOMES[indexB], smoothstep(clamp(t, 0, 1)));
  }

  update(dt, paused = false) {
    if (!paused) this.dayT = (this.dayT + dt / this.cycleSeconds) % 1;

    // Sun elevation: a full arc, with dusk/dawn near the horizon.
    const ang = this.dayT * Math.PI * 2 - Math.PI / 2;
    const elev = Math.sin(ang);
    const sunDir = this.skyUniforms.uSunDir.value;
    sunDir.set(Math.cos(ang) * 0.55, elev, -0.45).normalize();

    // Night factor: 1 deep night, 0 full day, smooth through the terminator.
    const night = 1 - clamp((elev + 0.18) / 0.42, 0, 1);
    this.night = night;
    const dusk = Math.pow(1 - Math.abs(clamp(elev / 0.28, -1, 1)), 2);
    this.skyUniforms.uNight.value = night;

    const p = this.current;

    // --- sky ----------------------------------------------------------------
    const top = this._tmpA.copy(p.sky);
    const hor = this._tmpB.copy(p.skyHorizon);

    top.lerp(NIGHT_TOP, night * 0.92);
    hor.lerp(NIGHT_HORIZON, night * 0.86);
    // Warm the horizon at sunrise/sunset.
    hor.lerp(DUSK, dusk * 0.45 * (1 - night * 0.5));
    this.skyUniforms.uTop.value.copy(top);
    this.skyUniforms.uHorizon.value.copy(hor);
    this.skyUniforms.uSunColor.value.copy(p.sun).lerp(SUNSET, dusk * 0.6);

    // --- fog ----------------------------------------------------------------
    // Matching the fog to the sky's horizon band is what makes the far edge of
    // the ground disappear instead of drawing a hard line across the horizon.
    this._fogTint.copy(hor).lerp(p.fog, 0.22);
    this.fog.color.copy(this._fogTint);

    // --- lights -------------------------------------------------------------
    const dayIntensity = p.sunIntensity * 0.65 * (1 - night);
    this.sun.intensity = dayIntensity + night * 0.78;
    this.sun.color.copy(p.sun)
      .lerp(SUNSET, dusk * 0.55)
      .lerp(MOON, night * 0.95);
    // Keep the key light in front-left so the dino's face catches light.
    const lx = sunDir.x * 60, ly = Math.max(18, Math.abs(elev) * 70 + 14), lz = sunDir.z * 60 - 16;
    this.sun.position.set(lx, ly, lz);

    this.hemi.intensity = lerp(p.ambientIntensity + 0.18, 0.8, night);
    this.hemi.color.copy(p.sky).lerp(NIGHT_FILL, night * 0.9);
    this.hemi.groundColor.copy(p.ground).multiplyScalar(lerp(1, 0.55, night));

    // --- sky dome + clouds follow the camera --------------------------------
    this.sky.position.copy(this.camera.position);
    this._clouds.position.copy(this.camera.position).setY(0);
    this.cloudMat.color.copy(p.sky).lerp(WHITE, 0.75).multiplyScalar(lerp(1, 0.28, night));
    if (!paused) {
      for (const c of this._clouds.children) {
        c.position.x += dt * c.userData.speed * 0.4;
        if (c.position.x > 230) c.position.x = -230;
      }
    }
  }

  /** Ambient tint used by particle/coin materials so nothing looks pasted-on. */
  get skyTint() { return this.skyUniforms.uHorizon.value; }
}
