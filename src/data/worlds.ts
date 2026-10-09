export type Mechanic =
  | 'conveyor' | 'press' | 'crane' | 'barrels'
  | 'bounce' | 'fence' | 'cars'
  | 'lowgrav' | 'vent' | 'debris'
  | 'lava' | 'magmaRock' | 'eruption'
  | 'ice' | 'iceBlock' | 'freezeVent'
  | 'gravityWell' | 'asteroid' | 'pit'
  | 'portal' | 'polarityZone' | 'flipGravity';

export interface WorldDef {
  id: number;
  name: string;
  subtitle: string;
  emoji: string;
  boss: string;
  palette: { floor: number; floor2: number; wall: number; trim: number; sky: number; fog: number; light: number; ambient: number; accent: number };
  mechanics: Mechanic[];
  /** stars needed to unlock the world */
  starsRequired: number;
  /** base friction of floor (1 = normal) */
  friction: number;
  music: { bpm: number; root: number; scale: number[]; mood: 'drive' | 'neon' | 'space' | 'heavy' | 'ice' | 'cosmic' | 'void' };
}

export const WORLDS: WorldDef[] = [
  { id: 1, name: 'IRON FACTORY', subtitle: 'Usines, convoyeurs et grues', emoji: '🏭', boss: 'magnetron',
    palette: { floor: 0x5d6b7a, floor2: 0x4f5b68, wall: 0xf2a33a, trim: 0x2b3440, sky: 0x2a3442, fog: 0x2a3442, light: 0xfff1d6, ambient: 0x8090a8, accent: 0xffc23d },
    mechanics: ['conveyor', 'press', 'crane', 'barrels'], starsRequired: 0, friction: 1,
    music: { bpm: 118, root: 45, scale: [0, 3, 5, 7, 10], mood: 'drive' } },
  { id: 2, name: 'NEON CITY', subtitle: 'La ville futuriste ne dort jamais', emoji: '🌃', boss: 'neonhydra',
    palette: { floor: 0x2b2450, floor2: 0x221c42, wall: 0xff3df2, trim: 0x10102a, sky: 0x120c2e, fog: 0x1a1240, light: 0xd8c8ff, ambient: 0x6a5acd, accent: 0x31f5ff },
    mechanics: ['bounce', 'fence', 'cars', 'barrels'], starsRequired: 25, friction: 1,
    music: { bpm: 124, root: 50, scale: [0, 2, 3, 7, 10], mood: 'neon' } },
  { id: 3, name: 'ORBITAL STATION', subtitle: 'Faible gravité, vide spatial', emoji: '🛰️', boss: 'satellizer',
    palette: { floor: 0xc9d4e0, floor2: 0xb4c1cf, wall: 0x3d8bff, trim: 0x2a3550, sky: 0x05070f, fog: 0x0a1020, light: 0xffffff, ambient: 0x8fa8d8, accent: 0xff7a00 },
    mechanics: ['lowgrav', 'vent', 'debris', 'pit'], starsRequired: 55, friction: 0.45,
    music: { bpm: 108, root: 47, scale: [0, 2, 4, 7, 9], mood: 'space' } },
  { id: 4, name: 'MAGMA CORE', subtitle: 'Volcans et métal en fusion', emoji: '🌋', boss: 'moltengolem',
    palette: { floor: 0x3a2220, floor2: 0x2e1a18, wall: 0xff5a1f, trim: 0x1a0d0b, sky: 0x2a0c06, fog: 0x3a1208, light: 0xffc28a, ambient: 0xa04030, accent: 0xffa31f },
    mechanics: ['lava', 'magmaRock', 'eruption', 'barrels'], starsRequired: 90, friction: 1,
    music: { bpm: 132, root: 40, scale: [0, 1, 5, 7, 8], mood: 'heavy' } },
  { id: 5, name: 'FROZEN FORGE', subtitle: 'Les usines gelées glissent', emoji: '❄️', boss: 'cryoforge',
    palette: { floor: 0xbfe6ff, floor2: 0xa6d8f5, wall: 0x5aa0ff, trim: 0x22406a, sky: 0x9fc8e8, fog: 0xbcdcf2, light: 0xffffff, ambient: 0x9fc4ff, accent: 0x31f5ff },
    mechanics: ['ice', 'iceBlock', 'freezeVent', 'conveyor'], starsRequired: 130, friction: 0.25,
    music: { bpm: 112, root: 52, scale: [0, 2, 3, 7, 9], mood: 'ice' } },
  { id: 6, name: 'COSMIC FIELD', subtitle: 'Astéroïdes et objets flottants', emoji: '🌌', boss: 'starmaw',
    palette: { floor: 0x231a4a, floor2: 0x1b1438, wall: 0x9b5cff, trim: 0x0d0a20, sky: 0x060312, fog: 0x0e0826, light: 0xe6d8ff, ambient: 0x6a4cff, accent: 0xff5cf0 },
    mechanics: ['gravityWell', 'asteroid', 'pit', 'lowgrav'], starsRequired: 175, friction: 0.7,
    music: { bpm: 100, root: 48, scale: [0, 2, 4, 6, 9], mood: 'cosmic' } },
  { id: 7, name: 'THE VOID', subtitle: 'Le monde ne répond plus aux règles', emoji: '🕳️', boss: 'nullking',
    palette: { floor: 0x101014, floor2: 0x18181f, wall: 0xffffff, trim: 0x000000, sky: 0x000000, fog: 0x050508, light: 0xffffff, ambient: 0x505070, accent: 0xff2d55 },
    mechanics: ['portal', 'polarityZone', 'flipGravity', 'pit'], starsRequired: 225, friction: 0.85,
    music: { bpm: 140, root: 44, scale: [0, 1, 3, 6, 7], mood: 'void' } },
];
export const worldById = (id: number) => WORLDS[id - 1] ?? WORLDS[0];
