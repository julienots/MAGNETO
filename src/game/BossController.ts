import * as THREE from 'three';
import type { Battle } from './Battle';
import type { Prop } from './types';
import { Body } from './physics';
import { BossRig } from '../gfx/models/boss';
import { bossById, BOSS_PHASES, BOSSES, type BossDef } from '../data/bosses';
import { audio } from '../audio/Audio';
import { haptics } from '../platform/Haptics';
import { HW, HH } from '../gfx/arena';
import { clamp, TAU } from '../core/math';

const VOLLEY_COLORS: Record<BossDef['volley'], number> = { bolts: 0xff5a3a, lasers: 0x31f5ff, orbs: 0xff7a00, rocks: 0xff9a3a, shards: 0x9fe8ff, stars: 0xff9df5, voids: 0xff2d55 };

interface Wave { r: number; x: number; z: number; speed: number; max: number; mesh: THREE.Mesh; hit: boolean }

/**
 * Multi-phase boss built around magnetic physics:
 *  P1 basic attacks · P2 polarity shifts · P3 arena vacuum · P4 decor destruction ·
 *  FINAL invulnerable: the player must hurl the arena's heavy magnetic cores at it.
 */
export class BossController {
  def: BossDef;
  rig: BossRig;
  body = new Body();
  hp: number;
  maxHp: number;
  alive = true;
  phase = 0;
  polarity: 1 | -1 = 1;
  private t = 0;
  private atkCd = 3;
  private polT = 0;
  private busy = 0;
  private current: string | null = null;
  private waves: Wave[] = [];
  private vacuumed: Body[] = [];
  private spat: Body[] = [];
  private beam: THREE.Mesh | null = null;
  private beamAngle = 0;
  private finalChunk = 0;
  private coresHit = 0;
  private started = false;
  private homeZ = -HH + 3.6;
  private dyingT = 0;
  private rains: { x: number; z: number; t: number; marker: THREE.Mesh }[] = [];
  /** damage scale: early bosses are gentler */
  private dm: number;

  constructor(private b: Battle, id: string, hpMult: number) {
    this.def = bossById(id);
    this.maxHp = this.hp = this.def.hp * hpMult;
    this.dm = 0.65 + this.def.world * 0.08;
    this.rig = new BossRig(this.def);
    const body = this.body;
    body.kind = 'boss'; body.r = 2.4; body.isStatic = true; body.setMass(0); body.magnetic = 0;
    body.x = 0; body.z = this.homeZ; body.owner = this;
    b.phys.add(body);
    this.rig.root.position.set(0, 0, this.homeZ);
    b.scene.add(this.rig.root);
    this.rig.setPose('idle');
  }

  phaseName() { return BOSS_PHASES[this.phase].name; }
  shieldRatio() { return this.phase === 4 ? 1 - this.coresHit / 3 : 0; }
  private isFinal() { return this.phase === 4; }

