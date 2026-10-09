import { HEROES, heroById, heroLevelCost, HERO_MAX_LEVEL } from '../data/heroes';
import { SKINS, skinById } from '../data/skins';
import { chestById, type ChestId } from '../data/chests';
import { LEVELS } from '../data/levels';
import { WORLDS } from '../data/worlds';
import { PASS, PASS_PREMIUM_PRICE, PASS_TIERS, PASS_XP_PER_TIER, SEASON } from '../data/pass';
import { MISSION_POOL, type MissionStat } from '../data/missions';
import { LEAGUES, leagueFor } from '../data/trophies';
import type { Reward } from '../data/types';
import { Rng, hashStr } from '../core/Random';
import { bus } from '../core/Events';
import { SaveService, defaultStorage, type StorageAdapter } from './SaveService';

export const SAVE_VERSION = 3;

export interface HeroState { owned: boolean; level: number; fragments: number }
export interface LevelState { stars: [boolean, boolean, boolean]; best: number; bestTime: number }
export interface Settings { sfx: number; music: number; haptics: boolean; quality: 'low' | 'medium' | 'high'; shake: boolean; showFps: boolean }
export type StatKey = MissionStat | 'games' | 'losses' | 'damageDealt' | 'playTime' | 'bestScore' | 'rushBest' | 'survivalBest' | 'bossRushBest' | 'chaosBest' | 'chestsOpened';

export interface SaveData {
  v: number;
  createdAt: number;
  updatedAt: number;
  name: string;
  coins: number;
  crystals: number;
  heroes: Record<string, HeroState>;
  selectedHero: string;
  equippedSkin: Record<string, string>;
  ownedSkins: string[];
  levels: Record<number, LevelState>;
  chests: ChestId[];
  freeChestAt: number;
  trophies: number;
  bestTrophies: number;
  claimedLeagues: string[];
  stats: Partial<Record<StatKey, number>>;
  missions: { day: string; list: { id: string; progress: number; claimed: boolean }[] };
  pass: { season: number; xp: number; premium: boolean; claimedFree: number[]; claimedPremium: number[] };
  shop: { day: string; purchases: Record<string, number>; lifetime: Record<string, number> };
  badges: string[];
  emotes: string[];
  trails: string[];
  settings: Settings;
  tutorialDone: boolean;
  seenWorlds: number[];
}

export const MAX_CHESTS = 8;
export const FREE_CHEST_INTERVAL = 4 * 3600 * 1000;

export function freshSave(): SaveData {
  const heroes: Record<string, HeroState> = {};
  for (const h of HEROES) heroes[h.id] = { owned: h.unlock.type === 'start', level: 1, fragments: 0 };
  const now = Date.now();
  return {
    v: SAVE_VERSION, createdAt: now, updatedAt: now, name: 'Joueur',
    coins: 500, crystals: 60,
    heroes, selectedHero: 'mag', equippedSkin: {}, ownedSkins: HEROES.map((h) => `${h.id}:default`),
    levels: {}, chests: ['wood'], freeChestAt: 0,
    trophies: 0, bestTrophies: 0, claimedLeagues: ['bronze'],
    stats: {},
    missions: { day: '', list: [] },
    pass: { season: SEASON.id, xp: 0, premium: false, claimedFree: [], claimedPremium: [] },
    shop: { day: '', purchases: {}, lifetime: {} },
    badges: [], emotes: ['👋'], trails: [],
    settings: { sfx: 0.8, music: 0.55, haptics: true, quality: 'high', shake: true, showFps: false },
    tutorialDone: false,
    seenWorlds: [1],
  };
}

/** Upgrade any older/partial save to the current schema without losing progress. */
export function migrateSave(raw: any): SaveData {
  const base = freshSave();
  if (!raw || typeof raw !== 'object') return base;
  const d: SaveData = { ...base, ...raw };
  d.settings = { ...base.settings, ...(raw.settings ?? {}) };
  d.stats = { ...(raw.stats ?? {}) };
  d.pass = { ...base.pass, ...(raw.pass ?? {}) };
  d.shop = { ...base.shop, ...(raw.shop ?? {}) };
  d.shop.lifetime = { ...(raw.shop?.lifetime ?? {}) };
  d.missions = raw.missions?.list ? raw.missions : base.missions;
  // heroes added after the save was created
  d.heroes = { ...base.heroes, ...(raw.heroes ?? {}) };
  for (const h of HEROES) if (!d.heroes[h.id]) d.heroes[h.id] = base.heroes[h.id];
  for (const s of base.ownedSkins) if (!d.ownedSkins.includes(s)) d.ownedSkins.push(s);
  if (!d.heroes[d.selectedHero]?.owned) d.selectedHero = 'mag';
  if (!Array.isArray(d.chests)) d.chests = [];
  d.chests = d.chests.filter((c) => !!chestById(c)).slice(0, MAX_CHESTS);
  if (d.pass.season !== SEASON.id) d.pass = { ...base.pass };
  d.v = SAVE_VERSION;
  return d;
}

