import { h, clear, hex } from '../dom';
import type { App } from '../../App';
import type { Screen } from '../UI';
import { topbar } from './common';
import { bottomNav } from './home';
import { LEAGUES, nextLeague } from '../../data/trophies';
import { HEROES } from '../../data/heroes';
import { LEVELS } from '../../data/levels';
import { formatNum } from '../../core/math';
import { rewardIcon } from './pass';
import { audio } from '../../audio/Audio';

export class ProfileScreen implements Screen {
  el = h('div.screen.dim');
  private body = h('div.page-body.scroll');
  constructor(private app: App) {
    this.el.append(topbar(app, { back: true, title: 'PROFIL' }), this.body, h('div', { style: { padding: '0 0.6rem calc(var(--sab) + 0.4rem)' } }, bottomNav(app, 'profile')));
  }
  onShow(focus?: string) {
    this.app.showMenu('home');
    this.render();
    if (focus === 'road') requestAnimationFrame(() => this.body.querySelector('.league.cur')?.scrollIntoView({ block: 'center' }));
  }
  render() {
    const app = this.app, p = app.profile, d = p.data;
    clear(this.body);
    const hero = p.selected;
    const lg = app.league(), nx = nextLeague(d.bestTrophies);
    const tile = (v: string, k: string) => h('div.tile', h('div.tv.stroke', v), h('div.tk', k));
    const ownedHeroes = HEROES.filter((x) => p.hero(x.id).owned).length;
    this.body.append(
      h('div.panel', { style: { padding: '0.8rem', display: 'flex', gap: '0.7rem', alignItems: 'center' } },
        h('div.avatar.h', { style: { width: '4.2rem', height: '4.2rem', fontSize: '2rem', background: hex(hero.color) } }, hero.name[0]),
        h('div', { style: { flex: '1' } },
          h('div.h.stroke', { style: { fontSize: '1.5rem' } }, d.name),
          h('div', { style: { fontSize: '0.8rem', color: lg.color } }, `${lg.icon} ${lg.name} · ${formatNum(d.trophies)} 🏆 (record ${formatNum(d.bestTrophies)})`),
          d.badges.length ? h('div', { style: { marginTop: '0.3rem', display: 'flex', gap: '0.3rem', flexWrap: 'wrap' } }, d.badges.map((b) => h('span.chip', '🏅 ' + b))) : null,
          nx ? h('div.progress.yellow', { style: { marginTop: '0.35rem' } }, h('i', { style: { width: `${((d.bestTrophies - lg.min) / (nx.min - lg.min)) * 100}%` } }), h('span', `${nx.icon} ${nx.name} : ${nx.min} 🏆`)) : null)),
      h('div.section-title', '📊 STATISTIQUES'),
      h('div.stat-tiles',
        tile(formatNum(p.stat('wins')), 'Victoires'), tile(formatNum(p.stat('games')), 'Parties'),
        tile(formatNum(p.stat('bestScore')), 'Meilleur score'), tile('×' + p.stat('maxCombo'), 'Meilleur combo'),
        tile(formatNum(p.stat('kills')), 'Ennemis détruits'), tile(formatNum(p.stat('explosions')), 'Kills explosifs'),
        tile(`${p.totalStars()}/${LEVELS.length * 3}`, 'Étoiles'), tile(String(p.stat('bossKills')), 'Boss vaincus'),
        tile(`${ownedHeroes}/${HEROES.length}`, 'Héros'), tile(`${d.ownedSkins.length - HEROES.length}`, 'Skins'),
        tile(formatNum(p.stat('rushBest')), 'Record Rush'), tile('Vague ' + p.stat('survivalBest'), 'Record Survival'),
        tile(`${Math.round(p.stat('playTime') / 60)} min`, 'Temps de jeu'), tile(formatNum(p.stat('flips')), 'Inversions')),
      h('div.section-title', '🏆 ROUTE DES TROPHÉES'),
      ...LEAGUES.map((L) => {
        const reached = d.bestTrophies >= L.min;
        const claimed = d.claimedLeagues.includes(L.id);
        const rw = Object.keys(L.reward).length ? rewardIcon(L.reward) : null;
        return h('div.league' + (L.id === lg.id ? '.cur' : '') + (reached ? '' : '.locked'),
          h('div.li', L.icon),
          h('div', { style: { flex: '1' } }, h('div.h', { style: { color: L.color, fontSize: '1.1rem' } }, L.name), h('div', { style: { fontSize: '0.7rem' } }, `${L.min} 🏆${L.unlock ? ' · Débloque : ' + L.unlock : ''}`)),
          rw ? (reached && !claimed
            ? h('button.btn.small.green', { onclick: () => { const r = p.claimLeague(L.id); if (r) app.ui.rewards(`LIGUE ${L.name} !`, r, () => this.render()); else audio.error(); } }, `${rw[0]} RÉCUPÉRER`)
            : h('span.chip', claimed ? '✔' : `${rw[0]} ${rw[1]}`)) : null);
      }),
    );
  }
}
