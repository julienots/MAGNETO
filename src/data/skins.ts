import { HEROES } from './heroes';
import type { Rarity } from './types';

export type SkinTheme = 'default' | 'inferno' | 'frost' | 'cosmic' | 'mecha' | 'phantom' | 'overcharge';
export interface SkinThemeDef {
  id: SkinTheme;
  name: string;
  emoji: string;
  rarity: Rarity;
  /** Palette override: null = keep hero palette */
  color: number | null;
  accent: number | null;
  emissive: number;
  /** particle effect emitted around the hero */
  aura: 'none' | 'fire' | 'snow' | 'stars' | 'sparks' | 'wisps' | 'bolts';
  /** extra accessories grafted onto the model */
  extra: ('horns' | 'spikes' | 'halo' | 'ring' | 'backpack' | 'fin' | 'crown' | 'coils')[];
  translucent?: boolean;
  metal?: boolean;
  price: { crystals: number };
}

export const SKIN_THEMES: SkinThemeDef[] = [
  { id: 'default', name: 'CLASSIQUE', emoji: '⭐', rarity: 'common', color: null, accent: null, emissive: 0x000000, aura: 'none', extra: [], price: { crystals: 0 } },
  { id: 'inferno', name: 'INFERNO', emoji: '🔥', rarity: 'epic', color: 0xff3b1f, accent: 0x2a0d05, emissive: 0x551100, aura: 'fire', extra: ['horns'], price: { crystals: 250 } },
  { id: 'frost', name: 'FROST', emoji: '❄️', rarity: 'epic', color: 0x9fe8ff, accent: 0x2f6bff, emissive: 0x0a2a44, aura: 'snow', extra: ['spikes'], price: { crystals: 250 } },
  { id: 'cosmic', name: 'COSMIC', emoji: '🌌', rarity: 'legendary', color: 0x3b1f8f, accent: 0xff5cf0, emissive: 0x1a0a40, aura: 'stars', extra: ['ring', 'halo'], price: { crystals: 450 } },
  { id: 'mecha', name: 'MECHA', emoji: '🤖', rarity: 'legendary', color: 0x9aa7b5, accent: 0xff7a00, emissive: 0x111111, aura: 'sparks', extra: ['backpack', 'fin'], metal: true, price: { crystals: 450 } },
  { id: 'phantom', name: 'PHANTOM', emoji: '👻', rarity: 'epic', color: 0xd8f6ff, accent: 0x6b4cff, emissive: 0x223355, aura: 'wisps', extra: ['crown'], translucent: true, price: { crystals: 300 } },
  { id: 'overcharge', name: 'OVERCHARGE', emoji: '⚡', rarity: 'mythic', color: 0x1b1b2a, accent: 0x31f5ff, emissive: 0x0a4455, aura: 'bolts', extra: ['coils', 'spikes'], price: { crystals: 700 } },
];

export interface SkinDef { id: string; hero: string; theme: SkinTheme; name: string; rarity: Rarity; price: number }

/** Every hero automatically gets every theme as a skin (7 x 7 = 49 skins). */
export const SKINS: SkinDef[] = HEROES.flatMap((h) =>
  SKIN_THEMES.map((t) => ({ id: `${h.id}:${t.id}`, hero: h.id, theme: t.id, name: `${h.name} ${t.name}`, rarity: t.rarity, price: t.price.crystals })),
);
export const skinById = (id: string) => SKINS.find((s) => s.id === id);
export const themeById = (id: SkinTheme) => SKIN_THEMES.find((t) => t.id === id) ?? SKIN_THEMES[0];
