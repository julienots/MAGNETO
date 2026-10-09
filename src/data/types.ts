export type Rarity = 'common' | 'rare' | 'epic' | 'legendary' | 'mythic';
export const RARITY_COLORS: Record<Rarity, string> = {
  common: '#9fb4c7', rare: '#3fa9ff', epic: '#b45cff', legendary: '#ffb627', mythic: '#ff4f9a',
};
export const RARITY_LABEL: Record<Rarity, string> = {
  common: 'COMMUN', rare: 'RARE', epic: 'ÉPIQUE', legendary: 'LÉGENDAIRE', mythic: 'MYTHIQUE',
};
export type Polarity = 1 | -1;
export type Currency = 'coins' | 'crystals';

export interface Reward {
  coins?: number;
  crystals?: number;
  fragments?: { hero: string; amount: number }[];
  chest?: string; // chest id
  skin?: string;
  hero?: string;
  passXp?: number;
  emote?: string;
  trail?: string;
  badge?: string;
}
