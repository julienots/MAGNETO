import { h, clear, hex } from '../dom';
import type { App } from '../../App';
import { MODES, type Mode } from '../../App';
import { bus } from '../../core/Events';
import { formatNum } from '../../core/math';
import { MISSION_POOL } from '../../data/missions';
import { currentEvent, GAME_EVENTS } from '../../data/events';
import { audio } from '../../audio/Audio';

/** Live top bar: avatar/name/trophies + coins + crystals. */
export function topbar(app: App, opts: { back?: boolean; title?: string } = {}) {
  const p = app.profile;
  const coins = h('span'), crystals = h('span'), name = h('div.h', { style: { fontSize: '0.95rem' } }), tro = h('div', { style: { fontSize: '0.75rem', color: '#ffd23f' } });
  const av = h('div.avatar.h');
  const coinPill = h('div.pill', h('span.ic', '🪙'), coins, h('span.plus', { 'data-tap': 1, onclick: () => app.ui.go('shop', 'featured') }, '+'));
  const cryPill = h('div.pill', h('span.ic', '💎'), crystals, h('span.plus', { 'data-tap': 1, onclick: () => app.ui.go('shop', 'crystals') }, '+'));
  let lastC = p.data.coins, lastK = p.data.crystals;
  const left = opts.back
    ? h('div', { style: { display: 'flex', alignItems: 'center', gap: '0.5rem', flex: '1' } }, h('button.btn.dark.round', { onclick: () => app.ui.back() }, '◀'), h('div.h.stroke', { style: { fontSize: '1.5rem' } }, opts.title ?? ''))
    : h('div.profile-chip', { 'data-tap': 1, onclick: () => app.ui.go('profile'), style: { flex: '1' } }, av, h('div', name, tro));
  const el = h('div.topbar', left, coinPill, cryPill);
  const update = () => {
    coins.textContent = formatNum(p.data.coins); crystals.textContent = formatNum(p.data.crystals);
    name.textContent = p.data.name;
    const lg = app.league();
    tro.textContent = `${lg.icon} ${formatNum(p.data.trophies)} 🏆`;
    const hero = p.selected;
    av.textContent = hero.name[0]; av.style.background = hex(hero.color);
    if (p.data.coins !== lastC) { coinPill.classList.remove('bump'); void coinPill.offsetWidth; coinPill.classList.add('bump'); lastC = p.data.coins; }
    if (p.data.crystals !== lastK) { cryPill.classList.remove('bump'); void cryPill.offsetWidth; cryPill.classList.add('bump'); lastK = p.data.crystals; }
  };
  update();
  bus.on('profile', update);
  return el;
}

export function modePicker(app: App, onPick: (m: Mode) => void) {
  const p = app.profile;
  const best: Record<string, string> = {
    rush: `Record : ${formatNum(p.stat('rushBest'))}`, survival: `Record : vague ${p.stat('survivalBest')}`,
    bossrush: `Record : ${p.stat('bossRushBest')}/7 boss`, chaos: `Record : ${formatNum(p.stat('chaosBest'))}`,
    campaign: `${p.totalStars()} ⭐ · niveau ${p.nextLevel()}`,
  };
  const list = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '0.5rem' } });
  for (const m of MODES) {
    const ok = p.modeUnlocked(m.id);
    list.appendChild(h(`button.btn.${ok ? (m.id === app.mode ? 'yellow' : 'blue') : 'gray'}${ok ? '' : '.off'}`, {
      style: { justifyContent: 'flex-start', textAlign: 'left', padding: '0.6rem 0.8rem 0.75rem' },
      onclick: () => { if (!ok) { audio.error(); app.ui.toast(`🔒 Débloqué : ${m.req}`); return; } app.ui.closeModal(); onPick(m.id); },
    }, h('span', { style: { fontSize: '2rem' } }, ok ? m.emoji : '🔒'),
      h('div', h('div', m.name), h('div', { style: { fontFamily: 'Nunito', fontSize: '0.7rem', marginTop: '0.15rem' } }, ok ? `${m.desc} ${best[m.id] ?? ''}` : m.req))));
  }
  app.ui.modal(h('div', h('div.mt.stroke', 'MODES DE JEU'), list));
}

