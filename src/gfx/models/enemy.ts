import * as THREE from 'three';
import type { EnemyKind } from '../../data/enemies';
import { ENEMIES } from '../../data/enemies';
import { Baker, shared, toonRamp, outlineMat, sphereGeo, capsuleGeo, rboxGeo, cylGeo, torusGeo, coneGeo, makeEye, blobShadow, shade, basic } from '../toon';
import { disposeTree } from '../toon';

/** Cached baked body geometry per kind: every enemy of a kind shares it. */
const bodyGeos = new Map<EnemyKind, THREE.BufferGeometry>();

function bakeBody(kind: EnemyKind): THREE.BufferGeometry {
  const d = ENEMIES[kind];
  const c = d.color, a = d.accent, dk = shade(c, -0.35), lt = shade(c, 0.35);
  const metal = 0xb8c4d2, steel = 0x6f7c8c, ink = 0x22222e, red = 0xff3b3b, blue = 0x2f7bff;
  const b = new Baker();
  const rivets = (x: number, y: number, z: number, n: number, spread: number, axis: 'x' | 'y' = 'x') => { for (let i = 0; i < n; i++) { const o = (i / Math.max(1, n - 1) - 0.5) * spread; b.add(sphereGeo(1, 6, 5), steel, axis === 'x' ? [x + o, y, z] : [x, y + o, z], [0, 0, 0], 0.025); } };
  switch (kind) {
    case 'drone': {
      // hover pod: light top dome, dark belly, equator band with lights
      b.add(sphereGeo(1, 24, 16), c, [0, 0.04, 0], [0, 0, 0], [0.44, 0.36, 0.42]);
      b.add(sphereGeo(1, 20, 12), lt, [0, 0.14, -0.02], [0, 0, 0], [0.34, 0.24, 0.32]);
      b.add(torusGeo(0.43, 0.05), a, [0, 0.0, 0], [Math.PI / 2, 0, 0], [1, 0.97, 1]);
      for (let i = 0; i < 6; i++) { const t = (i / 6) * Math.PI * 2 + 0.5; b.add(sphereGeo(1, 6, 5), 0xfff3a0, [Math.sin(t) * 0.44, 0, Math.cos(t) * 0.42], [0, 0, 0], 0.03); }
      b.add(sphereGeo(1, 16, 10), dk, [0, -0.16, 0], [0, 0, 0], [0.3, 0.16, 0.28]);
      // camera eye housing
      b.add(cylGeo(0.2, 0.22, 0.12, 20), ink, [0, 0.03, 0.34], [Math.PI / 2, 0, 0]);
      // under-blaster
      b.add(cylGeo(0.06, 0.07, 0.24, 10), steel, [0, -0.26, 0.12], [Math.PI / 2 - 0.3, 0, 0]);
      b.add(torusGeo(0.06, 0.022), red, [0, -0.3, 0.24], [0.3, 0, 0]);
      // rotor arms
      for (const s of [-1, 1]) { b.add(capsuleGeo(0.04, 0.28), a, [s * 0.5, 0.12, -0.02], [0, 0, Math.PI / 2]); b.add(cylGeo(0.09, 0.1, 0.1, 14), steel, [s * 0.72, 0.18, -0.02]); }
      // antenna
      b.add(cylGeo(0.015, 0.015, 0.22, 6), ink, [0.12, 0.42, -0.08], [0, 0, -0.3]);
      b.add(sphereGeo(1, 8, 6), red, [0.16, 0.54, -0.08], [0, 0, 0], 0.045);
      break;
    }
    case 'tank': {
      // treads with wheels & teeth
      for (const s of [-1, 1]) {
        b.add(rboxGeo(0.42, 0.5, 1.75, 0.22), ink, [s * 0.78, 0.26, 0]);
        for (let i = 0; i < 4; i++) b.add(cylGeo(0.16, 0.16, 0.44, 14), steel, [s * 0.78, 0.25, -0.6 + i * 0.4], [0, 0, Math.PI / 2]);
        for (let i = 0; i < 4; i++) b.add(cylGeo(0.07, 0.07, 0.46, 10), metal, [s * 0.78, 0.25, -0.6 + i * 0.4], [0, 0, Math.PI / 2]);
        for (let i = 0; i < 9; i++) b.add(rboxGeo(0.44, 0.04, 0.08, 0.01), 0x33333f, [s * 0.78, 0.52, -0.8 + i * 0.2]);
        b.add(rboxGeo(0.48, 0.1, 1.8, 0.04), dk, [s * 0.78, 0.55, 0]);
      }
      // hull with sloped front
      b.add(rboxGeo(1.3, 0.5, 1.5, 0.18), c, [0, 0.66, 0]);
      b.add(rboxGeo(1.24, 0.3, 0.5, 0.12), lt, [0, 0.62, 0.72], [-0.5, 0, 0]);
      rivets(0, 0.84, 0.78, 5, 0.9);
      // turret
      b.add(sphereGeo(1, 20, 14), c, [0, 1.0, -0.05], [0, 0, 0], [0.55, 0.32, 0.55]);
      b.add(rboxGeo(0.7, 0.18, 0.12, 0.05), ink, [0, 1.08, 0.42]);
      b.add(cylGeo(0.12, 0.14, 0.95, 14), steel, [0, 1.05, 0.85], [Math.PI / 2, 0, 0]);
      b.add(cylGeo(0.17, 0.17, 0.16, 14), dk, [0, 1.05, 1.32], [Math.PI / 2, 0, 0]);
      b.add(cylGeo(0.2, 0.2, 0.08, 16), lt, [0, 1.3, -0.15]);
      for (const s of [-1, 1]) b.add(cylGeo(0.06, 0.08, 0.35, 10), steel, [s * 0.45, 0.95, -0.72], [-0.4, 0, 0]);
      b.add(rboxGeo(0.25, 0.3, 0.05, 0.02), 0xffd23f, [0.35, 0.7, 0.75], [-0.5, 0, 0]);
      break;
    }
    case 'puller':
    case 'pusher': {
      // round-bellied walker robot
      b.add(sphereGeo(1, 22, 16), c, [0, 0.62, 0], [0, 0, 0], [0.42, 0.44, 0.38]);
      b.add(sphereGeo(1, 18, 12), lt, [0, 0.66, 0.17], [0, 0, 0], [0.26, 0.26, 0.2]);
      b.add(torusGeo(0.4, 0.04), a, [0, 0.42, 0], [Math.PI / 2, 0, 0], [1, 0.9, 1]);
      for (const s of [-1, 1]) {
        b.add(capsuleGeo(0.07, 0.14), steel, [s * 0.18, 0.18, 0]);
        b.add(rboxGeo(0.18, 0.1, 0.26, 0.05), a, [s * 0.18, 0.05, 0.04]);
        b.add(sphereGeo(1, 12, 10), steel, [s * 0.42, 0.72, 0], [0, 0, 0], 0.09);
      }
      if (kind === 'puller') {
        // arms raising a giant horseshoe magnet
        for (const s of [-1, 1]) b.add(capsuleGeo(0.06, 0.4), steel, [s * 0.47, 1.0, 0], [0, 0, -s * 0.25]);
        b.add(torusGeo(0.34, 0.13, Math.PI), red, [0, 1.38, 0.02], [0, 0, 0]);
        for (const s of [-1, 1]) b.add(rboxGeo(0.26, 0.22, 0.27, 0.05), 0xeeeeee, [s * 0.34, 1.3, 0.02]);
        b.add(rboxGeo(0.12, 0.1, 0.03, 0.02), 0xffffff, [0, 0.66, 0.37]);
      } else {
        // turbine blower in the belly + exhausts
        b.add(cylGeo(0.26, 0.3, 0.16, 22), ink, [0, 0.62, 0.32], [Math.PI / 2, 0, 0]);
        b.add(torusGeo(0.27, 0.05), blue, [0, 0.62, 0.41]);
        for (let i = 0; i < 6; i++) b.add(rboxGeo(0.04, 0.22, 0.03, 0.01), metal, [0, 0.62, 0.38], [0, 0, (i / 6) * Math.PI]);
        b.add(sphereGeo(1, 10, 8), steel, [0, 0.62, 0.4], [0, 0, 0], 0.05);
        for (const s of [-1, 1]) { b.add(capsuleGeo(0.06, 0.25), steel, [s * 0.47, 0.6, 0.05], [0.3, 0, -s * 0.2]); b.add(cylGeo(0.06, 0.09, 0.25, 10), steel, [s * 0.16, 1.05, -0.2], [-0.4, 0, 0]); }
      }
      // head dome
      b.add(sphereGeo(1, 18, 12), dk, [0, 1.0, 0], [0, 0, 0], [0.24, 0.17, 0.22]);
      break;
    }
    case 'bomber': {
      b.add(sphereGeo(1, 24, 18), c, [0, 0.58, 0], [0, 0, 0], 0.48);
      b.add(sphereGeo(1, 12, 10), 0xffffff, [-0.2, 0.84, 0.28], [0, 0, 0], [0.09, 0.06, 0.04]); // gloss
      b.add(cylGeo(0.15, 0.17, 0.16, 12), steel, [0, 1.08, 0]);
      b.add(torusGeo(0.16, 0.03), metal, [0, 1.14, 0], [Math.PI / 2, 0, 0]);
      b.add(torusGeo(0.47, 0.035), a, [0, 0.58, 0], [Math.PI / 2, 0, 0]);
      // little feet & mitts
      for (const s of [-1, 1]) {
        b.add(sphereGeo(1, 12, 10), a, [s * 0.2, 0.08, 0.12], [0, 0, 0], [0.12, 0.08, 0.16]);
        b.add(sphereGeo(1, 12, 10), a, [s * 0.5, 0.48, 0.1], [0, 0, 0], 0.09);
      }
      // hazard stripes on the belly
      b.add(rboxGeo(0.3, 0.06, 0.04, 0.02), 0xffd23f, [0, 0.33, 0.42], [-0.6, 0, 0]);
      break;
    }
    case 'shield': {
      // knight robot with a tall tower shield
      b.add(rboxGeo(0.8, 0.82, 0.62, 0.24), c, [0, 0.72, -0.05]);
      b.add(rboxGeo(0.66, 0.3, 0.5, 0.1), a, [0, 0.22, -0.05]);
      for (const s of [-1, 1]) { b.add(sphereGeo(1, 14, 10), lt, [s * 0.46, 0.98, -0.05], [0, 0, 0], [0.2, 0.16, 0.2]); b.add(rboxGeo(0.18, 0.2, 0.26, 0.06), steel, [s * 0.2, 0.08, -0.02]); }
      // helmet with crest
      b.add(sphereGeo(1, 18, 12), lt, [0, 1.25, -0.05], [0, 0, 0], [0.32, 0.28, 0.3]);
      b.add(rboxGeo(0.06, 0.24, 0.42, 0.03), a, [0, 1.48, -0.08]);
      b.add(rboxGeo(0.46, 0.1, 0.06, 0.03), ink, [0, 1.24, 0.24]);
      // tower shield
      b.add(rboxGeo(0.95, 1.1, 0.1, 0.12), metal, [0, 0.72, 0.42], [0.08, 0, 0]);
      b.add(rboxGeo(0.8, 0.95, 0.06, 0.1), a, [0, 0.73, 0.47], [0.08, 0, 0]);
      b.add(rboxGeo(0.14, 0.8, 0.04, 0.03), 0xffffff, [0, 0.73, 0.5], [0.08, 0, 0]);
      b.add(rboxGeo(0.6, 0.12, 0.04, 0.03), 0xffffff, [0, 0.86, 0.49], [0.08, 0, 0]);
      rivets(0, 1.22, 0.47, 4, 0.7);
      break;
    }
    case 'swarm': {
      // robot beetle
      b.add(sphereGeo(1, 16, 12), c, [0, 0.3, -0.02], [0, 0, 0], [0.26, 0.2, 0.3]);
      b.add(rboxGeo(0.03, 0.04, 0.5, 0.01), dk, [0, 0.48, -0.02]);
      b.add(sphereGeo(1, 12, 10), dk, [0, 0.26, 0.26], [0, 0, 0], [0.16, 0.13, 0.13]);
      for (const s of [-1, 1]) {
        for (let i = 0; i < 3; i++) b.add(capsuleGeo(0.022, 0.16), ink, [s * 0.25, 0.14, -0.14 + i * 0.14], [0, 0, s * 1.0]);
        b.add(cylGeo(0.012, 0.012, 0.22, 5), ink, [s * 0.07, 0.45, 0.32], [0.6, 0, -s * 0.35]);
        b.add(sphereGeo(1, 6, 5), a, [s * 0.12, 0.54, 0.4], [0, 0, 0], 0.035);
      }
      break;
    }
    case 'phaser': {
      // ghost sheet with tattered hem and tiny hands
      b.add(sphereGeo(1, 22, 16), c, [0, 0.82, 0], [0, 0, 0], [0.44, 0.46, 0.42]);
      b.add(cylGeo(0.44, 0.5, 0.5, 22, ), c, [0, 0.46, 0]);
      for (let i = 0; i < 10; i++) { const t = (i / 10) * Math.PI * 2; b.add(coneGeo(0.1, 0.24, 6), c, [Math.sin(t) * 0.42, 0.12, Math.cos(t) * 0.42], [Math.PI, 0, 0]); }
      for (const s of [-1, 1]) b.add(sphereGeo(1, 10, 8), lt, [s * 0.5, 0.6, 0.1], [0, 0, 0], [0.1, 0.12, 0.1]);
      b.add(torusGeo(0.25, 0.035), 0xfff3a0, [0, 1.36, 0], [Math.PI / 2, 0, 0]);
      break;
    }
    case 'chaos': {
      // jester orb: split red/blue halves, spikes, base
      b.add(new THREE.SphereGeometry(1, 20, 16, 0, Math.PI), red, [0, 0.72, 0], [0, 0, 0], 0.46);
      b.add(new THREE.SphereGeometry(1, 20, 16, Math.PI, Math.PI), blue, [0, 0.72, 0], [0, 0, 0], 0.46);
      b.add(torusGeo(0.47, 0.035), 0xffd23f, [0, 0.72, 0], [0, 0, 0]);
      for (let i = 0; i < 6; i++) {
        const ang = (i / 6) * Math.PI * 2;
        b.add(coneGeo(0.09, 0.28, 6), i % 2 ? red : blue, [Math.sin(ang) * 0.46, 0.72, Math.cos(ang) * 0.46], [Math.PI / 2, ang, 0], 1, 'YXZ');
        b.add(sphereGeo(1, 6, 5), 0xffd23f, [Math.sin(ang) * 0.68, 0.72, Math.cos(ang) * 0.68], [0, 0, 0], 0.045);
      }
      // jester hat
      for (const s of [-1, 1]) { b.add(coneGeo(0.13, 0.42, 10), s < 0 ? red : blue, [s * 0.2, 1.22, -0.05], [0, 0, s * 0.7]); b.add(sphereGeo(1, 8, 6), 0xffd23f, [s * 0.4, 1.36, -0.05], [0, 0, 0], 0.06); }
      b.add(cylGeo(0.22, 0.3, 0.2, 14), ink, [0, 0.14, 0]);
      break;
    }
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
    if (!geo) { geo = shared(bakeBody(kind)); bodyGeos.set(kind, geo); }
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
      drone: { y: 0.03, z: 0.44, size: 0.15, n: 1, sep: 0 },
      tank: { y: 1.09, z: 0.49, size: 0.075, n: 2, sep: 0.18, glow: 0xffd23f },
      puller: { y: 1.02, z: 0.2, size: 0.085, n: 2, sep: 0.11 },
      pusher: { y: 1.02, z: 0.2, size: 0.085, n: 2, sep: 0.11 },
      bomber: { y: 0.66, z: 0.44, size: 0.13, n: 2, sep: 0.18 },
      shield: { y: 1.24, z: 0.29, size: 0.06, n: 2, sep: 0.14, glow: 0x30e0ff },
      swarm: { y: 0.3, z: 0.37, size: 0.06, n: 2, sep: 0.07 },
      phaser: { y: 0.86, z: 0.4, size: 0.13, n: 2, sep: 0.16, glow: 0xffffff },
      chaos: { y: 0.75, z: 0.45, size: 0.17, n: 1, sep: 0 },
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
      const bladeM = basic(0x223344);
      const rotors = new THREE.Group();
      for (const sx of [-1, 1]) {
        const r = new THREE.Group(); r.position.set(sx * 0.72, 0.25, -0.02);
        for (let i = 0; i < 3; i++) { const bl = new THREE.Mesh(rboxGeo(0.42, 0.02, 0.07, 0.01), bladeM); bl.rotation.y = (i / 3) * Math.PI; r.add(bl); }
        rotors.add(r);
      }
      this.pivot.add(rotors); this.extra.prop = rotors;
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
    if (this.extra.prop) for (const r of this.extra.prop.children) r.rotation.y += dt * 32;
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
  dispose() { disposeTree(this.root); this.root.removeFromParent(); }
}
