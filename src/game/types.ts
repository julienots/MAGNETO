import type * as THREE from 'three';
import type { Body } from './physics';
import type { EnemyDef, EnemyKind } from '../data/enemies';
import type { EnemyRig } from '../gfx/models/enemy';
import type { PropKind } from '../data/levels';
import type { PropSpec } from '../gfx/models/props';

export interface Prop {
  body: Body;
  mesh: THREE.Object3D;
  kind: PropKind;
  spec: PropSpec;
  hp: number;
  dead: boolean;
  spin: number;
  fuse: number; // barrels chain-explosion delay
  falling: number; // pit fall animation
  hot: number; // magma rock glow
}

export interface Enemy {
  body: Body;
  rig: EnemyRig;
  def: EnemyDef;
  kind: EnemyKind;
  hp: number;
  maxHp: number;
  t: number;
  cd: number;       // attack cooldown
  state: 'spawn' | 'move' | 'windup' | 'attack' | 'recover';
  stateT: number;
  stun: number;
  facing: number;
  charge: 1 | -1 | 0;
  phase: boolean;   // phaser intangible
  fuse: number;     // bomber
  burn: number;
  dead: boolean;
  dying: number;
  falling: number;
  elite: boolean;
  scale: number;
  aimX: number; aimZ: number;
  targetCore: boolean;
  meleeCd: number;
  hpBarT: number;
  field: number;
}

export interface Bolt {
  x: number; z: number; y: number; vx: number; vz: number;
  r: number; dmg: number; life: number;
  owner: 'enemy' | 'player' | 'boss';
  color: number;
  mesh: THREE.Mesh;
  active: boolean;
  chain: number;
}

export interface BattleConfig {
  mode: 'campaign' | 'rush' | 'survival' | 'bossrush' | 'chaos';
  levelId?: number;
  heroId: string;
  skin: string;
  heroLevel: number;
  world?: number;
  event?: { forceMult?: number; frictionMult?: number; randomPolarity?: boolean; bossInvasion?: boolean; coinMult?: number };
  quality: number;
  tutorial?: boolean;
}

export interface BattleResult {
  mode: BattleConfig['mode'];
  levelId?: number;
  victory: boolean;
  score: number;
  time: number;
  stars: [boolean, boolean, boolean];
  starLabels: [string, string, string];
  kills: number;
  objectKills: number;
  explosionKills: number;
  ringouts: number;
  maxCombo: number;
  maxChain: number;
  flips: number;
  abilities: number;
  damageTaken: number;
  coinsCollected: number;
  bossKilled: boolean;
  wave: number;
  bossesBeaten: number;
}

export type HudState = {
  hp: number; maxHp: number; polarity: number; held: number; holdMax: number;
  ability: number; abilityReady: boolean; dashReady: number;
  combo: number; comboRatio: number; comboTier: string | null; comboColor: string;
  score: number; time: number; timeLeft: number | null;
  objective: string; progress: number; progressText: string;
  boss: { name: string; hp: number; phase: string; shield: number } | null;
  wave: number; coins: number; inverted: boolean;
};

export type { PropKind };
