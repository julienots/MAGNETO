import { h, clear } from '../dom';
import type { App, FinishSummary } from '../../App';
import type { Screen } from '../UI';
import { Battle } from '../../game/Battle';
import { Input } from '../../game/Input';
import type { BattleConfig, BattleResult } from '../../game/types';
import { audio, type Mood } from '../../audio/Audio';
import { haptics } from '../../platform/Haptics';
import { formatNum } from '../../core/math';
import { levelById, LEVELS } from '../../data/levels';
import { heroById } from '../../data/heroes';
import { worldById } from '../../data/worlds';
import { settingsModal } from './common';
import type { ComboTier } from '../../game/Combo';
import { LEAGUES } from '../../data/trophies';

const MOOD: Record<number, Mood> = { 1: 'drive', 2: 'neon', 3: 'space', 4: 'heavy', 5: 'ice', 6: 'cosmic', 7: 'void' };

export class BattleScreen implements Screen {
  el = h('div.screen');
  battle: Battle | null = null;
  input: Input | null = null;
  paused = false;
  private zone = h('div.touch-zone');
  private hud = h('div.hud');
  private overlay = h('div', { style: { position: 'absolute', inset: '0', pointerEvents: 'none' } });
  private vignette = h('div.vignette');
  // hud parts
  private hpFill = h('i'); private hpLag = h('i.lag'); private hpTxt = h('span'); private hpBar = h('div.hp-bar', this.hpLag, this.hpFill, this.hpTxt);
  private objTxt = h('span'); private objP = h('span.p');
  private score = h('div.sc.stroke'); private timeEl = h('div.tm.stroke'); private coinsEl = h('div.coins.stroke');
  private bossBox = h('div.boss-bar.hidden'); private bossName = h('span'); private bossPhase = h('span', { style: { fontSize: '0.8rem', color: '#ffd23f' } });
  private bossFill = h('i'); private bossLag = h('i.lag'); private bossBar = h('div.hp-bar', this.bossLag, this.bossFill);
  private combo = h('div.combo.hidden'); private comboX = h('div.cx.stroke'); private comboL = h('div.cl.stroke'); private comboT = h('i');
  private polBtn = h('div.pol-btn'); private polIcon = h('span'); private polLbl = h('small'); private heldEl = h('div.held.hidden');
  private abilBtn = h('div.abil-btn'); private abilFill = h('div.cdfill');
  private inverted = h('div.inverted.stroke.hidden', '🔄 POLARITÉ INVERSÉE');
  private fpsEl = h('div.fps');
  private last: Record<string, any> = {};
  private hudT = 0;
  private visHandler = () => { if (document.hidden) this.pause(); };

