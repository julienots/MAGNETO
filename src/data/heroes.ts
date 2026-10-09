import type { Rarity } from './types';

export type AbilityId = 'megaMagnet' | 'chainVolt' | 'pulseNova' | 'orbitRing' | 'crashWave' | 'phaseDash' | 'zeroField';
export type BodyShape = 'compact' | 'slim' | 'heavy' | 'tall' | 'cloak';
export type HeadShape = 'round' | 'square' | 'visor' | 'dome' | 'hood';
export type GloveShape = 'giant' | 'normal' | 'claws' | 'orbs' | 'none';
export type Accessory = 'antenna' | 'coils' | 'backpack' | 'crown' | 'halo' | 'horns' | 'fin' | 'ring' | 'scarf' | 'goggles' | 'spikes' | 'tank';
export type EyeStyle = 'big' | 'narrow' | 'visor' | 'cyclops' | 'glow';

export type HairStyle = 'spiky' | 'flame' | 'buzz' | 'ponytail' | 'mohawk' | 'hood' | 'slick' | 'bob' | 'afro';
export interface HeroModelSpec {
  hair: HairStyle;
  hairColor: number;
  eyeColor: number;
  /** skin-tone of the face + hands when bare */
  body: BodyShape;
  head: HeadShape;
  gloves: GloveShape;
  accessories: Accessory[];
  eyes: EyeStyle;
  scale: number;
}

export interface HeroStats {
  hp: number;
  speed: number;   // units/s
  force: number;   // magnet force multiplier
  range: number;   // magnet field length
  cone: number;    // half-angle in degrees
  hold: number;    // max held objects
  mass: number;
}

export interface HeroDef {
  id: string;
  name: string;
  title: string;
  desc: string;
  rarity: Rarity;
  color: number;
  accent: number;
  skinTone: number;
  stats: HeroStats;
  ability: { id: AbilityId; name: string; desc: string; cooldown: number };
  model: HeroModelSpec;
  /** How the hero is obtained. Fragments are always usable once owned. */
  unlock: { type: 'start' | 'fragments' | 'stars' | 'trophies' | 'pass'; amount: number };
}

/**
 * Hero registry. Adding a character = adding one entry: the model builder,
 * ability system, skins and shop all read from this table.
 */
