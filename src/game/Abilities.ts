import * as THREE from 'three';
import type { Battle } from './Battle';
import type { AbilityId } from '../data/heroes';
import type { Enemy, Prop } from './types';
import type { Body } from './physics';
import { audio } from '../audio/Audio';
import { haptics } from '../platform/Haptics';
import { heroStatMult } from '../data/heroes';
import { TAU } from '../core/math';

export interface AbilityState { id: AbilityId; active: number; data: any }

const DUR: Partial<Record<AbilityId, number>> = { megaMagnet: 2.4, orbitRing: 5, phaseDash: 0.42, zeroField: 4 };

export function useAbility(b: Battle) {
  const p = b.player, pb = p.body, ab = p.ability;
  const m = heroStatMult(b.cfg.heroLevel);
  ab.active = DUR[ab.id] ?? 0;
  ab.data = {};
  p.rig.play('ability');
  audio.ability(ab.id);
  haptics.heavy();
  b.rig.kick(0.8);
  b.rig.shake(0.25);
  b.onBanner?.(p.def.ability.name, undefined, '#' + p.def.color.toString(16).padStart(6, '0'), 0.9);
  b.fx.flash(pb.x, 1, pb.z, p.def.color, 0.5, 3, 0.3);
  switch (ab.id) {
    case 'megaMagnet':
      if (p.polarity < 0) b.flip();
      b.fx.ring(pb.x, pb.z, 0xff3b3b, 12, 0.5, 0.6, 0.9);
      break;
    case 'chainVolt': {
      const hit = new Set<Enemy>();
      let fx = pb.x, fz = pb.z;
      for (let i = 0; i < 6; i++) {
        let best: Enemy | null = null, bd = i === 0 ? 10 : 6.5;
        for (const e of b.enemies) {
          if (e.dead || hit.has(e) || e.state === 'spawn') continue;
          const d = Math.hypot(e.body.x - fx, e.body.z - fz);
          if (d < bd) { bd = d; best = e; }
        }
        if (!best) break;
        hit.add(best);
        const e = best, sx = fx, sz = fz, delay = i * 0.07;
        b.later(delay, () => {
          b.fx.lightning(sx, 1, sz, e.body.x, 1, e.body.z, 0xfff36b, 0.28);
          b.fx.lightning(sx, 1, sz, e.body.x, 1, e.body.z, 0xbff8ff, 0.12);
          b.fx.burst(e.body.x, 1, e.body.z, 0xfff36b, 12, 6, 0.4, 0.3);
          audio.zap();
          e.stun = 1.2;
          b.damageEnemy(e, 55 * m, 0, 'ability');
          b.combo.add(1);
        });
        fx = e.body.x; fz = e.body.z;
      }
      if (!hit.size) b.ft.spawn(pb.x, 2.4, pb.z, 'AUCUNE CIBLE', 'ft-small', 0.8);
      break;
    }
    case 'pulseNova':
      b.explode(pb.x, pb.z, 5.2, 65 * m, b.newChain(), 'ability');
      b.fx.ring(pb.x, pb.z, 0xff8a1f, 0.5, 9, 0.6, 1);
      break;
    case 'orbitRing': {
      const list: Body[] = [];
      const cands = b.props.filter((x) => !x.dead && !x.body.held && x.kind !== 'core' && x.kind !== 'cell' && x.body.mass < 6)
        .sort((a, c) => Math.hypot(a.body.x - pb.x, a.body.z - pb.z) - Math.hypot(c.body.x - pb.x, c.body.z - pb.z));
      for (const c of cands.slice(0, 6)) list.push(c.body);
      // also include currently held objects
      for (const h of p.held) if (!list.includes(h)) { h.held = false; list.push(h); }
      p.held = [];
      while (list.length < 3) { const pr = b.spawnProp('debris', pb.x + Math.random() - 0.5, pb.z + Math.random() - 0.5); list.push(pr.body); }
      ab.data.bodies = list; ab.data.chain = b.newChain(); ab.data.a = 0;
      break;
    }
    case 'crashWave': {
      const [fx, fz] = b.aimDir();
      const chain = b.newChain();
      for (let i = 0; i < 4; i++) b.later(i * 0.06, () => b.fx.ring(pb.x + fx * (1.5 + i * 2), pb.z + fz * (1.5 + i * 2), 0x3d7bff, 0.5, 3 + i, 0.4, 0.9, 0.5));
      b.fx.burst(pb.x + fx, 0.8, pb.z + fz, 0x9fc4ff, 40, 18, 0.5, 0.5, { dirX: fx, dirZ: fz, spread: 0.7 });
      for (const o of b.phys.bodies) {
        if (o === pb || o.isStatic || o.ghost || o.kind === 'boss' || o.kind === 'target') continue;
        const dx = o.x - pb.x, dz = o.z - pb.z, d = Math.hypot(dx, dz) || 1;
        if (d > 11 || (dx * fx + dz * fz) / d < 0.5) continue;
        if (o.held) { o.held = false; }
        const k = (1 - d / 12) * 34 / Math.sqrt(o.mass) * (1 - o.resist * 0.5);
        o.vx += (dx / d) * k; o.vz += (dz / d) * k; o.vy = 5; o.y = Math.max(o.y, 0.3);
        o.thrown = 1; o.chain = chain;
        if (o.kind === 'enemy') { (o.owner as Enemy).stun = 0.8; b.damageEnemy(o.owner as Enemy, 30 * m, chain, 'ability'); }
      }
      p.held = [];
      if (b.boss?.alive) { const d = Math.hypot(b.boss.body.x - pb.x, b.boss.body.z - pb.z); if (d < 12) b.boss.abilityHit(60 * m); }
      break;
    }
    case 'phaseDash': {
      const [fx, fz] = b.aimDir();
      ab.data.dx = fx; ab.data.dz = fz; ab.data.hit = new Set<Enemy>();
      pb.ghost = true;
      break;
    }
    case 'zeroField':
      ab.data.bubble = makeBubble(b);
      break;
  }
}

