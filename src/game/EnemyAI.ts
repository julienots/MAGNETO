import * as THREE from 'three';
import type { Battle } from './Battle';
import type { Enemy } from './types';
import { audio } from '../audio/Audio';
import { angleLerp, clamp, TAU } from '../core/math';

const telegraphGeo = new THREE.PlaneGeometry(1, 1);

function steer(b: Battle, e: Enemy, dirX: number, dirZ: number, speed: number, dt: number, accel = 6) {
  const body = e.body;
  let l = Math.hypot(dirX, dirZ);
  if (l < 1e-4) { dirX = 0; dirZ = 0; l = 1; }
  dirX /= l; dirZ /= l;
  // hazard avoidance: probe ahead, rotate away if dangerous
  if (speed > 0 && b.hazards.length) {
    const probe = 1.2 + body.r;
    for (const rot of [0, 0.7, -0.7, 1.4, -1.4, 2.2, -2.2]) {
      const c = Math.cos(rot), s = Math.sin(rot);
      const dx = dirX * c - dirZ * s, dz = dirX * s + dirZ * c;
      const px = body.x + dx * probe, pz = body.z + dz * probe;
      if (!b.hazards.some((h) => h.isDanger?.(px, pz, body.r * 0.5))) { dirX = dx; dirZ = dz; break; }
    }
  }
  const k = Math.min(1, accel * dt);
  body.vx += (dirX * speed - body.vx) * k;
  body.vz += (dirZ * speed - body.vz) * k;
  if (speed > 0.3) e.facing = Math.atan2(dirX, dirZ);
}

function face(e: Enemy, x: number, z: number, rate: number, dt: number) {
  e.facing = angleLerp(e.facing, Math.atan2(x - e.body.x, z - e.body.z), 1 - Math.exp(-rate * dt));
}

