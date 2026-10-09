/** Small deterministic PRNG (mulberry32) so levels and loot tables are reproducible in tests. */
export class Rng {
  private s: number;
  constructor(seed = Date.now() >>> 0) { this.s = seed >>> 0; }
  next(): number {
    let t = (this.s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a: number, b: number) { return a + (b - a) * this.next(); }
  int(a: number, b: number) { return Math.floor(this.range(a, b + 1)); }
  pick<T>(arr: readonly T[]): T { return arr[Math.floor(this.next() * arr.length)]; }
  chance(p: number) { return this.next() < p; }
  weighted<T>(items: readonly { w: number; v: T }[]): T {
    const total = items.reduce((s, i) => s + i.w, 0);
    let r = this.next() * total;
    for (const i of items) { if ((r -= i.w) <= 0) return i.v; }
    return items[items.length - 1].v;
  }
}
export const rng = new Rng();
export const rand = (a: number, b: number) => a + (b - a) * Math.random();
export function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
