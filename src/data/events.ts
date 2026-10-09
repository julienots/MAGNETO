export type EventId = 'magnetStorm' | 'zeroGravity' | 'chaosWeek' | 'bossInvasion';
export interface GameEventDef {
  id: EventId;
  name: string;
  emoji: string;
  desc: string;
  color: string;
  mods: { forceMult?: number; frictionMult?: number; randomPolarity?: boolean; bossInvasion?: boolean; coinMult?: number };
}
export const GAME_EVENTS: GameEventDef[] = [
  { id: 'magnetStorm', name: 'MAGNET STORM', emoji: '🌩️', desc: 'Force magnétique ×2 dans tous les modes !', color: '#ff4d4d', mods: { forceMult: 2, coinMult: 1.25 } },
  { id: 'zeroGravity', name: 'ZERO GRAVITY', emoji: '🪐', desc: 'Les objets flottent et glissent sans fin.', color: '#31a8ff', mods: { frictionMult: 0.25, coinMult: 1.25 } },
  { id: 'chaosWeek', name: 'CHAOS WEEK', emoji: '🌀', desc: 'Les polarités des ennemis changent au hasard.', color: '#ff3df2', mods: { randomPolarity: true, coinMult: 1.5 } },
  { id: 'bossInvasion', name: 'BOSS INVASION', emoji: '👹', desc: 'Des mini-boss envahissent les niveaux. Butin doublé !', color: '#ffb627', mods: { bossInvasion: true, coinMult: 2 } },
];
/** Rotation: one event per ISO week, deterministic for everyone. */
export function currentEvent(now = Date.now()): { def: GameEventDef; endsAt: number } {
  const WEEK = 7 * 24 * 3600 * 1000;
  const epoch = Date.UTC(2026, 0, 5); // a Monday
  const idx = Math.floor((now - epoch) / WEEK);
  const def = GAME_EVENTS[((idx % GAME_EVENTS.length) + GAME_EVENTS.length) % GAME_EVENTS.length];
  return { def, endsAt: epoch + (idx + 1) * WEEK };
}