const todayKey = (now = Date.now()) => new Date(now).toISOString().slice(0, 10);

export interface GrantResult { label: string; icon: string; amount?: number; rarity?: string; kind: string; ref?: string }

export class Profile {
  data: SaveData;
  private saver: SaveService<SaveData>;
  private dirty = false;
  private timer: any = null;

  constructor(storage: StorageAdapter = defaultStorage()) {
    this.saver = new SaveService<SaveData>(storage, freshSave, migrateSave);
    this.data = this.saver.load().data;
    this.refreshDaily();
  }

  /* ---------------- persistence ---------------- */
  changed(immediate = false) {
    this.dirty = true;
    bus.emit('profile', this);
    if (immediate) return this.flush();
    if (!this.timer) this.timer = setTimeout(() => this.flush(), 400);
  }
  flush() {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    if (!this.dirty) return;
    this.dirty = false;
    this.saver.save(this.data);
  }
  reset() { this.saver.wipe(); this.data = freshSave(); this.refreshDaily(); this.changed(true); }

  /* ---------------- currencies ---------------- */
  canAfford(p: { coins?: number; crystals?: number }) {
    return (p.coins ?? 0) <= this.data.coins && (p.crystals ?? 0) <= this.data.crystals;
  }
  spend(p: { coins?: number; crystals?: number }): boolean {
    if (!this.canAfford(p)) return false;
    this.data.coins -= p.coins ?? 0;
    this.data.crystals -= p.crystals ?? 0;
    this.changed();
    return true;
  }

  /* ---------------- stats ---------------- */
  stat(k: StatKey) { return this.data.stats[k] ?? 0; }
  addStat(k: StatKey, v: number) { this.data.stats[k] = this.stat(k) + v; this.progressMission(k as MissionStat, v, 'sum'); }
  maxStat(k: StatKey, v: number) { if (v > this.stat(k)) this.data.stats[k] = v; this.progressMission(k as MissionStat, v, 'max'); }

  /* ---------------- heroes ---------------- */
  hero(id: string) { return this.data.heroes[id]; }
  get selected() { return heroById(this.data.selectedHero); }
  skinOf(heroId: string) { return this.data.equippedSkin[heroId] ?? `${heroId}:default`; }
  select(id: string) { if (this.hero(id)?.owned) { this.data.selectedHero = id; this.changed(); } }
  canUnlockWithFragments(id: string) {
    const h = heroById(id); const st = this.hero(id);
    return !st.owned && h.unlock.type === 'fragments' && st.fragments >= h.unlock.amount;
  }
  unlockHero(id: string): boolean {
    const st = this.hero(id); const h = heroById(id);
    if (!st || st.owned) return false;
    if (h.unlock.type === 'fragments') {
      if (st.fragments < h.unlock.amount) return false;
      st.fragments -= h.unlock.amount;
    } else if (h.unlock.type === 'stars') {
      if (this.totalStars() < h.unlock.amount) return false;
    } else if (h.unlock.type === 'trophies') {
      if (this.data.bestTrophies < h.unlock.amount) return false;
    } else if (h.unlock.type === 'pass') {
      return false; // granted by pass reward
    }
    st.owned = true;
    this.changed(true);
    bus.emit('heroUnlocked', id);
    return true;
  }
  /** Unlock heroes whose star/trophy requirement is now met. Returns newly unlocked ids. */
  autoUnlocks(): string[] {
    const out: string[] = [];
    for (const h of HEROES) {
      const st = this.hero(h.id);
      if (st.owned) continue;
      if ((h.unlock.type === 'stars' && this.totalStars() >= h.unlock.amount) || (h.unlock.type === 'trophies' && this.data.bestTrophies >= h.unlock.amount)) {
        st.owned = true; out.push(h.id);
      }
    }
    if (out.length) this.changed(true);
    return out;
  }
  upgradeCost(id: string) { return heroLevelCost(this.hero(id).level); }
  canUpgrade(id: string) {
    const st = this.hero(id);
    if (!st.owned || st.level >= HERO_MAX_LEVEL) return false;
    const c = heroLevelCost(st.level);
    return st.fragments >= c.fragments && this.data.coins >= c.coins;
  }
  upgradeHero(id: string): boolean {
    if (!this.canUpgrade(id)) return false;
    const st = this.hero(id); const c = heroLevelCost(st.level);
    st.fragments -= c.fragments; this.data.coins -= c.coins; st.level++;
    this.changed(true);
    return true;
  }
  equipSkin(skinId: string) {
    const s = skinById(skinId);
    if (!s || !this.data.ownedSkins.includes(skinId)) return false;
    this.data.equippedSkin[s.hero] = skinId; this.changed(); return true;
  }
  buySkin(skinId: string) {
    const s = skinById(skinId);
    if (!s || this.data.ownedSkins.includes(skinId)) return false;
    if (!this.spend({ crystals: s.price })) return false;
    this.data.ownedSkins.push(skinId); this.changed(true); return true;
  }