export const HEROES: HeroDef[] = [
  {
    id: 'mag', name: 'MAG', title: 'Le Spécialiste', rarity: 'common',
    desc: 'Compact et fiable. Ses gants géants attirent tout ce qui traîne.',
    color: 0xff4d4d, accent: 0x2f7bff, skinTone: 0xffd2a8,
    stats: { hp: 120, speed: 6.2, force: 1.0, range: 6.5, cone: 38, hold: 4, mass: 3 },
    ability: { id: 'megaMagnet', name: 'MÉGA AIMANT', desc: "Attire TOUT l'écran puis relâche une onde de choc.", cooldown: 9 },
    model: { hair: 'spiky', hairColor: 0x3a2318, eyeColor: 0x2f7bff, body: 'compact', head: 'round', gloves: 'giant', accessories: ['antenna', 'scarf'], eyes: 'big', scale: 1 },
    unlock: { type: 'start', amount: 0 },
  },
  {
    id: 'volt', name: 'VOLT', title: "L'Étincelle", rarity: 'rare',
    desc: 'Toujours chargé. Ses arcs électriques sautent de robot en robot.',
    color: 0xffd23f, accent: 0x7a3cff, skinTone: 0xf6c08e,
    stats: { hp: 100, speed: 7.2, force: 0.9, range: 6, cone: 34, hold: 3, mass: 2.5 },
    ability: { id: 'chainVolt', name: 'ARC EN CHAÎNE', desc: 'Un éclair qui rebondit sur 6 ennemis.', cooldown: 7 },
    model: { hair: 'flame', hairColor: 0xffe14d, eyeColor: 0x9b5cff, body: 'slim', head: 'round', gloves: 'normal', accessories: ['coils'], eyes: 'narrow', scale: 0.95 },
    unlock: { type: 'stars', amount: 9 },
  },
  {
    id: 'pulse', name: 'PULSE', title: 'Le Détonateur', rarity: 'rare',
    desc: 'Lourd et lent, mais chaque pas fait trembler le sol.',
    color: 0xff8a1f, accent: 0x2b2b3a, skinTone: 0xc98b5e,
    stats: { hp: 180, speed: 5.0, force: 1.25, range: 5.5, cone: 45, hold: 5, mass: 6 },
    ability: { id: 'pulseNova', name: 'NOVA', desc: 'Explosion magnétique à 360° autour de lui.', cooldown: 8 },
    model: { hair: 'buzz', hairColor: 0x1b1b22, eyeColor: 0xff8a1f, body: 'heavy', head: 'round', gloves: 'giant', accessories: ['tank', 'goggles'], eyes: 'big', scale: 1.12 },
    unlock: { type: 'fragments', amount: 40 },
  },
  {
    id: 'orbit', name: 'ORBIT', title: "L'Acrobate", rarity: 'epic',
    desc: 'Agile. Fait tourner les débris autour de lui comme des satellites.',
    color: 0x2ee6a6, accent: 0xff4fd8, skinTone: 0xffe0bd,
    stats: { hp: 95, speed: 7.8, force: 0.95, range: 7, cone: 32, hold: 6, mass: 2.2 },
    ability: { id: 'orbitRing', name: 'ANNEAU ORBITAL', desc: 'Les objets proches orbitent et percutent les ennemis.', cooldown: 10 },
    model: { hair: 'ponytail', hairColor: 0xff4fd8, eyeColor: 0x16c486, body: 'slim', head: 'round', gloves: 'orbs', accessories: ['ring'], eyes: 'big', scale: 0.95 },
    unlock: { type: 'fragments', amount: 60 },
  },
  {
    id: 'crash', name: 'CRASH', title: 'Le Bélier', rarity: 'epic',
    desc: 'Une force brute de répulsion. Rien ne reste debout devant lui.',
    color: 0x3d7bff, accent: 0xffd23f, skinTone: 0x8d5a3b,
    stats: { hp: 160, speed: 5.6, force: 1.5, range: 6, cone: 30, hold: 3, mass: 5 },
    ability: { id: 'crashWave', name: 'MUR DE FORCE', desc: 'Une vague de répulsion colossale vers l’avant.', cooldown: 8 },
    model: { hair: 'mohawk', hairColor: 0xe0302a, eyeColor: 0x3d7bff, body: 'heavy', head: 'round', gloves: 'giant', accessories: ['horns', 'backpack'], eyes: 'narrow', scale: 1.1 },
    unlock: { type: 'trophies', amount: 600 },
  },
  {
    id: 'phase', name: 'PHASE', title: 'Le Spectre', rarity: 'legendary',
    desc: 'Mystérieux. Traverse la matière et frappe de l’intérieur.',
    color: 0x9b5cff, accent: 0x26c6da, skinTone: 0xe6d6ff,
    stats: { hp: 105, speed: 7.4, force: 1.05, range: 6.5, cone: 36, hold: 4, mass: 2.4 },
    ability: { id: 'phaseDash', name: 'PHASE DASH', desc: 'Devient intangible et traverse tout en blessant.', cooldown: 6 },
    model: { hair: 'hood', hairColor: 0x3a2a7a, eyeColor: 0x3ff0ff, body: 'cloak', head: 'hood', gloves: 'claws', accessories: [], eyes: 'glow', scale: 1 },
    unlock: { type: 'pass', amount: 30 },
  },
  {
    id: 'zero', name: 'ZERO', title: "L'Annulateur", rarity: 'legendary',
    desc: 'Coupe le magnétisme. Le monde flotte, lui seul décide.',
    color: 0xe8f1ff, accent: 0x18d4ff, skinTone: 0xf3d9c4,
    stats: { hp: 130, speed: 6.4, force: 1.1, range: 7, cone: 40, hold: 5, mass: 3 },
    ability: { id: 'zeroField', name: 'CHAMP ZÉRO', desc: 'Ennemis figés en apesanteur, objets à vous.', cooldown: 11 },
    model: { hair: 'slick', hairColor: 0x8fa8e6, eyeColor: 0x18d4ff, body: 'tall', head: 'round', gloves: 'normal', accessories: ['halo'], eyes: 'big', scale: 1.05 },
    unlock: { type: 'fragments', amount: 120 },
  },
];

export const heroById = (id: string) => HEROES.find((h) => h.id === id) ?? HEROES[0];

/** Hero levels: each level boosts stats; costs scale. */
export const HERO_MAX_LEVEL = 10;
export function heroLevelCost(level: number) {
  // cost to go from `level` to `level+1`
  return { fragments: 10 + level * 10, coins: Math.round(100 * Math.pow(1.75, level - 1)) };
}
export function heroStatMult(level: number) { return 1 + (level - 1) * 0.07; }
