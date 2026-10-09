import { Game } from './core/Game';
import { UI } from './ui/UI';
import { MenuScene } from './menu/MenuScene';
import { Profile, initProfile, type GrantResult } from './meta/Profile';
import { audio } from './audio/Audio';
import { haptics } from './platform/Haptics';
import { bus } from './core/Events';
import type { BattleConfig, BattleResult } from './game/types';
import type { SkinTheme } from './data/skins';
import { levelById } from './data/levels';
import { currentEvent } from './data/events';
import { HEROES, heroById } from './data/heroes';
import { BOSSES } from './data/bosses';
import { leagueFor } from './data/trophies';
import type { Reward } from './data/types';
import type { ChestId } from './data/chests';

export type Mode = BattleConfig['mode'];
export const MODES: { id: Mode; name: string; emoji: string; desc: string; req: string }[] = [
  { id: 'campaign', name: 'CAMPAGNE', emoji: '🗺️', desc: '105 niveaux, 7 mondes, 7 boss.', req: '' },
  { id: 'rush', name: 'MAGNET RUSH', emoji: '⏱️', desc: '60 secondes pour le meilleur score.', req: 'Niveau 5 ou 200 🏆' },
  { id: 'survival', name: 'SURVIVAL', emoji: '🛡️', desc: 'Vagues infinies. Jusqu’où iras-tu ?', req: 'Niveau 15 ou 600 🏆' },
  { id: 'bossrush', name: 'BOSS RUSH', emoji: '👹', desc: 'Les 7 boss, à la suite.', req: 'Niveau 30 ou 1200 🏆' },
  { id: 'chaos', name: 'CHAOS', emoji: '🌀', desc: 'Les règles physiques changent toutes les 15 s.', req: 'Niveau 45 ou 2000 🏆' },
];

export interface FinishSummary {
  result: BattleResult;
  rewards: GrantResult[];
  trophies: number;
  newStars: number;
  leagueUp: string | null;
  unlockedHeroes: string[];
  record: boolean;
}

/** Glue between the 3D game, meta progression and UI. */
export class App {
  game: Game;
  ui: UI;
  menu: MenuScene;
  profile: Profile;
  mode: Mode = 'campaign';
  lastConfig: BattleConfig | null = null;

  constructor(public root: HTMLElement, canvas: HTMLCanvasElement, uiRoot: HTMLElement, public floatLayer: HTMLElement) {
    this.profile = initProfile();
    this.game = new Game(canvas, root);
    this.ui = new UI(uiRoot);
    this.menu = new MenuScene();
    this.applySettings();
    bus.on('settings', () => this.applySettings());
    this.refreshMenuHero('spawn');
  }

  applySettings() {
    const s = this.profile.data.settings;
    audio.setVolumes(s.sfx, s.music);
    haptics.enabled = s.haptics;
    this.game.setQuality(s.quality);
  }

  refreshMenuHero(anim: 'spawn' | 'select' = 'select') {
    const h = this.profile.selected;
    const theme = this.profile.skinOf(h.id).split(':')[1] as SkinTheme;
    this.menu.setHero(h.id, theme, anim);
  }

  showMenu(cam: 'home' | 'hero' | 'title' = 'home') {
    this.menu.setCam(cam);
    this.game.setView(this.menu);
    audio.music('menu');
  }

  /* ---------------- battle ---------------- */
  battleConfig(mode: Mode, levelId?: number): BattleConfig {
    const h = this.profile.selected;
    const ev = currentEvent().def;
    const worldsOpen = [1, 2, 3, 4, 5, 6, 7].filter((w) => this.profile.isWorldUnlocked(w));
    return {
      mode, levelId: mode === 'campaign' ? levelId ?? this.profile.nextLevel() : undefined,
      heroId: h.id, skin: this.profile.skinOf(h.id), heroLevel: this.profile.hero(h.id).level,
      world: worldsOpen[Math.floor(Math.random() * worldsOpen.length)] ?? 1,
      event: ev.mods,
      quality: this.game.qualityScalar(),
    };
  }

  startBattle(cfg: BattleConfig) {
    this.lastConfig = cfg;
    this.profile.addStat('games', 1);
    this.ui.home('battle');
    (this.ui.screens.get('battle') as any).start(cfg);
  }

  replay() { if (this.lastConfig) this.startBattle({ ...this.lastConfig, quality: this.game.qualityScalar() }); }

