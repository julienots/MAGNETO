import { h, clear } from '../dom';
import type { App } from '../../App';
import type { Screen } from '../UI';
import { topbar } from './common';
import { bottomNav, chestEmoji } from './home';
import { PASS, PASS_PREMIUM_PRICE, PASS_XP_PER_TIER, PASS_TIERS, SEASON } from '../../data/pass';
import type { Reward } from '../../data/types';
import { heroById } from '../../data/heroes';
import { skinById } from '../../data/skins';
import { audio } from '../../audio/Audio';

export function rewardIcon(r: Reward): [string, string] {
  if (r.hero) return ['🧑‍🚀', heroById(r.hero).name];
  if (r.skin) return ['🎨', skinById(r.skin)?.name ?? 'Skin'];
  if (r.chest) return [chestEmoji(r.chest), 'Coffre'];
  if (r.crystals) return ['💎', `${r.crystals}`];
  if (r.fragments?.length) return ['🧩', `${r.fragments[0].amount} ${heroById(r.fragments[0].hero).name}`];
  if (r.coins) return ['🪙', `${r.coins}`];
  if (r.emote) return ['😄', 'Emote'];
  if (r.trail) return ['✨', 'Traînée'];
  if (r.badge) return ['🏅', 'Badge'];
  return ['🎁', ''];
}

export class PassScreen implements Screen {
  el = h('div.screen.dim');
  private head = h('div.panel.pass-head');
  private body = h('div.page-body.scroll');
  constructor(private app: App) {
    this.el.append(topbar(app, { back: true, title: 'SUPERESSENCE PASS' }), h('div', { style: { padding: '0 0.7rem' } }, this.head), this.body, h('div', { style: { padding: '0 0.6rem calc(var(--sab) + 0.4rem)' } }, bottomNav(app, 'pass')));
  }
  onShow() { this.app.showMenu('home'); this.render(); requestAnimationFrame(() => this.body.querySelector('.claimable, .next')?.scrollIntoView({ block: 'center' })); }
  render() {
    const app = this.app, p = app.profile, d = p.data.pass;
    const tier = p.passTier();
    const inTier = d.xp - tier * PASS_XP_PER_TIER;
    clear(this.head);
    const days = SEASON.days;
    this.head.append(
      h('div', { style: { fontSize: '2.6rem' } }, '⚡'),
      h('div', { style: { flex: '1' } }, h('div.h.stroke', { style: { fontSize: '1.15rem' } }, SEASON.name), h('div', { style: { fontSize: '0.7rem', opacity: '0.85' } }, `Palier ${tier}/${PASS_TIERS} · ${days} jours`),
        h('div.progress.yellow', { style: { marginTop: '0.3rem' } }, h('i', { style: { width: tier >= PASS_TIERS ? '100%' : `${(inTier / PASS_XP_PER_TIER) * 100}%` } }), h('span', tier >= PASS_TIERS ? 'MAX' : `${inTier}/${PASS_XP_PER_TIER} XP`))),
      d.premium ? h('div.chip', { style: { background: '#e08e00' } }, '👑 PREMIUM') : h('button.btn.yellow.small', { onclick: () => app.ui.confirm('PASS PREMIUM', 'Débloque la piste PREMIUM : PHASE, 4 skins OVERCHARGE, coffres cosmiques et plus !', `💎 ${PASS_PREMIUM_PRICE}`, () => {
        if (p.buyPremiumPass()) { audio.levelUp(); app.ui.toast('👑 Pass Premium activé !', '#e08e00'); this.render(); } else { audio.error(); app.ui.toast('Pas assez de cristaux 💎'); }
      }, 'yellow') }, h('span.shine'), '👑 PREMIUM'),
    );
    clear(this.body);
    const track = h('div.pass-track');
    track.appendChild(h('div.pass-tier', h('div.h', { style: { textAlign: 'center' } }, 'GRATUIT'), h('div'), h('div.h', { style: { textAlign: 'center', color: '#ffd23f' } }, '👑 PREMIUM')));
    for (const t of PASS) {
      const reached = t.tier <= tier;
      const cell = (track_: 'free' | 'premium') => {
        const r = track_ === 'free' ? t.free : t.premium;
        const [ic, lbl] = rewardIcon(r);
        const claimed = (track_ === 'free' ? d.claimedFree : d.claimedPremium).includes(t.tier);
        const can = p.canClaimPass(t.tier, track_);
        return h(`div.pass-cell.${track_ === 'free' ? 'free' : 'prem'}${claimed ? '.claimed' : ''}${can ? '.claimable' : ''}${track_ === 'premium' && !d.premium ? '.lockedp' : ''}`, {
          onclick: () => {
            const res = p.claimPass(t.tier, track_);
            if (res) app.ui.rewards(`PALIER ${t.tier} !`, res, () => this.render());
            else { audio.error(); app.ui.toast(claimed ? 'Déjà récupéré' : !reached ? `Atteins le palier ${t.tier}` : 'Pass Premium requis 👑'); }
          },
        }, h('span.pi', ic), h('span', lbl), claimed ? h('span', { style: { marginLeft: 'auto' } }, '✔') : null);
      };
      track.appendChild(h('div.pass-tier' + (t.tier === tier + 1 ? '.next' : ''), cell('free'), h('div.num' + (reached ? '.reached' : ''), String(t.tier)), cell('premium')));
    }
    this.body.appendChild(track);
  }
}
