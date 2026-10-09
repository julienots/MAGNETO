import * as THREE from 'three';
import type { Battle } from './Battle';
import type { Mechanic } from '../data/worlds';
import type { Enemy, Prop } from './types';
import { Body } from './physics';
import { HW, HH } from '../gfx/arena';
import { rboxGeo, cylGeo, torusGeo, sphereGeo, toon, basic, addOutline, outlineMat } from '../gfx/toon';
import { audio } from '../audio/Audio';
import { haptics } from '../platform/Haptics';
import { clamp, TAU } from '../core/math';

export interface Hazard {
  type: Mechanic;
  update(dt: number): void;
  /** true if a point is dangerous (AI avoidance / spawn rejection) */
  isDanger?(x: number, z: number, r: number): boolean;
  dispose?(): void;
}

const inRect = (x: number, z: number, r: { x0: number; z0: number; x1: number; z1: number }, pad = 0) => x > r.x0 - pad && x < r.x1 + pad && z > r.z0 - pad && z < r.z1 + pad;

function animatedTexture(draw: (x: CanvasRenderingContext2D, w: number, h: number) => void, w = 128, h = 128) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d')!, w, h);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Each moving body inside an area → callback. */
function forBodies(b: Battle, fn: (body: Body) => void) { for (const body of b.phys.bodies) if (body.alive && !body.isStatic && !body.held) fn(body); }

/** Make a body fall into a pit/lava/well: enemies ringout, props removed, player respawns. */
export function swallow(b: Battle, body: Body, kind: 'pit' | 'lava' | 'well') {
  if (body.kind === 'enemy') {
    const e = body.owner as Enemy;
    if (e.dead || e.falling > 0 || e.elite) return;
    e.falling = 0.5; body.ghost = true; body.vx *= 0.2; body.vz *= 0.2;
    if (kind === 'lava') { b.fx.burst(body.x, 0.3, body.z, 0xff7a1f, 18, 7, 0.5, 0.5, { up: 9 }); b.fx.smoke(body.x, 0.3, body.z, 4, 0x553322); }
    else b.fx.ring(body.x, body.z, 0x9b5cff, 1.4, 0.2, 0.4, 0.8);
    b.ft.spawn(body.x, 1.8, body.z, kind === 'lava' ? 'FONDU !' : 'ÉJECTÉ !', 'ft-big', 0.9);
    audio.enemyDie();
  } else if (body.kind === 'prop') {
    const p = body.owner as Prop;
    if (p.dead || p.falling > 0 || (p as any).crane) return;
    if (kind === 'lava' && p.kind === 'magmaRock') return;
    p.falling = 0.5; body.ghost = true; body.vx *= 0.2; body.vz *= 0.2;
    if (kind === 'lava') b.fx.burst(body.x, 0.3, body.z, 0xff7a1f, 10, 5, 0.4, 0.4);
  } else if (body.kind === 'player') {
    const pl = b.player;
    if (pl.dead || pl.fallT > 0 || pl.dashT > 0) return;
    if (kind === 'lava') { pl.slow = 0.3; if (pl.inv <= 0) b.hurtPlayer(9, 0, 0, 0); return; }
    pl.fallT = 0.6;
    b.hurtPlayer(15, 0, 0, 0);
    b.later(0.35, () => { body.x = body.lastSafeX; body.z = body.lastSafeZ; body.vx = body.vz = 0; pl.fallT = 0; pl.inv = 1; b.fx.ring(body.x, body.z, 0xffffff, 0.3, 2, 0.3, 0.7); });
  }
}

