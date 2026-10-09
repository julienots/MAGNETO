import type { Reward } from './types';

export const PASS_TIERS = 40;
export const PASS_XP_PER_TIER = 300;
export const PASS_PREMIUM_PRICE = 690; // crystals
export const SEASON = { id: 1, name: 'SAISON 1 : SURCHARGE', theme: 'overcharge', days: 42 };

export interface PassTier { tier: number; free: Reward; premium: Reward }

function freeReward(t: number): Reward {
  if (t % 10 === 0) return { chest: t >= 30 ? 'mythic' : 'epic' };
  if (t % 5 === 0) return { chest: 'energy' };
  if (t % 3 === 0) return { crystals: 10 + t };
  if (t % 2 === 0) return { fragments: [{ hero: t < 20 ? 'volt' : 'pulse', amount: 6 + Math.floor(t / 4) }] };
  return { coins: 150 + t * 25 };
}
function premiumReward(t: number): Reward {
  const special: Record<number, Reward> = {
    1: { skin: 'mag:overcharge' },
    8: { emote: 'GG ⚡' },
    12: { trail: 'bolts' },
    15: { skin: 'volt:overcharge' },
    20: { chest: 'cosmic' },
    25: { skin: 'crash:overcharge' },
    30: { hero: 'phase' },
    35: { badge: 'SURCHARGÉ' },
    40: { skin: 'phase:overcharge', chest: 'cosmic' },
  };
  if (special[t]) return special[t];
  if (t % 5 === 0) return { chest: 'mythic' };
  if (t % 2 === 0) return { crystals: 25 + t * 2 };
  if (t % 3 === 0) return { fragments: [{ hero: 'orbit', amount: 10 + Math.floor(t / 3) }] };
  return { coins: 400 + t * 60 };
}
export const PASS: PassTier[] = Array.from({ length: PASS_TIERS }, (_, i) => ({ tier: i + 1, free: freeReward(i + 1), premium: premiumReward(i + 1) }));
