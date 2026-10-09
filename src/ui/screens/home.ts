import { h, clear, hex } from '../dom';
import type { App } from '../../App';
import { MODES } from '../../App';
import type { Screen } from '../UI';
import { topbar, modePicker, settingsModal, missionsModal, eventsModal } from './common';
import { bus } from '../../core/Events';
import { chestById } from '../../data/chests';
import { RARITY_COLORS } from '../../data/types';
import { MAX_CHESTS } from '../../meta/Profile';
import { MISSION_POOL } from '../../data/missions';
import { currentEvent } from '../../data/events';
import { levelById } from '../../data/levels';
import { audio } from '../../audio/Audio';

const CHEST_EMOJI: Record<string, string> = { wood: '🧰', steel: '🗃️', energy: '🔋', epic: '💜', mythic: '👑', cosmic: '🌌' };
export const chestEmoji = (id: string) => CHEST_EMOJI[id] ?? '📦';

export function bottomNav(app: App, active: string) {
  const tabs: [string, string, string][] = [['shop', '🛒', 'BOUTIQUE'], ['heroes', '🧑‍🚀', 'HÉROS'], ['home', '🧲', 'JOUER'], ['pass', '🎟️', 'PASS'], ['profile', '🏆', 'PROFIL']];
  const nav = h('div.nav');
  for (const [id, ic, label] of tabs) {
    const t = h('div.tab' + (id === active ? '.on' : ''), { onclick: () => { if (id === 'home') app.ui.home(); else if (app.ui.current !== id) app.ui.go(id); } }, h('span.ic', ic), label);
    if (id === 'pass') {
      const n = countPass(app);
      if (n) t.appendChild(h('div.badge-dot', String(n)));
    }
    if (id === 'heroes') {
      const n = Object.keys(app.profile.data.heroes).filter((k) => app.profile.canUpgrade(k) || app.profile.canUnlockWithFragments(k)).length;
      if (n) t.appendChild(h('div.badge-dot', String(n)));
    }
    nav.appendChild(t);
  }
  return nav;
}
function countPass(app: App) {
  let n = 0;
  for (let t = 1; t <= app.profile.passTier(); t++) { if (app.profile.canClaimPass(t, 'free')) n++; if (app.profile.canClaimPass(t, 'premium')) n++; }
  return n;
}

export class HomeScreen implements Screen {
  el = h('div.screen');
  private body = h('div', { style: { display: 'contents' } });
  constructor(private app: App) {
    this.el.appendChild(this.body);
    bus.on('profile', () => { if (app.ui.current === 'home') this.render(); });
  }
  onShow() { this.app.showMenu('home'); this.app.refreshMenuHero(); this.render(); }

