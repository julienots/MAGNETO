import * as THREE from 'three';

export interface View {
  scene: THREE.Scene;
  camera: THREE.Camera;
  update(dt: number): void;
  resize?(w: number, h: number): void;
}

/** Owns the WebGL renderer + main loop; renders whichever View is active. */
export class Game {
  renderer: THREE.WebGLRenderer;
  view: View | null = null;
  w = 1; h = 1;
  paused = false;
  fps = 60;
  private last = performance.now();
  private frames = 0; private fpsT = 0;
  private hooks: ((dt: number) => void)[] = [];
  quality: 'low' | 'medium' | 'high' = 'high';

  constructor(public canvas: HTMLCanvasElement, public container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', alpha: false, stencil: false });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(0x000000, 1);
    new ResizeObserver(() => this.resize()).observe(container);
    this.resize();
    this.canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.paused = true; });
    this.canvas.addEventListener('webglcontextrestored', () => { this.paused = false; });
    requestAnimationFrame((t) => this.loop(t));
  }

  setQuality(q: 'low' | 'medium' | 'high') {
    this.quality = q;
    const dpr = window.devicePixelRatio || 1;
    this.renderer.setPixelRatio(Math.min(dpr, q === 'high' ? 2 : q === 'medium' ? 1.5 : 1));
    this.resize();
  }
  qualityScalar() { return this.quality === 'high' ? 1 : this.quality === 'medium' ? 0.75 : 0.5; }

  resize() {
    const r = this.container.getBoundingClientRect();
    this.w = Math.max(1, r.width); this.h = Math.max(1, r.height);
    this.renderer.setSize(this.w, this.h, false);
    this.view?.resize?.(this.w, this.h);
  }

  setView(v: View | null) { this.view = v; if (v) v.resize?.(this.w, this.h); }
  onFrame(fn: (dt: number) => void) { this.hooks.push(fn); return () => { this.hooks = this.hooks.filter((h) => h !== fn); }; }

  private loop(t: number) {
    requestAnimationFrame((tt) => this.loop(tt));
    const dt = Math.min(0.1, (t - this.last) / 1000);
    this.last = t;
    this.frames++; this.fpsT += dt;
    if (this.fpsT >= 0.5) { this.fps = Math.round(this.frames / this.fpsT); this.frames = 0; this.fpsT = 0; }
    if (this.paused) return;
    for (const h of this.hooks) h(dt);
    if (this.view) {
      this.view.update(dt);
      this.renderer.render(this.view.scene, this.view.camera);
    }
  }
}
