import * as THREE from 'three';

export type Expression = 'happy' | 'focus' | 'angry' | 'surprised' | 'sad' | 'ko' | 'laugh' | 'smug';
export type EyeStyle = 'big' | 'narrow' | 'visor' | 'cyclops' | 'glow';

export interface FaceStyle {
  eyeColor: number;
  eyes: EyeStyle;
  skin: number;
  brow: number;
  lashes?: boolean;
  blush?: boolean;
  /** hood heroes: dark face, glowing eyes */
  shadowed?: boolean;
}

const W = 512, H = 256;
const css = (c: number, a = 1) => `rgba(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255},${a})`;
const mix = (a: number, b: number, t: number) => {
  const r = ((a >> 16) & 255) * (1 - t) + ((b >> 16) & 255) * t;
  const g = ((a >> 8) & 255) * (1 - t) + ((b >> 8) & 255) * t;
  const bl = (a & 255) * (1 - t) + (b & 255) * t;
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(bl);
};
const INK = '#1a1426';

/**
 * Hand-drawn cartoon face rendered to a canvas and wrapped on the front of the head.
 * Eyes track, blink and squash; brows and mouth change with the expression.
 * Only redrawn when the (quantised) state changes.
 */
export class Face {
  canvas = document.createElement('canvas');
  ctx: CanvasRenderingContext2D;
  texture: THREE.CanvasTexture;
  mesh: THREE.Mesh;
  private key = '';

