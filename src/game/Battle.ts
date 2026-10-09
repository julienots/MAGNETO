import * as THREE from 'three';
import { PhysicsWorld, Body } from './physics';
import { Combo, type ComboTier } from './Combo';
import type { Prop, Enemy, Bolt, BattleConfig, BattleResult, HudState } from './types';
import { CameraRig } from '../gfx/CameraRig';
import { FX } from '../gfx/fx';
import { FloatText } from '../gfx/FloatText';
import { buildArena, HW, HH, type ArenaVisual } from '../gfx/arena';
import { HeroRig } from '../gfx/models/hero';
import { EnemyRig } from '../gfx/models/enemy';
import { makePropMesh, PROP_SPECS } from '../gfx/models/props';
import { sphereGeo, basic, disposeTree } from '../gfx/toon';
import { heroById, heroStatMult, type HeroDef, type HeroStats } from '../data/heroes';
import { ENEMIES, ENEMY_KINDS, type EnemyKind } from '../data/enemies';
import { levelById, type LevelDef, type PropKind } from '../data/levels';
import { worldById, WORLDS, type WorldDef, type Mechanic } from '../data/worlds';
import type { SkinTheme } from '../data/skins';
import { themeById } from '../data/skins';
import { BOSSES } from '../data/bosses';
import { audio } from '../audio/Audio';
import { haptics } from '../platform/Haptics';
import { Rng } from '../core/Random';
import { clamp, angleLerp, TAU } from '../core/math';
import { buildHazards, type Hazard } from './Hazards';
import { updateEnemyAI } from './EnemyAI';
import { BossController } from './BossController';
import { useAbility, updateAbility, type AbilityState } from './Abilities';

export interface PlayerState {
  body: Body;
  rig: HeroRig;
  def: HeroDef;
  stats: HeroStats;
  hp: number;
  maxHp: number;
  polarity: 1 | -1;
  facing: number;
  held: Body[];
  dashT: number; dashCd: number; dashX: number; dashZ: number;
  inv: number;
  abilityCd: number;
  ability: AbilityState;
  inZone: boolean;
  field: number;
  fieldMesh: THREE.Mesh;
  fieldMat: THREE.ShaderMaterial;
  aura: string;
  dead: boolean;
  slow: number;
  fallT: number;
}

const ROBOT_PARTS = [0x8fa3b8, 0x3c4652, 0xffc23d];
const DIFF_HP = (d: number) => 1 + (d - 1) * 0.9;

export class Battle {
  scene = new THREE.Scene();
  rig: CameraRig;
  fx = new FX();
  phys = new PhysicsWorld();
  arena: ArenaVisual;
  world: WorldDef;
  level?: LevelDef;
  player!: PlayerState;
  props: Prop[] = [];
  enemies: Enemy[] = [];
  bolts: Bolt[] = [];
  hazards: Hazard[] = [];
  boss: BossController | null = null;
  combo = new Combo();
  rng: Rng;
  ft: FloatText;
  score = 0;
  time = 0;
  timeLimit: number | null = null;
  state: 'intro' | 'play' | 'end' = 'intro';
  introT = 0;
  hitstop = 0;
  slowmo = 0;
  timeScale = 1;
  chainId = 0;
  chainCounts = new Map<number, number>();
  maxChain = 0;
  wave = 0;
  waveTimer = 0;
  pending: { kind: EnemyKind; x: number; z: number; t: number; elite: boolean; marker: THREE.Mesh }[] = [];
  objective: { type: string; target: number; progress: number };
  stats = { kills: 0, objectKills: 0, explosionKills: 0, ringouts: 0, flips: 0, abilities: 0, damageTaken: 0, coins: 0, bossKilled: false, bossesBeaten: 0 };
  generators: Prop[] = [];
  protectCore: Prop | null = null;
  collector: { x: number; z: number; mesh: THREE.Object3D } | null = null;
  difficulty = 1;
  forceMult = 1;
  coinMult = 1;
  chaosRule = '';
  chaosT = 0;
  private boltPool: Bolt[] = [];
  private tmpBodies: Body[] = [];
  private delayed: { t: number; fn: () => void }[] = [];
  private shadowMarkers: THREE.Mesh[] = [];
  private t = 0;
  ended = false;
  onEnd: ((r: BattleResult) => void) | null = null;
  onBanner: ((title: string, sub?: string, color?: string, dur?: number) => void) | null = null;
  onTier: ((t: ComboTier, idx: number) => void) | null = null;
  onTip: ((text: string) => void) | null = null;
  onShakeScreen: ((k: number) => void) | null = null;
  onFlash: ((color: string, a: number) => void) | null = null;
  bossRushIndex = 0;

