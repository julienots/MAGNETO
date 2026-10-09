import { describe, it, expect } from 'vitest';
import { PhysicsWorld, Body } from '../src/game/physics';
import { Combo } from '../src/game/Combo';

const body = (x: number, z: number, m = 1, r = 0.5) => { const b = new Body(); b.x = x; b.z = z; b.r = r; b.setMass(m); return b; };

describe('physics', () => {
  it('conserves momentum in a head-on collision and reports the impact', () => {
    const w = new PhysicsWorld();
    const a = w.add(body(-2, 0)); const b = w.add(body(2, 0));
    a.drag = b.drag = 0; a.vx = 10; b.vx = -10;
    let impacts = 0; w.onCollide = () => impacts++;
    for (let i = 0; i < 30; i++) w.step(1 / 60);
    expect(impacts).toBeGreaterThan(0);
    expect(a.vx).toBeLessThan(0); expect(b.vx).toBeGreaterThan(0);
    expect(Math.abs(a.vx * a.mass + b.vx * b.mass)).toBeLessThan(1e-6);
  });
  it('heavier bodies are pushed less', () => {
    const w = new PhysicsWorld();
    const light = w.add(body(-1, 0, 1)); const heavy = w.add(body(0.5, 0, 9));
    light.drag = heavy.drag = 0; light.vx = 12;
    for (let i = 0; i < 30; i++) w.step(1 / 60);
    expect(Math.abs(heavy.vx)).toBeLessThan(12 * 0.3);
  });
  it('walls and safety bounds keep fast or intangible bodies inside', () => {
    const w = new PhysicsWorld();
    w.addWall(5, -10, 10, 10);
    w.bounds = { x0: -5, z0: -5, x1: 5, z1: 5 };
    const b = w.add(body(0, 0)); b.drag = 0; b.vx = 40; b.ghost = true;
    for (let i = 0; i < 120; i++) w.step(1 / 60);
    expect(b.x).toBeLessThanOrEqual(5);
  });
  it('friction slows bodies down', () => {
    const w = new PhysicsWorld();
    const b = w.add(body(0, 0)); b.vx = 10; b.drag = 4;
    for (let i = 0; i < 60; i++) w.step(1 / 60);
    expect(b.vx).toBeLessThan(1);
  });
});

describe('combo', () => {
  it('fires each tier once and decays after its window', () => {
    const c = new Combo(); const tiers: string[] = [];
    c.onTier = (t) => tiers.push(t.label);
    for (let i = 0; i < 12; i++) c.add();
    expect(c.count).toBe(12);
    expect(tiers).toEqual(['NICE', 'GREAT', 'SUPER', 'MAGNÉTIQUE !']);
    expect(c.mult()).toBeCloseTo(2.2);
    c.update(5);
    expect(c.count).toBe(0);
    expect(c.best).toBe(12);
  });
});
