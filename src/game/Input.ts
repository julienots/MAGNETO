/**
 * One-thumb portrait controls:
 *  - touch & drag anywhere  → floating joystick (move + aim)
 *  - quick tap              → flip polarity 🔴/🔵
 *  - quick flick            → dash in flick direction
 *  - ability button (DOM)   → hero ability
 * Keyboard fallback for desktop: WASD/arrows, Space = flip, Shift = dash, E = ability.
 */
export type InputEvent = { type: 'flip' } | { type: 'dash'; x: number; z: number } | { type: 'ability' } | { type: 'pause' };

export class Input {
  moveX = 0;
  moveZ = 0;
  active = false;
  events: InputEvent[] = [];
  enabled = true;
  private pid: number | null = null;
  private sx = 0; private sy = 0; private cx = 0; private cy = 0; private t0 = 0;
  private maxR = 62;
  private keys = new Set<string>();
  private base: HTMLDivElement; private knob: HTMLDivElement;
  private off: (() => void)[] = [];

  constructor(private el: HTMLElement, overlay: HTMLElement) {
    this.base = document.createElement('div'); this.base.className = 'joy-base';
    this.knob = document.createElement('div'); this.knob.className = 'joy-knob';
    this.base.appendChild(this.knob); overlay.appendChild(this.base);
    const on = <K extends keyof HTMLElementEventMap>(t: HTMLElement | Window, ev: K, fn: (e: any) => void, opt?: AddEventListenerOptions) => {
      t.addEventListener(ev, fn as any, opt); this.off.push(() => t.removeEventListener(ev, fn as any));
    };
    on(el, 'pointerdown', (e: PointerEvent) => this.down(e), { passive: false });
    on(window, 'pointermove', (e: PointerEvent) => this.move(e), { passive: false });
    on(window, 'pointerup', (e: PointerEvent) => this.up(e));
    on(window, 'pointercancel', (e: PointerEvent) => this.up(e, true));
    on(window, 'keydown', (e: KeyboardEvent) => this.key(e, true));
    on(window, 'keyup', (e: KeyboardEvent) => this.key(e, false));
    on(window, 'blur', () => { this.keys.clear(); this.release(); });
  }

  private down(e: PointerEvent) {
    if (!this.enabled || this.pid !== null) return;
    e.preventDefault();
    this.pid = e.pointerId;
    this.sx = this.cx = this.origX = e.clientX; this.sy = this.cy = this.origY = e.clientY; this.t0 = performance.now();
    this.base.style.transform = `translate(${this.sx}px, ${this.sy}px)`;
    this.base.classList.add('on');
    this.knob.style.transform = 'translate(0px,0px)';
  }
  private move(e: PointerEvent) {
    if (e.pointerId !== this.pid) return;
    e.preventDefault();
    this.cx = e.clientX; this.cy = e.clientY;
    let dx = this.cx - this.sx, dy = this.cy - this.sy;
    const d = Math.hypot(dx, dy);
    // drag the base along when exceeding the radius (floating stick feel)
    if (d > this.maxR) {
      const k = (d - this.maxR) / d;
      this.sx += dx * k; this.sy += dy * k; dx = this.cx - this.sx; dy = this.cy - this.sy;
      this.base.style.transform = `translate(${this.sx}px, ${this.sy}px)`;
    }
    const m = Math.min(1, Math.hypot(dx, dy) / this.maxR);
    const dead = 0.12;
    if (m < dead) { this.moveX = 0; this.moveZ = 0; this.active = false; }
    else {
      const a = Math.atan2(dy, dx); const mm = (m - dead) / (1 - dead);
      this.moveX = Math.cos(a) * mm; this.moveZ = Math.sin(a) * mm; this.active = true;
    }
    this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
  }
  private up(e: PointerEvent, cancel = false) {
    if (e.pointerId !== this.pid) return;
    const dt = performance.now() - this.t0;
    const dx = e.clientX - this.origX, dy = e.clientY - this.origY;
    const travel = Math.hypot(dx, dy);
    if (!cancel && this.enabled) {
      if (dt < 230 && travel < 14) this.events.push({ type: 'flip' });
      else if (dt < 200 && travel > 45) this.events.push({ type: 'dash', x: dx / travel, z: dy / travel });
    }
    this.release();
  }
  private origX = 0; private origY = 0;
  private release() {
    this.pid = null; this.moveX = 0; this.moveZ = 0; this.active = false;
    this.base.classList.remove('on');
  }
  private key(e: KeyboardEvent, down: boolean) {
    const k = e.key.toLowerCase();
    if (down && !e.repeat) {
      if (k === ' ') { this.events.push({ type: 'flip' }); e.preventDefault(); }
      if (k === 'e') this.events.push({ type: 'ability' });
      if (k === 'escape' || k === 'p') this.events.push({ type: 'pause' });
      if (k === 'shift') { const l = Math.hypot(this.kx(), this.kz()) || 1; this.events.push({ type: 'dash', x: this.kx() / l || 0, z: this.kz() / l || -1 }); }
    }
    if (down) this.keys.add(k); else this.keys.delete(k);
    if (this.pid === null) {
      const x = this.kx(), z = this.kz(); const l = Math.hypot(x, z);
      this.moveX = l ? x / l : 0; this.moveZ = l ? z / l : 0; this.active = l > 0;
    }
  }
  private kx() { return (this.keys.has('d') || this.keys.has('arrowright') ? 1 : 0) - (this.keys.has('a') || this.keys.has('q') || this.keys.has('arrowleft') ? 1 : 0); }
  private kz() { return (this.keys.has('s') || this.keys.has('arrowdown') ? 1 : 0) - (this.keys.has('w') || this.keys.has('z') || this.keys.has('arrowup') ? 1 : 0); }

  poll(): InputEvent[] { const e = this.events; this.events = []; return e; }
  push(ev: InputEvent) { this.events.push(ev); }
  dispose() { this.off.forEach((f) => f()); this.base.remove(); }
}
