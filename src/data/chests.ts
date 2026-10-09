import type { Rarity } from './types';

export type ChestId = 'wood' | 'steel' | 'energy' | 'epic' | 'mythic' | 'cosmic';
export interface ChestDef {
  id: ChestId;
  name: string;
  rarity: Rarity;
  color: number;
  trim: number;
  glow: number;
  coins: [number, number];
  crystals: [number, number];
  fragmentStacks: number;
  fragments: [number, number];
  /** chance to contain a skin not yet owned */
  skinChance: number;
  /** chance to contain a whole hero not yet owned */
  heroChance: number;
  priceCrystals: number;
  /** number of suspense "taps" before it bursts */
  taps: number;
}

export const CHESTS: ChestDef[] = [
  { id: 'wood', name: 'COFFRE BOIS', rarity: 'common', color: 0x9b6a3c, trim: 0x5a3a1e, glow: 0xffd9a0, coins: [60, 120], crystals: [0, 2], fragmentStacks: 1, fragments: [3, 6], skinChance: 0, heroChance: 0, priceCrystals: 20, taps: 1 },
  { id: 'steel', name: 'COFFRE ACIER', rarity: 'rare', color: 0x8fa3b8, trim: 0x3c4a5a, glow: 0xbfe3ff, coins: [150, 260], crystals: [2, 6], fragmentStacks: 2, fragments: [5, 10], skinChance: 0.03, heroChance: 0, priceCrystals: 60, taps: 2 },
  { id: 'energy', name: 'COFFRE ÉNERGIE', rarity: 'epic', color: 0x2ee6a6, trim: 0x0f4a3a, glow: 0x7dffd8, coins: [320, 520], crystals: [5, 12], fragmentStacks: 2, fragments: [10, 18], skinChance: 0.08, heroChance: 0.03, priceCrystals: 140, taps: 2 },
  { id: 'epic', name: 'COFFRE ÉPIQUE', rarity: 'epic', color: 0xb45cff, trim: 0x3a1460, glow: 0xe4b8ff, coins: [600, 900], crystals: [10, 20], fragmentStacks: 3, fragments: [16, 28], skinChance: 0.15, heroChance: 0.06, priceCrystals: 280, taps: 3 },
  { id: 'mythic', name: 'COFFRE MYTHIQUE', rarity: 'legendary', color: 0xffb627, trim: 0x5a3200, glow: 0xffe9a6, coins: [1200, 1800], crystals: [20, 40], fragmentStacks: 3, fragments: [30, 50], skinChance: 0.35, heroChance: 0.15, priceCrystals: 550, taps: 3 },
  { id: 'cosmic', name: 'COFFRE COSMIQUE', rarity: 'mythic', color: 0x3b1f8f, trim: 0xff5cf0, glow: 0xff9df5, coins: [2500, 4000], crystals: [40, 80], fragmentStacks: 4, fragments: [50, 80], skinChance: 0.6, heroChance: 0.3, priceCrystals: 1100, taps: 4 },
];
export const chestById = (id: string) => CHESTS.find((c) => c.id === id) ?? CHESTS[0];