export function settingsModal(app: App) {
  const s = app.profile.data.settings;
  const save = () => { app.profile.changed(true); bus.emit('settings'); };
  const slider = (key: 'sfx' | 'music') => {
    const i = h('input.slider', { type: 'range', min: 0, max: 1, step: 0.05, value: s[key] }) as HTMLInputElement;
    i.addEventListener('input', () => { s[key] = Number(i.value); save(); if (key === 'sfx') audio.tap(); });
    return i;
  };
  const toggle = (key: 'haptics' | 'shake' | 'showFps') => {
    const t = h('div.toggle' + (s[key] ? '.on' : ''));
    t.addEventListener('click', () => { s[key] = !s[key]; t.classList.toggle('on', s[key]); save(); });
    return t;
  };
  const seg = h('div.seg');
  const drawSeg = () => {
    clear(seg);
    for (const [q, l] of [['low', 'BAS'], ['medium', 'MOYEN'], ['high', 'HAUT']] as const) seg.appendChild(h(`button.btn.small.${s.quality === q ? 'yellow' : 'dark'}`, { onclick: () => { s.quality = q; save(); drawSeg(); } }, l));
  };
  drawSeg();
  const name = h('button.btn.small.blue', { onclick: () => {
    const n = prompt('Ton pseudo :', app.profile.data.name);
    if (n && n.trim()) { app.profile.data.name = n.trim().slice(0, 14); save(); name.textContent = app.profile.data.name + ' ✏️'; }
  } }, app.profile.data.name + ' ✏️');
  app.ui.modal(h('div',
    h('div.mt.stroke', 'PARAMÈTRES'),
    h('div.scroll', { style: { maxHeight: '60vh' } },
      h('div.set-row', '🔊 Effets sonores', slider('sfx')),
      h('div.set-row', '🎵 Musique', slider('music')),
      h('div.set-row', '📳 Vibrations', toggle('haptics')),
      h('div.set-row', '📷 Tremblement caméra', toggle('shake')),
      h('div.set-row', '✨ Qualité graphique', seg),
      h('div.set-row', '📈 Afficher FPS', toggle('showFps')),
      h('div.set-row', '👤 Pseudo', name),
      h('div.set-row', '☁️ Sauvegarde', h('span', { style: { fontSize: '0.75rem', opacity: '0.8' } }, 'Locale (cloud bientôt)')),
      h('div.set-row', '♻️ Progression', h('button.btn.small.red', { onclick: () => app.ui.confirm('RÉINITIALISER ?', 'Toute ta progression sera effacée définitivement.', 'EFFACER', () => { app.profile.reset(); location.reload(); }, 'red') }, 'Réinitialiser')),
      h('div', { style: { textAlign: 'center', fontSize: '0.7rem', opacity: '0.6', marginTop: '0.8rem' } }, `MAGNET WAR v${__APP_VERSION__} · © SUPERESSENCE`))));
}

export function missionsModal(app: App) {
  const p = app.profile;
  const body = h('div');
  const draw = () => {
    clear(body);
    for (const m of p.data.missions.list) {
      const def = MISSION_POOL.find((d) => d.id === m.id)!;
      const done = m.progress >= def.target;
      body.appendChild(h('div.mission',
        h('div', { style: { fontSize: '1.8rem' } }, m.claimed ? '✅' : done ? '🎁' : '🎯'),
        h('div.mi', def.label, h('div.progress.yellow', h('i', { style: { width: `${Math.min(100, (m.progress / def.target) * 100)}%` } }), h('span', `${Math.min(m.progress, def.target)}/${def.target}`)),
          h('div', { style: { fontSize: '0.65rem', marginTop: '0.2rem', opacity: '0.85' } }, `🪙 ${def.coins}  🎟️ ${def.passXp} XP`)),
        h(`button.btn.small.${done && !m.claimed ? 'green' : 'gray'}${done && !m.claimed ? '' : '.off'}`, {
          onclick: () => { const r = p.claimMission(m.id); if (r) { app.ui.closeModal(); app.ui.rewards('MISSION ACCOMPLIE !', r, () => missionsModal(app)); } else audio.error(); },
        }, m.claimed ? 'FAIT' : 'RÉCUPÉRER')));
    }
    const reset = new Date(); reset.setUTCHours(24, 0, 0, 0);
    const hrs = Math.max(0, Math.round((reset.getTime() - Date.now()) / 3600000));
    body.appendChild(h('div', { style: { textAlign: 'center', fontSize: '0.75rem', opacity: '0.75' } }, `Nouvelles missions dans ${hrs} h`));
  };
  draw();
  app.ui.modal(h('div', h('div.mt.stroke', 'MISSIONS DU JOUR'), body));
}

export function eventsModal(app: App) {
  const cur = currentEvent();
  const days = Math.max(0, Math.ceil((cur.endsAt - Date.now()) / 86400000));
  const list = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '0.5rem' } });
  GAME_EVENTS.forEach((e) => {
    const on = e.id === cur.def.id;
    list.appendChild(h('div.panel', { style: { padding: '0.6rem 0.7rem', display: 'flex', gap: '0.6rem', alignItems: 'center', background: on ? `linear-gradient(180deg, ${e.color}, #2a1f4f)` : undefined, opacity: on ? '1' : '0.6' } },
      h('div', { style: { fontSize: '2.2rem' } }, e.emoji),
      h('div', { style: { flex: '1' } }, h('div.h', { style: { fontSize: '1.1rem' } }, e.name), h('div', { style: { fontSize: '0.75rem' } }, e.desc),
        h('div', { style: { fontSize: '0.7rem', marginTop: '0.2rem', color: '#ffd23f' } }, on ? `EN COURS · encore ${days} j · Butin ×${e.mods.coinMult ?? 1}` : 'Bientôt'))));
  });
  app.ui.modal(h('div', h('div.mt.stroke', 'ÉVÉNEMENTS'), list, h('div', { style: { textAlign: 'center', marginTop: '0.8rem' } }, h('button.btn.yellow', { onclick: () => { app.ui.closeModal(); app.ui.go('shop', 'event'); } }, 'BOUTIQUE ÉVÉNEMENT'))));
}

declare global { const __APP_VERSION__: string; }
