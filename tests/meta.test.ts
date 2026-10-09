import { describe, it, expect } from 'vitest';
import { Profile, freshSave, migrateSave, MAX_CHESTS } from '../src/meta/Profile';
import { MemoryStorage, SaveService, checksum } from '../src/meta/SaveService';
import { buyOffer, allOffers, remaining } from '../src/meta/ShopService';
import { PASS_XP_PER_TIER } from '../src/data/pass';

const fresh = () => new Profile(new MemoryStorage());

describe('save system', () => {
  it('round-trips through storage with checksum', () => {
    const st = new MemoryStorage();
    const p = new Profile(st);
    p.data.coins = 1234; p.recordLevel(1, [true, false, true], 999, 20);
    p.changed(true);
    const q = new Profile(st);
    expect(q.data.coins).toBe(1234);
    expect(q.starsOf(1)).toBe(2);
  });
  it('falls back to the backup when the main save is corrupted', () => {
    const st = new MemoryStorage();
    const p = new Profile(st);
    p.data.coins = 777; p.changed(true);
    p.data.coins = 888; p.changed(true);
    st.set('magnetwar.save', '{"d":"{}","c":"bad"}');
    const q = new Profile(st);
    expect(q.data.coins).toBe(777);
  });
  it('migrates old/partial saves without losing progress', () => {
    const old = { v: 1, coins: 50, heroes: { mag: { owned: true, level: 4, fragments: 3 } }, levels: { 1: { stars: [true, true, true], best: 10, bestTime: 9 } }, settings: { sfx: 0.2 } };
    const d = migrateSave(old);
    expect(d.coins).toBe(50);
    expect(d.heroes.mag.level).toBe(4);
    expect(d.heroes.zero).toBeTruthy();
    expect(d.settings.sfx).toBe(0.2);
    expect(d.settings.music).toBe(freshSave().settings.music);
  });
  it('checksum detects tampering', () => {
    expect(checksum('abc')).not.toBe(checksum('abd'));
    const s = new SaveService(new MemoryStorage(), freshSave, migrateSave);
    expect(s.load().source).toBe('fresh');
  });
});

describe('progression & economy', () => {
  it('unlocks levels sequentially and worlds by boss + stars', () => {
    const p = fresh();
    expect(p.isLevelUnlocked(1)).toBe(true);
    expect(p.isLevelUnlocked(2)).toBe(false);
    p.recordLevel(1, [true, false, false], 1, 1);
    expect(p.isLevelUnlocked(2)).toBe(true);
    for (let i = 1; i <= 15; i++) p.recordLevel(i, [true, true, false], 1, 1);
    expect(p.totalStars()).toBe(30);
    expect(p.isWorldUnlocked(2)).toBe(true);
    expect(p.isLevelUnlocked(16)).toBe(true);
  });
  it('never loses stars on a worse replay and counts only new stars', () => {
    const p = fresh();
    expect(p.recordLevel(3, [true, true, false], 10, 50)).toBe(2);
    expect(p.recordLevel(3, [false, false, true], 5, 60)).toBe(1);
    expect(p.levelState(3).stars).toEqual([true, true, true]);
    expect(p.levelState(3).best).toBe(10);
  });
  it('upgrades heroes with fragments + coins, never below zero', () => {
    const p = fresh();
    expect(p.upgradeHero('mag')).toBe(false);
    p.grant({ fragments: [{ hero: 'mag', amount: 20 }], coins: 1000 });
    const coins = p.data.coins;
    expect(p.upgradeHero('mag')).toBe(true);
    expect(p.hero('mag').level).toBe(2);
    expect(p.data.coins).toBe(coins - 100);
    expect(p.hero('mag').fragments).toBe(0);
  });
  it('unlocks fragment heroes and star heroes', () => {
    const p = fresh();
    p.grant({ fragments: [{ hero: 'pulse', amount: 40 }] });
    expect(p.unlockHero('pulse')).toBe(true);
    for (let i = 1; i <= 3; i++) p.recordLevel(i, [true, true, true], 1, 1);
    expect(p.autoUnlocks()).toContain('volt');
  });
  it('duplicate skins convert to crystals', () => {
    const p = fresh();
    p.grant({ skin: 'mag:inferno' });
    const c = p.data.crystals;
    const r = p.grant({ skin: 'mag:inferno' });
    expect(r[0].kind).toBe('crystals');
    expect(p.data.crystals).toBeGreaterThan(c);
  });
});

