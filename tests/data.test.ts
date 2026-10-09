import { describe, it, expect } from 'vitest';
import { LEVELS } from '../src/data/levels';
import { WORLDS } from '../src/data/worlds';
import { ENEMIES } from '../src/data/enemies';
import { HEROES } from '../src/data/heroes';
import { SKINS } from '../src/data/skins';
import { BOSSES } from '../src/data/bosses';
import { PASS } from '../src/data/pass';
import { MISSION_POOL } from '../src/data/missions';

describe('campaign data', () => {
  it('has at least 100 levels across 7 worlds, each world ending on a boss', () => {
    expect(LEVELS.length).toBeGreaterThanOrEqual(100);
    expect(WORLDS).toHaveLength(7);
    for (const w of WORLDS) {
      const ls = LEVELS.filter((l) => l.world === w.id);
      expect(ls.length).toBe(15);
      expect(ls[14].objective.type).toBe('boss');
      expect(ls[14].boss).toBe(w.boss);
    }
  });
  it('every level is well formed', () => {
    const names = new Set<string>();
    for (const l of LEVELS) {
      expect(l.waves.length).toBeGreaterThan(0);
      for (const w of l.waves) for (const e of w.enemies) { expect(ENEMIES[e.kind], `${l.id} ${e.kind}`).toBeTruthy(); expect(e.count).toBeGreaterThan(0); }
      expect(l.props.reduce((a, p) => a + p.count, 0)).toBeGreaterThan(0);
      expect(l.parTime).toBeGreaterThan(0);
      expect(l.scoreTarget).toBeGreaterThan(0);
      expect(l.special.label.length).toBeGreaterThan(3);
      names.add(l.name);
    }
    expect(names.size).toBe(LEVELS.length); // every level has its own idea/name
  });
  it('ring-out levels always contain a lethal hazard', () => {
    const lethal = ['press', 'fence', 'lava', 'pit', 'gravityWell'];
    for (const l of LEVELS.filter((x) => x.objective.type === 'ringout')) expect(l.mechanics.some((m) => lethal.includes(m)), `level ${l.id}`).toBe(true);
  });
  it('collect levels provide enough cells', () => {
    for (const l of LEVELS.filter((x) => x.objective.type === 'collect')) {
      const cells = l.props.find((p) => p.kind === 'cell')?.count ?? 0;
      expect(cells, `level ${l.id}`).toBeGreaterThanOrEqual(l.objective.target);
    }
  });
  it('introduces new enemies progressively', () => {
    const firstSeen = new Map<string, number>();
    for (const l of LEVELS) for (const w of l.waves) for (const e of w.enemies) if (!firstSeen.has(e.kind)) firstSeen.set(e.kind, l.id);
    expect(firstSeen.size).toBe(Object.keys(ENEMIES).length);
    expect(firstSeen.get('drone')).toBe(1);
    expect(firstSeen.get('chaos')!).toBeGreaterThan(firstSeen.get('tank')!);
  });
  it('heroes, skins, bosses, pass and missions are consistent', () => {
    expect(HEROES.length).toBeGreaterThanOrEqual(7);
    expect(new Set(HEROES.map((h) => h.id)).size).toBe(HEROES.length);
    expect(SKINS.length).toBe(HEROES.length * 7);
    expect(BOSSES).toHaveLength(7);
    expect(PASS).toHaveLength(40);
    expect(PASS.some((t) => t.premium.hero === 'phase')).toBe(true);
    for (const m of MISSION_POOL) expect(m.target).toBeGreaterThan(0);
  });
});