export function updateEnemyAI(b: Battle, e: Enemy, dt: number) {
  const body = e.body;
  e.t += dt; e.stateT += dt;
  e.meleeCd = Math.max(0, e.meleeCd - dt);
  e.field = Math.max(0, e.field - dt * 2);
  const speedMul = (e.elite ? 0.75 : 1) * (body.frozen > 0 ? 0 : 1);

  // ---- spawn: dropped from the sky
  if (e.state === 'spawn') {
    body.ghost = true;
    if (body.y <= 0.01 && e.stateT > 0.1) {
      body.ghost = false; e.state = 'move'; e.stateT = 0;
      e.rig.kick(-1.5);
      b.fx.ring(body.x, body.z, e.def.color, 0.3, 1.8 * e.scale, 0.3, 0.8);
      b.fx.smoke(body.x, 0.2, body.z, 3, 0x7a7a88, 0.8);
      audio.impact(0.4, 'robot');
      if (e.elite) { b.rig.shake(0.4); b.onBanner?.('👹 MINI-BOSS !', e.def.name + ' ÉLITE', '#ffb627', 1.2); audio.bossRoar(); }
    }
    if (e.state === 'spawn') return;
  }
  if (body.held || body.frozen > 0) { if (e.kind === 'tank') hideTelegraph(e); return; }
  if (e.stun > 0) { e.stun -= dt; return; }

  const pb = b.player.body;
  const core = b.protectCore && !b.protectCore.dead && e.targetCore ? b.protectCore.body : null;
  const tx = core ? core.x : pb.x, tz = core ? core.z : pb.z;
  const dx = tx - body.x, dz = tz - body.z;
  const dist = Math.hypot(dx, dz) || 0.001;
  const playerDead = b.player.dead || b.state !== 'play';
  const sp = e.def.speed * speedMul;

  // melee contact
  const reach = (core ? core.r : pb.r) + body.r + 0.2;
  if (!playerDead && dist < reach && e.meleeCd <= 0 && e.kind !== 'bomber' && !e.phase) {
    e.meleeCd = 1.0;
    e.rig.kick(1);
    if (core) b.damageTarget(b.protectCore!, e.def.damage, 0);
    else b.hurtPlayer(e.def.damage * (e.elite ? 1.5 : 1), dx / dist, dz / dist, 7);
  }
  if (playerDead) { steer(b, e, 0, 0, 0, dt); return; }

  switch (e.kind) {
    case 'drone': {
      const want = core ? 4 : 5.5;
      const strafe = Math.sin(e.t * 0.9) > 0 ? 1 : -1;
      let mx = 0, mz = 0;
      if (dist > want + 1) { mx = dx; mz = dz; } else if (dist < want - 1.2) { mx = -dx; mz = -dz; }
      mx += (-dz / dist) * strafe * 0.8 * dist; mz += (dx / dist) * strafe * 0.8 * dist;
      if (e.state === 'windup') {
        steer(b, e, 0, 0, 0, dt);
        face(e, tx, tz, 12, dt);
        e.rig.flash = 0.4 + Math.sin(e.stateT * 40) * 0.3;
        if (e.stateT > 0.45) {
          b.fireBolt(body.x, body.z, Math.sin(e.facing), Math.cos(e.facing), 9.5, e.def.damage, 'enemy', 0xff5a3a, 0.22, 1.1);
          audio.shoot(); e.rig.kick(0.6);
          e.state = 'move'; e.stateT = 0; e.cd = 1.8 + Math.random() * 1.2;
        }
      } else {
        steer(b, e, mx, mz, sp, dt, 4);
        face(e, tx, tz, 8, dt);
        e.cd -= dt;
        if (e.cd <= 0 && dist < 11) { e.state = 'windup'; e.stateT = 0; }
      }
      break;
    }
    case 'tank': {
      const tel = telegraph(b, e);
      if (e.state === 'windup') {
        steer(b, e, 0, 0, 0, dt);
        if (e.stateT < 0.6) { face(e, tx, tz, 6, dt); e.aimX = Math.sin(e.facing); e.aimZ = Math.cos(e.facing); }
        tel.visible = true;
        tel.position.set(body.x + e.aimX * 4.5, 0.06, body.z + e.aimZ * 4.5);
        tel.rotation.set(-Math.PI / 2, 0, -Math.atan2(e.aimX, e.aimZ));
        (tel.material as THREE.MeshBasicMaterial).opacity = 0.25 + Math.sin(e.stateT * 25) * 0.15;
        e.rig.flash = 0.2 + Math.sin(e.stateT * 30) * 0.2;
        if (e.stateT > 0.95) { e.state = 'attack'; e.stateT = 0; tel.visible = false; audio.whooshUI(); }
      } else if (e.state === 'attack') {
        body.vx = e.aimX * 12 * speedMul; body.vz = e.aimZ * 12 * speedMul;
        e.facing = Math.atan2(e.aimX, e.aimZ);
        if (Math.random() < 0.5) b.fx.smoke(body.x, 0.2, body.z, 1, 0x8a7a6a, 0.7);
        const pd = Math.hypot(pb.x - body.x, pb.z - body.z);
        if (pd < body.r + pb.r + 0.2 && e.meleeCd <= 0) { e.meleeCd = 1; b.hurtPlayer(26 * (e.elite ? 1.5 : 1), e.aimX, e.aimZ, 16); }
        // bowl through small things
        for (const o of b.phys.query(body.x + e.aimX * 0.6, body.z + e.aimZ * 0.6, body.r, [])) {
          if (o === body || o.isStatic || o.kind === 'player' || o.mass > 4) continue;
          o.vx += e.aimX * 14; o.vz += e.aimZ * 14;
        }
        const nearWall = Math.abs(body.x) > 6.2 - body.r || Math.abs(body.z) > 11.2 - body.r;
        if (e.stateT > 1.15 || nearWall) {
          e.state = 'recover'; e.stateT = 0;
          if (nearWall) { b.rig.shake(0.25); audio.impact(1, 'metal'); b.fx.burst(body.x, 0.6, body.z, 0xffffff, 10, 6, 0.4, 0.3); e.stun = 1.2; b.ft.spawn(body.x, 2, body.z, 'SONNÉ', 'ft-small', 0.8); }
        }
      } else if (e.state === 'recover') {
        steer(b, e, 0, 0, 0, dt);
        if (e.stateT > 0.9) { e.state = 'move'; e.stateT = 0; e.cd = 2.5 + Math.random(); }
      } else {
        steer(b, e, dx, dz, sp, dt, 3);
        e.cd -= dt;
        if (e.cd <= 0 && dist < 10 && !core) { e.state = 'windup'; e.stateT = 0; }
      }
      break;
    }
    case 'puller':
    case 'pusher': {
      const want = e.kind === 'puller' ? 5.5 : 4;
      let mx = 0, mz = 0;
      if (dist > want + 1) { mx = dx; mz = dz; } else if (dist < want - 1) { mx = -dx; mz = -dz; }
      mx += (-dz / dist) * 0.5 * dist * Math.sin(e.t * 0.6); mz += (dx / dist) * 0.5 * dist * Math.sin(e.t * 0.6);
      face(e, pb.x, pb.z, 8, dt);
      if (e.state === 'attack') {
        steer(b, e, 0, 0, 0, dt);
        e.field = 1;
        const pdx = pb.x - body.x, pdz = pb.z - body.z, pd = Math.hypot(pdx, pdz) || 1;
        if (pd < 9) {
          const pol = b.effectivePolarity();
          const resist = (e.kind === 'puller' ? pol < 0 : pol > 0) ? 0.35 : 1;
          const f = (e.kind === 'puller' ? -1 : 1) * 30 * (1 - pd / 9) * resist;
          pb.vx += (pdx / pd) * f * dt; pb.vz += (pdz / pd) * f * dt;
          if (Math.random() < 0.6) {
            if (e.kind === 'puller') b.fx.stream(pb.x, 0.8, pb.z, body.x, body.z, 0xff4d6d, 8, 0.2);
            else b.fx.stream(body.x, 0.8, body.z, pb.x, pb.z, 0x4d7dff, 9, 0.2);
          }
        }
        for (const o of b.phys.query(body.x, body.z, 6, [])) {
          if (o.kind !== 'prop' || o.held) continue;
          const odx = o.x - body.x, odz = o.z - body.z, od = Math.hypot(odx, odz) || 1;
          const f = (e.kind === 'puller' ? -1 : 1) * 10 / Math.sqrt(o.mass);
          o.vx += (odx / od) * f * dt; o.vz += (odz / od) * f * dt;
        }
        if (e.stateT > 2) { e.state = 'move'; e.stateT = 0; e.cd = 2.2 + Math.random() * 1.5; }
      } else {
        steer(b, e, mx, mz, sp, dt, 4);
        e.cd -= dt;
        if (e.cd <= 0 && dist < 9) { e.state = 'attack'; e.stateT = 0; audio.flip(e.kind === 'puller' ? 1 : -1); }
      }
      break;
    }
    case 'bomber': {
      if (e.fuse > 0) {
        e.fuse += dt;
        steer(b, e, 0, 0, 0, dt);
        if (e.fuse > 0.75) {
          b.killEnemy(e, 'bomb', 0);
        }
        break;
      }
      steer(b, e, dx, dz, sp * 1.05, dt, 5);
      if (dist < 1.7) { e.fuse = 0.001; audio.warning(); b.ft.spawn(body.x, 2, body.z, '💣', 'ft-big', 0.75); }
      break;
    }
    case 'shield': {
      face(e, tx, tz, 1.5, dt);
      const fx = Math.sin(e.facing), fz = Math.cos(e.facing);
      steer(b, e, dist > 2 ? fx : 0, dist > 2 ? fz : 0, sp, dt, 3);
      e.facing = angleLerp(e.facing, Math.atan2(dx, dz), 1 - Math.exp(-1.5 * dt));
      break;
    }
    case 'swarm': {
      const j = Math.sin(e.t * 7 + body.id) * 0.6;
      steer(b, e, dx + (-dz / dist) * j * 2, dz + (dx / dist) * j * 2, sp, dt, 7);
      break;
    }
    case 'phaser': {
      const cycle = e.t % 4.2;
      const phased = cycle > 2.6;
      if (phased !== e.phase) {
        e.phase = phased; body.ghost = phased;
        b.fx.burst(body.x, 0.8, body.z, 0xc49bff, 10, 4, 0.4, 0.4);
        if (phased) { body.held = false; }
      }
      steer(b, e, dx, dz, sp * (phased ? 1.7 : 0.9), dt, 5);
      if (phased && Math.random() < 0.5) b.fx.trail(body.x, 0.8, body.z, 0xc49bff, 0.5, 0.35);
      break;
    }
    case 'chaos': {
      if (Math.floor(e.t / 3) !== Math.floor((e.t - dt) / 3)) {
        e.charge = e.charge > 0 ? -1 : 1; body.charge = e.charge;
        b.fx.ring(body.x, body.z, e.charge > 0 ? 0xff3b3b : 0x2f7bff, 0.3, 2, 0.3, 0.9);
        e.rig.kick(0.6);
      }
      const want = 4;
      let mx = dist > want ? dx : -dx * 0.5, mz = dist > want ? dz : -dz * 0.5;
      mx += Math.cos(e.t * 1.3) * 2; mz += Math.sin(e.t * 1.3) * 2;
      steer(b, e, mx, mz, sp, dt, 4);
      face(e, tx, tz, 8, dt);
      e.cd -= dt;
      if (e.cd <= 0 && dist < 10) {
        e.cd = 3 + Math.random();
        const base = Math.atan2(dx, dz);
        for (const off of [-0.25, 0, 0.25]) b.fireBolt(body.x, body.z, Math.sin(base + off), Math.cos(base + off), 8, e.def.damage * 0.7, 'enemy', e.charge > 0 ? 0xff3b3b : 0x2f7bff, 0.2, 1);
        audio.shoot(); e.rig.kick(0.5);
      }
      break;
    }
  }

  // elites periodically stomp
  if (e.elite && Math.floor(e.t / 5) !== Math.floor((e.t - dt) / 5)) {
    b.fx.ring(body.x, body.z, 0xffb627, 0.5, 4.5, 0.5, 0.9);
    b.rig.shake(0.2); audio.explosion(0.5);
    const pd = Math.hypot(pb.x - body.x, pb.z - body.z);
    if (pd < 4.2) b.hurtPlayer(14, (pb.x - body.x) / (pd || 1), (pb.z - body.z) / (pd || 1), 12);
  }
  void clamp; void TAU;
}

function telegraph(b: Battle, e: Enemy): THREE.Mesh {
  let t = (e as any).tel as THREE.Mesh | undefined;
  if (!t) {
    t = new THREE.Mesh(telegraphGeo, new THREE.MeshBasicMaterial({ color: 0xff2d2d, transparent: true, opacity: 0.3, depthWrite: false }));
    t.scale.set(e.body.r * 2, 9, 1);
    t.visible = false;
    b.scene.add(t);
    (e as any).tel = t;
    const prevDispose = e.rig.dispose.bind(e.rig);
    e.rig.dispose = () => { t!.removeFromParent(); (t!.material as THREE.Material).dispose(); prevDispose(); };
  }
  return t;
}
function hideTelegraph(e: Enemy) { const t = (e as any).tel as THREE.Mesh | undefined; if (t) t.visible = false; }