describe('chests', () => {
  it('rolls deterministically per seed and respects tables', () => {
    const p = fresh();
    const a = p.rollChest('epic', 42), b = p.rollChest('epic', 42);
    expect(a).toEqual(b);
    expect(a.coins).toBeGreaterThanOrEqual(600);
    expect(a.coins).toBeLessThanOrEqual(900);
    const frag = a.fragments!.reduce((s, f) => s + f.amount, 0);
    expect(frag).toBeGreaterThanOrEqual(16 * 1);
  });
  it('opening removes the chest and grants its content', () => {
    const p = fresh();
    const before = p.data.coins;
    const res = p.openChest(0, 7)!;
    expect(res.chest).toBe('wood');
    expect(p.data.chests.length).toBe(0);
    expect(p.data.coins).toBeGreaterThan(before);
  });
  it('full inventory converts extra chests to coins', () => {
    const p = fresh();
    for (let i = 0; i < MAX_CHESTS + 2; i++) p.grant({ chest: 'steel' });
    expect(p.data.chests.length).toBe(MAX_CHESTS);
  });
});

describe('pass, missions, trophies, shop', () => {
  it('pass tiers are claimable once, premium requires the pass', () => {
    const p = fresh();
    p.addPassXp(PASS_XP_PER_TIER * 2);
    expect(p.passTier()).toBe(2);
    expect(p.claimPass(1, 'free')).toBeTruthy();
    expect(p.claimPass(1, 'free')).toBeNull();
    expect(p.claimPass(1, 'premium')).toBeNull();
    p.data.crystals = 1000;
    expect(p.buyPremiumPass()).toBe(true);
    expect(p.claimPass(1, 'premium')).toBeTruthy();
    expect(p.data.ownedSkins).toContain('mag:overcharge');
    expect(p.claimPass(3, 'free')).toBeNull();
  });
  it('daily missions progress and pay once', () => {
    const p = fresh();
    expect(p.data.missions.list).toHaveLength(4);
    const m = p.data.missions.list[0];
    for (let i = 0; i < 200; i++) { p.addStat(m.id.startsWith('c') ? 'maxCombo' : 'kills', 1); }
    p.maxStat('maxCombo', 50); p.addStat('wins', 5); p.addStat('flips', 100); p.addStat('abilities', 10); p.addStat('ringouts', 20); p.addStat('stars', 10); p.addStat('chests', 5); p.addStat('bossKills', 2); p.addStat('objectKills', 50); p.addStat('explosions', 20);
    for (const mm of p.data.missions.list) { expect(p.claimMission(mm.id)).toBeTruthy(); expect(p.claimMission(mm.id)).toBeNull(); }
  });
  it('trophies move leagues and league rewards are claimable once', () => {
    const p = fresh();
    expect(p.addTrophies(250).leagueUp).toBe('silver');
    expect(p.claimLeague('silver')).toBeTruthy();
    expect(p.claimLeague('silver')).toBeNull();
    p.addTrophies(-1000);
    expect(p.data.trophies).toBe(0);
    expect(p.data.bestTrophies).toBe(250);
  });
  it('shop purchases spend currency and respect limits', async () => {
    const p = fresh();
    p.data.crystals = 500;
    const starter = allOffers(p).find((o) => o.id === 'starter')!;
    const r = await buyOffer(p, starter);
    expect(r.ok).toBe(true);
    expect(p.data.crystals).toBe(500 - 99);
    expect(remaining(p, starter)).toBe(0);
    expect((await buyOffer(p, starter)).ok).toBe(false);
    const free = allOffers(p).find((o) => o.id === 'daily_free')!;
    expect((await buyOffer(p, free)).ok).toBe(true);
    expect((await buyOffer(p, free)).ok).toBe(false);
    p.data.crystals = 0;
    const chest = allOffers(p).find((o) => o.id === 'chest_epic')!;
    expect((await buyOffer(p, chest)).ok).toBe(false);
  });
});
