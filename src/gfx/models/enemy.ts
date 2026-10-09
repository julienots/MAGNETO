import * as THREE from 'three';
import type { EnemyKind } from '../../data/enemies';
import { ENEMIES } from '../../data/enemies';
import { Baker, toonRamp, outlineMat, sphereGeo, capsuleGeo, rboxGeo, cylGeo, torusGeo, coneGeo, makeEye, blobShadow, shade, basic } from '../toon';

/** Cached baked body geometry per kind: every enemy of a kind shares it. */
const bodyGeos = new Map<EnemyKind, THREE.BufferGeometry>();

function bakeBody(kind: EnemyKind): THREE.BufferGeometry {
  const d = ENEMIES[kind];
  const c = d.color, a = d.accent, dk = shade(c, -0.35), lt = shade(c, 0.35);
  const b = new Baker();
  switch (kind) {
    case 'drone':
      b.add(sphereGeo(1, 18, 12), c, [0, 0, 0], [0, 0, 0], [0.45, 0.4, 0.45]);
      b.add(cylGeo(0.47, 0.47, 0.1, 18), a, [0, -0.02, 0]);
      b.add(cylGeo(0.04, 0.04, 0.25, 6), a, [0, 0.45, 0]);
      b.add(rboxGeo(0.12, 0.16, 0.2, 0.04), dk, [0.42, -0.15, 0.1]);
      b.add(rboxGeo(0.12, 0.16, 0.2, 0.04), dk, [-0.42, -0.15, 0.1]);
      break;
    case 'tank':
      b.add(rboxGeo(1.5, 0.75, 1.5, 0.2), c, [0, 0.55, 0]);
      b.add(rboxGeo(0.45, 0.45, 1.7, 0.18), a, [0.75, 0.25, 0]);
      b.add(rboxGeo(0.45, 0.45, 1.7, 0.18), a, [-0.75, 0.25, 0]);
      b.add(rboxGeo(0.95, 0.5, 0.9, 0.16), lt, [0, 1.1, -0.05]);
      b.add(cylGeo(0.12, 0.14, 0.8, 10), dk, [0, 1.1, 0.75], [Math.PI / 2, 0, 0]);
      for (const x of [-0.75, 0.75]) for (const z of [-0.55, 0, 0.55]) b.add(cylGeo(0.17, 0.17, 0.48, 10), dk, [x, 0.25, z], [0, 0, Math.PI / 2]);
      break;
    case 'puller':
    case 'pusher': {
      b.add(capsuleGeo(0.38, 0.35), c, [0, 0.65, 0]);
      b.add(cylGeo(0.3, 0.42, 0.25, 16), a, [0, 0.18, 0]);
      if (kind === 'puller') {
        // giant horseshoe magnet on head
        b.add(torusGeo(0.32, 0.11, Math.PI), 0xff3b3b, [0, 1.25, 0.05], [0, 0, 0]);
        b.add(rboxGeo(0.22, 0.2, 0.22, 0.05), 0xe8e8e8, [0.32, 1.22, 0.05]);
        b.add(rboxGeo(0.22, 0.2, 0.22, 0.05), 0xe8e8e8, [-0.32, 1.22, 0.05]);
      } else {
        // fan / plunger
        b.add(cylGeo(0.07, 0.07, 0.4, 8), a, [0, 0.75, 0.45], [Math.PI / 2, 0, 0]);
        b.add(coneGeo(0.32, 0.25, 16), 0x2f7bff, [0, 0.75, 0.72], [-Math.PI / 2, 0, 0]);
        b.add(sphereGeo(), lt, [0, 1.15, 0], [0, 0, 0], 0.18);
      }
      break;
    }
    case 'bomber':
      b.add(sphereGeo(1, 18, 14), c, [0, 0.55, 0], [0, 0, 0], 0.5);
      b.add(cylGeo(0.14, 0.16, 0.16, 10), 0x888899, [0, 1.07, 0]);
      b.add(sphereGeo(), a, [0.22, 0.22, 0.32], [0, 0, 0], 0.12);
      b.add(sphereGeo(), a, [-0.22, 0.22, 0.32], [0, 0, 0], 0.12);
      b.add(torusGeo(0.5, 0.04), a, [0, 0.55, 0], [Math.PI / 2, 0, 0]);
      break;
    case 'shield':
      b.add(rboxGeo(0.95, 1.0, 0.8, 0.25), c, [0, 0.7, 0]);
      b.add(rboxGeo(0.75, 0.25, 0.55, 0.1), a, [0, 0.15, 0]);
      b.add(cylGeo(0.18, 0.22, 0.3, 12), dk, [0, 0.7, 0.42], [Math.PI / 2, 0, 0]);
      b.add(rboxGeo(0.25, 0.5, 0.25, 0.08), shade(c, -0.15), [0.6, 0.65, 0]);
      b.add(rboxGeo(0.25, 0.5, 0.25, 0.08), shade(c, -0.15), [-0.6, 0.65, 0]);
      break;
    case 'swarm':
      b.add(rboxGeo(0.46, 0.4, 0.46, 0.12), c, [0, 0.3, 0]);
      b.add(coneGeo(0.08, 0.2, 6), a, [0.15, 0.6, 0], [0, 0, -0.3]);
      b.add(coneGeo(0.08, 0.2, 6), a, [-0.15, 0.6, 0], [0, 0, 0.3]);
      break;
    case 'phaser':
      b.add(sphereGeo(1, 18, 14), c, [0, 0.75, 0], [0, 0, 0], [0.45, 0.5, 0.45]);
      b.add(coneGeo(0.45, 0.7, 16), shade(c, -0.1), [0, 0.3, 0], [Math.PI, 0, 0]);
      b.add(torusGeo(0.28, 0.04), lt, [0, 1.3, 0], [Math.PI / 2, 0, 0]);
      break;
    case 'chaos':
      b.add(sphereGeo(1, 18, 14), 0x222233, [0, 0.7, 0], [0, 0, 0], 0.48);
      for (let i = 0; i < 6; i++) {
        const ang = (i / 6) * Math.PI * 2;
        b.add(coneGeo(0.1, 0.32, 6), i % 2 ? 0xff3b3b : 0x2f7bff, [Math.sin(ang) * 0.5, 0.7, Math.cos(ang) * 0.5], [Math.PI / 2, ang, 0], 1, 'YXZ');
      }
      b.add(cylGeo(0.25, 0.32, 0.2, 14), a, [0, 0.14, 0]);
      break;
  }
  return b.build();
}

