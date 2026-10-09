export interface ComboTier { at: number; label: string; color: string; shake: number; slowmo: number }
export const COMBO_TIERS: ComboTier[] = [
  { at: 2, label: 'NICE', color: '#ffffff', shake: 0, slowmo: 0 },
  { at: 3, label: 'GREAT', color: '#7dffd8', shake: 0.05, slowmo: 0 },
  { at: 5, label: 'SUPER', color: '#31f5ff', shake: 0.1, slowmo: 0 },
  { at: 10, label: 'MAGNÉTIQUE !', color: '#ffd23f', shake: 0.2, slowmo: 0.12 },
  { at: 20, label: 'DÉVASTATEUR !', color: '#ff8a1f', shake: 0.3, slowmo: 0.18 },
  { at: 50, label: 'APOCALYPSE !', color: '#ff3df2', shake: 0.45, slowmo: 0.25 },
  { at: 100, label: 'SUPERESSENCE !!!', color: '#ffe14d', shake: 0.6, slowmo: 0.35 },
];

/** Combo counter with decay window; window shrinks slightly as combo grows (harder to keep). */
export class Combo {
  count = 0;
  best = 0;
  timer = 0;
  tierIndex = -1;
  onTier: ((t: ComboTier, idx: number) => void) | null = null;
  window() { return Math.max(1.6, 3.0 - this.count * 0.012); }
  add(n = 1) {
    this.count += n;
    this.timer = this.window();
    if (this.count > this.best) this.best = this.count;
    let idx = -1;
    for (let i = 0; i < COMBO_TIERS.length; i++) if (this.count >= COMBO_TIERS[i].at) idx = i;
    if (idx > this.tierIndex) { this.tierIndex = idx; this.onTier?.(COMBO_TIERS[idx], idx); }
  }
  update(dt: number) {
    if (this.count === 0) return;
    this.timer -= dt;
    if (this.timer <= 0) { this.count = 0; this.tierIndex = -1; }
  }
  /** score multiplier */
  mult() { return 1 + Math.min(this.count, 100) * 0.1; }
  ratio() { return this.count ? Math.max(0, this.timer / this.window()) : 0; }
  get tier(): ComboTier | null { return this.tierIndex >= 0 ? COMBO_TIERS[this.tierIndex] : null; }
}