  finishBattle(r: BattleResult): FinishSummary {
    const p = this.profile;
    const ev = currentEvent().def;
    const coinMult = ev.mods.coinMult ?? 1;
    const rewards: Reward = { coins: 0, passXp: 0 };
    let trophies = 0, newStars = 0, record = false;
    // stats & missions
    p.addStat('kills', r.kills); p.addStat('objectKills', r.objectKills); p.addStat('explosions', r.explosionKills);
    p.addStat('ringouts', r.ringouts); p.addStat('flips', r.flips); p.addStat('abilities', r.abilities);
    p.maxStat('maxCombo', r.maxCombo); p.maxStat('bestScore', r.score);
    p.addStat('playTime', Math.round(r.time));
    if (r.victory) p.addStat('wins', 1); else p.addStat('losses', 1);
    if (r.bossKilled) p.addStat('bossKills', Math.max(1, r.bossesBeaten));

    if (r.mode === 'campaign' && r.levelId) {
      const L = levelById(r.levelId);
      const firstClear = !p.isLevelCompleted(L.id);
      if (r.victory) {
        newStars = p.recordLevel(L.id, r.stars, r.score, r.time);
        const base = 40 + L.index * 6 + L.world * 25 + r.score / 150;
        rewards.coins = Math.round(base * (firstClear ? 1 : 0.5) * coinMult) + r.coinsCollected;
        rewards.passXp = 40 + r.stars.filter(Boolean).length * 20 + (L.boss ? 60 : 0);
        if (newStars) rewards.crystals = newStars * 5;
        if (firstClear) {
          if (L.boss) {
            rewards.chest = L.world >= 4 ? 'mythic' : 'epic';
            rewards.crystals = (rewards.crystals ?? 0) + 30 + L.world * 10;
            const locked = HEROES.filter((h) => !p.hero(h.id).owned && h.unlock.type === 'fragments');
            const target = locked[0] ?? HEROES[L.world % HEROES.length];
            rewards.fragments = [{ hero: target.id, amount: 15 + L.world * 3 }];
          } else if (L.index % 5 === 0) rewards.chest = 'energy';
          else if (L.index % 3 === 0) rewards.chest = 'steel';
          else if (L.index % 2 === 0) rewards.chest = 'wood';
          trophies = 10 + newStars * 5 + (L.boss ? 20 : 0);
        } else trophies = 2 + newStars * 5;
      } else {
        rewards.coins = Math.round(r.coinsCollected * 0.5);
        rewards.passXp = 10;
        trophies = -1;
      }
      if (!p.data.tutorialDone && r.victory) p.data.tutorialDone = true;
    } else {
      const key = ({ rush: 'rushBest', survival: 'survivalBest', bossrush: 'bossRushBest', chaos: 'chaosBest' } as const)[r.mode as 'rush'];
      const val = r.mode === 'survival' ? r.wave : r.mode === 'bossrush' ? r.bossesBeaten : r.score;
      if (val > p.stat(key)) { record = true; p.data.stats[key] = val; }
      switch (r.mode) {
        case 'rush': rewards.coins = Math.round(r.score / 60); trophies = Math.round(Math.min(30, r.score / 900)) - 4; break;
        case 'survival': rewards.coins = r.wave * 30; trophies = r.wave * 2 - 6; break;
        case 'bossrush': rewards.coins = r.bossesBeaten * 250; rewards.crystals = r.bossesBeaten * 5; trophies = r.bossesBeaten * 8 - 5; if (r.bossesBeaten >= BOSSES.length) rewards.chest = 'cosmic'; break;
        case 'chaos': rewards.coins = Math.round(r.score / 50); trophies = Math.round(Math.min(35, r.score / 800)) - 4; break;
      }
      rewards.coins = Math.round((rewards.coins ?? 0) * coinMult) + r.coinsCollected;
      rewards.passXp = 50 + (record ? 30 : 0);
      if (record) trophies += 5;
    }
    const results = p.grant(rewards);
    const { leagueUp } = p.addTrophies(trophies);
    const unlockedHeroes = p.autoUnlocks();
    p.changed(true);
    return { result: r, rewards: results, trophies, newStars, leagueUp, unlockedHeroes, record };
  }

  openChest(index: number) {
    const id = this.profile.data.chests[index] as ChestId | undefined;
    if (!id) return;
    this.ui.go('chest', { index, id });
  }

  heroName(id: string) { return heroById(id).name; }
  league() { return leagueFor(this.profile.data.bestTrophies); }
}