  /* ---------------- rewards ---------------- */
  grant(r: Reward, mult = 1): GrantResult[] {
    const out: GrantResult[] = [];
    if (r.coins) { const v = Math.round(r.coins * mult); this.data.coins += v; out.push({ kind: 'coins', label: 'Pièces', icon: '🪙', amount: v }); }
    if (r.crystals) { const v = Math.round(r.crystals * mult); this.data.crystals += v; out.push({ kind: 'crystals', label: 'Cristaux', icon: '💎', amount: v }); }
    for (const f of r.fragments ?? []) {
      const st = this.hero(f.hero); if (!st) continue;
      st.fragments += f.amount;
      out.push({ kind: 'fragments', label: `Fragments ${heroById(f.hero).name}`, icon: '🧩', amount: f.amount, ref: f.hero, rarity: heroById(f.hero).rarity });
    }
    if (r.hero) {
      const st = this.hero(r.hero);
      if (st && !st.owned) { st.owned = true; out.push({ kind: 'hero', label: heroById(r.hero).name, icon: '🧑‍🚀', ref: r.hero, rarity: heroById(r.hero).rarity }); }
      else if (st) { st.fragments += 50; out.push({ kind: 'fragments', label: `Fragments ${heroById(r.hero).name}`, icon: '🧩', amount: 50, ref: r.hero }); }
    }
    if (r.skin) {
      const s = skinById(r.skin);
      if (s && !this.data.ownedSkins.includes(r.skin)) { this.data.ownedSkins.push(r.skin); out.push({ kind: 'skin', label: s.name, icon: '🎨', ref: s.id, rarity: s.rarity }); }
      else if (s) { const v = Math.round(s.price / 3); this.data.crystals += v; out.push({ kind: 'crystals', label: 'Doublon converti', icon: '💎', amount: v }); }
    }
    if (r.chest) {
      const c = chestById(r.chest);
      if (this.data.chests.length < MAX_CHESTS) { this.data.chests.push(c.id); out.push({ kind: 'chest', label: c.name, icon: '📦', ref: c.id, rarity: c.rarity }); }
      else { const v = Math.round(c.coins[1] * 0.8); this.data.coins += v; out.push({ kind: 'coins', label: 'Coffre converti (inventaire plein)', icon: '🪙', amount: v }); }
    }
    if (r.passXp) { this.addPassXp(r.passXp); out.push({ kind: 'passXp', label: 'XP Pass', icon: '🎟️', amount: r.passXp }); }
    if (r.emote && !this.data.emotes.includes(r.emote)) { this.data.emotes.push(r.emote); out.push({ kind: 'emote', label: `Emote ${r.emote}`, icon: '😄' }); }
    if (r.trail && !this.data.trails.includes(r.trail)) { this.data.trails.push(r.trail); out.push({ kind: 'trail', label: 'Effet de traînée', icon: '✨' }); }
    if (r.badge && !this.data.badges.includes(r.badge)) { this.data.badges.push(r.badge); out.push({ kind: 'badge', label: `Badge ${r.badge}`, icon: '🏅' }); }
    this.changed(true);
    return out;
  }