  update(dt: number) {
    const b = this.b, r = this.rig;
    this.t += dt;
    r.update(dt);
    r.polarity = this.polarity;
    this.updateWaves(dt);
    this.updateRain(dt);
    if (!this.alive) { this.updateDeath(dt); return; }
    if (b.state !== 'play') return;
    if (!this.started) {
      this.started = true;
      r.setPose('roar'); audio.bossRoar(); b.rig.shake(0.6); haptics.heavy();
      b.onBanner?.(this.def.name, this.def.title, '#' + this.def.color.toString(16).padStart(6, '0'), 2);
      this.busy = 1.6;
    }
    // movement
    const spd = 0.35 + this.phase * 0.12;
    if (this.current !== 'vacuum' && this.current !== 'beam') this.body.x = Math.sin(this.t * spd) * (2.2 + this.phase * 0.3);
    this.body.z = this.homeZ;
    r.root.position.set(this.body.x, 0, this.body.z);
    // face player slightly
    const pb = b.player.body;
    r.root.rotation.y = clamp(Math.atan2(pb.x - this.body.x, pb.z - this.body.z), -0.6, 0.6);
    r.rage = this.phase / 4;

    // phase transitions
    const ratio = this.hp / this.maxHp;
    let ph = 0;
    for (let i = 0; i < BOSS_PHASES.length; i++) if (ratio <= BOSS_PHASES[i].at + 1e-6) ph = i;
    if (ph > this.phase) this.enterPhase(ph);

    // polarity cycling (phase 2+)
    if (this.phase >= 1 && !this.isFinal()) {
      this.polT += dt;
      const period = 4.6;
      if (this.polT > period - 0.8 && this.polT - dt <= period - 0.8) { audio.warning(); b.ft.spawn(this.body.x, 6, this.body.z + 1, this.polarity > 0 ? '🔵 BOUCLIER…' : '🔴 VULNÉRABLE…', 'ft-small', 0.8); }
      if (this.polT > period) {
        this.polT = 0; this.polarity = this.polarity > 0 ? -1 : 1;
        b.fx.ring(this.body.x, this.body.z, this.polarity > 0 ? 0xff3b3b : 0x2f7bff, 1, 6, 0.5, 1);
        audio.flip(this.polarity);
      }
      // red phase: thrown objects are attracted toward the core (easier hits)
      if (this.polarity > 0) for (const o of b.phys.bodies) {
        if (o.thrown > 0 && o.kind === 'prop' && !o.held) {
          const dx = this.body.x - o.x, dz = this.body.z + 1 - o.z, d = Math.hypot(dx, dz) || 1;
          if (d < 9) { o.vx += (dx / d) * 30 * dt; o.vz += (dz / d) * 30 * dt; }
        }
      }
    } else if (!this.isFinal()) this.polarity = 1;

    // attacks
    this.busy -= dt;
    if (this.current === 'vacuum') this.updateVacuum(dt);
    if (this.current === 'beam') this.updateBeam(dt);
    this.updateSpat();
    if (this.busy <= 0 && this.current !== 'vacuum' && this.current !== 'beam') {
      this.current = null;
      r.setPose('idle');
      this.atkCd -= dt;
      if (this.atkCd <= 0) this.chooseAttack();
    }
    if (this.isFinal()) this.updateFinalCores();
  }

  private chooseAttack() {
    const b = this.b, ph = this.phase;
    const options: string[] = ['volley', 'slam'];
    if (ph >= 0 && b.aliveEnemies() < 3) options.push('summon');
    if (ph >= 2) options.push('vacuum', 'vacuum');
    if (ph >= 3) options.push('rain', 'rain');
    if (ph >= 4) { options.length = 0; options.push('beam', 'beam', 'slam', 'volley'); }
    const pick = b.rng.pick(options);
    this.atkCd = Math.max(0.9, 2.6 - ph * 0.35);
    switch (pick) {
      case 'volley': this.volley(); break;
      case 'slam': this.slam(); break;
      case 'summon': this.summon(); break;
      case 'vacuum': this.startVacuum(); break;
      case 'rain': this.rain(); break;
      case 'beam': this.startBeam(); break;
    }
  }

  private volley() {
    const b = this.b, r = this.rig;
    r.setPose('shoot'); this.busy = 1.2; this.current = 'volley';
    const fans = this.phase >= 2 ? 2 : 1;
    const n = 5 + this.phase * 1;
    for (let f = 0; f < fans; f++) {
      b.later(0.45 + f * 0.45, () => {
        if (!this.alive) return;
        const pb = b.player.body;
        const hx = this.body.x, hz = this.body.z + 2.2;
        const base = Math.atan2(pb.x - hx, pb.z - hz);
        for (let i = 0; i < n; i++) {
          const a = base + (i / (n - 1) - 0.5) * (0.9 + f * 0.3);
          b.fireBolt(hx, hz, Math.sin(a), Math.cos(a), 8 + this.phase, (12 + this.phase * 2) * this.dm, 'boss', VOLLEY_COLORS[this.def.volley], 0.32, 1.4);
        }
        audio.shoot(); b.rig.shake(0.1); this.rig.kick(0.4);
        b.fx.flash(hx, 2, hz, VOLLEY_COLORS[this.def.volley], 0.5, 2, 0.2);
      });
    }
  }

