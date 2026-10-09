export type BossShape = 'robot' | 'hydra' | 'satellite' | 'golem' | 'forge' | 'maw' | 'king';
export interface BossDef {
  id: string;
  name: string;
  title: string;
  world: number;
  shape: BossShape;
  hp: number;
  color: number;
  accent: number;
  eye: number;
  /** attack flavour used in phase 1 */
  volley: 'bolts' | 'lasers' | 'orbs' | 'rocks' | 'shards' | 'stars' | 'voids';
  minion: 'drone' | 'swarm' | 'bomber' | 'phaser' | 'chaos' | 'shield' | 'puller';
}

export const BOSSES: BossDef[] = [
  { id: 'magnetron', name: 'MAGNETRON', title: 'Le Robot Colosse', world: 1, shape: 'robot', hp: 1400, color: 0xf2a33a, accent: 0x2b3440, eye: 0xff2d2d, volley: 'bolts', minion: 'drone' },
  { id: 'neonhydra', name: 'NEON HYDRA', title: 'Trois têtes, zéro pitié', world: 2, shape: 'hydra', hp: 1900, color: 0xff3df2, accent: 0x14102e, eye: 0x31f5ff, volley: 'lasers', minion: 'bomber' },
  { id: 'satellizer', name: 'SATELLIZER', title: "L'Antenne Vivante", world: 3, shape: 'satellite', hp: 2300, color: 0xd8e2ee, accent: 0x3d8bff, eye: 0xff7a00, volley: 'orbs', minion: 'shield' },
  { id: 'moltengolem', name: 'MOLTEN GOLEM', title: 'Cœur de Lave', world: 4, shape: 'golem', hp: 2800, color: 0x4a2a22, accent: 0xff5a1f, eye: 0xffe14d, volley: 'rocks', minion: 'phaser' },
  { id: 'cryoforge', name: 'CRYOFORGE', title: 'La Forge Glacée', world: 5, shape: 'forge', hp: 3300, color: 0x9fd8ff, accent: 0x22406a, eye: 0x31f5ff, volley: 'shards', minion: 'chaos' },
  { id: 'starmaw', name: 'STARMAW', title: 'Le Dévoreur d’Étoiles', world: 6, shape: 'maw', hp: 3900, color: 0x5a2fd8, accent: 0xff5cf0, eye: 0xffffff, volley: 'stars', minion: 'puller' },
  { id: 'nullking', name: 'NULL KING', title: 'Le Roi du Vide', world: 7, shape: 'king', hp: 4800, color: 0x111118, accent: 0xffffff, eye: 0xff2d55, volley: 'voids', minion: 'chaos' },
];
export const bossById = (id: string) => BOSSES.find((b) => b.id === id) ?? BOSSES[0];

export const BOSS_PHASES = [
  { at: 1.0, name: 'PHASE 1', desc: 'Attaques simples' },
  { at: 0.75, name: 'PHASE 2', desc: 'Inversion de polarité' },
  { at: 0.5, name: 'PHASE 3', desc: "Aspiration de l'arène" },
  { at: 0.3, name: 'PHASE 4', desc: 'Destruction du décor' },
  { at: 0.12, name: 'FINAL', desc: 'Retournez l’arène contre lui !' },
];