  /* ---------------- chests ---------------- */
  /** Deterministic for a given seed so it can be unit tested. */
  rollChest(id: ChestId, seed = (Math.random() * 2 ** 32) >>> 0): Reward {
    const c = chestById(id); const r = new Rng(seed);
    const reward: Reward = { coins: r.int(c.coins[0], c.coins[1]), fragments: [] };
    const cr = r.int(c.crystals[0], c.crystals[1]); if (cr > 0) reward.crystals = cr;
    // fragments: favour heroes the player owns or is close to unlocking
    const pool = HEROES.filter((h) => h.unlock.type !== 'pass');
    for (let i = 0; i < c.fragmentStacks; i++) {
      const h = r.weighted(pool.map((p) => ({ v: p, w: this.hero(p.id).owned ? 3 : p.unlock.type === 'fragments' ? 4 : 1 })));
      const existing = reward.fragments!.find((f) => f.hero === h.id);
      const amt = r.int(c.fragments[0], c.fragments[1]);
      if (existing) existing.amount += amt; else reward.fragments!.push({ hero: h.id, amount: amt });
    }
    if (r.chance(c.heroChance)) {
      const locked = HEROES.filter((h) => !this.hero(h.id).owned && h.unlock.type === 'fragments');
      if (locked.length) reward.hero = r.pick(locked).id;
    }
    if (r.chance(c.skinChance)) {
      const avail = SKINS.filter((s) => !this.data.ownedSkins.includes(s.id) && s.theme !== 'default' && this.hero(s.hero).owned);
      if (avail.length) reward.skin = r.pick(avail).id;
    }
    return reward;
  }
  openChest(index: number, seed?: number): { chest: ChestId; reward: Reward; results: GrantResult[] } | null {
    const id = this.data.chests[index];
    if (!id) return null;
    this.data.chests.splice(index, 1);
    const reward = this.rollChest(id, seed);
    const results = this.grant(reward);
    this.addStat('chestsOpened', 1);
    this.progressMission('chests', 1, 'sum');
    this.changed(true);
    return { chest: id, reward, results };
  }
  freeChestReady(now = Date.now()) { return now >= this.data.freeChestAt; }
  claimFreeChest(now = Date.now()): boolean {
    if (!this.freeChestReady(now) || this.data.chests.length >= MAX_CHESTS) return false;
    this.data.chests.push(this.data.stats.wins && this.data.stats.wins > 10 ? 'steel' : 'wood');
    this.data.freeChestAt = now + FREE_CHEST_INTERVAL;
    this.changed(true);
    return true;
  }

  /* ---------------- campaign ---------------- */
  levelState(id: number): LevelState { return this.data.levels[id] ?? { stars: [false, false, false], best: 0, bestTime: 0 }; }
  starsOf(id: number) { return this.levelState(id).stars.filter(Boolean).length; }
  totalStars() { let n = 0; for (const k in this.data.levels) n += this.data.levels[k].stars.filter(Boolean).length; return n; }
  worldStars(w: number) { let n = 0; for (const l of LEVELS) if (l.world === w) n += this.starsOf(l.id); return n; }
  isLevelCompleted(id: number) { return !!this.data.levels[id]; }
  isWorldUnlocked(w: number) {
    if (w === 1) return true;
    const prevBoss = (w - 1) * 15;
    return this.isLevelCompleted(prevBoss) && this.totalStars() >= WORLDS[w - 1].starsRequired;
  }
  isLevelUnlocked(id: number) {
    const l = LEVELS[id - 1]; if (!l) return false;
    if (!this.isWorldUnlocked(l.world)) return false;
    return id === 1 || this.isLevelCompleted(id - 1);
  }
  nextLevel(): number {
    for (const l of LEVELS) if (!this.isLevelCompleted(l.id)) return this.isLevelUnlocked(l.id) ? l.id : Math.max(1, l.id - 1);
    return LEVELS.length;
  }
  /** Returns how many NEW stars were earned. */
  recordLevel(id: number, stars: [boolean, boolean, boolean], score: number, time: number): number {
    const prev = this.levelState(id);
    const merged: [boolean, boolean, boolean] = [prev.stars[0] || stars[0], prev.stars[1] || stars[1], prev.stars[2] || stars[2]];
    const gained = merged.filter(Boolean).length - prev.stars.filter(Boolean).length;
    this.data.levels[id] = { stars: merged, best: Math.max(prev.best, score), bestTime: prev.bestTime ? Math.min(prev.bestTime, time) : time };
    if (gained > 0) this.addStat('stars', gained);
    this.changed(true);
    return gained;
  }

