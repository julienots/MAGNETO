import { h, clear, hex } from '../dom';
import type { App } from '../../App';
import type { Screen } from '../UI';
import { topbar } from './common';
import { bottomNav } from './home';
import { HEROES, heroById, HERO_MAX_LEVEL, heroStatMult } from '../../data/heroes';
import { SKINS, themeById, type SkinTheme } from '../../data/skins';
import { RARITY_COLORS, RARITY_LABEL } from '../../data/types';
import { audio } from '../../audio/Audio';
import { haptics } from '../../platform/Haptics';
import { bus } from '../../core/Events';

const UNLOCK_TEXT = (t: string, n: number) => ({ start: 'Disponible', fragments: `${n} fragments`, stars: `${n} ⭐ campagne`, trophies: `${n} 🏆`, pass: `Pass palier ${n}` } as Record<string, string>)[t];

export class HeroesScreen implements Screen {
  el = h('div.screen');
  private strip = h('div.tabs');
  private sheet = h('div.panel.hero-sheet.scroll');
  private viewing = 'mag';
  private previewSkin: string | null = null;
  private drag: { x: number; spin: number } | null = null;
  constructor(private app: App) {
    const area = h('div', { style: { flex: '1', touchAction: 'none' } });
    area.addEventListener('pointerdown', (e) => { this.drag = { x: e.clientX, spin: app.menu.spin }; });
    window.addEventListener('pointermove', (e) => { if (this.drag) app.menu.spin = this.drag.spin + (e.clientX - this.drag.x) * 0.012; });
    window.addEventListener('pointerup', (e) => { if (this.drag && Math.abs(e.clientX - this.drag.x) < 6) app.menu.tapHero(); this.drag = null; });
    this.el.append(topbar(app, { back: true, title: 'HÉROS' }), this.strip, area, this.sheet, h('div', { style: { padding: '0 0.6rem calc(var(--sab) + 0.4rem)', background: 'var(--panel)' } }, bottomNav(app, 'heroes')));
    bus.on('profile', () => { if (app.ui.current === 'heroes') this.render(); });
  }
  onShow(params?: string) {
    this.viewing = params ?? this.app.profile.data.selectedHero;
    this.previewSkin = null;
    this.app.showMenu('hero');
    this.render();
    this.preview();
  }
  onHide() { this.app.refreshMenuHero(); }
  private preview() {
    const p = this.app.profile;
    const skin = this.previewSkin ?? p.skinOf(this.viewing);
    this.app.menu.setHero(this.viewing, skin.split(':')[1] as SkinTheme, 'select');
  }
  render() {
    const app = this.app, p = app.profile;
    clear(this.strip);
    for (const hd of HEROES) {
      const st = p.hero(hd.id);
      const card = h('div.hero-card' + (hd.id === this.viewing ? '.sel' : '') + (st.owned ? '' : '.locked'), {
        style: { flex: '0 0 5.2rem', background: `linear-gradient(180deg, ${hex(hd.color)}, ${hex(hd.accent)})` },
        onclick: () => { this.viewing = hd.id; this.previewSkin = null; this.render(); this.preview(); },
      }, h('div.portrait', { style: { height: '2.6rem' } }, st.owned ? hd.name[0] : '?'), h('div.nm.stroke', hd.name),
        h('span.rar', { style: { background: RARITY_COLORS[hd.rarity] } }, RARITY_LABEL[hd.rarity]),
        (p.canUpgrade(hd.id) || p.canUnlockWithFragments(hd.id)) ? h('div.badge-dot', '↑') : null);
      this.strip.appendChild(card);
    }
    this.drawSheet();
  }
  private drawSheet() {
    const app = this.app, p = app.profile, hd = heroById(this.viewing), st = p.hero(hd.id);
    clear(this.sheet);
    const mult = heroStatMult(st.level);
    const stat = (k: string, v: number, max: number, shown: string) => h('div.stat-row', h('span.k', k), h('div.bar', h('i', { style: { width: `${Math.min(100, (v / max) * 100)}%` } })), h('span.v', shown));
    const cost = p.upgradeCost(hd.id);
    let action: HTMLElement;
    if (!st.owned) {
      const can = p.canUnlockWithFragments(hd.id) || (hd.unlock.type === 'stars' && p.totalStars() >= hd.unlock.amount) || (hd.unlock.type === 'trophies' && p.data.bestTrophies >= hd.unlock.amount);
      action = h(`button.btn.${can ? 'green' : 'gray'}${can ? '' : '.off'}`, { style: { flex: '1' }, onclick: () => {
        if (p.unlockHero(hd.id)) { audio.levelUp(); haptics.success(); app.menu.victory(); app.ui.toast(`🎉 ${hd.name} débloqué !`, '#16a06e'); }
        else { audio.error(); app.ui.toast(`🔒 Requis : ${UNLOCK_TEXT(hd.unlock.type, hd.unlock.amount)}`); }
      } }, can ? 'DÉBLOQUER !' : `🔒 ${UNLOCK_TEXT(hd.unlock.type, hd.unlock.amount)}`);
    } else {
      const sel = p.data.selectedHero === hd.id;
      action = h('div', { style: { display: 'flex', gap: '0.5rem', flex: '1' } },
        h(`button.btn.${sel ? 'gray' : 'yellow'}`, { style: { flex: '1' }, onclick: () => { if (!sel) { p.select(hd.id); app.menu.victory(); audio.levelUp(); } } }, sel ? '✔ CHOISI' : 'CHOISIR'),
        st.level < HERO_MAX_LEVEL
          ? h(`button.btn.${p.canUpgrade(hd.id) ? 'green' : 'dark'}`, { style: { flex: '1.2', flexDirection: 'column', gap: '0.1rem', fontSize: '0.95rem' }, onclick: () => {
              if (p.upgradeHero(hd.id)) { audio.levelUp(); haptics.success(); app.menu.victory(); app.ui.toast(`⬆️ ${hd.name} niveau ${st.level} !`, '#16a06e'); app.menu.fx.burst(0, 1.5, 0, 0xffd23f, 40, 8, 0.5, 0.8, { up: 10 }); }
              else { audio.error(); app.ui.toast(st.fragments < cost.fragments ? 'Pas assez de fragments 🧩' : 'Pas assez de pièces 🪙'); }
            } }, `AMÉLIORER`, h('span', { style: { fontSize: '0.65rem', fontFamily: 'Nunito' } }, `🧩${cost.fragments} · 🪙${cost.coins}`))
          : h('button.btn.purple.off', { style: { flex: '1' } }, 'NIVEAU MAX'));
    }
    const fragTarget = st.owned ? cost.fragments : hd.unlock.type === 'fragments' ? hd.unlock.amount : 0;
    const skins = h('div.skin-row');
    for (const s of SKINS.filter((x) => x.hero === hd.id)) {
      const th = themeById(s.theme as SkinTheme);
      const owned = p.data.ownedSkins.includes(s.id);
      const equipped = p.skinOf(hd.id) === s.id;
      skins.appendChild(h('div.skin' + ((this.previewSkin ?? p.skinOf(hd.id)) === s.id ? '.sel' : '') + (owned ? '' : '.locked'), {
        style: { background: `linear-gradient(180deg, ${hex(th.color ?? hd.color)}, ${hex(th.accent ?? hd.accent)})` },
        onclick: () => {
          this.previewSkin = s.id; this.preview(); this.drawSheet();
          if (owned && st.owned && !equipped) { p.equipSkin(s.id); audio.pop(); }
          else if (!owned) {
            app.ui.confirm(`SKIN ${th.name}`, `${th.emoji} ${s.name} — ${RARITY_LABEL[s.rarity]}. Nouveaux effets et nouvelle aura !`, `💎 ${s.price}`, () => {
              if (!st.owned) { app.ui.toast('Débloque d’abord ce héros'); return; }
              if (p.buySkin(s.id)) { p.equipSkin(s.id); audio.levelUp(); app.menu.victory(); app.ui.toast(`🎨 ${s.name} obtenu !`, '#16a06e'); }
              else { audio.error(); app.ui.toast('Pas assez de cristaux 💎'); }
            }, 'purple');
          }
        },
      }, h('div.e', th.emoji), h('div.h', th.name), owned ? (equipped ? '✔' : '') : `💎${s.price}`));
    }
    this.sheet.append(
      h('div', { style: { display: 'flex', alignItems: 'center', gap: '0.5rem' } },
        h('div', { style: { flex: '1' } },
          h('div.h.stroke', { style: { fontSize: '1.6rem', color: hex(hd.color) } }, hd.name, ' ', h('span', { style: { fontSize: '0.9rem', color: '#fff' } }, st.owned ? `NIV. ${st.level}` : '')),
          h('div', { style: { fontSize: '0.75rem', opacity: '0.85' } }, hd.title, ' · ', h('span.rar', { style: { background: RARITY_COLORS[hd.rarity] } }, RARITY_LABEL[hd.rarity]))),
        fragTarget ? h('div', { style: { width: '6.5rem' } }, h('div.progress.blue', h('i', { style: { width: `${Math.min(100, (st.fragments / fragTarget) * 100)}%` } }), h('span', `🧩 ${st.fragments}/${fragTarget}`))) : null),
      h('div', { style: { fontSize: '0.78rem', margin: '0.35rem 0', opacity: '0.9' } }, hd.desc),
      stat('❤️ Vie', hd.stats.hp * mult, 250, String(Math.round(hd.stats.hp * mult))),
      stat('🧲 Force', hd.stats.force * (1 + (mult - 1) * 0.5), 2, (hd.stats.force * (1 + (mult - 1) * 0.5)).toFixed(2)),
      stat('📏 Portée', hd.stats.range, 8, hd.stats.range.toFixed(1)),
      stat('👟 Vitesse', hd.stats.speed, 8.5, hd.stats.speed.toFixed(1)),
      stat('✋ Capacité', hd.stats.hold, 7, String(hd.stats.hold)),
      h('div.goal', h('span.gs', '✨'), h('div', h('b', hd.ability.name), h('div', { style: { fontSize: '0.72rem' } }, `${hd.ability.desc} (${hd.ability.cooldown}s)`))),
      h('div.section-title', '🎨 SKINS'), skins,
      h('div', { style: { display: 'flex', marginTop: '0.4rem' } }, action),
    );
  }
}
