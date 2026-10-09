import { h, clear, hex } from '../dom';
import type { App } from '../../App';
import type { Screen } from '../UI';
import { topbar } from './common';
import { WORLDS } from '../../data/worlds';
import { LEVELS, levelById } from '../../data/levels';
import { ENEMIES } from '../../data/enemies';
import { bossById } from '../../data/bosses';
import { audio } from '../../audio/Audio';

const OBJ_ICON: Record<string, string> = { eliminate: '💥', survive: '⏳', combo: '🔥', destroy: '🎯', collect: '⚡', ringout: '🕳️', protect: '🛡️', boss: '👹' };
const OBJ_TEXT = (t: string, n: number) => ({
  eliminate: 'Élimine toutes les vagues', survive: `Survis ${n} secondes`, combo: `Atteins un combo ×${n}`, destroy: `Détruis ${n} générateurs`,
  collect: `Dépose ${n} cellules d’énergie`, ringout: `Éjecte ${n} ennemis dans les pièges`, protect: `Protège le cœur pendant ${n} s`, boss: 'Vaincs le boss',
} as Record<string, string>)[t];

export class CampaignScreen implements Screen {
  el = h('div.screen.dim');
  private list = h('div.page-body.scroll');
  constructor(private app: App) {
    this.el.append(topbar(app, { back: true, title: 'CAMPAGNE' }), this.list);
  }
  onShow(params?: { focus?: number }) {
    this.app.showMenu('home');
    this.render();
    const focus = params?.focus ?? this.app.profile.nextLevel();
    requestAnimationFrame(() => this.list.querySelector(`[data-lvl="${focus}"]`)?.scrollIntoView({ block: 'center' }));
    if (params?.focus) setTimeout(() => this.brief(params.focus!), 250);
  }
  render() {
    const p = this.app.profile;
    clear(this.list);
    const next = p.nextLevel();
    this.list.appendChild(h('div', { style: { textAlign: 'center', fontSize: '0.85rem', margin: '0.2rem 0 0.6rem' } }, `⭐ ${p.totalStars()} / ${LEVELS.length * 3} étoiles`));
    for (const w of WORLDS) {
      const unlocked = p.isWorldUnlocked(w.id);
      const card = h('div.panel.world-card' + (unlocked ? '' : '.locked'), { style: { background: `linear-gradient(160deg, ${hex(w.palette.wall)} 0%, ${hex(w.palette.floor2)} 45%, ${hex(w.palette.trim)} 100%)` } },
        h('div.emo', w.emoji),
        h('div.wname.stroke', `${w.id}. ${w.name}`),
        h('div.wsub.stroke', w.subtitle),
        h('div.chip', { style: { marginTop: '0.35rem' } }, `⭐ ${p.worldStars(w.id)}/45`),
        !unlocked ? h('div.chip', { style: { marginTop: '0.35rem', marginLeft: '0.3rem' } }, `🔒 Boss précédent + ${w.starsRequired} ⭐`) : null);
      const grid = h('div.levels');
      for (const L of LEVELS.filter((l) => l.world === w.id)) {
        const open = p.isLevelUnlocked(L.id);
        const st = p.starsOf(L.id);
        const cls = L.boss ? 'red' : open ? (p.isLevelCompleted(L.id) ? 'blue' : 'yellow') : 'gray';
        grid.appendChild(h(`button.btn.lvl.${cls}${L.boss ? '.boss' : ''}${L.id === next && open ? '.current' : ''}${open ? '' : '.off'}`, {
          'data-lvl': L.id,
          onclick: () => { if (open) this.brief(L.id); else { audio.error(); this.app.ui.toast('🔒 Termine le niveau précédent'); } },
        }, L.boss ? '👹' : open ? String(L.index) : '🔒', h('span.st', '★'.repeat(st) + '☆'.repeat(3 - st))));
      }
      card.appendChild(grid);
      this.list.appendChild(card);
    }
  }
  brief(id: number) {
    const app = this.app, p = app.profile, L = levelById(id);
    const st = p.levelState(id);
    const enemyKinds = [...new Set(L.waves.flatMap((w) => w.enemies.map((e) => e.kind)))];
    const goals: [string, boolean][] = [[`Terminer en moins de ${L.parTime}s`, st.stars[0]], [`Score ≥ ${L.scoreTarget.toLocaleString('fr-FR')}`, st.stars[1]], [L.special.label, st.stars[2]]];
    const content = h('div',
      h('div', { style: { textAlign: 'center', fontSize: '0.8rem', opacity: '0.8' } }, `${WORLDS[L.world - 1].emoji} MONDE ${L.world} · NIVEAU ${L.index}`),
      h('div.mt.stroke', L.boss ? `👹 ${bossById(L.boss).name}` : L.name),
      h('div.star-row', [0, 1, 2].map((i) => h('span.star' + (st.stars[i] ? '.on' : ''), '⭐'))),
      h('div.goal', { style: { background: 'rgba(255,210,63,0.15)' } }, h('span.gs', OBJ_ICON[L.objective.type]), h('b', OBJ_TEXT(L.objective.type, L.objective.target))),
      goals.map(([g, ok]) => h('div.goal', h('span.gs', ok ? '⭐' : '☆'), g)),
      h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '0.3rem', marginTop: '0.6rem', justifyContent: 'center' } },
        enemyKinds.map((k) => h('span.chip', { style: { background: hex(ENEMIES[k].color) + '55' } }, ENEMIES[k].name)),
        L.mechanics.map((m) => h('span.chip', '⚙️ ' + m))),
      L.tip ? h('div', { style: { fontSize: '0.8rem', marginTop: '0.6rem', textAlign: 'center', opacity: '0.9' } }, '💡 ' + L.tip) : null,
      st.best ? h('div', { style: { fontSize: '0.75rem', marginTop: '0.4rem', textAlign: 'center', color: '#ffd23f' } }, `Meilleur score : ${st.best.toLocaleString('fr-FR')}`) : null,
      h('div', { style: { textAlign: 'center', marginTop: '0.9rem' } }, h('button.btn.big.green', { onclick: () => { app.ui.closeModal(); app.startBattle(app.battleConfig('campaign', id)); } }, h('span.shine'), 'COMBATTRE !')),
    );
    app.ui.modal(content);
  }
}