  render() {
    const app = this.app, p = app.profile;
    clear(this.body);
    const hero = p.selected;
    const ev = currentEvent();
    // left column
    const missionsReady = p.data.missions.list.filter((m) => !m.claimed && m.progress >= (MISSION_POOL.find((d) => d.id === m.id)?.target ?? 1e9)).length;
    const left = h('div.home-side.left',
      h('button.btn.event-banner', { style: { '--c1': ev.def.color, '--c2': '#3a1f6a', '--edge': '#1d0f3a' } as any, onclick: () => eventsModal(app) },
        h('span', { style: { fontSize: '1.8rem' } }, ev.def.emoji), h('div', h('b', ev.def.name), h('span', { style: { fontSize: '0.65rem', fontFamily: 'Nunito' } }, 'Événement en cours'))),
      h('button.btn.purple.side-btn', { onclick: () => missionsModal(app) }, '🎯', h('small', 'MISSIONS'), missionsReady ? h('div.badge-dot', String(missionsReady)) : null),
      h('button.btn.pink.side-btn', { onclick: () => app.ui.go('pass') }, '🎟️', h('small', `PALIER ${p.passTier()}`)),
    );
    // right column
    const freeReady = p.freeChestReady();
    const left2 = Math.max(0, p.data.freeChestAt - Date.now());
    const right = h('div.home-side.right',
      h('button.btn.dark.side-btn', { onclick: () => settingsModal(app) }, '⚙️', h('small', 'RÉGLAGES')),
      h(`button.btn.${freeReady ? 'green' : 'gray'}.side-btn`, {
        onclick: () => {
          if (p.claimFreeChest()) { audio.levelUp(); app.ui.toast('🎁 Coffre gratuit ajouté !', '#16a06e'); }
          else if (p.data.chests.length >= MAX_CHESTS) app.ui.toast('Inventaire de coffres plein !');
          else app.ui.toast(`Prochain coffre gratuit dans ${Math.ceil(left2 / 60000)} min`);
        },
      }, '🎁', h('small', freeReady ? 'GRATUIT' : `${Math.floor(left2 / 3600000)}h${String(Math.ceil((left2 % 3600000) / 60000)).padStart(2, '0')}`), freeReady ? h('div.badge-dot', '!') : null),
      h('button.btn.yellow.side-btn', { onclick: () => app.ui.go('profile', 'road') }, '🏆', h('small', 'TROPHÉES'), p.claimableLeagues().length ? h('div.badge-dot', String(p.claimableLeagues().length)) : null),
    );
    // hero name tag (tap → heroes)
    const heroTag = h('div.hero-name', { 'data-tap': 1, onclick: () => { app.menu.tapHero(); audio.pop(); } , style: { position: 'absolute', left: '0', right: '0', top: '66%' } },
      h('div.n.stroke', { style: { color: hex(hero.color) } }, h('span.level-badge', String(p.hero(hero.id).level)), hero.name),
      h('div.t.stroke', hero.title));
    // chests
    const chests = h('div.chest-row');
    for (let i = 0; i < MAX_CHESTS; i++) {
      const id = p.data.chests[i];
      if (id) {
        const def = chestById(id);
        chests.appendChild(h('div.chest-slot.full', { style: { background: `linear-gradient(180deg, ${hex(def.color)}, ${hex(def.trim)})` }, onclick: () => app.openChest(i) },
          chestEmoji(id), h('span.lbl.stroke', { style: { color: RARITY_COLORS[def.rarity] } }, 'OUVRIR')));
      } else chests.appendChild(h('div.chest-slot'));
    }
    // play row
    const mode = MODES.find((m) => m.id === app.mode)!;
    const next = levelById(p.nextLevel());
    const sub = app.mode === 'campaign' ? `Niveau ${next.id} · ${next.name}` : mode.desc;
    const play = h('div.play-row',
      h('button.btn.blue.mode-btn', { onclick: () => modePicker(app, (m) => { app.mode = m; this.render(); }) }, h('span.ic', mode.emoji), mode.name, h('span', { style: { fontSize: '0.55rem', fontFamily: 'Nunito' } }, 'CHANGER ▾')),
      h('button.btn.big.play-btn', {
        onclick: () => {
          if (app.mode === 'campaign') app.ui.go('campaign', { focus: next.id });
          else app.startBattle(app.battleConfig(app.mode));
        },
      }, h('span.shine'), 'JOUER', h('small', sub)),
    );
    const bottom = h('div.home-bottom', chests, play, bottomNav(app, 'home'));
    this.body.append(topbar(app), left, right, heroTag, bottom);
  }
}

export class TitleScreen implements Screen {
  el = h('div.screen.title-screen');
  constructor(private app: App) {
    this.el.append(
      h('div.mw-logo', h('div', h('span.l1', 'MAGNET')), h('div', h('span.l2', 'WAR'), ' ', h('span.mag', '🧲')), h('div.tag.stroke', 'ATTIRE. REPOUSSE. DÉTRUIS.')),
      h('div', { style: { textAlign: 'center' } }, h('div.tap-start.stroke', 'TOUCHE POUR JOUER'), h('div.mw-logo', h('div.by', 'SUPERESSENCE'))),
    );
    this.el.addEventListener('pointerdown', () => this.go());
  }
  private going = false;
  onShow() { this.going = false; this.app.showMenu('title'); }
  private go() {
    if (this.going) return;
    this.going = true;
    const app = this.app;
    audio.unlock();
    audio.music('menu');
    audio.whooshUI();
    // first session: straight into the action (fun in the first 10 seconds)
    if (!app.profile.isLevelCompleted(1)) app.startBattle(app.battleConfig('campaign', 1));
    else app.ui.home();
  }
}
