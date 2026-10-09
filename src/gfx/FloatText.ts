import type { CameraRig } from './CameraRig';

interface FT { el: HTMLDivElement; x: number; y: number; z: number; t: number; dur: number; active: boolean; vy: number; scale: number }
/** Pooled DOM floating texts (damage numbers, combo callouts, pickups). */
export class FloatText {
  private pool: FT[] = [];
  private o = { x: 0, y: 0, visible: true };
  constructor(private layer: HTMLElement, n = 40) {
    for (let i = 0; i < n; i++) {
      const el = document.createElement('div'); el.className = 'ft'; el.style.display = 'none'; layer.appendChild(el);
      this.pool.push({ el, x: 0, y: 0, z: 0, t: 0, dur: 1, active: false, vy: 0, scale: 1 });
    }
  }
  spawn(x: number, y: number, z: number, text: string, cls = '', dur = 0.9, scale = 1) {
    const f = this.pool.find((p) => !p.active) ?? this.pool.reduce((a, b) => (a.t / a.dur > b.t / b.dur ? a : b));
    f.active = true; f.x = x + (Math.random() - 0.5) * 0.4; f.y = y; f.z = z; f.t = 0; f.dur = dur; f.vy = 2.2; f.scale = scale;
    f.el.className = 'ft ' + cls; f.el.textContent = text; f.el.style.display = 'block';
  }
  update(dt: number, rig: CameraRig, w: number, h: number) {
    for (const f of this.pool) {
      if (!f.active) continue;
      f.t += dt; f.y += f.vy * dt; f.vy *= Math.exp(-3 * dt);
      const k = f.t / f.dur;
      if (k >= 1) { f.active = false; f.el.style.display = 'none'; continue; }
      rig.project(f.x, f.y, f.z, w, h, this.o);
      const pop = k < 0.12 ? 0.5 + (k / 0.12) * 0.9 : k < 0.25 ? 1.4 - ((k - 0.12) / 0.13) * 0.4 : 1;
      f.el.style.transform = `translate(${this.o.x}px, ${this.o.y}px) translate(-50%,-50%) scale(${pop * f.scale})`;
      f.el.style.opacity = String(k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1);
    }
  }
  clear() { for (const f of this.pool) { f.active = false; f.el.style.display = 'none'; } }
  dispose() { for (const f of this.pool) f.el.remove(); }
}