  constructor(public cfg: BattleConfig, aspect: number, floatLayer: HTMLElement) {
    this.rig = new CameraRig(aspect);
    this.ft = new FloatText(floatLayer);
    this.fx.quality = cfg.quality;
    this.rng = new Rng(cfg.levelId ? cfg.levelId * 7919 : (Math.random() * 1e9) | 0);
    if (cfg.mode === 'campaign' && cfg.levelId) this.level = levelById(cfg.levelId);
    this.world = this.level ? worldById(this.level.world) : worldById(cfg.world ?? 1);
    if (cfg.mode === 'bossrush') this.world = WORLDS[0];
    this.difficulty = this.level?.difficulty ?? 1;
    this.forceMult = cfg.event?.forceMult ?? 1;
    this.coinMult = cfg.event?.coinMult ?? 1;
    this.arena = buildArena(this.world, this.scene, cfg.quality);
    this.scene.add(this.fx.group);
    // physics world
    const fricMult = cfg.event?.frictionMult ?? 1;
    const mech = this.mechanics();
    this.phys.friction = this.world.friction * fricMult * (mech.includes('lowgrav') ? 0.6 : 1);
    if (mech.includes('lowgrav')) this.phys.gravity = 14;
    this.phys.addWall(-HW - 5, -HH - 5, HW + 5, -HH, 'wall');
    this.phys.addWall(-HW - 5, HH, HW + 5, HH + 5, 'wall');
    this.phys.addWall(-HW - 5, -HH, -HW, HH, 'wall');
    this.phys.addWall(HW, -HH, HW + 5, HH, 'wall');
    this.phys.bounds = { x0: -HW - 0.05, z0: -HH - 0.05, x1: HW + 0.05, z1: HH + 0.05 };
    this.phys.onCollide = (a, b, imp, nx, nz, w) => this.collide(a, b, imp, nx, nz, w);

    this.combo.onTier = (t, i) => this.comboTier(t, i);
    this.objective = { type: 'eliminate', target: 0, progress: 0 };
    this.setupPlayer();
    this.hazards = buildHazards(this, mech);
    this.setupMode();
    this.rig.target.set(this.player.body.x, 0, this.player.body.z);
    this.rig.shakeEnabled = true;
    this.rig.snap();
    // pool bolts
    for (let i = 0; i < 60; i++) {
      const mesh = new THREE.Mesh(sphereGeo(1, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      mesh.visible = false; this.scene.add(mesh);
      this.boltPool.push({ x: 0, z: 0, y: 1, vx: 0, vz: 0, r: 0.2, dmg: 0, life: 0, owner: 'enemy', color: 0xffffff, mesh, active: false, chain: 0 });
    }
  }

  mechanics(): Mechanic[] {
    if (this.level) return this.level.mechanics;
    if (this.cfg.mode === 'bossrush') return [];
    return this.world.mechanics.slice(0, 2);
  }

  /* =========================================================== setup */
  private setupPlayer() {
    const def = heroById(this.cfg.heroId);
    const theme = (this.cfg.skin.split(':')[1] ?? 'default') as SkinTheme;
    const m = heroStatMult(this.cfg.heroLevel);
    const stats: HeroStats = { ...def.stats, hp: Math.round(def.stats.hp * m), force: def.stats.force * (1 + (m - 1) * 0.5) * this.forceMult };
    const body = new Body();
    body.kind = 'player'; body.r = 0.5; body.setMass(stats.mass); body.drag = 9; body.magnetic = 0; body.restitution = 0.1;
    body.x = 0; body.z = HH - 4; body.lastSafeX = body.x; body.lastSafeZ = body.z;
    this.phys.add(body);
    const rig = new HeroRig(def, theme);
    this.scene.add(rig.root);
    rig.play('spawn');
    // magnet field fan
    const cone = THREE.MathUtils.degToRad(stats.cone);
    const fieldMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(0xff3b3b) }, uPol: { value: 1 }, uInt: { value: 0 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `
        varying vec2 vUv; uniform float uTime; uniform vec3 uColor; uniform float uPol; uniform float uInt;
        void main(){
          float d = length(vUv - 0.5) * 2.0;
          float rings = fract(d * 3.5 + uTime * 2.2 * uPol);
          float band = smoothstep(0.0, 0.12, rings) * smoothstep(0.35, 0.12, rings);
          float edge = smoothstep(1.0, 0.85, d);
          float a = (band * 0.75 + 0.12) * edge * (1.0 - d * 0.55) * uInt;
          gl_FragColor = vec4(uColor * 1.4, a);
        }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    const fieldMesh = new THREE.Mesh(new THREE.CircleGeometry(1, 32, -Math.PI / 2 - cone, cone * 2), fieldMat);
    fieldMesh.rotation.x = -Math.PI / 2; fieldMesh.position.y = 0.06; fieldMesh.scale.setScalar(stats.range);
    fieldMesh.renderOrder = 3;
    const fieldPivot = new THREE.Group(); fieldPivot.add(fieldMesh);
    rig.root.add(fieldPivot);
    this.player = {
      body, rig, def, stats, hp: stats.hp, maxHp: stats.hp, polarity: 1, facing: Math.PI, held: [],
      dashT: 0, dashCd: 0, dashX: 0, dashZ: 0, inv: 0, abilityCd: def.ability.cooldown * 0.5,
      ability: { id: def.ability.id, active: 0, data: {} }, inZone: false, field: 0, fieldMesh, fieldMat,
      aura: themeById(theme).aura, dead: false, slow: 0, fallT: 0,
    };
  }

  private setupMode() {
    const L = this.level;
    if (L) {
      for (const p of L.props) for (let i = 0; i < p.count; i++) this.spawnProp(p.kind);
      this.objective = { type: L.objective.type, target: L.objective.target, progress: 0 };
      const o = L.objective.type;
      if (o === 'survive' || o === 'protect') this.timeLimit = L.objective.target;
      if (o === 'destroy') {
        for (let i = 0; i < L.objective.target; i++) {
          const x = (i - (L.objective.target - 1) / 2) * (L.objective.target > 4 ? 2.4 : 3.2);
          const z = -7 + (i % 2) * 2.2;
          this.spawnTarget('generator', x, z, 180 * DIFF_HP(this.difficulty));
        }
      }
      if (o === 'protect') this.protectCore = this.spawnTarget('protect', 0, 3.2, 650 * DIFF_HP(this.difficulty));
      if (o === 'collect') {
        const mesh = makePropMesh('collector', 0.04); mesh.position.set(0, 0, -8);
        this.scene.add(mesh);
        this.collector = { x: 0, z: -8, mesh };
      }
      if (o === 'boss') this.startBoss(L.boss!, 1);
    } else {
      const m = this.cfg.mode;
      const kinds: PropKind[] = this.world.id === 3 || this.world.id === 6 ? ['debris', 'debris', 'asteroid', 'barrel'] : this.world.id === 5 ? ['iceBlock', 'crate', 'barrel'] : this.world.id === 4 ? ['magmaRock', 'crate', 'barrel'] : ['crate', 'crate', 'barrel', 'heavy'];
      for (let i = 0; i < 14; i++) this.spawnProp(kinds[i % kinds.length]);
      if (m === 'rush') { this.timeLimit = 60; this.objective = { type: 'rush', target: 0, progress: 0 }; }
      if (m === 'survival') this.objective = { type: 'survival', target: 0, progress: 0 };
      if (m === 'chaos') { this.timeLimit = 90; this.objective = { type: 'chaos', target: 0, progress: 0 }; }
      if (m === 'bossrush') { this.objective = { type: 'bossrush', target: BOSSES.length, progress: 0 }; this.startBoss(BOSSES[0].id, 0.55); }
    }
  }

  startBoss(id: string, hpMult: number) {
    this.boss?.dispose();
    this.boss = new BossController(this, id, hpMult * (this.cfg.mode === 'bossrush' ? 1 : 1));
  }

  /* =========================================================== spawning */
  freeSpot(r: number, zMin: number, zMax: number, xPad = 1): [number, number] {
    for (let tries = 0; tries < 40; tries++) {
      const x = this.rng.range(-HW + xPad, HW - xPad), z = this.rng.range(zMin, zMax);
      if (this.phys.blocked(x, z, r + 0.2)) continue;
      if (this.hazards.some((h) => h.isDanger?.(x, z, r + 0.4))) continue;
      if (this.phys.query(x, z, r + 0.3, this.tmpBodies).length) continue;
      if (Math.hypot(x - this.player.body.x, z - this.player.body.z) < 2.5) continue;
      return [x, z];
    }
    return [this.rng.range(-HW + 1, HW - 1), this.rng.range(zMin, zMax)];
  }

  spawnProp(kind: PropKind, x?: number, z?: number): Prop {
    const spec = PROP_SPECS[kind];
    if (x === undefined || z === undefined) [x, z] = this.freeSpot(spec.r, -9, 8);
    const body = new Body();
    body.kind = 'prop'; body.r = spec.r; body.setMass(spec.mass); body.restitution = spec.restitution; body.magnetic = spec.magnetic; body.drag = spec.drag;
    body.x = x; body.z = z;
    if (kind === 'core') { body.magnetic = 0.15; body.resist = 0.6; }
    this.phys.add(body);
    const mesh = makePropMesh(kind, this.cfg.quality > 0.6 ? 0.04 : 0);
    mesh.rotation.y = this.rng.range(0, TAU);
    this.scene.add(mesh);
    const p: Prop = { body, mesh, kind, spec, hp: spec.hp, dead: false, spin: 0, fuse: 0, falling: 0, hot: kind === 'magmaRock' ? 1 : 0 };
    body.owner = p;
    if (kind === 'cell') {
      const glow = new THREE.Mesh(sphereGeo(1, 10, 8), basic(0x7dffd8, { additive: true, opacity: 0.5 }));
      glow.scale.setScalar(0.5); glow.position.y = 0.45; mesh.add(glow);
    }
    if (kind === 'core') {
      const glow = new THREE.Mesh(sphereGeo(1, 12, 10), new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false }));
      glow.scale.setScalar(1.1); glow.position.y = 0.8; mesh.add(glow); mesh.userData.glow = glow;
    }
    this.props.push(p);
    return p;
  }

  spawnTarget(kind: 'generator' | 'protect', x: number, z: number, hp: number): Prop {
    const body = new Body();
    body.kind = 'target'; body.r = kind === 'generator' ? 1.0 : 1.3; body.isStatic = true; body.setMass(0); body.magnetic = 0;
    body.x = x; body.z = z;
    this.phys.add(body);
    const mesh = makePropMesh(kind, 0.04); mesh.position.set(x, 0, z);
    this.scene.add(mesh);
    const glow = new THREE.Mesh(sphereGeo(1, 12, 10), new THREE.MeshBasicMaterial({ color: kind === 'generator' ? 0xff4d4d : 0x2ee6a6, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.scale.setScalar(kind === 'generator' ? 0.45 : 0.55); glow.position.y = kind === 'generator' ? 2.1 : 1.6;
    mesh.add(glow); mesh.userData.glow = glow;
    const p: Prop = { body, mesh, kind: 'heavy', spec: { ...PROP_SPECS.heavy, hp }, hp, dead: false, spin: 0, fuse: 0, falling: 0, hot: 0 };
    (p as any).target = kind; (p as any).maxHp = hp;
    body.owner = p;
    if (kind === 'generator') this.generators.push(p);
    return p;
  }

  spawnEnemy(kind: EnemyKind, x: number, z: number, elite = false): Enemy {
    const def = ENEMIES[kind];
    const body = new Body();
    const scale = elite ? 1.6 : 1;
    body.kind = 'enemy'; body.r = def.radius * scale; body.setMass(def.mass * (elite ? 3 : 1)); body.drag = 5; body.restitution = 0.35;
    body.magnetic = 1; body.resist = elite ? Math.min(0.75, def.resist + 0.3) : def.resist; body.x = x; body.z = z;
    let charge: 0 | 1 | -1 = def.charge;
    if (this.cfg.event?.randomPolarity || this.chaosRule === 'polarity') charge = this.rng.chance(0.5) ? 1 : -1;
    body.charge = kind === 'puller' || kind === 'pusher' ? 0 : charge;
    this.phys.add(body);
    const rig = new EnemyRig(kind);
    rig.root.scale.setScalar(scale);
    if (this.cfg.quality <= 0.6) rig.body.children.forEach((c) => (c.visible = false));
    this.scene.add(rig.root);
    const hpMul = DIFF_HP(this.difficulty) * (elite ? 2.2 : 1) * (this.cfg.mode === 'survival' ? 1 + this.wave * 0.06 : 1);
    const e: Enemy = {
      body, rig, def, kind, hp: def.hp * hpMul, maxHp: def.hp * hpMul, t: this.rng.range(0, 3), cd: this.rng.range(1, 2.5), state: 'spawn', stateT: 0,
      stun: 0, facing: 0, charge: kind === 'chaos' ? 1 : def.charge, phase: false, fuse: 0, burn: 0, dead: false, dying: 0, falling: 0, elite, scale,
      aimX: 0, aimZ: 0, targetCore: !!this.protectCore && this.rng.chance(0.65), meleeCd: 0, hpBarT: 0, field: 0,
    };
    e.charge = body.charge || e.charge;
    body.owner = e;
    rig.root.position.set(x, 7, z);
    body.y = 7; body.vy = -3; body.ghost = true; // drop-in from the sky
    this.enemies.push(e);
    return e;
  }

  /** Telegraphed spawn: marker first, enemy drops after delay. */
  queueSpawn(kind: EnemyKind, elite = false, x?: number, z?: number) {
    if (x === undefined || z === undefined) [x, z] = this.freeSpot(ENEMIES[kind].radius, -HH + 1.5, -HH + 7);
    const marker = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.75, 24), new THREE.MeshBasicMaterial({ color: 0xff4d4d, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide }));
    marker.rotation.x = -Math.PI / 2; marker.position.set(x, 0.07, z);
    this.scene.add(marker);
    this.pending.push({ kind, x, z, t: 0.9 + this.rng.range(0, 0.5), elite, marker });
  }

  spawnWave(i: number) {
    const L = this.level;
    let list: { kind: EnemyKind; count: number }[] = [];
    if (L && L.waves.length) list = L.waves[i % L.waves.length].enemies;
    else {
      // procedural waves for modes
      const n = 4 + Math.floor(i * 1.2) + (this.cfg.mode === 'rush' ? 3 : 0);
      const pool: EnemyKind[] = ENEMY_KINDS.filter((k) => i >= ({ drone: 0, swarm: 0, bomber: 1, tank: 2, puller: 2, pusher: 2, shield: 3, phaser: 4, chaos: 5 } as Record<EnemyKind, number>)[k]);
      const counts = new Map<EnemyKind, number>();
      for (let k = 0; k < n; k++) { const kind = this.rng.pick(pool); counts.set(kind, (counts.get(kind) ?? 0) + (kind === 'swarm' ? 3 : 1)); }
      list = [...counts.entries()].map(([kind, count]) => ({ kind, count }));
    }
    const loopBonus = L ? Math.floor(i / L.waves.length) : 0;
    for (const e of list) for (let k = 0; k < e.count + (loopBonus && e.kind === 'swarm' ? 2 : 0); k++) this.queueSpawn(e.kind);
    const isLast = L && i === L.waves.length - 1;
    if (this.cfg.event?.bossInvasion && isLast && L && L.objective.type !== 'boss' && (L.world > 1 || L.index >= 6) && i === L.waves.length - 1) this.queueSpawn(this.rng.pick(['tank', 'chaos', 'shield'] as EnemyKind[]), true);
    this.wave = i + 1;
    if (i > 0) this.onBanner?.(`VAGUE ${i + 1}`, undefined, '#ffd23f', 1.1);
    this.waveTimer = 0;
  }

  /* =========================================================== magnetism */
  effectivePolarity(): 1 | -1 { return (this.player.inZone ? -this.player.polarity : this.player.polarity) as 1 | -1; }

  aimDir(): [number, number] {
    const p = this.player;
    return [Math.sin(p.facing), Math.cos(p.facing)];
  }

  /** Nearest target close to the facing line (aim assist). */
  aimTarget(maxAngle = 0.55, maxDist = 16): { x: number; z: number } | null {
    const p = this.player.body;
    const [fx, fz] = this.aimDir();
    let best: { x: number; z: number } | null = null, bestScore = Infinity;
    const consider = (x: number, z: number) => {
      const dx = x - p.x, dz = z - p.z, d = Math.hypot(dx, dz);
      if (d > maxDist || d < 0.5) return;
      const cos = (dx * fx + dz * fz) / d;
      const ang = Math.acos(clamp(cos, -1, 1));
      if (ang > maxAngle) return;
      const s = ang * 6 + d * 0.15;
      if (s < bestScore) { bestScore = s; best = { x, z }; }
    };
    for (const e of this.enemies) if (!e.dead && !e.body.held && e.state !== 'spawn') consider(e.body.x, e.body.z);
    for (const g of this.generators) if (!g.dead) consider(g.body.x, g.body.z);
    if (this.boss && this.boss.alive) consider(this.boss.body.x, this.boss.body.z + 1);
    return best;
  }

  canHold(b: Body) {
    if (b.held || b.ghost || b.isStatic || b.falling()) return false;
    const strength = this.player.stats.force;
    if (b.kind === 'prop') {
      const p = b.owner as Prop;
      if (p.kind === 'core') return b.magnetic > 0.5;
      return b.mass <= 2.2 * strength + 1.2 || (p.kind === 'car' && strength >= 1.4);
    }
    if (b.kind === 'enemy') {
      const e = b.owner as Enemy;
      if (e.phase || e.state === 'spawn' || e.elite) return false;
      return b.mass <= 1.6 * strength + 0.3;
    }
    return false;
  }

  holdSlot(i: number, n: number): [number, number, number] {
    const p = this.player;
    const spread = Math.min(1.4, 0.45 * (n - 1));
    const a = p.facing + (n > 1 ? (i / (n - 1) - 0.5) * spread : 0) + Math.sin(this.t * 2 + i) * 0.05;
    const rad = 1.35 + (i % 2) * 0.35;
    return [p.body.x + Math.sin(a) * rad, p.body.z + Math.cos(a) * rad, 1.0 + Math.sin(this.t * 4 + i * 1.7) * 0.12];
  }

  private applyMagnet(dt: number) {
    const p = this.player;
    const pb = p.body;
    const pol = this.effectivePolarity();
    const megaT = p.ability.id === 'megaMagnet' && p.ability.active > 0;
    const range = megaT ? 30 : p.stats.range;
    const cone = megaT ? Math.PI : THREE.MathUtils.degToRad(p.stats.cone);
    const force = p.stats.force * (megaT ? 1.4 : 1);
    const [fx, fz] = this.aimDir();
    const hold = p.stats.hold + (megaT ? 6 : 0);
    let affected = 0;
    // drop invalid held
    p.held = p.held.filter((b) => b.alive && b.held);
    for (const b of this.phys.bodies) {
      if (b === pb || b.isStatic || b.ghost || b.magnetic <= 0 || b.held || b.kind === 'boss' || b.kind === 'target') continue;
      if (b.kind === 'enemy') { const e = b.owner as Enemy; if (e.dead || e.phase || e.state === 'spawn') continue; }
      const dx = b.x - pb.x, dz = b.z - pb.z;
      const d = Math.hypot(dx, dz);
      if (d > range + b.r || d < 0.01) continue;
      const cos = (dx * fx + dz * fz) / d;
      if (d > 1.8 && Math.acos(clamp(cos, -1, 1)) > cone) continue;
      let s: number = pol;
      if (b.charge !== 0 && b.charge === pol) s = -s; // same colour = inverted response
      const fall = Math.pow(1 - clamp(d / (range + 0.5), 0, 1), 0.55) * (0.45 + 0.55 * Math.max(0, cos));
      const k = force * fall * b.magnetic * (1 - b.resist);
      if (k <= 0.01) continue;
      affected++;
      if (s > 0) {
        // attract toward hold point
        const hx = pb.x + fx * 1.4, hz = pb.z + fz * 1.4;
        const tx = hx - b.x, tz = hz - b.z, tl = Math.hypot(tx, tz) || 1;
        const acc = (46 * k) / Math.sqrt(b.mass);
        b.vx += (tx / tl) * acc * dt; b.vz += (tz / tl) * acc * dt;
        // lift a little while being dragged
        if (b.y < 0.35) b.y = Math.min(0.35, b.y + dt * 1.5);
        if (tl < 1.5 && p.held.length < hold && this.canHold(b)) this.grab(b);
        if (this.rng.chance(0.25 * this.fx.quality)) this.fx.stream(b.x, 0.6, b.z, pb.x, pb.z, 0xff5a5a, 9, 0.16);
      } else {
        const acc = (34 * k) / Math.sqrt(b.mass);
        b.vx += (dx / d) * acc * dt; b.vz += (dz / d) * acc * dt;
        if (b.kind === 'enemy' && b.speed > 7 && b.thrown <= 0) { b.thrown = 0.35; b.chain = this.newChain(); }
        if (this.rng.chance(0.2 * this.fx.quality)) this.fx.stream(pb.x + fx, 0.6, pb.z + fz, b.x, b.z, 0x5a9bff, 10, 0.16);
      }
    }
    // held objects follow their slots
    const n = p.held.length;
    p.held.forEach((b, i) => {
      const [sx, sz, sy] = this.holdSlot(i, n);
      b.vx = (sx - b.x) * 16; b.vz = (sz - b.z) * 16;
      b.y += (sy - b.y) * Math.min(1, dt * 12); b.vy = 0;
      if (b.kind === 'enemy') { const e = b.owner as Enemy; e.stun = 0.5; }
    });
    p.field = clamp(affected / 3 + n * 0.2 + 0.25, 0, 1);
  }

  grab(b: Body) {
    b.held = true; b.thrown = 0;
    this.player.held.push(b);
    audio.pickup();
    haptics.light();
    this.fx.burst(b.x, 0.8, b.z, 0xff5a5a, 6, 3, 0.35, 0.3);
    if (b.kind === 'enemy') { const e = b.owner as Enemy; e.rig.kick(0.8); if (e.kind !== 'swarm') this.ft.spawn(b.x, 2, b.z, 'CAPTURÉ !', 'ft-small', 0.7); }
  }

  newChain() { this.chainId++; this.chainCounts.set(this.chainId, 0); return this.chainId; }
  chainHit(id: number) {
    if (!id) return;
    const n = (this.chainCounts.get(id) ?? 0) + 1;
    this.chainCounts.set(id, n);
    if (n > this.maxChain) this.maxChain = n;
  }

  flip() {
    const p = this.player;
    if (p.dead || this.state !== 'play') return;
    const was = p.polarity;
    p.polarity = (was === 1 ? -1 : 1) as 1 | -1;
    this.stats.flips++;
    audio.flip(this.effectivePolarity());
    p.rig.polarity = this.effectivePolarity();
    const pb = p.body;
    if (this.effectivePolarity() < 0) {
      // LAUNCH everything held
      const tgt = this.aimTarget();
      const [fx, fz] = this.aimDir();
      let ax = fx, az = fz;
      if (tgt) { const dx = tgt.x - pb.x, dz = tgt.z - pb.z, d = Math.hypot(dx, dz) || 1; ax = dx / d; az = dz / d; p.facing = Math.atan2(ax, az); }
      const n = p.held.length;
      const chain = this.newChain();
      p.held.forEach((b, i) => {
        b.held = false;
        const spread = n > 1 ? (i / (n - 1) - 0.5) * 0.22 : 0;
        const ca = Math.cos(spread), sa = Math.sin(spread);
        const dx = ax * ca - az * sa, dz = ax * sa + az * ca;
        const sp = (27 * p.stats.force) / (0.6 + 0.4 * Math.sqrt(b.mass));
        b.vx = dx * sp; b.vz = dz * sp; b.vy = 0.8; b.y = Math.max(b.y, 0.6);
        b.thrown = 1.3; b.chain = chain;
        if (b.kind === 'prop') (b.owner as Prop).spin = 18;
      });
      // repel pulse
      for (const b of this.phys.query(pb.x + fx * 2, pb.z + fz * 2, p.stats.range * 0.6, this.tmpBodies)) {
        if (b === pb || b.isStatic || b.held || p.held.includes(b) || b.kind === 'boss' || b.kind === 'target' || b.ghost) continue;
        const dx = b.x - pb.x, dz = b.z - pb.z, d = Math.hypot(dx, dz) || 1;
        if ((dx * fx + dz * fz) / d < 0.2) continue;
        const imp = (12 * p.stats.force * (1 - b.resist)) / Math.sqrt(b.mass);
        b.vx += (dx / d) * imp; b.vz += (dz / d) * imp;
        if (b.kind === 'enemy') { b.thrown = 0.5; b.chain = chain; (b.owner as Enemy).stun = 0.4; }
      }
      p.held = [];
      p.rig.punch();
      this.fx.ring(pb.x + fx * 0.8, pb.z + fz * 0.8, 0x4d8dff, 0.3, 3.2, 0.3, 0.9, 0.9);
      this.fx.burst(pb.x + fx * 0.9, 0.9, pb.z + fz * 0.9, 0x6fb0ff, 14, 9, 0.4, 0.35, { dirX: fx, dirZ: fz, spread: 0.7 });
      if (n > 0) {
        audio.launch(Math.min(1, n / 3));
        haptics.medium();
        this.rig.kick(0.4 + n * 0.1);
        this.rig.shake(0.08 + n * 0.03);
      } else haptics.light();
    } else {
      // snap attraction pulse
      this.fx.ring(pb.x, pb.z, 0xff4d4d, 3.5, 0.4, 0.3, 0.7, 0.9);
      haptics.light();
    }
  }

  dash(x: number, z: number) {
    const p = this.player;
    if (p.dashCd > 0 || p.dead || this.state !== 'play') return;
    const l = Math.hypot(x, z) || 1;
    p.dashX = x / l; p.dashZ = z / l; p.dashT = 0.17; p.dashCd = 1.1; p.inv = Math.max(p.inv, 0.25);
    p.facing = Math.atan2(p.dashX, p.dashZ);
    audio.whooshUI();
    haptics.light();
    p.rig.kick(-0.6);
    this.fx.ring(p.body.x, p.body.z, 0xffffff, 0.3, 1.6, 0.25, 0.6);
  }

  /* =========================================================== damage */
  private collide(a: Body, b: Body | null, imp: number, nx: number, nz: number, wall?: any) {
    if (!b) {
      // wall impacts
      if (imp > 6 && a.kind !== 'player') {
        const x = a.x - nx * a.r, z = a.z - nz * a.r;
        if (imp > 9) { this.fx.burst(x, 0.5, z, 0xffffff, 4, 4, 0.3, 0.25); }
        if (a.kind === 'prop') { audio.impact(imp / 25, (a.owner as Prop).spec.material); this.damageProp(a.owner as Prop, imp * 0.8, a.chain); }
        if (a.kind === 'enemy' && a.thrown > 0 && imp > 9) {
          const e = a.owner as Enemy;
          this.damageEnemy(e, imp * 1.3, a.chain, 'wall');
          audio.impact(imp / 20, 'robot');
          this.rig.shake(0.05);
        }
        void wall;
      }
      return;
    }
    if (a.kind === 'player' || b.kind === 'player') return;
    // projectile → enemy
    this.tryHit(a, b, imp, nx, nz);
    this.tryHit(b, a, imp, -nx, -nz);
    // generic prop impacts
    if (imp > 5) {
      if (a.kind === 'prop' && b.kind === 'prop') {
        audio.impact(imp / 25, (a.owner as Prop).spec.material);
        const ch = a.thrown > 0 ? a.chain : b.thrown > 0 ? b.chain : 0;
        this.damageProp(a.owner as Prop, imp * (b.mass / a.mass) * 0.6, ch);
        this.damageProp(b.owner as Prop, imp * (a.mass / b.mass) * 0.6, ch);
        if (ch && imp > 9) { this.chainHit(ch); }
        if (imp > 10) this.fx.burst((a.x + b.x) / 2, 0.6, (a.z + b.z) / 2, 0xfff1d6, 5, 4, 0.3, 0.2);
      }
    }
  }

  private tryHit(proj: Body, target: Body, imp: number, nx: number, nz: number) {
    if (proj.thrown <= 0 || imp < 4.5) return;
    const dmgBase = imp * Math.pow(proj.mass, 0.6) * 2.1 * heroStatMult(this.cfg.heroLevel);
    if (target.kind === 'enemy') {
      const e = target.owner as Enemy;
      if (e.dead) return;
      // shield: frontal deflect
      if (e.kind === 'shield' && e.state !== 'spawn') {
        const fx = Math.sin(e.facing), fz = Math.cos(e.facing);
        if (-(nx * fx + nz * fz) > 0.6) {
          audio.shield(); this.fx.burst(target.x - nx * target.r, 0.9, target.z - nz * target.r, 0x30e0ff, 10, 6, 0.4, 0.3);
          this.ft.spawn(target.x, 2.2, target.z, 'BLOQUÉ', 'ft-block', 0.6);
          e.rig.kick(0.4);
          return;
        }
      }
      const isEnemyProj = proj.kind === 'enemy';
      this.damageEnemy(e, dmgBase, proj.chain, isEnemyProj ? 'enemy' : 'object');
      // knockback chain: target becomes a projectile too
      if (target.mass < proj.mass * 3) { target.thrown = 0.7; target.chain = proj.chain; }
      e.stun = 0.5;
      if (isEnemyProj) this.damageEnemy(proj.owner as Enemy, dmgBase * 0.5, proj.chain, 'enemy');
      if (proj.kind === 'prop') {
        const p = proj.owner as Prop;
        if (p.kind === 'iceBlock') { e.body.frozen = 2.5; audio.freeze(); this.fx.burst(target.x, 1, target.z, 0xbff2ff, 12, 5, 0.4, 0.5); }
        if (p.kind === 'magmaRock') { e.burn = 3; this.fx.burst(target.x, 1, target.z, 0xff7a1f, 12, 5, 0.45, 0.5); }
        if (p.kind === 'barrel') { this.damageProp(p, 999, proj.chain); }
        this.damageProp(p, imp * 0.6, proj.chain);
      }
      this.chainHit(proj.chain);
      this.combo.add(1);
      const big = dmgBase > 60;
      this.hitstop = Math.max(this.hitstop, big ? 0.07 : 0.035);
      this.rig.shake(big ? 0.18 : 0.08);
      audio.hitEnemy(Math.min(1, dmgBase / 80));
      audio.impact(Math.min(1, imp / 20), 'robot');
      haptics.medium();
      this.fx.flash(target.x - nx * target.r, 0.8, target.z - nz * target.r, 0xffffff, 0.2, big ? 1.6 : 1, 0.15);
      this.fx.burst(target.x - nx * target.r, 0.8, target.z - nz * target.r, 0xfff3a0, big ? 14 : 8, 7, 0.4, 0.3, { dirX: -nx, dirZ: -nz, spread: 1.2 });
    } else if (target.kind === 'target') {
      const g = target.owner as Prop;
      this.damageTarget(g, dmgBase, proj.chain);
      if (proj.kind === 'prop' && (proj.owner as Prop).kind === 'barrel') this.damageProp(proj.owner as Prop, 999, proj.chain);
    } else if (target.kind === 'boss') {
      this.boss?.hitBy(proj, dmgBase, nx, nz);
      if (proj.kind === 'prop' && (proj.owner as Prop).kind === 'barrel') this.damageProp(proj.owner as Prop, 999, proj.chain);
    } else if (target.kind === 'prop') {
      const tp = target.owner as Prop;
      if (tp.kind === 'barrel' && imp > 6) this.damageProp(tp, 999, proj.chain);
      else if (imp > 8) { target.thrown = Math.max(target.thrown, 0.5); target.chain = proj.chain; }
    }
  }

  damageProp(p: Prop, dmg: number, chain = 0) {
    if (p.dead || (p as any).target || (p as any).crane) return;
    if (p.kind === 'cell' || p.kind === 'core') return;
    p.hp -= dmg;
    if (p.hp > 0) return;
    p.dead = true;
    const b = p.body;
    if (p.kind === 'barrel') {
      // chain explosion slightly delayed for readability
      this.later(0.06 + Math.random() * 0.06, () => this.explode(b.x, b.z, 3.2, 70, chain || this.newChain(), 'barrel'));
      this.removeProp(p, false);
      return;
    }
    const col = p.kind === 'crate' ? 0xc98a4b : p.kind === 'iceBlock' ? 0xbff2ff : p.kind === 'magmaRock' ? 0x3a2220 : 0x8fa3b8;
    this.fx.chunks(b.x, 0.5, b.z, col, 8, 6, 0.24);
    this.fx.smoke(b.x, 0.4, b.z, 3, 0x8a7a6a, 0.9);
    audio.impact(0.8, p.spec.material);
    if (chain) { this.combo.add(1); this.addScore(25, b.x, b.z); }
    this.removeProp(p, false);
  }

  private ammoT = 0;
  /** The arena must never run dry: magnetism needs objects. Missing ammo drops from the sky. */
  private keepAmmo(dt: number) {
    this.ammoT -= dt;
    if (this.ammoT > 0) return;
    this.ammoT = 0.7;
    const ammo = this.props.filter((x) => !x.dead && x.falling <= 0 && x.kind !== 'cell' && x.kind !== 'core').length;
    const min = this.boss ? 9 : 7;
    if (ammo < min) this.dropProp();
  }

  /** Props falling from the sky (keeps the arena stocked). */
  dropProp(kind?: PropKind) {
    const kinds: PropKind[] = this.world.id === 3 || this.world.id === 6 ? ['debris', 'barrel'] : this.world.id === 5 ? ['iceBlock', 'crate', 'barrel'] : this.world.id === 4 ? ['magmaRock', 'crate', 'barrel'] : ['crate', 'barrel', 'crate'];
    const p = this.spawnProp(kind ?? this.rng.pick(kinds));
    p.body.y = 8; p.body.vy = -2;
  }

  removeProp(p: Prop, silent = true) {
    p.dead = true;
    p.body.alive = false;
    p.body.held = false;
    p.mesh.removeFromParent();
    this.props = this.props.filter((x) => x !== p);
    void silent;
  }

  damageTarget(g: Prop, dmg: number, chain: number) {
    if (g.dead) return;
    g.hp -= dmg;
    const isGen = (g as any).target === 'generator';
    this.fx.burst(g.body.x, 1.5, g.body.z, isGen ? 0xff4d4d : 0x2ee6a6, 10, 6, 0.4, 0.3);
    this.ft.spawn(g.body.x, 2.8, g.body.z, String(Math.round(dmg)), 'ft-dmg', 0.7);
    audio.impact(0.8, 'metal');
    g.mesh.scale.setScalar(1.12);
    if (isGen) { this.combo.add(1); this.chainHit(chain); this.addScore(40, g.body.x, g.body.z); }
    if (g.hp <= 0) {
      g.dead = true; g.body.alive = false;
      if (isGen) {
        this.explode(g.body.x, g.body.z, 3.5, 60, chain || this.newChain(), 'barrel');
        g.mesh.removeFromParent();
        this.objective.progress++;
        this.ft.spawn(g.body.x, 3, g.body.z, 'GÉNÉRATEUR DÉTRUIT !', 'ft-big', 1.2);
        this.addScore(500, g.body.x, g.body.z);
      } else {
        // protect core destroyed → defeat
        this.explode(g.body.x, g.body.z, 4, 0, 0, 'boss');
        g.mesh.removeFromParent();
        this.end(false);
      }
    }
  }

  damageEnemy(e: Enemy, dmg: number, chain: number, source: 'object' | 'enemy' | 'explosion' | 'wall' | 'ability' | 'hazard' | 'bolt') {
    if (e.dead || e.state === 'spawn') return;
    if (e.phase && source !== 'ability') return;
    e.hp -= dmg;
    if (dmg >= 3) {
      e.rig.flash = 1; e.rig.kick(0.7); e.hpBarT = 2;
      this.ft.spawn(e.body.x, 1.6 * e.scale + 0.4, e.body.z, String(Math.round(dmg)), dmg > 60 ? 'ft-dmg ft-crit' : 'ft-dmg', 0.75, dmg > 60 ? 1.25 : 1);
    } else e.rig.flash = Math.max(e.rig.flash, 0.3);
    this.stats.damageTaken += 0;
    if (e.hp <= 0) this.killEnemy(e, source, chain);
  }

  killEnemy(e: Enemy, source: string, chain = 0) {
    if (e.dead) return;
    e.dead = true; e.dying = 0.18;
    const b = e.body;
    if (b.held) { b.held = false; this.player.held = this.player.held.filter((x) => x !== b); }
    b.alive = false;
    if (source === 'bomb') {
      // self-destruct: no reward for the player
      this.later(0.02, () => this.explode(b.x, b.z, 2.8, 32 * (e.elite ? 2 : 1), this.newChain(), 'bomber'));
      return;
    }
    this.stats.kills++;
    if (source === 'object' || source === 'wall' || source === 'enemy') this.stats.objectKills++;
    if (source === 'explosion') this.stats.explosionKills++;
    if (source === 'hazard') this.stats.ringouts++;
    if (this.objective.type === 'ringout' && source === 'hazard') this.objective.progress++;
    this.combo.add(1);
    this.chainHit(chain);
    const pts = e.def.score * (e.elite ? 5 : 1);
    this.addScore(pts, b.x, b.z);
    // VFX: pop!
    const c = e.def.color;
    this.fx.flash(b.x, 0.8, b.z, 0xffffff, 0.3, 2.2 * e.scale, 0.2);
    this.fx.burst(b.x, 0.8, b.z, c, 16, 8, 0.5, 0.45);
    this.fx.burst(b.x, 0.8, b.z, 0xfff3a0, 10, 10, 0.3, 0.3);
    this.fx.chunks(b.x, 0.8, b.z, c, 6, 7, 0.22);
    this.fx.chunks(b.x, 0.8, b.z, this.rng.pick(ROBOT_PARTS), 4, 6, 0.18);
    this.fx.ring(b.x, b.z, c, 0.3, 2.5 * e.scale, 0.35, 0.8);
    audio.enemyDie();
    haptics.medium();
    this.rig.shake(e.elite ? 0.35 : 0.1);
    if (e.kind === 'bomber' && source !== 'hazard') this.later(0.05, () => this.explode(b.x, b.z, 2.8, 55, chain || this.newChain(), 'barrel'));
    // drops
    const coins = Math.max(1, Math.round((e.def.score / 100) * (e.elite ? 6 : 1)));
    for (let i = 0; i < Math.min(6, coins); i++) this.later(0.05 * i, () => this.coinPickup(b.x, b.z));
    if (this.rng.chance(e.elite ? 1 : 0.05) && this.player.hp < this.player.maxHp) this.later(0.2, () => this.heartPickup(b.x, b.z));
  }

  coinRain(x: number, z: number, n: number) {
    for (let i = 0; i < n; i++) this.later(i * 0.04, () => this.coinPickup(x + (Math.random() - 0.5) * 4, z + (Math.random() - 0.5) * 3));
  }
  private coinPickup(x: number, z: number) {
    this.stats.coins += 1;
    this.fx.burst(x, 1, z, 0xffd23f, 3, 4, 0.35, 0.4);
    this.ft.spawn(x, 1.2, z, '🪙', 'ft-coin', 0.6, 0.8);
    audio.coin(this.stats.coins);
  }
  private heartPickup(x: number, z: number) {
    const heal = Math.round(this.player.maxHp * 0.15);
    this.player.hp = Math.min(this.player.maxHp, this.player.hp + heal);
    this.ft.spawn(x, 1.5, z, `❤️ +${heal}`, 'ft-heal', 1);
    audio.pickup();
  }

  addScore(pts: number, x: number, z: number) {
    const v = Math.round(pts * this.combo.mult());
    this.score += v;
    void x; void z;
  }

  explode(x: number, z: number, radius: number, dmg: number, chain: number, source: 'barrel' | 'bomber' | 'boss' | 'ability') {
    this.fx.flash(x, 0.8, z, 0xfff1a0, 0.6, radius * 0.9, 0.28, 1);
    this.fx.flash(x, 0.5, z, 0xff7a1f, 0.4, radius * 0.7, 0.4, 0.9);
    this.fx.ring(x, z, 0xffb627, 0.4, radius * 1.4, 0.4, 0.9);
    this.fx.ring(x, z, 0xffffff, 0.2, radius * 0.9, 0.25, 0.7);
    this.fx.burst(x, 0.6, z, 0xff7a1f, 26, 10, 0.7, 0.55, { up: 8 });
    this.fx.burst(x, 0.6, z, 0xffe14d, 16, 14, 0.4, 0.35);
    this.fx.smoke(x, 0.6, z, 9, 0x2b2b33, 1.6);
    this.fx.chunks(x, 0.6, z, 0x2b2b33, 7, 9, 0.2);
    audio.explosion(radius / 3);
    haptics.heavy();
    this.rig.shake(0.45);
    this.rig.kick(0.6);
    this.hitstop = Math.max(this.hitstop, 0.06);
    this.onFlash?.('#ffb627', 0.18);
    for (const b of this.phys.query(x, z, radius, [])) {
      if (b.isStatic && b.kind !== 'target') continue;
      const dx = b.x - x, dz = b.z - z, d = Math.hypot(dx, dz) || 0.01;
      const f = 1 - clamp(d / (radius + b.r), 0, 1);
      if (b.kind === 'player') {
        if (source === 'ability') continue;
        const pd = dmg * f * (source === 'barrel' ? 0.3 : 0.8);
        if (pd > 1) this.hurtPlayer(pd, dx / d, dz / d, 10 * f);
        continue;
      }
      if (b.kind === 'target') { if (dmg > 0 && (b.owner as any).target === 'generator') this.damageTarget(b.owner as Prop, dmg * f, chain); continue; }
      if (b.kind === 'boss') { this.boss?.explosionHit(dmg * f); continue; }
      if (b.held) continue;
      const imp = (22 * f * (1 - b.resist * 0.5)) / Math.sqrt(b.mass);
      b.vx += (dx / d) * imp; b.vz += (dz / d) * imp; b.vy = Math.max(b.vy, 6 * f); b.y = Math.max(b.y, 0.2);
      b.thrown = 0.8; b.chain = chain;
      if (b.kind === 'enemy') this.damageEnemy(b.owner as Enemy, dmg * (0.4 + f * 0.6), chain, 'explosion');
      else if (b.kind === 'prop') { const p = b.owner as Prop; if (p.kind === 'barrel' && !p.dead) this.damageProp(p, 999, chain); else this.damageProp(p, dmg * f * 0.6, chain); }
    }
  }

  hurtPlayer(dmg: number, nx = 0, nz = 0, knock = 6) {
    const p = this.player;
    if (p.dead || p.inv > 0 || this.state !== 'play') return;
    if (p.ability.id === 'phaseDash' && p.ability.active > 0) return;
    p.hp -= dmg;
    this.stats.damageTaken += dmg;
    p.inv = 0.45;
    p.body.vx += nx * knock; p.body.vz += nz * knock;
    p.rig.hurt();
    audio.hurt();
    haptics.heavy();
    this.rig.shake(0.3);
    this.onFlash?.('#ff2d2d', 0.3);
    this.ft.spawn(p.body.x, 2.2, p.body.z, `-${Math.round(dmg)}`, 'ft-hurt', 0.8);
    this.fx.burst(p.body.x, 1, p.body.z, 0xff4d4d, 10, 6, 0.4, 0.35);
    if (p.hp <= 0) {
      p.hp = 0; p.dead = true;
      p.rig.play('defeat');
      for (const b of p.held) b.held = false;
      p.held = [];
      this.slowmo = 0.8;
      this.later(1.4, () => this.end(false));
    }
  }

  /* =========================================================== bolts */
  fireBolt(x: number, z: number, dx: number, dz: number, speed: number, dmg: number, owner: Bolt['owner'], color: number, r = 0.22, y = 1) {
    const b = this.boltPool.find((q) => !q.active);
    if (!b) return;
    const l = Math.hypot(dx, dz) || 1;
    b.x = x; b.z = z; b.y = y; b.vx = (dx / l) * speed; b.vz = (dz / l) * speed; b.r = r; b.dmg = dmg; b.life = 3.5; b.owner = owner; b.color = color; b.active = true; b.chain = 0;
    b.mesh.visible = true; (b.mesh.material as THREE.MeshBasicMaterial).color.setHex(color); b.mesh.scale.setScalar(r * 1.4);
    this.bolts.push(b);
  }

  private updateBolts(dt: number) {
    const p = this.player, pb = p.body;
    const pol = this.effectivePolarity();
    const [fx, fz] = this.aimDir();
    for (const b of this.bolts) {
      if (!b.active) continue;
      b.life -= dt;
      b.x += b.vx * dt; b.z += b.vz * dt;
      b.mesh.position.set(b.x, b.y, b.z);
      if (this.rng.chance(0.5 * this.fx.quality)) this.fx.trail(b.x, b.y, b.z, b.color, b.r * 2, 0.2);
      let kill = b.life <= 0 || Math.abs(b.x) > HW + 0.2 || Math.abs(b.z) > HH + 0.2;
      if (!kill && b.owner !== 'player') {
        // repel field reflects enemy shots
        const dx = b.x - pb.x, dz = b.z - pb.z, d = Math.hypot(dx, dz);
        if (pol < 0 && !p.dead && d < p.stats.range * 0.75 && d > 0.3 && (dx * fx + dz * fz) / d > Math.cos(THREE.MathUtils.degToRad(p.stats.cone + 10))) {
          const tgt = this.aimTarget(1.2, 20);
          let rx = dx / d, rz = dz / d;
          if (tgt) { const tx = tgt.x - b.x, tz = tgt.z - b.z, tl = Math.hypot(tx, tz) || 1; rx = tx / tl; rz = tz / tl; }
          const sp = Math.hypot(b.vx, b.vz) * 1.4;
          b.vx = rx * sp; b.vz = rz * sp; b.owner = 'player'; b.dmg *= 2; b.color = 0x6fb0ff; b.chain = this.newChain();
          (b.mesh.material as THREE.MeshBasicMaterial).color.setHex(b.color);
          this.fx.burst(b.x, b.y, b.z, 0x6fb0ff, 8, 5, 0.3, 0.25);
          this.ft.spawn(b.x, 2, b.z, 'RENVOYÉ !', 'ft-small', 0.6);
          audio.shield();
        } else if (d < pb.r + b.r && !p.dead) {
          this.hurtPlayer(b.dmg, b.vx / (Math.hypot(b.vx, b.vz) || 1), b.vz / (Math.hypot(b.vx, b.vz) || 1), 4);
          kill = true;
        }
        // protect core
        if (!kill && this.protectCore && !this.protectCore.dead && Math.hypot(b.x - this.protectCore.body.x, b.z - this.protectCore.body.z) < 1.4) { this.damageTarget(this.protectCore, b.dmg, 0); kill = true; }
      }
      if (!kill && b.owner === 'player') {
        for (const e of this.enemies) {
          if (e.dead || e.phase) continue;
          if (Math.hypot(e.body.x - b.x, e.body.z - b.z) < e.body.r + b.r) {
            this.damageEnemy(e, b.dmg, b.chain, 'bolt'); this.combo.add(1); this.chainHit(b.chain); kill = true; break;
          }
        }
        if (!kill && this.boss && this.boss.alive && Math.hypot(this.boss.body.x - b.x, this.boss.body.z - b.z) < this.boss.body.r + b.r) { this.boss.boltHit(b.dmg); kill = true; }
      }
      if (!kill && this.phys.blocked(b.x, b.z, 0)) kill = true;
      if (kill) {
        b.active = false; b.mesh.visible = false;
        this.fx.burst(b.x, b.y, b.z, b.color, 5, 3, 0.3, 0.2);
      }
    }
    this.bolts = this.bolts.filter((b) => b.active);
  }

  /* =========================================================== flow */
  later(t: number, fn: () => void) { this.delayed.push({ t, fn }); }

  private comboTier(t: ComboTier, idx: number) {
    audio.combo(idx);
    this.onTier?.(t, idx);
    if (t.shake) this.rig.shake(t.shake);
    if (t.slowmo) this.slowmo = Math.max(this.slowmo, t.slowmo);
    if (idx >= 3) { this.rig.kick(0.5); haptics.heavy(); this.fx.ring(this.player.body.x, this.player.body.z, parseInt(t.color.slice(1), 16), 0.5, 8, 0.6, 0.8); }
  }

  begin() {
    this.state = 'play';
    if (!this.boss) this.spawnWave(0);
    if (this.level?.tip) this.onTip?.(this.level.tip);
  }

  update(rawDt: number) {
    const dtReal = Math.min(rawDt, 1 / 20);
    this.t += dtReal;
    // hitstop & slowmo
    if (this.hitstop > 0) { this.hitstop -= dtReal; this.timeScale = 0.05; }
    else if (this.slowmo > 0) { this.slowmo -= dtReal; this.timeScale = 0.35; }
    else this.timeScale = 1;
    const dt = dtReal * this.timeScale;

    if (this.state === 'intro') {
      this.introT += dtReal;
      this.rig.zoomTarget = 1;
    }
    if (this.state === 'play') this.time += dt;

    // delayed calls
    for (const d of this.delayed) d.t -= dt;
    const due = this.delayed.filter((d) => d.t <= 0);
    if (due.length) { this.delayed = this.delayed.filter((d) => d.t > 0); due.forEach((d) => d.fn()); }

    this.updatePlayer(dt);
    if (this.state === 'play') this.keepAmmo(dt);
    if (this.state === 'play' && !this.player.dead) this.applyMagnet(dt);
    for (const h of this.hazards) h.update(dt);
    this.phys.step(dt);
    this.updateProps(dt);
    this.updateEnemies(dt);
    this.updatePending(dt);
    this.updateBolts(dt);
    this.boss?.update(dt);
    this.combo.update(dt);
    if (this.state === 'play') this.updateObjective(dt);
    if (this.cfg.mode === 'chaos' && this.state === 'play') this.updateChaos(dt);
    this.fx.update(dt);
    for (const a of this.arena.animated) a(dt, this.t);
    // camera
    const pb = this.player.body;
    this.rig.target.set(pb.x, 0, pb.z);
    this.rig.northBias = this.boss ? 2.5 : 0;
    this.rig.update(dtReal);
    audio.field(this.state === 'play' && !this.player.dead ? this.player.field : 0, this.effectivePolarity());
    audio.setIntensity(clamp(this.combo.count / 20 + (this.boss ? 0.4 : 0), 0, 1));
  }

  private updatePlayer(dt: number) {
    const p = this.player, b = p.body;
    p.dashCd = Math.max(0, p.dashCd - dt);
    p.inv = Math.max(0, p.inv - dt);
    p.abilityCd = Math.max(0, p.abilityCd - dt * (1 + Math.min(this.combo.count, 30) * 0.02));
    p.slow = Math.max(0, p.slow - dt);
    updateAbility(this, dt);
    if (!p.dead && this.state === 'play') {
      const inp = this.input;
      const spd = p.stats.speed * (p.slow > 0 ? 0.55 : 1) * (p.held.length ? 0.92 : 1);
      if (p.dashT > 0) {
        p.dashT -= dt;
        b.vx = p.dashX * 19; b.vz = p.dashZ * 19;
        this.fx.trail(b.x, 0.8, b.z, p.polarity > 0 ? 0xff7a7a : 0x7ab0ff, 0.6, 0.3);
        // dash bumps small enemies
        for (const e of this.enemies) {
          if (e.dead || e.body.mass > 3 || e.phase) continue;
          const dx = e.body.x - b.x, dz = e.body.z - b.z, d = Math.hypot(dx, dz);
          if (d < b.r + e.body.r + 0.2) { e.body.vx += (dx / (d || 1)) * 10; e.body.vz += (dz / (d || 1)) * 10; e.stun = 0.4; e.body.thrown = 0.4; e.body.chain = this.newChain(); }
        }
      } else if (inp && (inp.moveX || inp.moveZ)) {
        const tx = inp.moveX * spd, tz = inp.moveZ * spd;
        const k = 1 - Math.exp(-(this.phys.friction < 0.5 ? 4 : 14) * dt);
        b.vx += (tx - b.vx) * k; b.vz += (tz - b.vz) * k;
        const target = Math.atan2(inp.moveX, inp.moveZ);
        p.facing = angleLerp(p.facing, target, 1 - Math.exp(-16 * dt));
      } else {
        // aim assist when standing still
        const tgt = this.aimTarget(Math.PI, 10);
        if (tgt) p.facing = angleLerp(p.facing, Math.atan2(tgt.x - b.x, tgt.z - b.z), 1 - Math.exp(-5 * dt));
      }
      // safe position tracking (for pits)
      if (!this.hazards.some((h) => h.isDanger?.(b.x, b.z, 0.6))) { b.lastSafeX = b.x; b.lastSafeZ = b.z; }
    }
    // visuals
    const r = p.rig;
    r.root.position.set(b.x, b.y, b.z);
    r.root.rotation.y = angleLerp(r.root.rotation.y, p.facing, 1 - Math.exp(-20 * dt));
    r.moveSpeed = clamp(Math.hypot(b.vx, b.vz) / p.stats.speed, 0, 1);
    r.field = this.state === 'play' && !p.dead ? p.field : 0;
    r.polarity = this.effectivePolarity();
    r.update(dt);
    if (r.anim === 'idle' && r.moveSpeed > 0.15) r.anim = 'run';
    if (r.anim === 'run' && r.moveSpeed <= 0.15) r.anim = 'idle';
    // field fan
    const fm = p.fieldMat;
    fm.uniforms.uTime.value = this.t;
    fm.uniforms.uPol.value = this.effectivePolarity() > 0 ? 1 : -1;
    (fm.uniforms.uColor.value as THREE.Color).setHex(this.effectivePolarity() > 0 ? 0xff3b3b : 0x2f7bff);
    fm.uniforms.uInt.value = this.state === 'play' && !p.dead ? 0.55 + p.field * 0.45 : 0;
    const fp = p.fieldMesh.parent!;
    fp.rotation.y = p.facing - r.root.rotation.y;
    const mega = p.ability.id === 'megaMagnet' && p.ability.active > 0;
    p.fieldMesh.scale.setScalar(mega ? 14 : p.stats.range);
    // invulnerability blink
    r.pivot.visible = p.inv > 0 && !p.dead && p.dashT <= 0 ? Math.sin(this.t * 40) > -0.3 : true;
    // skin aura particles
    if (p.aura !== 'none' && this.rng.chance(0.35 * this.fx.quality)) this.auraParticle(b.x, b.z, p.aura);
  }

  private auraParticle(x: number, z: number, aura: string) {
    const col = { fire: 0xff7a1f, snow: 0xe8f8ff, stars: 0xff9df5, sparks: 0xffd23f, wisps: 0xbfe3ff, bolts: 0x31f5ff }[aura] ?? 0xffffff;
    const a = Math.random() * TAU, r = 0.3 + Math.random() * 0.3;
    this.fx.glow.spawn(x + Math.cos(a) * r, 0.3 + Math.random() * 1.2, z + Math.sin(a) * r, 0, aura === 'snow' ? -0.5 : 1.2, 0, new THREE.Color(col), 0.8, 0.22, 0.6, aura === 'fire' ? -1 : 0, 1);
    if (aura === 'bolts' && Math.random() < 0.05) this.fx.lightning(x, 1.2, z, x + (Math.random() - 0.5) * 1.6, 0.2, z + (Math.random() - 0.5) * 1.6, 0x31f5ff, 0.06);
  }

  input: { moveX: number; moveZ: number } | null = null;

  private updateProps(dt: number) {
    for (const p of [...this.props]) {
      if (p.dead) continue;
      const b = p.body;
      if (p.falling > 0) {
        p.falling -= dt;
        p.mesh.position.y -= dt * 6;
        p.mesh.scale.multiplyScalar(Math.exp(-3 * dt));
        if (p.falling <= 0) {
          this.removeProp(p);
          if (p.kind === 'cell') this.later(1, () => this.spawnProp('cell'));
          else if (p.kind === 'core') this.later(0.5, () => { const c = this.spawnProp('core', 0, 2); c.body.y = 8; });
        }
        continue;
      }
      p.mesh.position.set(b.x, b.y, b.z);
      if (p.spin > 0) { p.mesh.rotation.y += p.spin * dt; p.mesh.rotation.x += p.spin * 0.4 * dt; p.spin *= Math.exp(-2 * dt); }
      else { p.mesh.rotation.x *= Math.exp(-8 * dt); }
      if (b.held) { p.mesh.rotation.y += dt * 3; }
      if (b.thrown > 0 && b.speed > 8 && this.rng.chance(0.6 * this.fx.quality)) this.fx.trail(b.x, b.y + 0.4, b.z, 0x9fd0ff, 0.4, 0.25);
      if (b.y > 0.05 && !b.held && b.vy < -8) {
        // landing from a drop
        if (b.y + b.vy * dt <= 0) {
          this.fx.ring(b.x, b.z, 0xffffff, 0.3, 1.5, 0.3, 0.6); this.fx.smoke(b.x, 0.2, b.z, 3, 0x9a8a7a, 0.8); audio.impact(0.5, p.spec.material);
          for (const e of this.enemies) if (!e.dead && Math.hypot(e.body.x - b.x, e.body.z - b.z) < 1.2) this.damageEnemy(e, 25, 0, 'object');
        }
      }
      if (p.kind === 'core') {
        const glow = p.mesh.userData.glow as THREE.Mesh | undefined;
        if (glow) (glow.material as THREE.MeshBasicMaterial).opacity = b.magnetic > 0.5 ? 0.5 + Math.sin(this.t * 10) * 0.2 : 0.12;
      }
      if (this.collector && p.kind === 'cell' && Math.hypot(b.x - this.collector.x, b.z - this.collector.z) < 1.5) {
        this.objective.progress++;
        audio.deposit(); haptics.success();
        this.fx.flash(this.collector.x, 1, this.collector.z, 0x2ee6a6, 0.5, 2.5, 0.3);
        this.fx.burst(this.collector.x, 1, this.collector.z, 0x7dffd8, 20, 8, 0.5, 0.5, { up: 10 });
        this.ft.spawn(this.collector.x, 2.5, this.collector.z, `⚡ ${this.objective.progress}/${this.objective.target}`, 'ft-big', 1);
        this.addScore(300, b.x, b.z);
        this.combo.add(1);
        b.held = false;
        this.removeProp(p);
        if (this.props.filter((x) => x.kind === 'cell').length < this.objective.target - this.objective.progress) this.later(1, () => this.spawnProp('cell'));
      }
    }
    for (const g of this.generators) if (!g.dead) {
      g.mesh.scale.lerp(new THREE.Vector3(1, 1, 1), 1 - Math.exp(-10 * dt));
      const glow = g.mesh.userData.glow as THREE.Mesh;
      glow.scale.setScalar(0.45 + Math.sin(this.t * 6) * 0.05);
    }
    if (this.protectCore && !this.protectCore.dead) {
      this.protectCore.mesh.scale.lerp(new THREE.Vector3(1, 1, 1), 1 - Math.exp(-10 * dt));
      (this.protectCore.mesh.userData.glow as THREE.Mesh).scale.setScalar(0.55 + Math.sin(this.t * 3) * 0.06);
    }
    if (this.collector) this.collector.mesh.rotation.y += dt * 0.6;
  }

  private updateEnemies(dt: number) {
    for (const e of this.enemies) {
      const b = e.body;
      if (e.dead) {
        e.dying -= dt;
        const k = Math.max(0, e.dying / 0.18);
        e.rig.root.scale.setScalar(e.scale * (1 + (1 - k) * 0.5) * k);
        if (e.dying <= 0 && e.rig.root.parent) e.rig.dispose();
        continue;
      }
      if (e.falling > 0) {
        e.falling -= dt;
        e.rig.root.position.y -= dt * 7;
        e.rig.root.scale.multiplyScalar(Math.exp(-2.5 * dt));
        e.rig.root.rotation.z += dt * 6;
        if (e.falling <= 0) { this.killEnemy(e, 'hazard', b.chain); e.dying = 0.01; }
        continue;
      }
      updateEnemyAI(this, e, dt);
      e.rig.root.position.set(b.x, b.y, b.z);
      e.rig.root.rotation.y = angleLerp(e.rig.root.rotation.y, e.facing, 1 - Math.exp(-10 * dt));
      const moving = clamp(b.speed / Math.max(0.1, e.def.speed), 0, 1);
      e.rig.update(dt, moving, { phase: e.phase, charge: e.charge, fuse: e.fuse, field: e.field });
      if (b.frozen > 0) { b.frozen -= dt; e.rig.mat.emissive.setRGB(0.2, 0.45, 0.6); }
      if (e.burn > 0) { e.burn -= dt; this.damageEnemy(e, 14 * dt, 0, 'hazard'); if (Math.floor(e.burn * 2) !== Math.floor((e.burn + dt) * 2)) this.ft.spawn(b.x, 1.8, b.z, '🔥7', 'ft-crit', 0.5, 0.8); if (this.rng.chance(0.4)) this.fx.trail(b.x, 1, b.z, 0xff7a1f, 0.4, 0.4); if (e.hp <= 0) continue; }
      if (b.held) { e.rig.root.rotation.z = Math.sin(this.t * 30) * 0.15; }
      else e.rig.root.rotation.z = 0;
    }
    // drop dead enemies from list once their death anim ends
    this.enemies = this.enemies.filter((e) => !(e.dead && e.dying <= 0));
  }

  private updatePending(dt: number) {
    for (const s of this.pending) {
      s.t -= dt;
      s.marker.scale.setScalar(1 + Math.sin(this.t * 14) * 0.15);
      (s.marker.material as THREE.MeshBasicMaterial).opacity = 0.5 + Math.sin(this.t * 14) * 0.3;
      if (this.rng.chance(0.5 * this.fx.quality)) this.fx.glow.spawn(s.x + (Math.random() - 0.5), 0.1, s.z + (Math.random() - 0.5), 0, 5, 0, new THREE.Color(0xff4d4d), 0.8, 0.25, 0.5, 0, 1);
      if (s.t <= 0) {
        s.marker.removeFromParent(); s.marker.geometry.dispose(); (s.marker.material as THREE.Material).dispose();
        this.spawnEnemy(s.kind, s.x, s.z, s.elite);
      }
    }
    this.pending = this.pending.filter((s) => s.t > 0);
  }

  aliveEnemies() { return this.enemies.filter((e) => !e.dead).length + this.pending.length; }

  private updateObjective(dt: number) {
    const o = this.objective;
    const L = this.level;
    this.waveTimer += dt;
    const alive = this.aliveEnemies();
    const loops = o.type === 'survive' || o.type === 'combo' || o.type === 'ringout' || o.type === 'protect' || o.type === 'collect' || o.type === 'destroy' || o.type === 'rush' || o.type === 'survival' || o.type === 'chaos';
    if (o.type !== 'boss' && o.type !== 'bossrush') {
      const waves = L ? L.waves.length : 999;
      const nextReady = alive <= (o.type === 'eliminate' ? 0 : 2) || (this.waveTimer > 22 && alive < 8);
      if (nextReady && (this.wave < waves || loops) && this.waveTimer > 1.2) this.spawnWave(this.wave);
      if (o.type === 'survival') o.progress = this.wave;
    }
    switch (o.type) {
      case 'eliminate': if (L && this.wave >= L.waves.length && this.aliveEnemies() === 0) this.end(true); break;
      case 'survive': case 'protect': if (this.timeLimit && this.time >= this.timeLimit) this.end(true); break;
      case 'combo': o.progress = Math.max(o.progress, this.combo.count); if (o.progress >= o.target) this.end(true); break;
      case 'ringout': case 'collect': case 'destroy': o.progress = Math.min(o.progress, o.target); if (o.progress >= o.target) this.end(true); break;
      case 'rush': case 'chaos': if (this.timeLimit && this.time >= this.timeLimit) this.end(true); break;
      default: break;
    }
  }

  private updateChaos(dt: number) {
    this.chaosT -= dt;
    if (this.chaosT > 0) return;
    this.chaosT = 15;
    const rules = ['gravity', 'polarity', 'ice', 'heavy', 'storm'];
    const r = this.rng.pick(rules.filter((x) => x !== this.chaosRule));
    this.chaosRule = r;
    this.phys.driftX = 0; this.phys.driftZ = 0; this.phys.friction = this.world.friction; this.forceMult = 1;
    const names: Record<string, string> = { gravity: 'GRAVITÉ FOLLE', polarity: 'POLARITÉS ALÉATOIRES', ice: 'SOL GELÉ', heavy: 'OBJETS GÉANTS', storm: 'TEMPÊTE MAGNÉTIQUE' };
    if (r === 'gravity') { const a = this.rng.range(0, TAU); this.phys.driftX = Math.cos(a) * 9; this.phys.driftZ = Math.sin(a) * 9; }
    if (r === 'polarity') for (const e of this.enemies) e.body.charge = e.charge = this.rng.chance(0.5) ? 1 : -1;
    if (r === 'ice') this.phys.friction = 0.2;
    if (r === 'heavy') for (let i = 0; i < 3; i++) this.dropProp('heavy');
    if (r === 'storm') this.player.stats.force = heroById(this.cfg.heroId).stats.force * 1.8;
    else this.player.stats.force = heroById(this.cfg.heroId).stats.force * heroStatMult(this.cfg.heroLevel);
    this.onBanner?.('🌀 ' + names[r], 'Nouvelle règle !', '#ff3df2', 1.6);
    audio.warning();
  }

  useAbility() {
    const p = this.player;
    if (p.abilityCd > 0 || p.dead || this.state !== 'play') return;
    p.abilityCd = p.def.ability.cooldown;
    this.stats.abilities++;
    useAbility(this);
  }

  /* =========================================================== end */
  end(victory: boolean) {
    if (this.ended) return;
    this.ended = true;
    this.state = 'end';
    audio.field(0, 1);
    for (const b of this.player.held) b.held = false;
    this.player.held = [];
    if (victory) {
      this.slowmo = 0.6;
      this.player.rig.play('victory');
      this.player.inv = 99;
      // remaining enemies flee/pop
      for (const e of this.enemies) if (!e.dead && this.objective.type !== 'eliminate') this.later(this.rng.range(0.1, 0.6), () => { if (!e.dead) { e.dead = true; e.dying = 0.18; e.body.alive = false; this.fx.burst(e.body.x, 0.8, e.body.z, e.def.color, 10, 6, 0.4, 0.4); } });
    }
    const L = this.level;
    const scoreStar = L ? this.score >= L.scoreTarget : false;
    const timeStar = L ? this.time <= L.parTime : false;
    const special = L ? this.checkSpecial() : false;
    let stars: [boolean, boolean, boolean] = [victory && timeStar, victory && scoreStar, victory && special];
    if (victory && L && !stars.some(Boolean)) stars = [true, false, false];
    const res: BattleResult = {
      mode: this.cfg.mode, levelId: L?.id, victory, score: this.score, time: this.time, stars,
      starLabels: L ? [`Terminer en moins de ${L.parTime}s`, `Score ≥ ${L.scoreTarget.toLocaleString('fr-FR')}`, L.special.label] : ['', '', ''],
      kills: this.stats.kills, objectKills: this.stats.objectKills, explosionKills: this.stats.explosionKills, ringouts: this.stats.ringouts,
      maxCombo: this.combo.best, maxChain: this.maxChain, flips: this.stats.flips, abilities: this.stats.abilities,
      damageTaken: this.stats.damageTaken, coinsCollected: Math.round(this.stats.coins * this.coinMult), bossKilled: this.stats.bossKilled,
      wave: this.wave, bossesBeaten: this.stats.bossesBeaten,
    };
    if (victory) { audio.victory(); haptics.success(); } else audio.defeat();
    this.later(victory ? 1.6 : 0.6, () => this.onEnd?.(res));
  }

  checkSpecial(): boolean {
    const s = this.level!.special;
    switch (s.type) {
      case 'combo': return this.combo.best >= s.value;
      case 'nohit': return this.stats.damageTaken <= s.value;
      case 'explosions': return this.stats.explosionKills >= s.value;
      case 'ringouts': return this.stats.ringouts >= s.value;
      case 'noAbility': return this.stats.abilities === 0;
      case 'objectKills': return this.stats.objectKills >= s.value;
      case 'chain': return this.maxChain >= s.value;
      case 'flips': return this.stats.flips <= s.value;
    }
  }

  hud(): HudState {
    const p = this.player;
    const o = this.objective;
    let objective = '', progress = 0, progressText = '';
    const alive = this.aliveEnemies();
    switch (o.type) {
      case 'eliminate': { const total = this.level!.waves.length; objective = `Élimine toutes les vagues`; progressText = `Vague ${Math.max(1, this.wave)}/${total} · ${alive} 👾`; progress = (this.wave - (alive ? 1 : 0)) / total; break; }
      case 'survive': objective = 'Survis !'; progress = this.time / o.target; progressText = `${Math.max(0, Math.ceil(o.target - this.time))}s`; break;
      case 'protect': objective = 'Protège le cœur !'; progress = this.time / o.target; progressText = `${Math.max(0, Math.ceil(o.target - this.time))}s · ❤️ ${Math.max(0, Math.round((this.protectCore!.hp / (this.protectCore as any).maxHp) * 100))}%`; break;
      case 'combo': objective = `Atteins un combo ×${o.target}`; progress = o.progress / o.target; progressText = `×${o.progress}/${o.target}`; break;
      case 'ringout': objective = 'Éjecte les ennemis dans les pièges'; progress = o.progress / o.target; progressText = `${o.progress}/${o.target}`; break;
      case 'collect': objective = 'Dépose les cellules ⚡'; progress = o.progress / o.target; progressText = `${o.progress}/${o.target}`; break;
      case 'destroy': objective = 'Détruis les générateurs'; progress = o.progress / o.target; progressText = `${o.progress}/${o.target}`; break;
      case 'boss': objective = 'Vaincs le boss !'; progress = this.boss ? 1 - this.boss.hp / this.boss.maxHp : 1; break;
      case 'rush': objective = 'MAGNET RUSH : max de points !'; progress = this.time / 60; progressText = `${Math.max(0, Math.ceil(60 - this.time))}s`; break;
      case 'survival': objective = 'SURVIVAL : tiens bon !'; progress = 0; progressText = `Vague ${this.wave}`; break;
      case 'chaos': objective = 'CHAOS : ' + (this.chaosRule || 'prépare-toi'); progress = this.time / 90; progressText = `${Math.max(0, Math.ceil(90 - this.time))}s`; break;
      case 'bossrush': objective = 'BOSS RUSH'; progress = o.progress / o.target; progressText = `Boss ${o.progress + 1}/${o.target}`; break;
    }
    const tier = this.combo.tier;
    return {
      hp: p.hp, maxHp: p.maxHp, polarity: this.effectivePolarity(), held: p.held.length, holdMax: p.stats.hold,
      ability: 1 - p.abilityCd / p.def.ability.cooldown, abilityReady: p.abilityCd <= 0, dashReady: 1 - p.dashCd / 1.1,
      combo: this.combo.count, comboRatio: this.combo.ratio(), comboTier: tier?.label ?? null, comboColor: tier?.color ?? '#ffffff',
      score: this.score, time: this.time, timeLeft: this.timeLimit ? Math.max(0, this.timeLimit - this.time) : null,
      objective, progress: clamp(progress, 0, 1), progressText,
      boss: this.boss && this.boss.alive ? { name: this.boss.def.name, hp: this.boss.hp / this.boss.maxHp, phase: this.boss.phaseName(), shield: this.boss.shieldRatio() } : null,
      wave: this.wave, coins: this.stats.coins, inverted: p.inZone,
    };
  }

  resize(aspect: number, h: number) { this.rig.resize(aspect); this.fx.setViewport(h); }

  dispose() {
    disposeTree(this.scene);
    this.boss?.dispose();
    for (const h of this.hazards) h.dispose?.();
    this.arena.dispose();
    this.ft.dispose();
    this.player.rig.dispose();
    for (const e of this.enemies) e.rig.dispose();
    for (const m of this.shadowMarkers) m.removeFromParent();
    this.scene.clear();
  }
}

declare module './physics' {
  interface Body { falling(): boolean }
}
Body.prototype.falling = function (this: Body) {
  const o = this.owner as { falling?: number } | null;
  return !!o && typeof o.falling === 'number' && o.falling > 0;
};