  constructor(public style: FaceStyle, headR: number) {
    this.canvas.width = W; this.canvas.height = H;
    this.ctx = this.canvas.getContext('2d')!;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 4;
    // front cap of a sphere: 140° wide, from 35° to 125° polar
    const geo = new THREE.SphereGeometry(headR * 1.012, 40, 24, Math.PI / 2 - (70 * Math.PI) / 180, (140 * Math.PI) / 180, (35 * Math.PI) / 180, (90 * Math.PI) / 180);
    const mat = new THREE.MeshBasicMaterial({ map: this.texture, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.renderOrder = 2;
    this.draw('happy', 0, 0, 0, 0);
  }

  set(expr: Expression, blink: number, lookX: number, lookY: number, talk = 0) {
    const q = (v: number, s: number) => Math.round(v * s) / s;
    const key = `${expr}|${q(blink, 4)}|${q(lookX, 8)}|${q(lookY, 8)}|${q(talk, 4)}`;
    if (key === this.key) return;
    this.key = key;
    this.draw(expr, q(blink, 4), q(lookX, 8), q(lookY, 8), q(talk, 4));
    this.texture.needsUpdate = true;
  }

  private draw(expr: Expression, blink: number, lx: number, ly: number, talk: number) {
    const c = this.ctx, st = this.style;
    c.clearRect(0, 0, W, H);
    c.lineCap = 'round'; c.lineJoin = 'round';
    if (st.shadowed) {
      const g = c.createRadialGradient(256, 130, 20, 256, 130, 230);
      g.addColorStop(0, 'rgba(10,6,24,0.92)'); g.addColorStop(0.75, 'rgba(10,6,24,0.8)'); g.addColorStop(1, 'rgba(10,6,24,0)');
      c.fillStyle = g; c.fillRect(0, 0, W, H);
    }
    // blush
    if (st.blush && !st.shadowed) {
      for (const x of [150, 362]) {
        const g = c.createRadialGradient(x, 172, 2, x, 172, 34);
        g.addColorStop(0, 'rgba(255,110,130,0.45)'); g.addColorStop(1, 'rgba(255,110,130,0)');
        c.fillStyle = g; c.beginPath(); c.ellipse(x, 172, 40, 22, 0, 0, Math.PI * 2); c.fill();
      }
    }
    // eyes
    const eyes: [number, number, number, number, number][] = st.eyes === 'cyclops'
      ? [[256, 118, 64, 74, 0]]
      : [[188, 124, st.eyes === 'narrow' ? 38 : 42, st.eyes === 'narrow' ? 44 : 56, -1], [324, 124, st.eyes === 'narrow' ? 38 : 42, st.eyes === 'narrow' ? 44 : 56, 1]];
    for (const [x, y, rx, ry, side] of eyes) this.eye(x, y, rx, ry, side, expr, blink, lx, ly);
    if (!st.shadowed) this.brows(expr, eyes);
    if (!st.shadowed) this.mouth(expr, talk);
    // extras
    if (expr === 'angry' && !st.shadowed) this.vein(420, 52);
    if ((expr === 'sad' || expr === 'ko') && !st.shadowed) this.sweat(400, 84);
  }

  private eye(x: number, y: number, rx: number, ry: number, side: number, expr: Expression, blink: number, lx: number, ly: number) {
    const c = this.ctx, st = this.style;
    const closed = blink > 0.85 || expr === 'laugh';
    if (expr === 'ko') {
      c.strokeStyle = INK; c.lineWidth = 11;
      c.beginPath(); c.moveTo(x - rx * 0.7, y - ry * 0.5); c.lineTo(x + rx * 0.7, y + ry * 0.5); c.moveTo(x + rx * 0.7, y - ry * 0.5); c.lineTo(x - rx * 0.7, y + ry * 0.5); c.stroke();
      return;
    }
    if (closed) {
      c.strokeStyle = INK; c.lineWidth = 11;
      c.beginPath();
      if (expr === 'laugh' || expr === 'happy') c.arc(x, y + ry * 0.25, rx * 0.8, Math.PI * 1.1, Math.PI * 1.9); // ^ ^
      else c.arc(x, y - ry * 0.35, rx * 0.85, Math.PI * 0.15, Math.PI * 0.85); // relaxed closed lid
      c.stroke();
      return;
    }
    const glow = st.eyes === 'glow' || st.eyes === 'visor' || st.shadowed;
    const sq = expr === 'surprised' ? 1.12 : expr === 'focus' || expr === 'smug' ? 0.9 : 1;
    const ery = ry * sq;
    if (glow) {
      c.save();
      c.shadowColor = css(st.eyeColor); c.shadowBlur = 28;
      c.fillStyle = css(mix(st.eyeColor, 0xffffff, 0.55));
      c.beginPath(); c.ellipse(x + lx * rx * 0.2, y + ly * ry * 0.15, rx * 0.72, ery * (expr === 'angry' ? 0.45 : 0.62), side * (expr === 'angry' ? 0.35 : 0), 0, Math.PI * 2); c.fill();
      c.restore();
      c.fillStyle = '#ffffff';
      c.beginPath(); c.ellipse(x - rx * 0.2, y - ery * 0.22, rx * 0.16, ery * 0.14, 0, 0, Math.PI * 2); c.fill();
      this.lid(x, y, rx, ery, side, expr, blink, true);
      return;
    }
    // sclera
    c.fillStyle = '#ffffff'; c.strokeStyle = INK; c.lineWidth = 7;
    c.beginPath(); c.ellipse(x, y, rx, ery, 0, 0, Math.PI * 2); c.fill();
    // iris
    c.save();
    c.beginPath(); c.ellipse(x, y, rx - 1, ery - 1, 0, 0, Math.PI * 2); c.clip();
    const ix = x + lx * rx * 0.34, iy = y + ly * ery * 0.26 + ery * 0.06;
    const ir = rx * 0.66, iry = ery * 0.66;
    const g = c.createRadialGradient(ix, iy + iry * 0.35, 2, ix, iy, iry);
    g.addColorStop(0, css(mix(st.eyeColor, 0xffffff, 0.45)));
    g.addColorStop(0.55, css(st.eyeColor));
    g.addColorStop(1, css(mix(st.eyeColor, 0x000000, 0.55)));
    c.fillStyle = g;
    c.beginPath(); c.ellipse(ix, iy, ir, iry, 0, 0, Math.PI * 2); c.fill();
    // pupil
    const pr = expr === 'surprised' ? 0.32 : expr === 'angry' ? 0.42 : 0.5;
    c.fillStyle = INK;
    c.beginPath(); c.ellipse(ix, iy, ir * pr, iry * pr * 1.05, 0, 0, Math.PI * 2); c.fill();
    // iris ring
    c.strokeStyle = css(mix(st.eyeColor, 0x000000, 0.7), 0.6); c.lineWidth = 3;
    c.beginPath(); c.ellipse(ix, iy, ir, iry, 0, 0, Math.PI * 2); c.stroke();
    // highlights
    c.fillStyle = '#ffffff';
    c.beginPath(); c.ellipse(ix - ir * 0.38, iy - iry * 0.42, ir * 0.3, iry * 0.26, -0.4, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.ellipse(ix + ir * 0.35, iy + iry * 0.38, ir * 0.13, iry * 0.11, 0, 0, Math.PI * 2); c.fill();
    c.restore();
    // outline
    c.strokeStyle = INK; c.lineWidth = 7;
    c.beginPath(); c.ellipse(x, y, rx, ery, 0, 0, Math.PI * 2); c.stroke();
    this.lid(x, y, rx, ery, side, expr, blink, false);
  }

  /** upper eyelid: skin band + thick lash line, angled by expression */
  private lid(x: number, y: number, rx: number, ry: number, side: number, expr: Expression, blink: number, glow: boolean) {
    const c = this.ctx, st = this.style;
    let cover = Math.max(blink, { happy: 0.12, focus: 0.34, angry: 0.36, surprised: 0, sad: 0.26, ko: 0, laugh: 0, smug: 0.42 }[expr]);
    let tilt = { happy: 0, focus: 0.1, angry: 0.38, surprised: 0, sad: -0.32, ko: 0, laugh: 0, smug: -0.08 }[expr] * -side;
    if (st.eyes === 'cyclops') tilt = 0;
    const top = y - ry - 4;
    const lidY = top + (ry * 2 + 8) * cover;
    c.save();
    c.beginPath(); c.ellipse(x, y, rx + 5, ry + 5, 0, 0, Math.PI * 2); c.clip();
    c.translate(x, lidY); c.rotate(tilt);
    if (cover > 0.02) {
      c.fillStyle = glow ? 'rgba(10,6,24,1)' : css(st.skin);
      c.fillRect(-rx - 30, -ry * 3, rx * 2 + 60, ry * 3);
    }
    c.restore();
    if (glow) return;
    // lash line
    c.save();
    c.translate(x, lidY); c.rotate(tilt);
    c.strokeStyle = INK; c.lineWidth = st.lashes ? 12 : 9;
    const w = cover > 0.05 ? rx * 0.98 : rx * 0.92;
    c.beginPath();
    if (cover > 0.05) { c.moveTo(-w, 0); c.lineTo(w, 0); }
    else c.ellipse(0, ry + 4, rx + 1, ry + 2, 0, Math.PI * 1.12, Math.PI * 1.88);
    c.stroke();
    if (st.lashes) { c.lineWidth = 7; c.beginPath(); c.moveTo(w * side, cover > 0.05 ? 0 : ry * 0.5 - ry); c.lineTo(w * side + 16 * side, (cover > 0.05 ? 0 : ry * 0.5 - ry) - 14); c.stroke(); }
    c.restore();
  }

  private brows(expr: Expression, eyes: [number, number, number, number, number][]) {
    const c = this.ctx;
    c.strokeStyle = css(this.style.brow); c.lineWidth = 15;
    const ang: Record<Expression, number> = { happy: -0.12, focus: 0.22, angry: 0.48, surprised: -0.2, sad: -0.45, ko: -0.2, laugh: -0.15, smug: 0.1 };
    const lift: Record<Expression, number> = { happy: 0, focus: 8, angry: 14, surprised: -16, sad: -4, ko: -6, laugh: -4, smug: 4 };
    for (const [x, y, rx, ry, side] of eyes) {
      const by = y - ry - 22 + lift[expr];
      const a = ang[expr] * (side || 1) * -1;
      const w = eyes.length === 1 ? rx * 0.9 : rx * 0.95;
      c.save(); c.translate(x, by); c.rotate(eyes.length === 1 ? 0 : a);
      c.beginPath();
      c.moveTo(-w, 6); c.quadraticCurveTo(0, expr === 'surprised' ? -10 : -4, w, 6);
      c.stroke(); c.restore();
      if (eyes.length === 1 && expr === 'angry') { c.save(); c.translate(x, by); c.beginPath(); c.moveTo(-w, -6); c.lineTo(0, 12); c.lineTo(w, -6); c.stroke(); c.restore(); }
    }
  }

  private mouth(expr: Expression, talk: number) {
    const c = this.ctx;
    const x = 256, y = 202;
    c.strokeStyle = INK; c.lineWidth = 8;
    const openMouth = (w: number, h: number, shape: 'smile' | 'shout' | 'o') => {
      c.beginPath();
      if (shape === 'smile') { c.moveTo(x - w, y - h * 0.25); c.quadraticCurveTo(x, y - h * 0.05, x + w, y - h * 0.25); c.quadraticCurveTo(x + w * 0.6, y + h, x, y + h); c.quadraticCurveTo(x - w * 0.6, y + h, x - w, y - h * 0.25); }
      else if (shape === 'shout') { c.moveTo(x - w, y - h * 0.4); c.lineTo(x + w, y - h * 0.4); c.quadraticCurveTo(x + w * 0.9, y + h, x, y + h); c.quadraticCurveTo(x - w * 0.9, y + h, x - w, y - h * 0.4); }
      else c.ellipse(x, y + h * 0.2, w, h * 0.7, 0, 0, Math.PI * 2);
      c.closePath();
      c.fillStyle = '#5a1426'; c.fill();
      c.save(); c.clip();
      // tongue
      c.fillStyle = '#ff6b81'; c.beginPath(); c.ellipse(x, y + h * 0.95, w * 0.62, h * 0.5, 0, 0, Math.PI * 2); c.fill();
      // teeth
      if (shape !== 'o') { c.fillStyle = '#ffffff'; c.fillRect(x - w, y - h * 0.5, w * 2, h * 0.32); if (shape === 'shout') c.fillRect(x - w, y + h * 0.8, w * 2, h * 0.3); }
      c.restore();
      c.stroke();
    };
    switch (expr) {
      case 'happy': if (talk > 0.1) openMouth(40, 26 + talk * 14, 'smile'); else { c.beginPath(); c.moveTo(x - 36, y - 6); c.quadraticCurveTo(x, y + 26, x + 36, y - 6); c.stroke(); } break;
      case 'laugh': openMouth(46, 40, 'smile'); break;
      case 'focus': c.beginPath(); c.moveTo(x - 24, y + 4); c.quadraticCurveTo(x + 4, y + 10, x + 26, y - 2); c.stroke(); break;
      case 'smug': c.beginPath(); c.moveTo(x - 26, y + 6); c.quadraticCurveTo(x + 10, y + 12, x + 32, y - 10); c.stroke(); break;
      case 'angry': openMouth(38, 24 + talk * 10, 'shout'); break;
      case 'surprised': openMouth(18, 30, 'o'); break;
      case 'sad': c.beginPath(); c.moveTo(x - 28, y + 14); c.quadraticCurveTo(x, y - 8, x + 28, y + 14); c.stroke(); break;
      case 'ko': c.beginPath(); for (let i = 0; i <= 6; i++) { const px = x - 36 + i * 12, py = y + 6 + (i % 2 ? -7 : 7); if (i) c.lineTo(px, py); else c.moveTo(px, py); } c.stroke(); break;
    }
  }
  private vein(x: number, y: number) {
    const c = this.ctx; c.strokeStyle = '#ff2d55'; c.lineWidth = 8;
    for (const [dx, dy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { c.beginPath(); c.moveTo(x + dx * 6, y + dy * 6); c.quadraticCurveTo(x + dx * 18, y + dy * 4, x + dx * 20, y + dy * 18); c.stroke(); }
  }
  private sweat(x: number, y: number) {
    const c = this.ctx; c.fillStyle = '#8fd6ff'; c.strokeStyle = INK; c.lineWidth = 4;
    c.beginPath(); c.moveTo(x, y - 18); c.quadraticCurveTo(x + 14, y + 4, x, y + 10); c.quadraticCurveTo(x - 14, y + 4, x, y - 18); c.fill(); c.stroke();
  }
  dispose() { this.texture.dispose(); this.mesh.geometry.dispose(); (this.mesh.material as THREE.Material).dispose(); }
}
