import { h } from '../dom';
import { audio } from '../../audio/Audio';

/**
 * SUPERESSENCE studio intro, portrait.
 * A lone particle appears, wanders, starts attracting others; together they
 * assemble the "SuperEssence." logo (exact studio card: black, white "Super",
 * yellow "Essence.", dark offset shadow). The formed card stays as the loading
 * screen until loading completes, then a magnetic pulse crosses it.
 */
export async function runIntro(root: HTMLElement, loaded: Promise<unknown>, onProgress: (cb: (p: number) => void) => void): Promise<void> {
  const wrap = h('div.studio');
  const canvas = h('canvas') as HTMLCanvasElement;
  const logo = h('div.se-logo', { style: { opacity: '0' } }, h('span.s', 'Super'), h('span.e', 'Essence.'));
  const bar = h('i');
  const loadbar = h('div.loadbar', { style: { opacity: '0' } }, bar);
  wrap.append(canvas, logo, loadbar);
  root.appendChild(wrap);
  onProgress((p) => { bar.style.width = `${Math.round(p * 100)}%`; });

  try { await document.fonts.load("400 46px 'Lilita One'"); } catch { /* fallback font */ }
  await new Promise((r) => requestAnimationFrame(r));

  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = wrap.clientWidth, H = wrap.clientHeight;
  canvas.width = W * dpr; canvas.height = H * dpr;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);

  // sample target points from the logo text, laid out exactly like the DOM logo
  const lr = logo.getBoundingClientRect(), wr = wrap.getBoundingClientRect();
  const fontPx = parseFloat(getComputedStyle(logo).fontSize);
  const off = document.createElement('canvas'); off.width = Math.ceil(lr.width) + 8; off.height = Math.ceil(lr.height) + 8;
  const ox = off.getContext('2d')!;
  ox.font = `400 ${fontPx}px 'Lilita One', sans-serif`;
  ox.textBaseline = 'middle';
  (ox as any).letterSpacing = getComputedStyle(logo).letterSpacing;
  const superW = (logo.children[0] as HTMLElement).getBoundingClientRect().width;
  ox.fillStyle = '#fff'; ox.fillText('Super', 0, off.height / 2);
  ox.fillStyle = '#ff0'; ox.fillText('Essence.', superW, off.height / 2);
  const img = ox.getImageData(0, 0, off.width, off.height).data;
  const targets: { x: number; y: number; yellow: boolean }[] = [];
  const step = Math.max(2, Math.round(fontPx / 16));
  for (let y = 0; y < off.height; y += step) for (let x = 0; x < off.width; x += step) {
    const i = (y * off.width + x) * 4;
    if (img[i + 3] > 128) targets.push({ x: lr.left - wr.left + x, y: lr.top - wr.top + y - off.height / 2 + lr.height / 2, yellow: img[i + 2] < 100 });
  }
  // shuffle
  for (let i = targets.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [targets[i], targets[j]] = [targets[j], targets[i]]; }

  interface P { x: number; y: number; vx: number; vy: number; tx: number; ty: number; yellow: boolean; on: number; size: number }
  const ps: P[] = targets.map((t) => {
    const a = Math.random() * Math.PI * 2, r = Math.max(W, H) * (0.35 + Math.random() * 0.5);
    return { x: W / 2 + Math.cos(a) * r, y: H / 2 + Math.sin(a) * r, vx: 0, vy: 0, tx: t.x, ty: t.y, yellow: t.yellow, on: 0.9 + Math.random() * 1.1, size: 1 + Math.random() * 1.2 };
  });
  // the lone leader particle
  const lead = { x: W * 0.2, y: H * 0.72, vx: 60, vy: -40 };
  let t = 0, last = performance.now();
  let isLoaded = false; loaded.then(() => (isLoaded = true));
  let settledAt = -1, pulseT = -1, done = false, skip = false;

  await new Promise<void>((resolve) => {
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt;
      ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.fillRect(0, 0, W, H);
      // leader wanders toward the centre, leaving a trail
      if (t > 0.25) {
        const cx = W / 2 + Math.sin(t * 2.3) * 40 * Math.max(0, 1.6 - t), cy = H / 2 + Math.cos(t * 1.7) * 60 * Math.max(0, 1.6 - t);
        lead.vx += (cx - lead.x) * 3 * dt; lead.vy += (cy - lead.y) * 3 * dt; lead.vx *= 0.97; lead.vy *= 0.97;
        lead.x += lead.vx * dt; lead.y += lead.vy * dt;
        if (t < 2.4) {
          const g = ctx.createRadialGradient(lead.x, lead.y, 0, lead.x, lead.y, 14);
          g.addColorStop(0, 'rgba(255,240,180,1)'); g.addColorStop(1, 'rgba(255,205,33,0)');
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(lead.x, lead.y, 14, 0, 7); ctx.fill();
        }
      }
      // particles get attracted (spring + magnetic pull toward the leader first, then their slot)
      let settled = 0;
      for (const p of ps) {
        if (t < p.on) continue;
        const k = Math.min(1, (t - p.on) / 1.2);
        const gx = t < 1.8 ? lead.x + (p.tx - W / 2) * k * 0.6 : p.tx;
        const gy = t < 1.8 ? lead.y + (p.ty - H / 2) * k * 0.6 : p.ty;
        const dx = gx - p.x, dy = gy - p.y;
        p.vx += dx * (8 + k * 30) * dt; p.vy += dy * (8 + k * 30) * dt;
        p.vx *= Math.pow(0.02, dt); p.vy *= Math.pow(0.02, dt);
        p.x += p.vx * dt; p.y += p.vy * dt;
        if (Math.abs(dx) + Math.abs(dy) < 1.2) settled++;
        ctx.fillStyle = p.yellow ? '#ffcd21' : '#ffffff';
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      }
      if (t > 1.3 && t < 2.6 && Math.random() < 0.3) audio.particleTick((t * 10) | 0);
      if (settledAt < 0 && t > 2.4 && settled > ps.length * 0.9) {
        settledAt = t;
        logo.style.transition = 'opacity 0.35s'; logo.style.opacity = '1';
        loadbar.style.transition = 'opacity 0.6s 0.4s'; loadbar.style.opacity = '1';
      }
      if (settledAt > 0 && t > settledAt + 0.4) { ctx.clearRect(0, 0, W, H); canvas.style.opacity = '0'; }
      // hold the studio card as the loading screen until everything is ready
      if (settledAt > 0 && pulseT < 0 && isLoaded && (t > settledAt + 0.9 || skip)) {
        pulseT = t;
        loadbar.style.opacity = '0';
        audio.introPulse();
        canvas.style.opacity = '1';
        logo.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.07)', filter: 'brightness(1.6)' }, { transform: 'scale(1)' }], { duration: 520, easing: 'cubic-bezier(.2,1.6,.4,1)' });
      }
      if (pulseT > 0) {
        const k = (t - pulseT) / 0.6;
        ctx.clearRect(0, 0, W, H);
        const x = -W * 0.3 + k * W * 1.6;
        const g = ctx.createLinearGradient(x - 70, 0, x + 70, 0);
        g.addColorStop(0, 'rgba(255,205,33,0)'); g.addColorStop(0.5, 'rgba(255,240,180,0.55)'); g.addColorStop(1, 'rgba(255,205,33,0)');
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
        ctx.strokeStyle = `rgba(255,205,33,${Math.max(0, 0.6 - k * 0.5)})`; ctx.lineWidth = 2;
        for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(W / 2, H / 2, k * W * (0.5 + i * 0.25), 0, 7); ctx.stroke(); }
        if (k > 1.6 && !done) { done = true; wrap.classList.add('out'); setTimeout(() => { wrap.remove(); resolve(); }, 480); return; }
      }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
    // allow skipping once loaded
    wrap.addEventListener('pointerdown', () => { if (isLoaded && settledAt > 0) skip = true; });
  });
}

/** Static studio card (same look) for quick reuse, e.g. while a heavy scene loads. */
export function studioCard(): HTMLElement {
  return h('div.studio', h('div.se-logo', h('span.s', 'Super'), h('span.e', 'Essence.')));
}