export class EnemyRig {
  root = new THREE.Group();
  pivot = new THREE.Group();
  body: THREE.Mesh;
  mat: THREE.MeshToonMaterial;
  eyes: THREE.Group[] = [];
  extra: Record<string, THREE.Object3D> = {};
  shadow: THREE.Mesh;
  private blinkT = Math.random() * 3;
  private t = Math.random() * 10;
  squash = 0;
  private squashV = 0;
  flash = 0;

  constructor(public kind: EnemyKind) {
    const d = ENEMIES[kind];
    let geo = bodyGeos.get(kind);
    if (!geo) { geo = bakeBody(kind); bodyGeos.set(kind, geo); }
    this.mat = new THREE.MeshToonMaterial({ color: 0xffffff, vertexColors: true, gradientMap: toonRamp() });
    if (kind === 'phaser') { this.mat.transparent = true; this.mat.opacity = 0.85; }
    this.body = new THREE.Mesh(geo, this.mat);
    const ol = new THREE.Mesh(geo, outlineMat(kind === 'swarm' ? 0.03 : 0.045));
    this.body.add(ol);
    this.root.add(this.pivot);
    this.pivot.add(this.body);
    this.shadow = blobShadow(d.radius * 1.1);
    this.root.add(this.shadow);

    // eyes
    const eyeCfg: Record<EnemyKind, { y: number; z: number; size: number; n: 1 | 2; sep: number; glow?: number }> = {
      drone: { y: 0.02, z: 0.4, size: 0.17, n: 1, sep: 0 },
      tank: { y: 1.12, z: 0.42, size: 0.13, n: 2, sep: 0.22, glow: 0xffd23f },
      puller: { y: 0.85, z: 0.34, size: 0.11, n: 2, sep: 0.15 },
      pusher: { y: 0.92, z: 0.34, size: 0.11, n: 2, sep: 0.15 },
      bomber: { y: 0.65, z: 0.44, size: 0.12, n: 2, sep: 0.17 },
      shield: { y: 0.95, z: 0.4, size: 0.12, n: 2, sep: 0.2, glow: 0x30e0ff },
      swarm: { y: 0.33, z: 0.24, size: 0.09, n: 1, sep: 0 },
      phaser: { y: 0.82, z: 0.38, size: 0.12, n: 2, sep: 0.15, glow: 0xffffff },
      chaos: { y: 0.75, z: 0.43, size: 0.18, n: 1, sep: 0 },
    };
    const ec = eyeCfg[kind];
    for (let i = 0; i < ec.n; i++) {
      const e = makeEye(ec.size, 0x14121c, ec.glow);
      e.position.set(ec.n === 1 ? 0 : (i ? 1 : -1) * ec.sep, ec.y, ec.z);
      this.pivot.add(e); this.eyes.push(e);
      // angry brow
      if (!ec.glow) {
        const br = new THREE.Mesh(rboxGeo(ec.size * 1.6, ec.size * 0.35, 0.05, 0.02), basic(0x14121c));
        br.position.set(e.position.x, ec.y + ec.size * 1.2, ec.z + 0.03);
        br.rotation.z = ec.n === 1 ? 0 : (i ? 0.35 : -0.35);
        this.pivot.add(br);
      }
    }
    if (kind === 'drone') {
      const p = new THREE.Group();
      const bladeM = basic(0x223344);
      for (let i = 0; i < 2; i++) { const bl = new THREE.Mesh(rboxGeo(0.9, 0.03, 0.12, 0.01), bladeM); bl.rotation.y = i * Math.PI / 2; p.add(bl); }
      p.position.y = 0.58; this.pivot.add(p); this.extra.prop = p;
      this.pivot.position.y = 0.9;
    }
    if (kind === 'shield') {
      const bub = new THREE.Mesh(new THREE.SphereGeometry(1.15, 24, 12, -Math.PI / 2.2, Math.PI / 1.1 * 1, 0, Math.PI),
        new THREE.MeshBasicMaterial({ color: 0x30e0ff, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      bub.position.y = 0.7; bub.scale.set(1, 0.9, 1);
      this.pivot.add(bub); this.extra.bubble = bub;
    }
    if (kind === 'bomber') {
      const spark = new THREE.Mesh(sphereGeo(1, 8, 6), basic(0xffd23f, { additive: true }));
      spark.scale.setScalar(0.12); spark.position.y = 1.2; this.pivot.add(spark); this.extra.spark = spark;
    }
    if (kind === 'chaos') {
      const ring = new THREE.Mesh(torusGeo(0.75, 0.06), new THREE.MeshBasicMaterial({ color: 0xff3b3b, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
      ring.rotation.x = Math.PI / 2; ring.position.y = 0.7; this.pivot.add(ring); this.extra.ring = ring;
    }
    if (kind === 'puller' || kind === 'pusher') {
      const ring = new THREE.Mesh(torusGeo(0.9, 0.04), new THREE.MeshBasicMaterial({ color: kind === 'puller' ? 0xff3b3b : 0x2f7bff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
      ring.rotation.x = Math.PI / 2; ring.position.y = 0.2; this.pivot.add(ring); this.extra.ring = ring;
    }
  }

  kick(a: number) { this.squashV += a * 6; }

  update(dt: number, moving: number, state: { phase?: boolean; charge?: number; fuse?: number; field?: number }) {
    this.t += dt;
    this.squashV += (-this.squash * 200 - this.squashV * 12) * dt;
    this.squash += this.squashV * dt;
    const s = 1 + Math.max(-0.4, Math.min(0.4, this.squash));
    const bob = this.kind === 'drone' ? 0.9 + Math.sin(this.t * 4) * 0.12 : Math.abs(Math.sin(this.t * 10)) * 0.08 * moving;
    this.pivot.position.y = bob;
    this.body.scale.set(1 / Math.sqrt(s), s, 1 / Math.sqrt(s));
    this.body.rotation.z = Math.sin(this.t * 10) * 0.06 * moving;
    if (this.extra.prop) this.extra.prop.rotation.y += dt * 30;
    // blink
    this.blinkT -= dt;
    const bl = this.blinkT < 0.12 ? 0.15 : 1;
    if (this.blinkT < 0) this.blinkT = 2 + Math.random() * 3;
    for (const e of this.eyes) e.scale.y = bl;
    // flash
    this.flash = Math.max(0, this.flash - dt * 6);
    (this.mat.emissive as THREE.Color).setRGB(this.flash, this.flash, this.flash);
    if (this.kind === 'phaser') {
      const ph = !!state.phase;
      this.mat.opacity = ph ? 0.25 + Math.sin(this.t * 20) * 0.05 : 0.9;
      this.mat.transparent = true;
    }
    if (this.extra.ring && this.kind === 'chaos') {
      (this.extra.ring as THREE.Mesh).rotation.z += dt * 3;
      ((this.extra.ring as THREE.Mesh).material as THREE.MeshBasicMaterial).color.setHex((state.charge ?? 1) > 0 ? 0xff3b3b : 0x2f7bff);
    }
    if (this.extra.ring && (this.kind === 'puller' || this.kind === 'pusher')) {
      const r = this.extra.ring as THREE.Mesh;
      const f = state.field ?? 0;
      const k = this.kind === 'puller' ? 1 - ((this.t * 1.5) % 1) : (this.t * 1.5) % 1;
      r.scale.setScalar(0.5 + k * 3);
      (r.material as THREE.MeshBasicMaterial).opacity = f * (1 - Math.abs(k - 0.5) * 2) * 0.8;
    }
    if (this.extra.spark) {
      const f = state.fuse ?? 0;
      this.extra.spark.scale.setScalar(0.1 + Math.random() * 0.08 + f * 0.15);
      this.mat.emissive.setRGB(Math.max(this.flash, f * (Math.sin(this.t * (10 + f * 30)) > 0 ? 0.8 : 0)), this.flash * 0.3, this.flash * 0.2);
    }
  }
  dispose() { this.root.removeFromParent(); this.mat.dispose(); }
}