function makeBubble(b: Battle) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), new THREE.MeshBasicMaterial({ color: 0x18d4ff, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  m.scale.setScalar(0.5);
  b.scene.add(m);
  return m;
}

export function updateAbility(b: Battle, dt: number) {
  const p = b.player, pb = p.body, ab = p.ability;
  if (ab.active <= 0) return;
  const was = ab.active;
  ab.active -= dt;
  const ending = ab.active <= 0;
  const m = heroStatMult(b.cfg.heroLevel);
  switch (ab.id) {
    case 'megaMagnet':
      if (Math.random() < 0.8) { const a = Math.random() * TAU; b.fx.stream(pb.x + Math.cos(a) * 9, 0.5, pb.z + Math.sin(a) * 9, pb.x, pb.z, 0xff5a5a, 16, 0.25); }
      if (ending) {
        if (p.polarity > 0) b.flip();
        b.explode(pb.x, pb.z, 4.5, 40 * m, b.newChain(), 'ability');
      }
      break;
    case 'orbitRing': {
      ab.data.a += dt * 7;
      const list: Body[] = (ab.data.bodies as Body[]).filter((x) => x.alive);
      list.forEach((o, i) => {
        const a = ab.data.a + (i / list.length) * TAU;
        const tx = pb.x + Math.cos(a) * 2.3, tz = pb.z + Math.sin(a) * 2.3;
        o.vx = (tx - o.x) * 18; o.vz = (tz - o.z) * 18; o.y = 0.9; o.vy = 0;
        o.thrown = 0.3; o.chain = ab.data.chain;
        if (o.kind === 'prop') (o.owner as Prop).spin = 12;
        if (Math.random() < 0.5) b.fx.trail(o.x, 1, o.z, 0x2ee6a6, 0.4, 0.3);
        if (ending) { o.vx = -Math.sin(a) * 22; o.vz = Math.cos(a) * 22; o.thrown = 1; }
      });
      break;
    }
    case 'phaseDash': {
      pb.vx = ab.data.dx * 24; pb.vz = ab.data.dz * 24;
      p.inv = Math.max(p.inv, 0.1);
      b.fx.trail(pb.x, 1, pb.z, 0x9b5cff, 0.9, 0.4);
      b.fx.trail(pb.x, 0.5, pb.z, 0x3ff0ff, 0.6, 0.3);
      for (const e of b.enemies) {
        if (e.dead || ab.data.hit.has(e)) continue;
        if (Math.hypot(e.body.x - pb.x, e.body.z - pb.z) < e.body.r + 0.9) {
          ab.data.hit.add(e);
          b.later(0.15, () => { b.damageEnemy(e, 75 * m, 0, 'ability'); b.combo.add(1); b.fx.burst(e.body.x, 1, e.body.z, 0x9b5cff, 14, 7, 0.4, 0.4); });
        }
      }
      if (b.boss?.alive && Math.hypot(b.boss.body.x - pb.x, b.boss.body.z - pb.z) < b.boss.body.r + 1 && !ab.data.boss) { ab.data.boss = true; b.boss.abilityHit(70 * m); }
      if (ending) { pb.ghost = false; pb.vx *= 0.2; pb.vz *= 0.2; }
      break;
    }
    case 'zeroField': {
      const bub = ab.data.bubble as THREE.Mesh;
      const k = Math.min(1, (4 - ab.active) * 4);
      bub.scale.setScalar(9 * k);
      bub.position.set(pb.x, 0, pb.z);
      (bub.material as THREE.MeshBasicMaterial).opacity = 0.12 + Math.sin(ab.active * 10) * 0.03;
      for (const e of b.enemies) {
        if (e.dead) continue;
        if (Math.hypot(e.body.x - pb.x, e.body.z - pb.z) < 9) {
          e.stun = Math.max(e.stun, 0.2);
          e.body.vx *= 0.9; e.body.vz *= 0.9;
          if (!e.body.held) e.body.y = 0.6 + Math.sin(ab.active * 3 + e.body.id) * 0.3;
          e.body.resist = 0;
        }
      }
      for (const bl of b.bolts) if (bl.owner !== 'player' && Math.hypot(bl.x - pb.x, bl.z - pb.z) < 9) { bl.vx *= 0.9; bl.vz *= 0.9; }
      if (ending) {
        bub.removeFromParent(); bub.geometry.dispose(); (bub.material as THREE.Material).dispose();
        for (const e of b.enemies) { e.body.resist = e.elite ? Math.min(0.75, e.def.resist + 0.3) : e.def.resist; }
        b.fx.ring(pb.x, pb.z, 0x18d4ff, 9, 0.5, 0.5, 0.8);
      }
      break;
    }
  }
  void was;
}