  constructor(private app: App) {
    this.polBtn.append(this.polIcon, this.polLbl, this.heldEl);
    this.abilBtn.append(this.abilFill, h('span', '✨'));
    const pauseBtn = h('button.btn.dark.round.pause', { onclick: () => this.pause() }, 'II');
    this.bossBox.append(h('div.bn.stroke', this.bossName, this.bossPhase), this.bossBar);
    this.combo.append(this.comboX, this.comboL, h('div.ct', this.comboT));
    this.hud.append(
      h('div.top', h('div.hp-box', this.hpBar, h('div.obj', this.objTxt, this.objP)), h('div.score-box', this.score, this.timeEl, this.coinsEl), pauseBtn),
      this.bossBox, this.combo, this.inverted,
      h('div.controls', this.abilBtn, this.polBtn),
    );
    this.el.append(this.vignette, this.zone, this.hud, this.overlay, this.fpsEl);
    const tapBtn = (el: HTMLElement, fn: () => void) => el.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); el.classList.add('press'); setTimeout(() => el.classList.remove('press'), 120); fn(); });
    tapBtn(this.polBtn, () => this.input?.push({ type: 'flip' }));
    tapBtn(this.abilBtn, () => this.input?.push({ type: 'ability' }));
  }

  start(cfg: BattleConfig) {
    this.cleanup();
    const app = this.app;
    clear(this.overlay);
    this.paused = false;
    this.input = new Input(this.zone, this.el);
    const b = new Battle(cfg, app.game.w / app.game.h, app.floatLayer);
    this.battle = b;
    b.input = this.input;
    b.resize(app.game.w / app.game.h, app.game.h);
    b.rig.shakeEnabled = app.profile.data.settings.shake;
    b.onBanner = (t, s, c, d) => this.banner(t, s, c, d);
    b.onTier = (t, i) => this.tier(t, i);
    b.onTip = (t) => this.tip(t);
    b.onFlash = (c, a) => app.ui.flash(c, a);
    b.onEnd = (r) => this.finish(r);
    const view = {
      scene: b.scene, camera: b.rig.cam,
      update: (dt: number) => this.frame(dt),
      resize: (w: number, hh: number) => b.resize(w / hh, hh),
    };
    app.game.setView(view);
    audio.music(b.boss ? 'boss' : MOOD[b.world.id] ?? 'drive');
    // intro: name card + countdown
    const L = cfg.levelId ? levelById(cfg.levelId) : null;
    const title = L ? (L.boss ? '👹 BOSS' : `NIVEAU ${L.id}`) : { rush: 'MAGNET RUSH', survival: 'SURVIVAL', bossrush: 'BOSS RUSH', chaos: 'CHAOS', campaign: '' }[cfg.mode];
    this.banner(title, L ? L.name : worldById(b.world.id).name, '#ffd23f', 1.3);
    const cd = h('div.countdown.stroke');
    this.overlay.appendChild(cd);
    const steps = ['3', '2', '1', 'GO !'];
    steps.forEach((s, i) => setTimeout(() => {
      if (this.battle !== b) return;
      clear(cd); cd.appendChild(h('span', { style: { color: i === 3 ? '#ffd23f' : '#fff' } }, s));
      audio.countdown(i === 3); haptics.light();
      if (i === 3) { setTimeout(() => cd.remove(), 600); b.begin(); }
    }, 1300 + i * 520));
    document.addEventListener('visibilitychange', this.visHandler);
    this.hudT = 0; this.last = {};
  }

  private frame(dt: number) {
    const b = this.battle;
    if (!b) return;
    if (this.paused) { b.rig.update(0); return; }
    // inputs
    if (this.input && b.state === 'play') {
      for (const ev of this.input.poll()) {
        if (ev.type === 'flip') b.flip();
        else if (ev.type === 'dash') b.dash(ev.x, ev.z);
        else if (ev.type === 'ability') b.useAbility();
        else if (ev.type === 'pause') this.pause();
      }
    }
    b.update(dt);
    b.ft.update(dt, b.rig, this.app.game.w, this.app.game.h);
    this.hudT -= dt;
    if (this.hudT <= 0) { this.hudT = 1 / 30; this.updateHud(); }
  }

  private set(key: string, v: any, fn: () => void) { if (this.last[key] !== v) { this.last[key] = v; fn(); } }

  private updateHud() {
    const b = this.battle!;
    const s = b.hud();
    const hpPct = Math.max(0, (s.hp / s.maxHp) * 100);
    this.set('hp', Math.round(hpPct), () => {
      this.hpFill.style.width = hpPct + '%'; this.hpLag.style.width = hpPct + '%';
      this.hpTxt.textContent = `❤️ ${Math.ceil(s.hp)}/${s.maxHp}`;
      this.hpBar.classList.toggle('low', hpPct < 30);
      this.vignette.classList.toggle('low', hpPct < 25 && hpPct > 0);
    });
    this.set('obj', s.objective, () => (this.objTxt.textContent = s.objective));
    this.set('objp', s.progressText, () => (this.objP.textContent = s.progressText));
    this.set('score', s.score, () => (this.score.textContent = formatNum(s.score)));
    const tt = s.timeLeft !== null ? `⏱ ${Math.ceil(s.timeLeft)}s` : `⏱ ${Math.floor(s.time / 60)}:${String(Math.floor(s.time % 60)).padStart(2, '0')}`;
    this.set('time', tt, () => (this.timeEl.textContent = tt));
    this.set('coins', s.coins, () => (this.coinsEl.textContent = `🪙 ${s.coins}`));
    // boss
    this.set('boss', !!s.boss, () => this.bossBox.classList.toggle('hidden', !s.boss));
    if (s.boss) {
      this.set('bossn', s.boss.name, () => (this.bossName.textContent = s.boss!.name));
      this.set('bossp', s.boss.phase, () => { this.bossPhase.textContent = s.boss!.phase; this.bossBar.classList.toggle('final', s.boss!.phase === 'FINAL'); });
      const w = Math.max(0, s.boss.hp * 100);
      this.set('bossh', Math.round(w * 4), () => { this.bossFill.style.width = w + '%'; this.bossLag.style.width = w + '%'; });
    }
    // combo
    this.set('combo', s.combo, () => {
      this.combo.classList.toggle('hidden', s.combo < 2);
      if (s.combo >= 2) {
        this.comboX.textContent = `×${s.combo}`;
        this.combo.classList.remove('pop'); void this.combo.offsetWidth; this.combo.classList.add('pop');
      }
    });
    this.set('ctier', s.comboTier, () => {
      this.comboL.textContent = s.comboTier ?? '';
      this.combo.style.color = s.comboColor;
      this.combo.className = 'combo pop' + (s.combo < 2 ? ' hidden' : '') + ` t${['NICE', 'GREAT', 'SUPER', 'MAGNÉTIQUE !', 'DÉVASTATEUR !', 'APOCALYPSE !', 'SUPERESSENCE !!!'].indexOf(s.comboTier ?? '')}`;
      this.vignette.classList.toggle('tier', s.combo >= 10);
      this.vignette.style.setProperty('--tc', s.comboColor + '77');
    });
    this.comboT.style.width = `${s.comboRatio * 100}%`;
    // controls
    this.set('pol', s.polarity, () => {
      this.polBtn.classList.toggle('neg', s.polarity < 0);
      this.polIcon.textContent = s.polarity > 0 ? '+' : '−';
      this.polLbl.textContent = s.polarity > 0 ? 'ATTIRE' : 'REPOUSSE';
    });
    this.set('held', s.held, () => { this.heldEl.classList.toggle('hidden', s.held === 0); this.heldEl.textContent = `${s.held}/${s.holdMax}`; });
    const ab = Math.round(Math.min(1, s.ability) * 40);
    this.set('abil', ab, () => { this.abilFill.style.height = `${(1 - Math.min(1, s.ability)) * 100}%`; });
    this.set('abilr', s.abilityReady, () => { this.abilBtn.classList.toggle('ready', s.abilityReady); this.abilBtn.classList.toggle('cd', !s.abilityReady); if (s.abilityReady && this.battle?.state === 'play') audio.pop(); });
    this.set('inv', s.inverted, () => this.inverted.classList.toggle('hidden', !s.inverted));
    const showFps = this.app.profile.data.settings.showFps;
    this.fpsEl.textContent = showFps ? `${this.app.game.fps} FPS · ${this.app.game.renderer.info.render.calls} DC` : '';
  }

  banner(title: string, sub?: string, color = '#fff', dur = 1.4) {
    const el = h('div.banner', h('div.bt.stroke', { style: { color } }, title), sub ? h('div.bs.stroke', sub) : null);
    this.overlay.appendChild(el);
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 300); }, dur * 1000);
  }
  private tier(t: ComboTier, i: number) {
    if (i < 2) return;
    const el = h('div.tier-flash.stroke', { style: { color: t.color } }, t.label);
    this.overlay.appendChild(el);
    setTimeout(() => el.remove(), 1000);
    if (i >= 3) this.app.ui.flash(t.color, 0.15 + i * 0.04);
  }
  private tip(text: string) {
    const el = h('div.tip.panel', { html: '💡 ' + text.replace(/(🔴[^.!]*|🔵[^.!]*|TAPE|PROJETER|ATTIRE)/g, '<b>$1</b>') });
    this.overlay.appendChild(el);
    const kill = () => { el.style.transition = 'opacity 0.3s'; el.style.opacity = '0'; setTimeout(() => el.remove(), 300); };
    setTimeout(kill, 6500);
    el.addEventListener('pointerdown', kill);
  }

  pause() {
    if (!this.battle || this.paused || this.battle.state === 'end') return;
    this.paused = true;
    audio.field(0, 1);
    audio.suspend();
    const app = this.app, cfg = this.battle.cfg;
    const L = cfg.levelId ? levelById(cfg.levelId) : null;
    const resume = () => { this.paused = false; audio.resume(); };
    const content = h('div',
      h('div.mt.stroke', 'PAUSE'),
      L ? h('div', { style: { textAlign: 'center', fontSize: '0.85rem', marginBottom: '0.6rem' } }, `Niveau ${L.id} · ${L.name}`) : null,
      L ? h('div', { style: { fontSize: '0.8rem', marginBottom: '0.8rem' } }, [`⭐ < ${L.parTime}s`, `⭐ Score ≥ ${L.scoreTarget.toLocaleString('fr-FR')}`, `⭐ ${L.special.label}`].map((t) => h('div.goal', t))) : null,
      h('div', { style: { display: 'flex', flexDirection: 'column', gap: '0.55rem' } },
        h('button.btn.green.big', { onclick: () => { app.ui.closeModal(); } }, '▶ REPRENDRE'),
        h('button.btn.blue', { onclick: () => { app.ui.closeModal(); audio.resume(); app.replay(); } }, '↻ RECOMMENCER'),
        h('button.btn.dark', { onclick: () => settingsModal(app) }, '⚙️ PARAMÈTRES'),
        h('button.btn.red', { onclick: () => app.ui.confirm('QUITTER ?', 'La progression de cette partie sera perdue.', 'QUITTER', () => { app.ui.closeModal(); audio.resume(); this.quit(); }, 'red') }, '✕ QUITTER')),
    );
    app.ui.modal(content, { onClose: resume });
  }
  onBack() { if (this.battle && this.battle.state !== 'end') { if (!this.paused) this.pause(); return true; } return false; }

  quit() { this.cleanup(); this.app.ui.home(); }

  private finish(r: BattleResult) {
    const sum = this.app.finishBattle(r);
    this.results(sum);
  }

  private results(sum: FinishSummary) {
    const app = this.app, r = sum.result;
    const L = r.levelId ? levelById(r.levelId) : null;
    const win = r.victory;
    const stars = h('div.stars', [0, 1, 2].map((i) => h('span.star', '⭐')));
    const scoreEl = h('b', '0');
    const lines: [string, string][] = [
      ['Score', ''], ['Temps', `${Math.floor(r.time / 60)}:${String(Math.floor(r.time % 60)).padStart(2, '0')}`], ['Ennemis détruits', String(r.kills)],
      ['Meilleur combo', `×${r.maxCombo}`], ['Réaction en chaîne max', String(r.maxChain)], ['Kills avec objets', String(r.objectKills)], ['Kills explosifs', String(r.explosionKills)],
    ];
    if (r.mode === 'survival') lines.push(['Vague atteinte', String(r.wave)]);
    if (r.mode === 'bossrush') lines.push(['Boss vaincus', `${r.bossesBeaten}/7`]);
    const card = h('div.panel.res-card', lines.map(([k, v], i) => h('div.res-line', k, i === 0 ? scoreEl : h('b', v))),
      L ? h('div', { style: { marginTop: '0.4rem' } }, r.starLabels.map((t, i) => h('div.goal', { style: { padding: '0.3rem 0.5rem' } }, h('span.gs', r.stars[i] ? '⭐' : '☆'), t))) : null,
      h('div.rewards', sum.rewards.map((g, i) => h('div.reward', { style: { animationDelay: `${0.6 + i * 0.12}s` } }, h('div.ri', g.icon), g.amount !== undefined ? h('div.ra.stroke', `+${formatNum(g.amount)}`) : null, h('div.rl', g.label))),
        sum.trophies ? h('div.reward', { style: { animationDelay: '0.5s' } }, h('div.ri', '🏆'), h('div.ra.stroke', `${sum.trophies > 0 ? '+' : ''}${sum.trophies}`), h('div.rl', 'Trophées')) : null));
    const nextId = L && win && L.id < LEVELS.length && app.profile.isLevelUnlocked(L.id + 1) ? L.id + 1 : null;
    const buttons = h('div', { style: { display: 'flex', gap: '0.5rem', width: '100%' } },
      h('button.btn.dark', { style: { flex: '1' }, onclick: () => { this.cleanup(); app.ui.home(); } }, '🏠'),
      h('button.btn.blue', { style: { flex: '1' }, onclick: () => app.replay() }, '↻ REJOUER'),
      nextId ? h('button.btn.green', { style: { flex: '1.6' }, onclick: () => app.startBattle(app.battleConfig('campaign', nextId)) }, h('span.shine'), 'SUIVANT ▶') : null);
    const title = win ? (r.mode === 'campaign' ? 'VICTOIRE !' : sum.record ? 'NOUVEAU RECORD !' : 'BRAVO !') : r.mode === 'campaign' ? 'DÉFAITE…' : 'TERMINÉ';
    const panel = h('div.screen.results.dim', { style: { pointerEvents: 'auto', zIndex: '30' } },
      h(`div.rt.stroke.${win ? 'win' : 'lose'}`, title),
      L ? stars : h('div', { style: { fontSize: '0.9rem' } }, heroById(app.profile.data.selectedHero).name),
      card, buttons);
    this.overlay.appendChild(panel);
    // juice: stars one by one, score count-up
    if (L) r.stars.forEach((on, i) => setTimeout(() => { if (on) { stars.children[i].classList.add('on'); audio.star(i); haptics.medium(); } }, 500 + i * 380));
    const t0 = performance.now();
    const count = () => { const k = Math.min(1, (performance.now() - t0) / 1100); scoreEl.textContent = formatNum(Math.round(r.score * (1 - Math.pow(1 - k, 3)))); if (k < 1) requestAnimationFrame(count); };
    requestAnimationFrame(count);
    setTimeout(() => {
      if (sum.leagueUp) { const lg = LEAGUES.find((x) => x.id === sum.leagueUp)!; this.banner(`${lg.icon} LIGUE ${lg.name} !`, 'Récompense disponible dans Profil', lg.color, 2.2); audio.levelUp(); }
      for (const id of sum.unlockedHeroes) { app.ui.toast(`🎉 Nouveau héros : ${heroById(id).name} !`, '#16a06e'); audio.levelUp(); }
    }, 1600);
    audio.music(null);
  }

  cleanup() {
    document.removeEventListener('visibilitychange', this.visHandler);
    this.input?.dispose(); this.input = null;
    if (this.battle) { this.battle.dispose(); this.battle = null; }
    clear(this.overlay);
    audio.field(0, 1);
  }
  onHide() { this.cleanup(); }
}