  private slam() {
    const b = this.b, r = this.rig;
    r.setPose('raise'); this.busy = 1.6; this.current = 'slam';
    audio.warning();
    b.later(0.85, () => {
      if (!this.alive) return;
      r.setPose('slam'); r.kick(-1.5);
      const x = this.body.x, z = this.body.z + 2.4;
      b.fx.flash(x, 0.4, z, 0xffffff, 1, 4, 0.25);
      b.fx.smoke(x, 0.3, z, 10, 0x6a6a6a, 1.8);
      b.fx.chunks(x, 0.3, z, this.def.color, 10, 9, 0.3);
      audio.explosion(1.4); b.rig.shake(0.6); haptics.heavy();
      const mesh = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 64), new THREE.MeshBasicMaterial({ color: this.polarity > 0 ? 0xff5a3a : 0x5a9bff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      mesh.rotation.x = -Math.PI / 2; mesh.position.set(x, 0.12, z);
      b.scene.add(mesh);
      this.waves.push({ r: 0.5, x, z, speed: 9 + this.phase * 1.5, max: 22, mesh, hit: false });
      // the slam also scatters props
      for (const o of b.phys.query(x, z, 6, [])) {
        if (o.kind !== 'prop' || o.held) continue;
        const dx = o.x - x, dz = o.z - z, d = Math.hypot(dx, dz) || 1;
        o.vx += (dx / d) * 10; o.vz += (dz / d) * 10; o.vy = 6; o.y = 0.2;
      }
    });
  }

  private updateWaves(dt: number) {
    const b = this.b, pb = b.player.body;
    for (const w of this.waves) {
      w.r += w.speed * dt;
      w.mesh.scale.setScalar(w.r);
      (w.mesh.material as THREE.MeshBasicMaterial).opacity = 0.85 * (1 - w.r / w.max);
      const d = Math.hypot(pb.x - w.x, pb.z - w.z);
      if (!w.hit && Math.abs(d - w.r) < 0.55 && pb.y < 0.3 && b.player.dashT <= 0) {
        w.hit = true;
        b.hurtPlayer((16 + this.phase * 3) * this.dm, (pb.x - w.x) / (d || 1), (pb.z - w.z) / (d || 1), 12);
      }
    }
    for (const w of this.waves) if (w.r >= w.max) { w.mesh.removeFromParent(); w.mesh.geometry.dispose(); (w.mesh.material as THREE.Material).dispose(); }
    this.waves = this.waves.filter((w) => w.r < w.max);
  }

  private summon() {
    const b = this.b;
    this.rig.setPose('roar'); this.busy = 1; this.current = 'summon';
    audio.bossRoar();
    const n = this.def.minion === 'swarm' ? 6 : 2 + Math.floor(this.phase / 2);
    for (let i = 0; i < n; i++) b.queueSpawn(this.def.minion);
  }

  /* ---------- PHASE 3: vacuum the whole arena, then spit it back ---------- */
  private startVacuum() {
    this.current = 'vacuum'; this.busy = 3.2; this.vacuumed = [];
    this.rig.setPose('vacuum');
    this.b.onBanner?.('ASPIRATION !', 'Passe en 🔵 pour résister', '#ff3b3b', 1.2);
    audio.bossRoar();
  }
  private updateVacuum(dt: number) {
    const b = this.b;
    const cx = this.body.x, cz = this.body.z + 2.6;
    const pb = b.player.body;
    // pull player (resisted in blue)
    const pdx = cx - pb.x, pdz = cz - pb.z, pd = Math.hypot(pdx, pdz) || 1;
    const resist = b.effectivePolarity() < 0 ? 0.3 : 1;
    pb.vx += (pdx / pd) * 11 * resist * dt * 6; pb.vz += (pdz / pd) * 11 * resist * dt * 6;
    if (Math.random() < 0.9) { const a = Math.random() * TAU, rr = 8 + Math.random() * 4; b.fx.stream(cx + Math.cos(a) * rr, 0.4, cz + Math.sin(a) * rr, cx, cz, 0xff8080, 14, 0.25); }
    for (const o of b.phys.bodies) {
      if (o.kind !== 'prop' || o.held || o.isStatic || o.ghost) continue;
      if ((o.owner as any)?.crane || (o.owner as Prop).kind === 'core' || (o.owner as Prop).kind === 'cell') continue;
      const dx = cx - o.x, dz = cz - o.z, d = Math.hypot(dx, dz) || 1;
      if (d < 3.4) {
        if (!this.vacuumed.includes(o) && this.vacuumed.length < 8) this.vacuumed.push(o);
      } else { o.vx += (dx / d) * 26 * dt / Math.sqrt(o.mass); o.vz += (dz / d) * 26 * dt / Math.sqrt(o.mass); }
    }
    // orbit captured objects
    this.vacuumed = this.vacuumed.filter((o) => o.alive && !o.held);
    this.vacuumed.forEach((o, i) => {
      const a = this.t * 4 + (i / Math.max(1, this.vacuumed.length)) * TAU;
      const tx = cx + Math.cos(a) * 2.8, tz = cz + Math.sin(a) * 1.4;
      o.vx = (tx - o.x) * 10; o.vz = (tz - o.z) * 10; o.y = 1.6; o.vy = 0;
    });
    if (this.busy <= 0) {
      // SPIT them at the player
      this.rig.setPose('shoot');
      const n = this.vacuumed.length;
      this.vacuumed.forEach((o, i) => b.later(i * 0.12, () => {
        if (!o.alive || o.held) return;
        const dx = pb.x - o.x + (Math.random() - 0.5) * 2, dz = pb.z - o.z, d = Math.hypot(dx, dz) || 1;
        o.vx = (dx / d) * 15; o.vz = (dz / d) * 15; o.y = 1; o.vy = 2;
        this.spat.push(o);
        audio.launch(0.5);
      }));
      if (n === 0) this.volley();
      this.vacuumed = [];
      this.current = null; this.busy = 0.6 + n * 0.12;
    }
  }
  /** Objects spat by the boss hurt the player, unless caught (held) or deflected. */
  private updateSpat() {
    const b = this.b, pb = b.player.body;
    for (const o of this.spat) {
      if (!o.alive || o.held || o.thrown > 0 || o.speed < 5) { o.vy = o.vy; continue; }
      if (Math.hypot(o.x - pb.x, o.z - pb.z) < o.r + pb.r + 0.1) {
        b.hurtPlayer((14 + this.phase * 2) * this.dm, o.vx / (o.speed || 1), o.vz / (o.speed || 1), 9);
        o.vx *= -0.3; o.vz *= -0.3;
      }
    }
    this.spat = this.spat.filter((o) => o.alive && !o.held && o.thrown <= 0 && o.speed > 5);
  }

  /* ---------- PHASE 4: the boss wrecks the arena ---------- */
  private rain() {
    const b = this.b;
    this.rig.setPose('roar'); this.busy = 1.4; this.current = 'rain';
    audio.bossRoar(); b.rig.shake(0.5);
    const piece = this.rig.breakArmor();
    if (piece) b.fx.chunks(piece.x, piece.y, piece.z, this.def.color, 8, 8, 0.35);
    const n = 5 + this.phase;
    for (let i = 0; i < n; i++) {
      const pb = b.player.body;
      const x = i < 2 ? clamp(pb.x + (Math.random() - 0.5) * 3, -HW + 1, HW - 1) : -HW + 1 + Math.random() * (HW * 2 - 2);
      const z = i < 2 ? clamp(pb.z + (Math.random() - 0.5) * 3, -HH + 6, HH - 1) : -HH + 7 + Math.random() * (HH * 2 - 9);
      const marker = new THREE.Mesh(new THREE.CircleGeometry(1.1, 24), new THREE.MeshBasicMaterial({ color: 0xff2d2d, transparent: true, opacity: 0.3, depthWrite: false }));
      marker.rotation.x = -Math.PI / 2; marker.position.set(x, 0.06, z); b.scene.add(marker);
      this.rains.push({ x, z, t: 1.1 + i * 0.12, marker });
    }
  }
  private updateRain(dt: number) {
    const b = this.b;
    for (const r of this.rains) {
      r.t -= dt;
      r.marker.scale.setScalar(1.15 - Math.max(0, r.t) * 0.3);
      (r.marker.material as THREE.MeshBasicMaterial).opacity = 0.3 + Math.sin(r.t * 22) * 0.15;
      if (r.t <= 0) {
        r.marker.removeFromParent(); r.marker.geometry.dispose();
        b.fx.flash(r.x, 0.5, r.z, 0xffffff, 0.4, 1.8, 0.2); b.fx.smoke(r.x, 0.3, r.z, 4, 0x6a6a6a, 1); b.fx.chunks(r.x, 0.5, r.z, this.def.accent, 5, 6, 0.25);
        audio.impact(1, 'metal'); b.rig.shake(0.15);
        for (const o of b.phys.query(r.x, r.z, 1.2, [])) {
          if (o.kind === 'player') b.hurtPlayer(16 * this.dm, 0, 0, 0);
          else if (o.kind === 'enemy') b.damageEnemy(o.owner as any, 40, 0, 'hazard');
        }
        if (b.props.length < 24) { const p = b.spawnProp(Math.random() < 0.3 ? 'barrel' : 'debris', r.x, r.z); p.body.vy = 3; }
      }
    }
    this.rains = this.rains.filter((r) => r.t > 0);
  }

  /* ---------- FINAL: invulnerable, only the heavy cores hurt it ---------- */
  private enterPhase(ph: number) {
    const b = this.b;
    this.phase = ph;
    this.rig.setPose('roar'); this.busy = 1.8; this.current = 'phase';
    for (let i = 0; i < 2; i++) { const piece = this.rig.breakArmor(); if (piece) b.fx.chunks(piece.x, piece.y, piece.z, this.def.color, 8, 9, 0.35); }
    audio.bossRoar(); b.rig.shake(0.8); haptics.heavy();
    b.slowmo = 0.5;
    b.fx.ring(this.body.x, this.body.z, 0xffffff, 1, 14, 0.8, 0.9);
    const P = BOSS_PHASES[ph];
    b.onBanner?.(P.name, P.desc, ph === 4 ? '#ffd23f' : '#ff4d4d', 1.8);
    // release anything orbiting
    this.vacuumed = [];
    if (ph === 4) {
      this.finalChunk = this.hp / 3 + 1;
      this.coresHit = 0;
      this.polarity = 1;
      for (let i = 0; i < 3; i++) b.later(0.6 + i * 0.4, () => { const c = b.spawnProp('core', -4 + i * 4, 1 + (i % 2) * 2.5); c.body.y = 9; c.body.vy = -2; });
      b.later(2.4, () => b.onTip?.('Il est en SURCHARGE ! Quand il charge son rayon, les NOYAUX ⚙️ deviennent magnétiques : attire-les et lance-les sur lui !'));
    }
    if (ph === 2 || ph === 3) b.later(1, () => this.summon());
  }
  private startBeam() {
    this.current = 'beam'; this.busy = 3.4; this.rig.setPose('charge');
    const b = this.b;
    audio.warning();
    if (!this.beam) {
      this.beam = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0xff2d2d, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      this.beam.rotation.x = -Math.PI / 2; b.scene.add(this.beam);
    }
    const pb = b.player.body;
    this.beamAngle = Math.atan2(pb.x - this.body.x, pb.z - (this.body.z + 2));
    this.beam.visible = true;
    b.ft.spawn(this.body.x, 6, this.body.z, '⚡ CHARGE ⚡', 'ft-big', 1);
  }
  private updateBeam(dt: number) {
    const b = this.b, beam = this.beam!;
    const charging = this.busy > 1.1;
    const pb = b.player.body;
    const ox = this.body.x, oz = this.body.z + 2;
    const target = Math.atan2(pb.x - ox, pb.z - oz);
    this.beamAngle += clamp(target - this.beamAngle, -1, 1) * dt * (charging ? 1.4 : 0.35);
    const len = 30, w = charging ? 0.25 : 1.6;
    beam.scale.set(w, len, 1);
    beam.position.set(ox + Math.sin(this.beamAngle) * len / 2, 0.15, oz + Math.cos(this.beamAngle) * len / 2);
    beam.rotation.set(-Math.PI / 2, 0, -this.beamAngle + Math.PI);
    const m = beam.material as THREE.MeshBasicMaterial;
    m.color.setHex(charging ? 0xff2d2d : 0xfff3a0);
    m.opacity = charging ? 0.25 + Math.sin(this.t * 30) * 0.15 : 0.85;
    if (charging && Math.random() < 0.5) b.fx.stream(ox + (Math.random() - 0.5) * 6, 2, oz + (Math.random() - 0.5) * 4, ox, oz, 0xffd23f, 10, 0.3);
    if (!charging) {
      b.rig.shake(0.08);
      if (Math.random() < 0.8) b.fx.burst(ox + Math.sin(this.beamAngle) * 6, 0.5, oz + Math.cos(this.beamAngle) * 6, 0xfff3a0, 3, 4, 0.4, 0.2);
      // damage along the line
      const dx = pb.x - ox, dz = pb.z - oz;
      const along = dx * Math.sin(this.beamAngle) + dz * Math.cos(this.beamAngle);
      const perp = Math.abs(dx * Math.cos(this.beamAngle) - dz * Math.sin(this.beamAngle));
      if (along > 0 && perp < 0.9) b.hurtPlayer(22 * this.dm, Math.cos(this.beamAngle), -Math.sin(this.beamAngle), 10);
    }
    if (this.busy <= 0) { beam.visible = false; this.current = null; this.busy = 0.4; this.rig.setPose('idle'); }
  }
  private updateFinalCores() {
    const charging = this.current === 'beam';
    for (const p of this.b.props) if (p.kind === 'core') {
      p.body.magnetic = charging ? 1.3 : 0.15;
      p.body.resist = charging ? 0 : 0.6;
    }
  }

  /* ---------- damage intake ---------- */
  private applyDamage(dmg: number, x: number, z: number, label?: string) {
    const b = this.b;
    if (!this.alive || !this.started) return;
    this.hp = Math.max(0, this.hp - dmg);
    this.rig.flash = 1; this.rig.kick(0.5);
    b.ft.spawn(x, 4.5, z + 1, (label ? label + ' ' : '') + Math.round(dmg), dmg > 120 ? 'ft-dmg ft-crit' : 'ft-dmg', 0.9, dmg > 120 ? 1.4 : 1.1);
    b.addScore(Math.round(dmg * 2), x, z);
    b.combo.add(1);
    if (this.hp <= 0) this.die();
  }
  hitBy(proj: Body, dmg: number, nx: number, nz: number) {
    const b = this.b;
    if (!this.alive) return;
    const isCore = proj.kind === 'prop' && (proj.owner as Prop).kind === 'core';
    b.fx.flash(proj.x, 1.5, proj.z, 0xffffff, 0.4, 2, 0.2);
    b.fx.burst(proj.x, 1.5, proj.z, 0xfff3a0, 14, 8, 0.5, 0.35);
    audio.impact(1, 'metal'); haptics.medium();
    b.hitstop = Math.max(b.hitstop, 0.06); b.rig.shake(0.2);
    if (this.isFinal()) {
      if (!isCore) { this.deflect(proj, nx, nz, 'SURCHARGÉ !'); return; }
      this.coresHit++;
      b.explode(proj.x, proj.z, 3.5, 0, 0, 'ability');
      b.removeProp(proj.owner as Prop);
      this.rig.setPose('stagger'); this.busy = 1.2; this.current = 'stagger';
      if (this.beam) this.beam.visible = false;
      b.onBanner?.(`NOYAU ${this.coresHit}/3 !`, undefined, '#ffd23f', 1);
      b.slowmo = 0.4;
      this.applyDamage(this.coresHit >= 3 ? this.hp + 1 : this.finalChunk, proj.x, proj.z, '💥');
      if (this.alive && b.props.filter((p) => p.kind === 'core').length < 3 - this.coresHit) b.later(1.5, () => { const c = b.spawnProp('core', (Math.random() - 0.5) * 8, 2); c.body.y = 9; });
      return;
    }
    if (this.phase >= 1 && this.polarity < 0 && proj.mass < 3) { this.deflect(proj, nx, nz, 'BLOQUÉ'); return; }
    const mult = this.phase >= 1 && this.polarity > 0 ? 1.5 : 1;
    this.applyDamage(dmg * mult * 0.9, proj.x, proj.z, mult > 1 ? 'CRITIQUE !' : undefined);
    proj.thrown = 0;
  }
  private deflect(proj: Body, nx: number, nz: number, label: string) {
    const b = this.b;
    proj.vx = -nx * 10 + (Math.random() - 0.5) * 4; proj.vz = Math.abs(nz) * 10 + 4;
    proj.thrown = 0;
    audio.shield();
    b.fx.burst(proj.x, 1.5, proj.z, 0x5a9bff, 12, 6, 0.4, 0.3);
    b.ft.spawn(proj.x, 3.5, proj.z, label, 'ft-block', 0.8);
  }
  explosionHit(dmg: number) { if (!this.isFinal()) this.applyDamage(dmg * 0.7, this.body.x, this.body.z + 1); }
  boltHit(dmg: number) { if (!this.isFinal()) this.applyDamage(dmg * (this.polarity > 0 ? 1.5 : 0.5), this.body.x, this.body.z + 1); }
  abilityHit(dmg: number) { if (!this.isFinal()) this.applyDamage(dmg, this.body.x, this.body.z + 1); }

  private die() {
    const b = this.b;
    this.alive = false;
    this.dyingT = 0;
    this.rig.setPose('dead');
    if (this.beam) this.beam.visible = false;
    for (const w of this.waves) w.mesh.removeFromParent();
    this.waves = [];
    b.stats.bossKilled = true; b.stats.bossesBeaten++;
    b.slowmo = 1.2;
    audio.bossRoar();
    b.onBanner?.('K.O. !', this.def.name + ' est vaincu', '#ffd23f', 2);
    b.addScore(5000, this.body.x, this.body.z);
    for (const e of b.enemies) if (!e.dead) b.later(0.3 + Math.random() * 0.8, () => b.killEnemy(e, 'explosion'));
  }
  private updateDeath(dt: number) {
    const b = this.b;
    if (this.dyingT < 0) return;
    const prev = this.dyingT;
    this.dyingT += dt;
    if (Math.floor(this.dyingT / 0.25) !== Math.floor(prev / 0.25) && this.dyingT < 2.2) {
      const x = this.body.x + (Math.random() - 0.5) * 4, z = this.body.z + (Math.random() - 0.5) * 2;
      b.fx.flash(x, 2 + Math.random() * 3, z, 0xffb627, 0.5, 2.5, 0.3);
      b.fx.burst(x, 2.5, z, 0xff7a1f, 20, 10, 0.6, 0.5);
      b.fx.chunks(x, 2.5, z, this.def.color, 6, 9, 0.35);
      audio.explosion(1.2); b.rig.shake(0.5); haptics.heavy();
    }
    if (this.dyingT > 2.4) {
      this.dyingT = -1;
      b.fx.flash(this.body.x, 2, this.body.z, 0xffffff, 1, 10, 0.5);
      b.fx.ring(this.body.x, this.body.z, 0xffd23f, 1, 18, 0.8, 1);
      b.onFlash?.('#ffffff', 0.7);
      this.rig.root.visible = false;
      this.body.alive = false;
      b.coinRain(this.body.x, this.body.z, 25);
      if (b.cfg.mode === 'bossrush') {
        b.objective.progress++;
        const next = BOSSES[b.objective.progress];
        if (next) {
          b.player.hp = Math.min(b.player.maxHp, b.player.hp + b.player.maxHp * 0.35);
          b.later(2, () => { b.world; b.startBoss(next.id, 0.55 + b.objective.progress * 0.08); });
        } else b.end(true);
      } else b.end(true);
    }
  }

  dispose() {
    this.rig.dispose();
    this.body.alive = false;
    this.beam?.removeFromParent();
    for (const w of this.waves) w.mesh.removeFromParent();
    for (const r of this.rains) r.marker.removeFromParent();
  }
}