export function buildHazards(b: Battle, mechs: Mechanic[]): Hazard[] {
  const out: Hazard[] = [];
  const rng = b.rng;
  const scene = b.scene;
  // candidate slots for zone hazards (middle band, away from spawns)
  const slots: [number, number][] = [[-3.8, -3.5], [3.8, -3.5], [-3.8, 2.2], [3.8, 2.2], [0, -0.8], [-4.2, 5.4], [4.2, 5.4]];
  const used = new Set<number>();
  const slot = () => {
    const free = slots.map((_, i) => i).filter((i) => !used.has(i));
    const i = free.length ? rng.pick(free) : rng.int(0, slots.length - 1);
    used.add(i); return slots[i];
  };

  for (const m of mechs) {
    switch (m) {
      case 'conveyor': {
        const belts = [{ z: -1.6, dir: 1 }, { z: 4.2, dir: -1 }];
        const meshes: THREE.Mesh[] = [];
        const tex = animatedTexture((x, w, h) => {
          x.fillStyle = '#2b2f38'; x.fillRect(0, 0, w, h);
          x.fillStyle = '#ffc23d';
          for (let i = 0; i < 4; i++) { x.beginPath(); const o = i * 32; x.moveTo(o, 20); x.lineTo(o + 18, 64); x.lineTo(o, 108); x.lineTo(o + 10, 108); x.lineTo(o + 28, 64); x.lineTo(o + 10, 20); x.fill(); }
        });
        tex.repeat.set(6, 1);
        for (const bl of belts) {
          const mat = new THREE.MeshBasicMaterial({ map: tex });
          const mesh = new THREE.Mesh(new THREE.PlaneGeometry(HW * 2 - 1, 1.5), mat);
          mesh.rotation.x = -Math.PI / 2; mesh.position.set(0, 0.03, bl.z);
          if (bl.dir < 0) mesh.rotation.z = Math.PI;
          scene.add(mesh); meshes.push(mesh);
          const rail = new THREE.Mesh(rboxGeo(HW * 2 - 0.6, 0.12, 0.14, 0.04), toon(0x3c4652));
          rail.position.set(0, 0.06, bl.z - 0.8); scene.add(rail); meshes.push(rail);
          const rail2 = rail.clone(); rail2.position.z = bl.z + 0.8; scene.add(rail2); meshes.push(rail2);
        }
        out.push({
          type: m,
          update(dt) {
            tex.offset.x -= dt * 1.2;
            forBodies(b, (body) => {
              for (const bl of belts) if (Math.abs(body.z - bl.z) < 0.75 && body.y < 0.3) {
                const target = 3.6 * bl.dir; const k = body.kind === 'player' ? 0.5 : 1;
                body.vx += (target - body.vx) * Math.min(1, 3 * dt) * k;
              }
            });
          },
          dispose() { meshes.forEach((x) => x.removeFromParent()); tex.dispose(); },
        });
        break;
      }
      case 'press': {
        const presses = [slot(), slot()].map(([x, z]) => {
          const g = new THREE.Group(); g.position.set(x, 0, z); scene.add(g);
          const frame = new THREE.Mesh(rboxGeo(2.6, 0.2, 2.6, 0.06), toon(0x2b3440)); frame.position.y = 0.1; g.add(frame);
          for (const [px, pz] of [[-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2], [1.2, 1.2]]) { const post = new THREE.Mesh(cylGeo(0.12, 0.12, 4, 8), toon(0xffc23d)); post.position.set(px, 2, pz); addOutline(post, 0.03); g.add(post); }
          const head = new THREE.Mesh(rboxGeo(2.2, 0.9, 2.2, 0.15), toon(0x6f7c8c)); head.position.y = 3.2; addOutline(head, 0.04); g.add(head);
          const stripe = new THREE.Mesh(rboxGeo(2.24, 0.2, 2.24, 0.05), toon(0xffc23d)); stripe.position.y = -0.3; head.add(stripe);
          const warn = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.2), new THREE.MeshBasicMaterial({ color: 0xff2d2d, transparent: true, opacity: 0, depthWrite: false }));
          warn.rotation.x = -Math.PI / 2; warn.position.y = 0.22; g.add(warn);
          return { x, z, g, head, warn, t: rng.range(0, 3), rect: { x0: x - 1.25, z0: z - 1.25, x1: x + 1.25, z1: z + 1.25 } };
        });
const CYCLE = 2.8;
        out.push({
          type: m,
          update(dt) {
            for (const p of presses) {
              p.t = (p.t + dt) % CYCLE;
              const t = p.t;
              let y: number;
              if (t < 1.1) y = 3.2; // up
              else if (t < 1.8) { y = 3.2 + Math.sin(t * 40) * 0.05; } // warn
              else if (t < 1.9) y = 3.2 * (1 - (t - 1.8) / 0.1); // slam
              else if (t < 2.2) y = 0.45; // hold
              else y = 0.45 + ((t - 2.2) / 0.6) * 2.75;
              p.head.position.y = Math.max(0.45, y);
              (p.warn.material as THREE.MeshBasicMaterial).opacity = t >= 1.1 && t < 1.9 ? 0.25 + Math.sin(t * 25) * 0.2 : 0;
              // thrown enemies landing on the press plate get stuck (magnetic plate) until the slam
              for (const body of b.phys.bodies) {
                if (body.kind !== 'enemy' || body.thrown <= 0 || !inRect(body.x, body.z, p.rect, 0)) continue;
                const e = body.owner as Enemy;
                if (e.stun < 1.2) { e.stun = 1.6; body.vx *= 0.2; body.vz *= 0.2; b.fx.burst(body.x, 0.4, body.z, 0xffc23d, 6, 3, 0.3, 0.3); }
              }
              const prev = t - dt;
              if (prev < 1.9 && t >= 1.9) {
                // SLAM
                b.fx.ring(p.x, p.z, 0xffffff, 1, 3.4, 0.35, 0.8);
                b.fx.smoke(p.x, 0.3, p.z, 8, 0x8a8a8a, 1.2);
                b.fx.chunks(p.x, 0.3, p.z, 0x6f7c8c, 6, 6, 0.18);
                audio.explosion(0.6); b.rig.shake(0.25); haptics.medium();
                forBodies(b, (body) => {
                  if (!inRect(body.x, body.z, p.rect, body.r * 0.3) || body.y > 1) return;
                  if (body.kind === 'enemy') { const e = body.owner as Enemy; if (!e.elite) { b.ft.spawn(body.x, 1.5, body.z, 'ÉCRASÉ !', 'ft-big', 0.9); b.killEnemy(e, 'hazard', body.chain); } else b.damageEnemy(e, 80, body.chain, 'hazard'); }
                  else if (body.kind === 'prop') { const pr = body.owner as Prop; if (pr.kind !== 'heavy' && pr.kind !== 'core' && pr.kind !== 'cell') b.damageProp(pr, 999, body.chain); }
                  else if (body.kind === 'player') { const dx = body.x - p.x, dz = body.z - p.z, d = Math.hypot(dx, dz) || 1; b.hurtPlayer(28, dx / d, dz / d, 16); }
                });
              }
            }
          },
          isDanger(x, z, r) { return presses.some((p) => inRect(x, z, p.rect, r) && p.t > 1.0 && p.t < 2.3); },
          dispose() { presses.forEach((p) => p.g.removeFromParent()); },
        });
        break;
      }
      case 'crane': {
        const ball = new Body(); ball.kind = 'prop'; ball.r = 0.85; ball.setMass(30); ball.magnetic = 0; ball.restitution = 0.6; ball.thrown = 1e9;
        ball.owner = { kind: 'heavy', spec: { material: 'metal' }, falling: 0, dead: false, hp: 1e9, crane: true } as any;
        b.phys.add(ball);
        const g = new THREE.Group(); scene.add(g);
        const mesh = new THREE.Mesh(sphereGeo(1, 18, 14), toon(0x2b2b33)); mesh.scale.setScalar(0.85); addOutline(mesh, 0.05); g.add(mesh);
        const ring = new THREE.Mesh(torusGeo(0.2, 0.06), toon(0xffc23d)); ring.position.y = 0.85; mesh.add(ring);
        const cable = new THREE.Mesh(cylGeo(0.04, 0.04, 1, 6), basic(0x111111)); scene.add(cable);
        const pivot = new THREE.Vector3(0, 9, -1.5);
        let t = rng.range(0, 3);
        let chain = b.newChain();
        out.push({
          type: m,
          update(dt) {
            t += dt;
            const a = Math.sin(t * 1.15) * 1.0;
            const x = Math.sin(a) * 5.4, z = -1.5 + Math.sin(t * 0.5) * 2.5;
            const prevx = ball.x, prevz = ball.z;
            ball.x = x; ball.z = z;
            ball.vx = (x - prevx) / Math.max(dt, 1e-4); ball.vz = (z - prevz) / Math.max(dt, 1e-4);
            if (Math.abs(a) > 0.98) chain = b.newChain();
            ball.chain = chain; ball.thrown = 1e9;
            mesh.position.set(x, 0.9, z);
            mesh.rotation.z = -a * 0.3;
            const top = new THREE.Vector3(pivot.x + x * 0.3, pivot.y, z);
            const mid = top.clone().add(mesh.position).multiplyScalar(0.5);
            cable.position.copy(mid);
            cable.scale.y = top.distanceTo(mesh.position);
            cable.lookAt(mesh.position); cable.rotateX(Math.PI / 2);
            const pb = b.player.body;
            if (Math.hypot(pb.x - x, pb.z - z) < ball.r + pb.r + 0.05 && ball.speed > 3) {
              const d = Math.hypot(pb.x - x, pb.z - z) || 1; b.hurtPlayer(18, (pb.x - x) / d, (pb.z - z) / d, 14);
            }
          },
          isDanger(x, z, r) { return Math.hypot(x - ball.x, z - ball.z) < ball.r + r + 1; },
          dispose() { g.removeFromParent(); cable.removeFromParent(); ball.alive = false; },
        });
        break;
      }
      case 'bounce': {
        const pads = [slot(), slot(), slot()].map(([x, z]) => {
          const mesh = new THREE.Mesh(cylGeo(0.95, 1.05, 0.18, 24), toon(0x31f5ff, { emissive: 0x0a5560 })); mesh.position.set(x, 0.09, z); addOutline(mesh, 0.04); scene.add(mesh);
          const top = new THREE.Mesh(new THREE.CircleGeometry(0.8, 24), basic(0xff3df2, { additive: true, opacity: 0.6 })); top.rotation.x = -Math.PI / 2; top.position.y = 0.1; mesh.add(top);
          return { x, z, mesh, pulse: 0 };
        });
        out.push({
          type: m,
          update(dt) {
            for (const p of pads) {
              p.pulse = Math.max(0, p.pulse - dt * 3);
              p.mesh.scale.set(1 + p.pulse * 0.2, 1 - p.pulse * 0.4, 1 + p.pulse * 0.2);
              forBodies(b, (body) => {
                if (body.portalCd > 0 || body.y > 0.4 || Math.hypot(body.x - p.x, body.z - p.z) > 0.95) return;
                const sp = body.speed;
                if (body.kind === 'player') { body.vy = 7; body.y = 0.05; body.portalCd = 0.6; p.pulse = 1; audio.pop(); return; }
                if (sp < 2) return;
                const k = Math.min(1.7, 24 / sp);
                body.vx *= k; body.vz *= k; body.vy = 9; body.y = 0.05; body.portalCd = 0.5; p.pulse = 1;
                if (sp > 6 || body.thrown > 0) { body.thrown = Math.max(body.thrown, 1); if (!body.chain) body.chain = b.newChain(); }
                b.fx.ring(p.x, p.z, 0xff3df2, 0.6, 2, 0.3, 0.8); audio.pop();
              });
            }
          },
          dispose() { pads.forEach((p) => p.mesh.removeFromParent()); },
        });
        break;
      }
      case 'fence': {
        const fences = (rng.chance(0.5) ? [[-HW, -4.5, -1.5], [1.5, 1.5, HW]] : [[-HW, 1.5, -1.8], [1.8, -4.5, HW]]).map(([x0, z, x1]) => {
          const rect = b.phys.addWall(x0, z - 0.12, x1, z + 0.12, 'fence');
          const g = new THREE.Group(); scene.add(g);
          for (let x = x0 + 0.2; x <= x1; x += Math.max(1, (x1 - x0) / 4)) { const post = new THREE.Mesh(cylGeo(0.13, 0.16, 1.4, 8), toon(0x3a3a4a)); post.position.set(x, 0.7, z); addOutline(post, 0.03); g.add(post); const cap = new THREE.Mesh(sphereGeo(1, 8, 6), basic(0x31f5ff)); cap.scale.setScalar(0.16); cap.position.set(x, 1.45, z); g.add(cap); }
          for (const y of [0.45, 0.95]) { const wire = new THREE.Mesh(rboxGeo(x1 - x0, 0.06, 0.06, 0.02), basic(0x7ff8ff)); wire.position.set((x0 + x1) / 2, y, z); g.add(wire); }
          return { rect, g, x0, x1, z, cd: 0 };
        });
        out.push({
          type: m,
          update(dt) {
            for (const f of fences) {
              f.cd -= dt;
              if (Math.random() < 0.18 * b.fx.quality) { const xa = f.x0 + Math.random() * (f.x1 - f.x0); b.fx.lightning(xa, 0.5 + Math.random() * 0.5, f.z, xa + (Math.random() - 0.5) * 1.5, 0.5 + Math.random() * 0.5, f.z, 0x7ff8ff, 0.07); }
              forBodies(b, (body) => {
                const cx = clamp(body.x, f.x0, f.x1), dz = Math.abs(body.z - f.z);
                if (Math.abs(body.x - cx) > 0.05 || dz > body.r + 0.2) return;
                if (body.kind === 'enemy') {
                  const e = body.owner as Enemy;
                  if (e.dead) return;
                  if (body.speed > 3.5 || body.thrown > 0) {
                    b.fx.lightning(body.x, 2.5, body.z, body.x, 0.4, body.z, 0xbff8ff, 0.2); b.fx.burst(body.x, 0.8, body.z, 0x7ff8ff, 14, 6, 0.4, 0.4); audio.zap();
                    b.ft.spawn(body.x, 1.8, body.z, 'GRILLÉ !', 'ft-big', 0.9);
                    if (e.elite) b.damageEnemy(e, 60, body.chain, 'hazard'); else b.killEnemy(e, 'hazard', body.chain);
                  }
                } else if (body.kind === 'player' && f.cd <= 0) {
                  f.cd = 0.6; audio.zap(); b.fx.lightning(body.x, 2, body.z, body.x, 0.4, body.z, 0xbff8ff, 0.18);
                  b.hurtPlayer(12, 0, Math.sign(body.z - f.z) || 1, 10);
                }
              });
            }
          },
          isDanger(x, z, r) { return fences.some((f) => x > f.x0 - r && x < f.x1 + r && Math.abs(z - f.z) < r + 0.6); },
          dispose() { fences.forEach((f) => { f.g.removeFromParent(); b.phys.walls = b.phys.walls.filter((w) => w !== f.rect); }); },
        });
        break;
      }
      case 'vent': {
        const vents = [[-HW + 0.9, -2.5, 1], [HW - 0.9, 3.5, -1]].map(([x, z, dir]) => {
          const mesh = new THREE.Mesh(rboxGeo(1.2, 0.2, 2.6, 0.06), toon(0x3d8bff)); mesh.position.set(x, 0.1, z); addOutline(mesh, 0.03); scene.add(mesh);
          for (let i = -1; i <= 1; i++) { const slat = new THREE.Mesh(rboxGeo(1.0, 0.06, 0.18, 0.02), basic(0x2a3550)); slat.position.set(0, 0.12, i * 0.6); mesh.add(slat); }
          return { x, z, dir, mesh, t: rng.range(0, 5) };
        });
        out.push({
          type: m,
          update(dt) {
            for (const v of vents) {
              v.t += dt;
              const on = v.t % 5 < 3;
              if (!on) continue;
              if (Math.random() < 0.5 * b.fx.quality) b.fx.glow.spawn(v.x, 0.3 + Math.random(), v.z + (Math.random() - 0.5) * 2.4, v.dir * 12, 0, 0, new THREE.Color(0xdfefff), 0.5, 0.3, 0.8, 0, 0.6);
              forBodies(b, (body) => {
                if (Math.abs(body.z - v.z) > 1.4) return;
                const dist = (body.x - v.x) * v.dir;
                if (dist < 0 || dist > 9) return;
                const k = (1 - dist / 9) * (body.kind === 'player' ? 9 : 22) / Math.sqrt(body.mass);
                body.vx += v.dir * k * dt;
              });
            }
          },
          dispose() { vents.forEach((v) => v.mesh.removeFromParent()); },
        });
        break;
      }
      case 'lava': {
        const lavaMat = new THREE.ShaderMaterial({
          uniforms: { uT: { value: 0 } },
          vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
          fragmentShader: `varying vec2 vUv; uniform float uT;
            float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
            float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
            void main(){ vec2 p = vUv * 5.0; float v = n(p + uT*0.4) * 0.6 + n(p*2.0 - uT*0.3) * 0.4;
              vec3 c = mix(vec3(0.9,0.2,0.02), vec3(1.0,0.85,0.2), smoothstep(0.45, 0.8, v));
              float edge = min(min(vUv.x, 1.0-vUv.x), min(vUv.y, 1.0-vUv.y));
              c = mix(vec3(0.25,0.06,0.02), c, smoothstep(0.0, 0.08, edge));
              gl_FragColor = vec4(c, 1.0); }`,
        });
        const pools = [slot(), slot()].map(([x, z]) => {
          const w = 2.8, h = 2.4;
          const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), lavaMat); mesh.rotation.x = -Math.PI / 2; mesh.position.set(x, 0.04, z); scene.add(mesh);
          const rim = new THREE.Mesh(rboxGeo(w + 0.3, 0.14, h + 0.3, 0.06), toon(0x1a0d0b)); rim.position.set(x, 0.0, z); scene.add(rim);
          return { x, z, rect: { x0: x - w / 2, z0: z - h / 2, x1: x + w / 2, z1: z + h / 2 }, mesh, rim };
        });
        out.push({
          type: m,
          update(dt) {
            lavaMat.uniforms.uT.value += dt;
            for (const p of pools) {
              if (Math.random() < 0.15 * b.fx.quality) b.fx.glow.spawn(p.x + (Math.random() - 0.5) * 2.6, 0.1, p.z + (Math.random() - 0.5) * 2.2, 0, 2.5, 0, new THREE.Color(0xff9a3a), 0.9, 0.3, 0.8, 0, 1);
              forBodies(b, (body) => { if (body.y < 0.8 && inRect(body.x, body.z, p.rect, -body.r * 0.4)) swallow(b, body, 'lava'); });
            }
          },
          isDanger(x, z, r) { return pools.some((p) => inRect(x, z, p.rect, r)); },
          dispose() { pools.forEach((p) => { p.mesh.removeFromParent(); p.rim.removeFromParent(); }); lavaMat.dispose(); },
        });
        break;
      }
      case 'pit': {
        const pits = [slot(), slot()].map(([x, z]) => {
          const r = 1.35;
          const hole = new THREE.Mesh(new THREE.CircleGeometry(r, 32), basic(0x05030a)); hole.rotation.x = -Math.PI / 2; hole.position.set(x, 0.04, z); scene.add(hole);
          const rim = new THREE.Mesh(torusGeo(r, 0.12), toon(b.world.palette.accent)); rim.rotation.x = Math.PI / 2; rim.position.set(x, 0.06, z); scene.add(rim);
          const glow = new THREE.Mesh(new THREE.RingGeometry(r * 0.3, r, 32), new THREE.MeshBasicMaterial({ color: 0x9b5cff, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false })); glow.rotation.x = -Math.PI / 2; glow.position.set(x, 0.05, z); scene.add(glow);
          return { x, z, r, hole, rim, glow };
        });
        out.push({
          type: m,
          update(dt) {
            for (const p of pits) {
              p.glow.rotation.z += dt;
              forBodies(b, (body) => { if (body.y < 1.3 && Math.hypot(body.x - p.x, body.z - p.z) < p.r - body.r * 0.35) swallow(b, body, 'pit'); });
            }
          },
          isDanger(x, z, r) { return pits.some((p) => Math.hypot(x - p.x, z - p.z) < p.r + r); },
          dispose() { pits.forEach((p) => { p.hole.removeFromParent(); p.rim.removeFromParent(); p.glow.removeFromParent(); }); },
        });
        break;
      }
      case 'eruption': {
        const rocks: { x: number; z: number; t: number; marker: THREE.Mesh }[] = [];
        let timer = 4;
        out.push({
          type: m,
          update(dt) {
            if (b.state !== 'play') return;
            timer -= dt;
            if (timer <= 0) {
              timer = rng.range(5, 7);
              audio.warning(); b.rig.shake(0.15);
              const n = rng.int(3, 5);
              for (let i = 0; i < n; i++) {
                const x = rng.range(-HW + 1, HW - 1), z = i === 0 ? b.player.body.z + rng.range(-1.5, 1.5) : rng.range(-HH + 2, HH - 2);
                const marker = new THREE.Mesh(new THREE.CircleGeometry(1.2, 24), new THREE.MeshBasicMaterial({ color: 0xff2d2d, transparent: true, opacity: 0.3, depthWrite: false }));
                marker.rotation.x = -Math.PI / 2; marker.position.set(x, 0.05, z); scene.add(marker);
                rocks.push({ x: i === 0 ? b.player.body.x + rng.range(-1.5, 1.5) : x, z, t: 1.3 + i * 0.15, marker });
                marker.position.x = rocks[rocks.length - 1].x;
              }
            }
            for (const r of rocks) {
              r.t -= dt;
              r.marker.scale.setScalar(1.1 - Math.max(0, r.t) * 0.3);
              (r.marker.material as THREE.MeshBasicMaterial).opacity = 0.25 + Math.sin(r.t * 20) * 0.15;
              if (r.t < 0.5 && Math.random() < 0.6) b.fx.trail(r.x, 1 + r.t * 16, r.z, 0xff7a1f, 0.8, 0.3);
              if (r.t <= 0) {
                r.marker.removeFromParent(); r.marker.geometry.dispose();
                b.fx.flash(r.x, 0.5, r.z, 0xff7a1f, 0.4, 2, 0.3); b.fx.burst(r.x, 0.5, r.z, 0xff9a3a, 16, 8, 0.5, 0.5, { up: 8 }); b.fx.chunks(r.x, 0.4, r.z, 0x3a2220, 6, 6, 0.25);
                audio.explosion(0.5); b.rig.shake(0.18);
                for (const body of b.phys.query(r.x, r.z, 1.3, [])) {
                  if (body.kind === 'player') b.hurtPlayer(18, 0, 0, 0);
                  else if (body.kind === 'enemy') b.damageEnemy(body.owner as Enemy, 45, 0, 'hazard');
                }
                if (rng.chance(0.35) && b.props.length < 22) b.spawnProp('magmaRock', r.x, r.z);
              }
            }
            for (let i = rocks.length - 1; i >= 0; i--) if (rocks[i].t <= 0) rocks.splice(i, 1);
          },
          isDanger(x, z, r) { return rocks.some((k) => Math.hypot(x - k.x, z - k.z) < 1.3 + r); },
          dispose() { rocks.forEach((r) => r.marker.removeFromParent()); },
        });
        break;
      }
      case 'freezeVent': {
        const vents = [slot(), slot()].map(([x, z]) => {
          const mesh = new THREE.Mesh(cylGeo(0.9, 1.0, 0.2, 20), toon(0x5aa0ff)); mesh.position.set(x, 0.1, z); addOutline(mesh, 0.03); scene.add(mesh);
          const top = new THREE.Mesh(new THREE.CircleGeometry(0.75, 20), basic(0xbff2ff)); top.rotation.x = -Math.PI / 2; top.position.y = 0.11; mesh.add(top);
          return { x, z, mesh, t: rng.range(0, 5) };
        });
        out.push({
          type: m,
          update(dt) {
            for (const v of vents) {
              const prev = v.t; v.t = (v.t + dt) % 5;
              if (v.t > 3.8 && Math.random() < 0.4) b.fx.glow.spawn(v.x + (Math.random() - 0.5), 0.2, v.z + (Math.random() - 0.5), 0, 2, 0, new THREE.Color(0xe8f8ff), 0.8, 0.25, 0.5, 0, 1);
              if (prev > v.t) {
                b.fx.ring(v.x, v.z, 0xbff2ff, 0.4, 2.6, 0.4, 0.9); b.fx.burst(v.x, 0.5, v.z, 0xe8f8ff, 24, 7, 0.45, 0.6, { up: 4 }); audio.freeze();
                forBodies(b, (body) => {
                  if (Math.hypot(body.x - v.x, body.z - v.z) > 2.4) return;
                  if (body.kind === 'enemy') { body.frozen = 3; (body.owner as Enemy).stun = 3; }
                  if (body.kind === 'player') b.player.slow = 1.6;
                });
              }
            }
          },
          dispose() { vents.forEach((v) => v.mesh.removeFromParent()); },
        });
        break;
      }
      case 'gravityWell': {
        const [x, z] = slot();
        const mat = new THREE.ShaderMaterial({
          uniforms: { uT: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
          vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
          fragmentShader: `varying vec2 vUv; uniform float uT; void main(){ vec2 c = vUv - 0.5; float d = length(c)*2.0; float a = atan(c.y, c.x);
            float s = sin(a*3.0 + d*12.0 - uT*4.0)*0.5+0.5; float al = (1.0-d) * s * 0.8 + smoothstep(0.25,0.0,d);
            gl_FragColor = vec4(mix(vec3(0.6,0.3,1.0), vec3(1.0,0.4,0.95), s), al*step(d,1.0)); }`,
        });
        const disc = new THREE.Mesh(new THREE.PlaneGeometry(9, 9), mat); disc.rotation.x = -Math.PI / 2; disc.position.set(x, 0.05, z); scene.add(disc);
        const core = new THREE.Mesh(new THREE.CircleGeometry(0.75, 24), basic(0x000000)); core.rotation.x = -Math.PI / 2; core.position.set(x, 0.07, z); scene.add(core);
        out.push({
          type: m,
          update(dt) {
            mat.uniforms.uT.value += dt;
            forBodies(b, (body) => {
              const dx = x - body.x, dz = z - body.z, d = Math.hypot(dx, dz);
              if (d > 4.5 || d < 0.01) return;
              const pull = (body.kind === 'player' ? 5 : body.kind === 'enemy' ? 26 : 16) * (1 - d / 4.5) / Math.sqrt(body.mass) * (body.kind === 'player' && b.effectivePolarity() < 0 ? 0.4 : 1);
              body.vx += (dx / d) * pull * dt; body.vz += (dz / d) * pull * dt;
              if (body.kind === 'enemy' && d < 2.2) { const e = body.owner as Enemy; e.stun = Math.max(e.stun, 0.15); }
              if ((d < 1.0 && body.y < 1.2) || (body.kind === 'enemy' && body.thrown > 0 && d < 1.7 && body.y < 1.6)) swallow(b, body, 'well');
            });
            if (Math.random() < 0.4 * b.fx.quality) { const a = Math.random() * TAU; b.fx.stream(x + Math.cos(a) * 4, 0.2, z + Math.sin(a) * 4, x, z, 0xd8a0ff, 6, 0.2); }
          },
          isDanger(px, pz, r) { return Math.hypot(px - x, pz - z) < 1.6 + r; },
          dispose() { disc.removeFromParent(); core.removeFromParent(); mat.dispose(); },
        });
        break;
      }
      case 'portal': {
        const A: [number, number] = [-4.5, -2], B: [number, number] = [4.5, 3];
        const mk = (p: [number, number], c: number) => {
          const g = new THREE.Group(); g.position.set(p[0], 0, p[1]); scene.add(g);
          const ring = new THREE.Mesh(torusGeo(0.9, 0.14), basic(c)); ring.rotation.x = Math.PI / 2; ring.position.y = 0.15; g.add(ring);
          const inner = new THREE.Mesh(new THREE.CircleGeometry(0.85, 24), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false })); inner.rotation.x = -Math.PI / 2; inner.position.y = 0.06; g.add(inner);
          return g;
        };
        const ga = mk(A, 0xff8a1f), gb = mk(B, 0x31a8ff);
        out.push({
          type: m,
          update(dt) {
            ga.rotation.y += dt * 2; gb.rotation.y -= dt * 2;
            if (Math.random() < 0.3) { b.fx.trail(A[0] + (Math.random() - 0.5) * 1.6, 0.3, A[1] + (Math.random() - 0.5) * 1.6, 0xff8a1f, 0.25, 0.4); b.fx.trail(B[0] + (Math.random() - 0.5) * 1.6, 0.3, B[1] + (Math.random() - 0.5) * 1.6, 0x31a8ff, 0.25, 0.4); }
            forBodies(b, (body) => {
              if (body.portalCd > 0) return;
              for (const [from, to] of [[A, B], [B, A]] as const) {
                if (Math.hypot(body.x - from[0], body.z - from[1]) < 0.75) {
                  const sp = body.speed || 1;
                  body.x = to[0] + (body.vx / sp) * 1.1; body.z = to[1] + (body.vz / sp) * 1.1;
                  body.portalCd = 0.8;
                  b.fx.flash(to[0], 0.6, to[1], 0xffffff, 0.3, 1.4, 0.2); b.fx.ring(from[0], from[1], 0xffffff, 1, 0.2, 0.25, 0.8);
                  audio.pop();
                  break;
                }
              }
            });
          },
          dispose() { ga.removeFromParent(); gb.removeFromParent(); },
        });
        break;
      }
      case 'polarityZone': {
        const zones = [slot(), slot()].map(([x, z]) => {
          const mesh = new THREE.Mesh(new THREE.CircleGeometry(2.2, 32), new THREE.MeshBasicMaterial({ color: 0xb45cff, transparent: true, opacity: 0.28, depthWrite: false })); mesh.rotation.x = -Math.PI / 2; mesh.position.set(x, 0.05, z); scene.add(mesh);
          const ring = new THREE.Mesh(torusGeo(2.2, 0.07), basic(0xd8a0ff)); ring.rotation.x = Math.PI / 2; ring.position.set(x, 0.08, z); scene.add(ring);
          return { x, z, mesh, ring };
        });
        let tt = 0;
        out.push({
          type: m,
          update(dt) {
            tt += dt;
            const pb = b.player.body;
            const inside = zones.some((zn) => Math.hypot(pb.x - zn.x, pb.z - zn.z) < 2.2);
            if (inside !== b.player.inZone) { b.player.inZone = inside; audio.flip(b.effectivePolarity()); if (inside) b.ft.spawn(pb.x, 2.4, pb.z, 'POLARITÉ INVERSÉE !', 'ft-small', 0.9); }
            for (const zn of zones) { zn.ring.scale.setScalar(1 + Math.sin(tt * 4) * 0.03); (zn.mesh.material as THREE.MeshBasicMaterial).opacity = 0.22 + Math.sin(tt * 3) * 0.08; }
          },
          dispose() { zones.forEach((z) => { z.mesh.removeFromParent(); z.ring.removeFromParent(); }); b.player.inZone = false; },
        });
        break;
      }
      case 'flipGravity': {
        const dirs: [number, number, string][] = [[0, 1, '⬇️'], [1, 0, '➡️'], [0, -1, '⬆️'], [-1, 0, '⬅️']];
        let t = 0, i = rng.int(0, 3);
        const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.8, 1.6, 3), basic(0xff2d55, { transparent: true, opacity: 0.4 }));
        arrow.position.set(0, 0.1, 0); arrow.rotation.x = -Math.PI / 2; scene.add(arrow);
        out.push({
          type: m,
          update(dt) {
            if (b.state !== 'play') return;
            const prev = t; t += dt;
            if (prev < 7 && t >= 7) { audio.warning(); b.onBanner?.('GRAVITÉ ' + dirs[(i + 1) % 4][2], undefined, '#ff2d55', 1); }
            if (t >= 8) { t = 0; i = (i + 1) % 4; b.rig.shake(0.2); }
            const [dx, dz] = dirs[i];
            b.phys.driftX = dx * 6; b.phys.driftZ = dz * 6;
            arrow.rotation.set(-Math.PI / 2, 0, Math.atan2(-dx, dz) + Math.PI);
            arrow.position.set(b.player.body.x, 0.1, b.player.body.z);
            (arrow.material as THREE.MeshBasicMaterial).opacity = 0.25 + Math.sin(t * 6) * 0.1;
          },
          dispose() { arrow.removeFromParent(); b.phys.driftX = b.phys.driftZ = 0; },
        });
        break;
      }
      case 'asteroid': {
        out.push({
          type: m,
          update() {
            for (const p of b.props) if (p.kind === 'asteroid' && !p.body.held && p.body.speed < 0.6 && Math.random() < 0.01) { const a = Math.random() * TAU; p.body.vx += Math.cos(a) * 2; p.body.vz += Math.sin(a) * 2; }
          },
        });
        break;
      }
      default:
        // barrels, cars, debris, lowgrav, ice, iceBlock, magmaRock: handled through props / physics settings
        break;
    }
  }
  void outlineMat;
  return out;
}
