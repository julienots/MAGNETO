export type EnemyKind = 'drone' | 'tank' | 'puller' | 'pusher' | 'bomber' | 'shield' | 'swarm' | 'phaser' | 'chaos';

export interface EnemyDef {
  kind: EnemyKind;
  name: string;
  desc: string;
  hp: number;
  speed: number;
  mass: number;
  radius: number;
  damage: number;
  score: number;
  color: number;
  accent: number;
  /** 0 = ferromagnetic (obeys player mode), ±1 = charged */
  charge: 0 | 1 | -1;
  /** how much the enemy resists magnetic force (0..1) */
  resist: number;
}

export const ENEMIES: Record<EnemyKind, EnemyDef> = {
  drone: { kind: 'drone', name: 'DRONE', desc: 'Rapide, tire des boulons.', hp: 30, speed: 4.2, mass: 1, radius: 0.5, damage: 8, score: 100, color: 0x58d0ff, accent: 0x223344, charge: 0, resist: 0 },
  tank: { kind: 'tank', name: 'TANK', desc: 'Très lourd. Charge en ligne droite.', hp: 140, speed: 2.2, mass: 9, radius: 0.95, damage: 22, score: 350, color: 0x7d8a5a, accent: 0x2f3524, charge: 0, resist: 0.65 },
  puller: { kind: 'puller', name: 'PULLER', desc: 'Vous attire vers lui.', hp: 55, speed: 2.6, mass: 2.5, radius: 0.65, damage: 12, score: 200, color: 0xff4d6d, accent: 0x3a1020, charge: 1, resist: 0.2 },
  pusher: { kind: 'pusher', name: 'PUSHER', desc: 'Vous repousse dans les pièges.', hp: 55, speed: 2.6, mass: 2.5, radius: 0.65, damage: 10, score: 200, color: 0x4d7dff, accent: 0x10183a, charge: -1, resist: 0.2 },
  bomber: { kind: 'bomber', name: 'BOMBER', desc: 'Fonce et explose. Renvoyez-le !', hp: 20, speed: 4.8, mass: 1.4, radius: 0.55, damage: 30, score: 150, color: 0x2b2b33, accent: 0xff5a1f, charge: 0, resist: 0 },
  shield: { kind: 'shield', name: 'SHIELD', desc: 'Champ magnétique frontal. Contournez-le.', hp: 80, speed: 2.4, mass: 4, radius: 0.75, damage: 14, score: 300, color: 0xf2f2f2, accent: 0x30e0ff, charge: 0, resist: 0.5 },
  swarm: { kind: 'swarm', name: 'SWARM', desc: 'Petits, nombreux, agaçants.', hp: 8, speed: 5.0, mass: 0.35, radius: 0.28, damage: 4, score: 40, color: 0xb6ff3b, accent: 0x223300, charge: 0, resist: 0 },
  phaser: { kind: 'phaser', name: 'PHASER', desc: 'Devient intangible par moments.', hp: 45, speed: 3.6, mass: 1.5, radius: 0.55, damage: 12, score: 250, color: 0xc49bff, accent: 0x2d1050, charge: 0, resist: 0.1 },
  chaos: { kind: 'chaos', name: 'CHAOS', desc: 'Change de polarité sans cesse.', hp: 70, speed: 3.2, mass: 2.2, radius: 0.65, damage: 14, score: 320, color: 0xff3df2, accent: 0x111111, charge: 1, resist: 0.15 },
};
export const ENEMY_KINDS = Object.keys(ENEMIES) as EnemyKind[];
