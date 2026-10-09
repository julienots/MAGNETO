import { h, clear } from './dom';
import { audio } from '../audio/Audio';
import { haptics } from '../platform/Haptics';
import type { GrantResult } from '../meta/Profile';
import { RARITY_COLORS } from '../data/types';
import { formatNum } from '../core/math';

export interface Screen {
  el: HTMLElement;
  onShow?(params?: any): void;
  onHide?(): void;
  refresh?(): void;
  /** true = handled */
  onBack?(): boolean;
}

/** Screen router + global UI services (toasts, modals, reward popups, button feel). */
export class UI {
  root: HTMLElement;
  screens = new Map<string, Screen>();
  current: string | null = null;
  stack: string[] = [];
  private modalStack: HTMLElement[] = [];

  constructor(root: HTMLElement) {
    this.root = root;
    // physical button feel for everything with .btn / [data-tap]
    root.addEventListener('pointerdown', (e) => {
      const t = (e.target as HTMLElement).closest('.btn, [data-tap], .tab, .chest-slot, .hero-card, .skin, .pass-cell, .lvl, .offer, .toggle') as HTMLElement | null;
      if (!t) return;
      audio.unlock();
      t.classList.add('press');
      if (!t.classList.contains('off')) { audio.tap(); haptics.light(); }
      const up = () => { t.classList.remove('press'); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); };
      window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
    }, true);
  }

  register(name: string, s: Screen) { this.screens.set(name, s); s.el.classList.add('hidden'); this.root.appendChild(s.el); }

  go(name: string, params?: any, opts: { push?: boolean } = {}) {
    const next = this.screens.get(name);
    if (!next) throw new Error('no screen ' + name);
    if (this.current && this.current !== name) {
      const cur = this.screens.get(this.current)!;
      cur.onHide?.();
      cur.el.classList.remove('enter');
      cur.el.classList.add('leave');
      const el = cur.el;
      setTimeout(() => { if (this.current !== name || true) { el.classList.add('hidden'); el.classList.remove('leave'); } }, 190);
      if (opts.push !== false) this.stack.push(this.current);
    }
    this.current = name;
    next.el.classList.remove('hidden', 'leave');
    void next.el.offsetWidth;
    next.el.classList.add('enter');
    next.onShow?.(params);
  }
  back() {
    if (this.modalStack.length) { this.closeModal(); return; }
    const cur = this.current ? this.screens.get(this.current) : null;
    if (cur?.onBack?.()) return;
    const prev = this.stack.pop();
    if (prev) { audio.back(); this.go(prev, undefined, { push: false }); }
  }
  /** Reset navigation history (e.g. coming back home). */
  home(name = 'home') { this.stack = []; this.go(name, undefined, { push: false }); }

  toast(text: string, color = 'var(--panel)') {
    const t = h('div.toast.panel', { style: { background: color } }, text);
    this.root.appendChild(t);
    setTimeout(() => t.remove(), 2300);
  }

  modal(content: HTMLElement, opts: { onClose?: () => void; closable?: boolean } = {}) {
    const wrap = h('div.modal-wrap');
    const box = h('div.modal.panel', { style: { position: 'relative' } }, content);
    if (opts.closable !== false) {
      const x = h('button.btn.red.round.close', { onclick: () => this.closeModal() }, '✕');
      box.appendChild(x);
      wrap.addEventListener('pointerdown', (e) => { if (e.target === wrap) this.closeModal(); });
    }
    (wrap as any).__onClose = opts.onClose;
    wrap.appendChild(box);
    this.root.appendChild(wrap);
    this.modalStack.push(wrap);
    audio.whooshUI();
    return wrap;
  }
  closeModal() {
    const m = this.modalStack.pop();
    if (!m) return;
    (m as any).__onClose?.();
    m.remove();
  }
  get modalOpen() { return this.modalStack.length > 0; }

  /** Animated reward summary popup. */
  rewards(title: string, results: GrantResult[], onDone?: () => void) {
    if (!results.length) { onDone?.(); return; }
    const list = h('div.rewards');
    results.forEach((r, i) => {
      const card = h('div.reward', { style: { animationDelay: `${0.15 + i * 0.12}s`, borderColor: r.rarity ? RARITY_COLORS[r.rarity as keyof typeof RARITY_COLORS] : undefined } },
        h('div.ri', r.icon), r.amount !== undefined ? h('div.ra.stroke', `+${formatNum(r.amount)}`) : null, h('div.rl', r.label));
      list.appendChild(card);
      setTimeout(() => { r.kind === 'coins' ? audio.coin(i) : r.kind === 'crystals' ? audio.crystal() : audio.pop(); }, 150 + i * 120);
    });
    const content = h('div', h('div.mt.stroke', title), list, h('div', { style: { textAlign: 'center', marginTop: '1rem' } }, h('button.btn.green', { onclick: () => this.closeModal() }, 'SUPER !')));
    this.modal(content, { onClose: onDone });
    haptics.success();
  }

  confirm(title: string, text: string, okLabel: string, onOk: () => void, okClass = 'green') {
    const c = h('div', h('div.mt.stroke', title), h('div', { style: { textAlign: 'center', fontSize: '0.95rem', margin: '0.4rem 0 1rem' } }, text),
      h('div', { style: { display: 'flex', gap: '0.6rem', justifyContent: 'center' } },
        h('button.btn.gray', { onclick: () => this.closeModal() }, 'ANNULER'),
        h(`button.btn.${okClass}`, { onclick: () => { this.closeModal(); onOk(); } }, okLabel)));
    this.modal(c);
  }

  flash(color: string, a = 0.4) {
    const f = h('div.screen-flash', { style: { background: color } });
    this.root.appendChild(f);
    f.animate([{ opacity: a }, { opacity: 0 }], { duration: 350, easing: 'ease-out' }).onfinish = () => f.remove();
  }
}
export { h, clear };
