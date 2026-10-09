import { h, clear } from '../dom';
import type { App } from '../../App';
import type { Screen } from '../UI';
import { topbar } from './common';
import { bottomNav, chestEmoji } from './home';
import { SHOP_SECTIONS, type ShopOffer, type ShopSection } from '../../data/shop';
import { allOffers, buyOffer, remaining } from '../../meta/ShopService';
import { payments } from '../../meta/Payments';
import { formatNum } from '../../core/math';
import { audio } from '../../audio/Audio';
import { currentEvent } from '../../data/events';

export class ShopScreen implements Screen {
  el = h('div.screen.dim');
  private tabs = h('div.tabs');
  private body = h('div.page-body.scroll');
  private section: ShopSection = 'featured';
  private busy = false;
  constructor(private app: App) {
    this.el.append(topbar(app, { back: true, title: 'BOUTIQUE' }), this.tabs, this.body, h('div', { style: { padding: '0 0.6rem calc(var(--sab) + 0.4rem)' } }, bottomNav(app, 'shop')));
  }
  onShow(section?: ShopSection) {
    if (section) this.section = section;
    this.app.showMenu('home');
    this.app.profile.refreshDaily();
    this.render();
  }
  render() {
    clear(this.tabs);
    for (const s of SHOP_SECTIONS) this.tabs.appendChild(h(`button.btn.small.${s.id === this.section ? 'yellow' : 'dark'}`, { onclick: () => { this.section = s.id; this.render(); this.body.scrollTop = 0; } }, `${s.emoji} ${s.label}`));
    clear(this.body);
    const p = this.app.profile;
    const offers = allOffers(p).filter((o) => o.section === this.section);
    if (this.section === 'daily') {
      const reset = new Date(); reset.setUTCHours(24, 0, 0, 0);
      this.body.appendChild(h('div', { style: { textAlign: 'center', fontSize: '0.8rem', marginBottom: '0.5rem' } }, `🔄 Nouvelles offres dans ${Math.ceil((reset.getTime() - Date.now()) / 3600000)} h`));
    }
    if (this.section === 'event') {
      const ev = currentEvent().def;
      this.body.appendChild(h('div.panel', { style: { padding: '0.7rem', marginBottom: '0.6rem', background: `linear-gradient(160deg, ${ev.color}, #2a1f4f)`, textAlign: 'center' } }, h('div.h.stroke', { style: { fontSize: '1.4rem' } }, `${ev.emoji} ${ev.name}`), h('div', { style: { fontSize: '0.8rem' } }, ev.desc)));
    }
    const grid = h('div.grid2');
    if (!offers.length) grid.appendChild(h('div', { style: { gridColumn: 'span 2', textAlign: 'center', opacity: '0.8', padding: '2rem' } }, this.section === 'characters' ? 'Tu possèdes déjà tous les héros disponibles ici ! 🎉' : 'Revenez plus tard !'));
    offers.forEach((o, i) => grid.appendChild(this.card(o, i)));
    this.body.appendChild(grid);
    if (this.section === 'crystals' && payments.sandbox) this.body.appendChild(h('div.sandbox', '🧪 MODE TEST : les achats réels ne sont pas encore connectés à Google Play Billing. Aucun paiement n’est effectué.'));
  }
  private card(o: ShopOffer, i: number) {
    const p = this.app.profile;
    const left = remaining(p, o);
    const sold = left <= 0;
    const featured = o.section === 'featured' && i === 0 && o.id === 'starter';
    const price = o.price.free ? 'GRATUIT' : o.price.real ? o.price.real : o.price.crystals ? `💎 ${formatNum(o.price.crystals)}` : `🪙 ${formatNum(o.price.coins ?? 0)}`;
    const icon = o.reward.chest ? chestEmoji(o.reward.chest) : o.icon;
    const btn = h(`button.btn.small.${sold ? 'gray.off' : o.price.free ? 'green' : o.price.real ? 'blue' : o.price.crystals ? 'purple' : 'yellow'}`, { onclick: () => this.buy(o) }, sold ? 'ACHETÉ' : price);
    return h('div.offer' + (featured ? '.featured' : '') + (sold ? '.soldout' : ''), { style: o.tint ? { background: `linear-gradient(180deg, ${o.tint}, #222861)` } : {} },
      o.badge ? h('div.ribbon', o.badge) : null, o.value ? h('div.val', o.value) : null,
      h('div.oi', { style: { animationDelay: `${i * 0.2}s` } }, icon),
      h('div', { style: featured ? { flex: '1' } : {} }, h('div.ot.stroke', o.title), h('div.os', o.subtitle ?? (o.limit && !sold && o.section === 'daily' ? `${left} restant(s)` : '')),
        featured ? h('div', { style: { fontSize: '0.7rem', marginTop: '0.2rem' } }, '🪙 3 000 · Coffre Épique · 20 fragments VOLT') : null),
      featured ? h('div', h('span.btn.shine', { style: { display: 'none' } }), btn) : btn);
  }
  private async buy(o: ShopOffer) {
    if (this.busy) return;
    const p = this.app.profile;
    if (remaining(p, o) <= 0) { audio.error(); return; }
    const doBuy = async () => {
      this.busy = true;
      const r = await buyOffer(p, o);
      this.busy = false;
      if (!r.ok) { audio.error(); this.app.ui.toast(r.reason ?? 'Achat impossible'); return; }
      audio.levelUp();
      this.app.ui.rewards('ACHAT RÉUSSI !', r.results ?? [], () => this.render());
      this.render();
    };
    if (o.price.free || (o.price.coins && !o.price.crystals)) doBuy();
    else this.app.ui.confirm(o.title, o.price.real ? `Acheter pour ${o.price.real} ?${payments.sandbox ? ' (mode test, gratuit)' : ''}` : `Dépenser 💎 ${o.price.crystals} ?`, 'ACHETER', doBuy, 'purple');
  }
}