  /* ---------------- trophies ---------------- */
  addTrophies(n: number): { leagueUp: string | null } {
    const before = leagueFor(this.data.bestTrophies).id;
    this.data.trophies = Math.max(0, this.data.trophies + n);
    this.data.bestTrophies = Math.max(this.data.bestTrophies, this.data.trophies);
    const after = leagueFor(this.data.bestTrophies).id;
    this.changed();
    return { leagueUp: before !== after ? after : null };
  }
  claimableLeagues() { return LEAGUES.filter((l) => this.data.bestTrophies >= l.min && !this.data.claimedLeagues.includes(l.id)); }
  claimLeague(id: string): GrantResult[] | null {
    const l = LEAGUES.find((x) => x.id === id);
    if (!l || this.data.bestTrophies < l.min || this.data.claimedLeagues.includes(id)) return null;
    this.data.claimedLeagues.push(id);
    const res = this.grant(l.reward);
    if (id === 'grandmaster') res.push(...this.grant({ skin: 'zero:cosmic' }));
    if (id === 'master') res.push(...this.grant({ badge: 'MASTER' }));
    return res;
  }
  modeUnlocked(mode: 'campaign' | 'rush' | 'survival' | 'bossrush' | 'chaos') {
    const t = this.data.bestTrophies;
    switch (mode) {
      case 'campaign': return true;
      case 'rush': return t >= 200 || this.isLevelCompleted(5);
      case 'survival': return t >= 600 || this.isLevelCompleted(15);
      case 'bossrush': return t >= 1200 || this.isLevelCompleted(30);
      case 'chaos': return t >= 2000 || this.isLevelCompleted(45);
    }
  }

  /* ---------------- pass ---------------- */
  passTier() { return Math.min(PASS_TIERS, Math.floor(this.data.pass.xp / PASS_XP_PER_TIER)); }
  addPassXp(xp: number) { this.data.pass.xp = Math.min(this.data.pass.xp + xp, PASS_TIERS * PASS_XP_PER_TIER); this.changed(); }
  buyPremiumPass(): boolean {
    if (this.data.pass.premium) return false;
    if (!this.spend({ crystals: PASS_PREMIUM_PRICE })) return false;
    this.data.pass.premium = true; this.changed(true); return true;
  }
  canClaimPass(tier: number, track: 'free' | 'premium') {
    if (tier > this.passTier()) return false;
    if (track === 'premium' && !this.data.pass.premium) return false;
    const list = track === 'free' ? this.data.pass.claimedFree : this.data.pass.claimedPremium;
    return !list.includes(tier);
  }
  claimPass(tier: number, track: 'free' | 'premium'): GrantResult[] | null {
    if (!this.canClaimPass(tier, track)) return null;
    (track === 'free' ? this.data.pass.claimedFree : this.data.pass.claimedPremium).push(tier);
    const t = PASS[tier - 1];
    return this.grant(track === 'free' ? t.free : t.premium);
  }

  /* ---------------- missions (daily) ---------------- */
  refreshDaily(now = Date.now()) {
    const day = todayKey(now);
    if (this.data.missions.day !== day) {
      const r = new Rng(hashStr(day));
      const pool = [...MISSION_POOL]; const list = [];
      for (let i = 0; i < 4 && pool.length; i++) list.push({ id: pool.splice(r.int(0, pool.length - 1), 1)[0].id, progress: 0, claimed: false });
      this.data.missions = { day, list };
    }
    if (this.data.shop.day !== day) this.data.shop = { day, purchases: {}, lifetime: this.data.shop.lifetime ?? {} };
  }
  progressMission(stat: MissionStat, v: number, mode: 'sum' | 'max') {
    for (const m of this.data.missions.list) {
      const def = MISSION_POOL.find((d) => d.id === m.id);
      if (!def || def.stat !== stat || m.claimed) continue;
      if (def.mode === 'max' && mode === 'max') m.progress = Math.max(m.progress, v);
      else if (def.mode === 'sum' && mode === 'sum') m.progress += v;
    }
  }
  claimMission(id: string): GrantResult[] | null {
    const m = this.data.missions.list.find((x) => x.id === id);
    const def = MISSION_POOL.find((d) => d.id === id);
    if (!m || !def || m.claimed || m.progress < def.target) return null;
    m.claimed = true;
    return this.grant({ coins: def.coins, passXp: def.passXp });
  }

  /* ---------------- shop limits ---------------- */
  purchases(offerId: string, lifetime = false) { return (lifetime ? this.data.shop.lifetime[offerId] : this.data.shop.purchases[offerId]) ?? 0; }
  recordPurchase(offerId: string) {
    this.data.shop.purchases[offerId] = this.purchases(offerId) + 1;
    this.data.shop.lifetime[offerId] = this.purchases(offerId, true) + 1;
    this.changed(true);
  }
}

export let profile: Profile;
export function initProfile(storage?: StorageAdapter) { profile = new Profile(storage); return profile; }
