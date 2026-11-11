import * as THREE from 'three';
import { CFG } from './Config.js';

/**
 * Owns the renderer, scene, camera and the main loop. Keeps zero gameplay
 * knowledge so it can be reasoned about (and profiled) on its own.
 */
export class Engine {
  constructor(canvas, { onReady, onError } = {}) {
    this.canvas = canvas;
    this.onReady = onReady;
    this.onError = onError;
    this._rendered = false;

    try {
      this.renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        powerPreference: 'high-performance',
        stencil: false,
      });
    } catch (error) {
      error.code = 'WEBGL_UNAVAILABLE';
      throw error;
    }
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.06;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setClearColor(0x8fd3ff, 1);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(CFG.camera.fov, 1, 0.35, 340);
    this.camera.position.set(...CFG.camera.offset);
    this.camera.lookAt(new THREE.Vector3(...CFG.camera.lookAt));

    this.clock = new THREE.Clock();
    this.elapsed = 0;
    this.frame = 0;
    this.running = false;

    // Rolling FPS estimate used by the adaptive-quality controller.
    this.fps = 60;
    this._fpsAccum = 0;
    this._fpsFrames = 0;

    this._updaters = [];
    this._raf = null;
    this._onResize = this._onResize.bind(this);
    this._tick = this._tick.bind(this);
    this._onContextLost = () => {
      const error = new Error('The WebGL context was lost.');
      error.code = 'WEBGL_CONTEXT_LOST';
      this._fail(error);
    };
    window.addEventListener('resize', this._onResize);
    canvas.addEventListener('webglcontextlost', this._onContextLost);
    this._onResize();
  }

  onUpdate(fn) { this._updaters.push(fn); return fn; }

  _onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, CFG.quality.maxPixelRatio);
    this.renderer.setPixelRatio(dpr * (this.renderScale ?? 1));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** Lets the quality controller trade resolution for frame rate. */
  setRenderScale(scale) {
    if (this.renderScale === scale) return;
    this.renderScale = scale;
    this._onResize();
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.clock.start();
    this._raf = requestAnimationFrame(this._tick);
  }

  stop() {
    this.running = false;
    if (this._raf !== null) cancelAnimationFrame(this._raf);
    this._raf = null;
  }

  dispose() {
    this.stop();
    window.removeEventListener('resize', this._onResize);
    this.canvas.removeEventListener('webglcontextlost', this._onContextLost);
    this.renderer.dispose();
  }

  _fail(error) {
    this.stop();
    if (this.onError) this.onError(error);
    else throw error;
  }

  _tick() {
    if (!this.running) return;
    try {
      this._renderFrame();
    } catch (error) {
      this._fail(error);
    }
  }

  _renderFrame() {
    this._raf = requestAnimationFrame(this._tick);
    // Clamp so an alt-tab or a GC hitch never teleports the world.
    const raw = this.clock.getDelta();
    const dt = Math.min(raw, 1 / 20);
    this.elapsed += dt;
    this.frame++;

    this._fpsAccum += raw;
    this._fpsFrames++;
    if (this._fpsAccum >= 0.5) {
      this.fps = this._fpsFrames / this._fpsAccum;
      this._fpsAccum = 0;
      this._fpsFrames = 0;
    }

    for (let i = 0; i < this._updaters.length; i++) this._updaters[i](dt, this.elapsed);
    this.renderer.render(this.scene, this.camera);
    if (!this._rendered) {
      this._rendered = true;
      this.onReady?.();
    }
  }
}
