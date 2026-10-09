import { h, clear } from '../dom';
import type { App } from '../../App';
import type { Screen } from '../UI';
import { ChestScene } from '../../menu/ChestScene';
import { chestById, type ChestId } from '../../data/chests';
import { RARITY_COLORS, RARITY_LABEL } from '../../data/types';
import type { GrantResult } from '../../meta/Profile';
import { formatNum } from '../../core/math';
import { audio } from '../../audio/Audio';
import { haptics } from '../../platform/Haptics';
import { heroById } from '../../data/heroes';

const RIDX: Record<string, number> = { common: 0, rare: 1, epic: 2, legendary: 3, mythic: 4 };

/** Chest opening: tap to build suspense, burst, then reveal each item one by one. */
export class ChestScreen implements Screen {
  el = h('div.screen.chest-ui');
  private scene: ChestScene | null = null;
  private results: GrantResult[] = [];
  private idx = -1;
  private state: 'closed' | 'reveal' | 'done' = 'closed';
  private hint = h('div.hint.stroke');
  private name = h('div.cn.stroke');
  private card = h('div');
  constructor(private app: App) {
    this.el.append(this.name, this.card, this.hint);
    this.el.addEventListener('pointerdown', () => this.tap());
  }
  onShow(params: { index: number; id: ChestId }) {
    const def = chestById(params.id);
    this.scene = new ChestScene(params.id);
    this.app.game.setView(this.scene);
    this.name.textContent = def.name;
    this.name.style.color = RARITY_COLORS[def.rarity];
    this.hint.textContent = 'TOUCHE LE COFFRE !';
    this.hint.style.display = '';
    clear(this.card);
    this.state = 'closed'; this.idx = -1;
    // roll & grant immediately (safe against quitting mid-animation)
    const res = this.app.profile.openChest(params.index);
    this.results = res?.results ?? [];
    audio.music(null);
    audio.whooshUI();
  }
  onHide() { this.scene?.dispose(); this.scene = null; }
  onBack() { if (this.state !== 'done') { this.tap(); return true; } return false; }

  private tap() {
    if (!this.scene) return;
    if (this.state === 'closed') {
      const burst = this.scene.tap();
      const left = this.scene.needed - this.scene.taps;
      this.hint.textContent = burst ? '' : left > 0 ? `ENCORE ${left} !` : '';
      this.name.animate([{ transform: 'scale(1.15)' }, { transform: 'scale(1)' }], { duration: 200 });
      if (burst) { this.state = 'reveal'; this.app.ui.flash('#ffffff', 0.85); setTimeout(() => this.next(), 650); }
      return;
    }
    if (this.state === 'reveal') { this.next(); return; }
    if (this.state === 'done') { this.app.ui.home(); }
  }
  private next() {
    this.idx++;
    clear(this.card);
    if (this.idx >= this.results.length) { this.summary(); return; }
    const r = this.results[this.idx];
    const rar = r.rarity ?? (r.kind === 'crystals' ? 'rare' : 'common');
    const col = RARITY_COLORS[rar as keyof typeof RARITY_COLORS];
    const special = r.kind === 'hero' || r.kind === 'skin';
    const icon = r.kind === 'hero' ? '🧑‍🚀' : r.icon;
    const title = r.kind === 'hero' ? `NOUVEAU HÉROS !` : r.kind === 'skin' ? 'NOUVEAU SKIN !' : '';
    this.card.appendChild(h('div.reveal-card.panel', { style: { background: `linear-gradient(180deg, ${col}, #1d2147 75%)` } },
      title ? h('div.h.stroke', { style: { fontSize: '1.3rem', color: '#ffd23f' } }, title) : null,
      h('div.ci', icon),
      r.amount !== undefined ? h('div.ca.stroke', `×${formatNum(r.amount)}`) : null,
      h('div.cl.stroke', r.kind === 'hero' && r.ref ? heroById(r.ref).name : r.label),
      r.rarity ? h('div', h('span.rar', { style: { background: col } }, RARITY_LABEL[r.rarity as keyof typeof RARITY_LABEL])) : null,
      h('div.reveal-count', `${this.idx + 1} / ${this.results.length}`)));
    const ri = RIDX[rar] ?? 0;
    audio.reveal(ri + (special ? 2 : 0));
    if (r.kind === 'coins') audio.coin(this.idx); else if (r.kind === 'crystals') audio.crystal();
    haptics[special || ri >= 3 ? 'heavy' : 'medium']();
    if (special || ri >= 3) this.app.ui.flash(col, 0.5);
    this.scene?.fx.burst(0, 2.2, 0, parseInt(col.slice(1), 16), 20 + ri * 10, 8, 0.5, 0.8, { up: 10 });
    this.hint.textContent = 'TOUCHE POUR CONTINUER';
  }
  private summary() {
    this.state = 'done';
    clear(this.card);
    this.card.appendChild(h('div.reveal-card.panel', h('div.h.stroke', { style: { fontSize: '1.5rem' } }, 'BUTIN'),
      h('div.rewards', this.results.map((r, i) => h('div.reward', { style: { animationDelay: `${i * 0.08}s` } }, h('div.ri', r.icon), r.amount !== undefined ? h('div.ra.stroke', `+${formatNum(r.amount)}`) : null, h('div.rl', r.label))))));
    this.hint.textContent = 'TOUCHE POUR CONTINUER';
    audio.levelUp();
  }
}
