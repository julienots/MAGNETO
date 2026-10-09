import * as THREE from 'three';
import type { BossDef } from '../../data/bosses';
import { toonRamp, addOutline, sphereGeo, capsuleGeo, rboxGeo, cylGeo, torusGeo, coneGeo, makeEye, blobShadow, shade, basic } from '../toon';
import { clamp, damp } from '../../core/math';

export type BossPose = 'idle' | 'raise' | 'slam' | 'vacuum' | 'shoot' | 'roar' | 'stagger' | 'dead' | 'charge';

/** Giant, expressive, procedurally built boss with a shared skeleton (torso/head/arms/core). */
export class BossRig {
  root = new THREE.Group();
  pivot = new THREE.Group();
  torso = new THREE.Group();
  head = new THREE.Group();
  armL = new THREE.Group();
  armR = new THREE.Group();
  handL = new THREE.Group();
  handR = new THREE.Group();
  core!: THREE.Mesh;
  coreMat = new THREE.MeshBasicMaterial({ color: 0xff3b3b });
  aura: THREE.Mesh;
  eyes: THREE.Group[] = [];
  heads: THREE.Group[] = [];
  armor: THREE.Mesh[] = [];
  mats: THREE.MeshToonMaterial[] = [];
  jaw?: THREE.Object3D;
  moons: THREE.Object3D[] = [];
  pose: BossPose = 'idle';
  poseT = 0;
  polarity = 1;
  flash = 0;
  rage = 0;
  private t = 0;
  private squash = 0;
  private squashV = 0;

  constructor(public def: BossDef) {
    this.root.add(this.pivot);
    this.pivot.add(this.torso);
    const shadow = blobShadow(2.6); this.root.add(shadow);
    const auraMat = new THREE.MeshBasicMaterial({ color: 0xff3b3b, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false });
    this.aura = new THREE.Mesh(torusGeo(3.2, 0.08), auraMat);
    this.aura.rotation.x = Math.PI / 2; this.aura.position.y = 0.15;
    this.root.add(this.aura);
    this.build();
  }

  private mat(c: number, emissive = 0) {
    const m = new THREE.MeshToonMaterial({ color: c, gradientMap: toonRamp(), emissive });
    this.mats.push(m); return m;
  }
  private m(geo: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D, pos: [number, number, number], scale: number | [number, number, number] = 1, ol = 0.06) {
    const me = new THREE.Mesh(geo, mat);
    me.position.set(...pos);
    if (typeof scale === 'number') me.scale.setScalar(scale); else me.scale.set(...scale);
    if (ol) addOutline(me, ol / (typeof scale === 'number' ? scale : Math.max(...scale)));
    parent.add(me); return me;
  }

  private build() {
    const d = this.def; const C = this.mat(d.color); const A = this.mat(d.accent); const DK = this.mat(shade(d.color, -0.4));
    const LT = this.mat(shade(d.color, 0.3));
    this.core = new THREE.Mesh(sphereGeo(1, 20, 14), this.coreMat);
    const armSetup = (shoulderX: number, shoulderY: number, handSize: number, handKind: 'magnet' | 'fist' | 'claw' | 'float') => {
      for (const [arm, hand, x] of [[this.armL, this.handL, -1], [this.armR, this.handR, 1]] as const) {
        arm.position.set(x * shoulderX, shoulderY, 0);
        this.torso.add(arm);
        if (handKind !== 'float') {
          this.m(sphereGeo(), A, arm, [0, 0, 0], 0.55);
          this.m(capsuleGeo(0.32, 1.2), DK, arm, [x * 0.35, -0.9, 0.2], 1).rotation.z = x * 0.3;
        }
        hand.position.set(x * 0.6, -1.9, 0.5);
        arm.add(hand);
        if (handKind === 'magnet') {
          this.m(torusGeo(0.55 * handSize, 0.26 * handSize, Math.PI), this.mat(0xff3b3b), hand, [0, 0, 0], 1).rotation.z = Math.PI;
          this.m(rboxGeo(0.5 * handSize, 0.4 * handSize, 0.55 * handSize, 0.08), this.mat(0xeeeeee), hand, [0.55 * handSize, -0.1, 0]);
          this.m(rboxGeo(0.5 * handSize, 0.4 * handSize, 0.55 * handSize, 0.08), this.mat(0xeeeeee), hand, [-0.55 * handSize, -0.1, 0]);
        } else if (handKind === 'fist') {
          this.m(rboxGeo(1.1 * handSize, 0.9 * handSize, 1.0 * handSize, 0.3), C, hand, [0, 0, 0]);
          this.m(rboxGeo(1.12 * handSize, 0.25 * handSize, 1.02 * handSize, 0.1), A, hand, [0, 0.25 * handSize, 0], 1, 0.03);
        } else if (handKind === 'claw') {
          this.m(sphereGeo(), C, hand, [0, 0, 0], 0.5 * handSize);
          for (const k of [-1, 0, 1]) this.m(coneGeo(0.14, 0.7, 8), A, hand, [k * 0.25, -0.2, 0.4], 1, 0.03).rotation.x = Math.PI / 2 + 0.4;
        } else {
          this.m(rboxGeo(0.9, 0.3, 1.1, 0.12), this.mat(0xf2f2f2), hand, [0, 0, 0]);
          for (const k of [-1.5, -0.5, 0.5, 1.5]) this.m(capsuleGeo(0.08, 0.4), this.mat(0xf2f2f2), hand, [k * 0.2, 0, 0.7], 1, 0.03).rotation.x = Math.PI / 2;
        }
      }
    };
    const addEyes = (parent: THREE.Object3D, n: number, size: number, y: number, z: number, sep: number, glow?: number) => {
      for (let i = 0; i < n; i++) {
        const e = makeEye(size, 0x14121c, glow);
        e.position.set(n === 1 ? 0 : (i - (n - 1) / 2) * sep, y, z);
        parent.add(e); this.eyes.push(e);
      }
    };

    switch (d.shape) {
      case 'robot': {
        this.m(rboxGeo(3.4, 2.6, 2.4, 0.6), C, this.torso, [0, 2.4, 0]);
        this.m(rboxGeo(2.6, 0.7, 2.0, 0.25), DK, this.torso, [0, 0.8, 0]);
        this.m(cylGeo(1.3, 1.6, 0.9, 20), A, this.torso, [0, 0.3, 0]);
        this.core.scale.setScalar(0.55); this.core.position.set(0, 2.4, 1.25); this.torso.add(this.core);
        this.m(torusGeo(0.62, 0.12), A, this.torso, [0, 2.4, 1.2], 1, 0.03);
        for (const x of [-1, 1]) this.armor.push(this.m(rboxGeo(1.1, 0.5, 1.4, 0.2), LT, this.torso, [x * 1.85, 3.7, 0]));
        this.armor.push(this.m(rboxGeo(2.2, 0.35, 0.3, 0.1), A, this.torso, [0, 1.55, 1.2], 1, 0.03));
        this.head.position.set(0, 4.3, 0.1); this.torso.add(this.head);
        this.m(rboxGeo(2.0, 1.3, 1.6, 0.45), C, this.head, [0, 0, 0]);
        this.m(rboxGeo(1.7, 0.5, 0.3, 0.15), basic(0x0d0f1a), this.head, [0, 0.05, 0.75], 1, 0.03);
        addEyes(this.head, 2, 0.24, 0.05, 0.9, 0.7, d.eye);
        this.m(cylGeo(0.06, 0.06, 0.8, 8), basic(0x222222), this.head, [0.6, 0.9, 0], 1, 0);
        this.m(sphereGeo(), this.mat(0xff3b3b, 0x661111), this.head, [0.6, 1.35, 0], 0.18);
        this.jaw = this.m(rboxGeo(1.4, 0.35, 1.0, 0.12), DK, this.head, [0, -0.75, 0.25]);
        armSetup(2.2, 3.3, 1.5, 'magnet');
        break;
      }
      case 'hydra': {
        this.m(sphereGeo(), C, this.torso, [0, 1.2, 0], [2.2, 1.3, 1.8]);
        this.m(cylGeo(2.0, 2.4, 0.5, 24), A, this.torso, [0, 0.25, 0]);
        this.core.scale.setScalar(0.5); this.core.position.set(0, 1.4, 1.75); this.torso.add(this.core);
        for (let i = 0; i < 3; i++) {
          const neck = new THREE.Group(); const x = (i - 1) * 1.5;
          neck.position.set(x, 2.0, 0); neck.rotation.z = -(i - 1) * 0.35;
          this.torso.add(neck);
          for (let k = 0; k < 4; k++) this.m(sphereGeo(), k % 2 ? A : C, neck, [0, 0.45 + k * 0.5, 0], 0.45 - k * 0.04, 0.04);
          const h = new THREE.Group(); h.position.set(0, 2.6, 0.2); neck.add(h);
          this.m(rboxGeo(1.3, 0.9, 1.5, 0.35), C, h, [0, 0, 0]);
          this.m(coneGeo(0.15, 0.5, 6), this.mat(0x31f5ff, 0x113344), h, [0.4, 0.6, -0.2], 1, 0.03);
          this.m(coneGeo(0.15, 0.5, 6), this.mat(0x31f5ff, 0x113344), h, [-0.4, 0.6, -0.2], 1, 0.03);
          addEyes(h, 2, 0.17, 0.15, 0.72, 0.5, i === 1 ? undefined : d.eye);
          const jaw = this.m(rboxGeo(1.1, 0.25, 1.2, 0.1), DK, h, [0, -0.5, 0.15], 1, 0.04);
          if (i === 1) this.jaw = jaw;
          this.heads.push(h);
          this.armor.push(this.m(rboxGeo(1.0, 0.3, 0.6, 0.1), LT, h, [0, 0.5, -0.4], 1, 0.03));
        }
        this.head = this.heads[1];
        armSetup(2.2, 1.0, 1.2, 'claw');
        break;
      }
      case 'satellite': {
        this.m(sphereGeo(), C, this.torso, [0, 2.2, 0], 1.6);
        this.m(torusGeo(1.65, 0.18), A, this.torso, [0, 2.2, 0], 1, 0.04).rotation.x = Math.PI / 2;
        this.m(cylGeo(0.6, 1.2, 1.2, 16), DK, this.torso, [0, 0.6, 0]);
        for (const x of [-1, 1]) {
          const w = new THREE.Group(); w.position.set(x * 2.4, 2.4, 0); this.torso.add(w);
          this.m(rboxGeo(2.4, 0.12, 1.5, 0.05), this.mat(0x2a3f8f, 0x0a1440), w, [x * 0.7, 0, 0], 1, 0.03);
          for (let k = 0; k < 3; k++) this.armor.push(this.m(rboxGeo(0.7, 0.14, 1.4, 0.03), this.mat(0x3d8bff), w, [x * (0.05 + k * 0.75), 0.05, 0], 1, 0.02));
        }
        this.head.position.set(0, 3.9, 0); this.torso.add(this.head);
        const dish = this.m(new THREE.SphereGeometry(1.2, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2.5), this.mat(0xeeeeee), this.head, [0, 0, 0], 1, 0.03);
        dish.rotation.x = -1.1;
        addEyes(this.head, 1, 0.5, 0.3, 0.6, 0);
        this.core.scale.setScalar(0.45); this.core.position.set(0, 2.2, 1.55); this.torso.add(this.core);
        armSetup(1.6, 1.6, 1.0, 'claw');
        break;
      }
      case 'golem': {
        this.m(sphereGeo(1, 10, 8), C, this.torso, [0, 2.3, 0], [2.0, 1.8, 1.6], 0.07);
        for (let i = 0; i < 7; i++) { const a = i * 1.7; this.armor.push(this.m(sphereGeo(1, 6, 5), DK, this.torso, [Math.cos(a) * 1.6, 2.3 + Math.sin(i * 2.1) * 1.2, Math.sin(a) * 1.2], 0.6, 0.05)); }
        for (let i = 0; i < 5; i++) this.m(cylGeo(0.06, 0.06, 1.4, 6), basic(0xff7a1f), this.torso, [(i - 2) * 0.5, 2.3, 1.55], 1, 0).rotation.z = i * 0.6;
        this.m(cylGeo(1.4, 1.8, 0.8, 10), DK, this.torso, [0, 0.4, 0]);
        this.core.scale.setScalar(0.6); this.core.position.set(0, 2.4, 1.45); this.torso.add(this.core);
        this.head.position.set(0, 4.3, 0.2); this.torso.add(this.head);
        this.m(sphereGeo(1, 8, 6), C, this.head, [0, 0, 0], [1.1, 0.9, 1.0], 0.06);
        addEyes(this.head, 2, 0.22, 0.1, 0.85, 0.6, d.eye);
        this.jaw = this.m(rboxGeo(1.3, 0.35, 0.8, 0.12), DK, this.head, [0, -0.65, 0.3]);
        armSetup(2.4, 3.2, 1.6, 'fist');
        break;
      }
      case 'forge': {
        this.m(rboxGeo(4.2, 1.6, 2.6, 0.35), C, this.torso, [0, 2.6, 0]);
        this.m(rboxGeo(2.6, 1.6, 2.0, 0.3), DK, this.torso, [0, 1.0, 0]);
        this.m(rboxGeo(3.2, 0.5, 2.4, 0.2), A, this.torso, [0, 0.25, 0]);
        for (const x of [-1.4, 1.4]) { this.m(cylGeo(0.35, 0.45, 1.8, 12), A, this.torso, [x, 4.0, -0.6]); this.armor.push(this.m(cylGeo(0.5, 0.5, 0.25, 12), LT, this.torso, [x, 4.95, -0.6], 1, 0.03)); }
        this.head.position.set(0, 2.6, 1.3); this.torso.add(this.head);
        this.m(rboxGeo(1.8, 0.9, 0.3, 0.15), basic(0x0d1a2a), this.head, [0, -0.1, 0], 1, 0.03);
        addEyes(this.head, 2, 0.22, 0.25, 0.18, 0.75, d.eye);
        this.core.scale.setScalar(0.45); this.core.position.set(0, 1.0, 1.05); this.torso.add(this.core);
        for (let i = 0; i < 4; i++) this.armor.push(this.m(coneGeo(0.25, 0.9, 6), this.mat(0xcff4ff), this.torso, [-1.6 + i * 1.05, 3.6, 0.9], 1, 0.03));
        armSetup(2.4, 2.8, 1.4, 'fist');
        break;
      }
      case 'maw': {
        this.m(sphereGeo(1, 24, 18), C, this.torso, [0, 2.4, 0], 2.1);
        const mouth = new THREE.Group(); mouth.position.set(0, 1.9, 1.5); this.torso.add(mouth);
        this.m(sphereGeo(), basic(0x12051f), mouth, [0, 0, 0], [1.4, 0.8, 0.6], 0);
        for (let i = 0; i < 7; i++) this.m(coneGeo(0.14, 0.4, 5), this.mat(0xffffff), mouth, [(i - 3) * 0.36, 0.62, 0.3], 1, 0.02).rotation.x = Math.PI;
        for (let i = 0; i < 7; i++) this.m(coneGeo(0.14, 0.4, 5), this.mat(0xffffff), mouth, [(i - 3) * 0.36, -0.62, 0.3], 1, 0.02);
        this.jaw = mouth;
        this.head = this.torso;
        addEyes(this.torso, 3, 0.32, 3.4, 1.75, 0.85);
        this.core.scale.setScalar(0.4); this.core.position.set(0, 1.9, 1.7); this.torso.add(this.core);
        for (let i = 0; i < 3; i++) {
          const g = new THREE.Group(); this.torso.add(g); g.position.y = 2.4;
          const moon = this.m(sphereGeo(1, 12, 10), i === 1 ? A : LT, g, [3.0 + i * 0.4, 0, 0], 0.4 + i * 0.1, 0.04);
          this.armor.push(moon);
          g.rotation.y = i * 2.1; g.rotation.z = 0.3 - i * 0.2;
          this.moons.push(g);
        }
        armSetup(2.4, 2.4, 1.0, 'float');
        this.handL.visible = this.handR.visible = false;
        break;
      }
      case 'king': {
        this.m(coneGeo(1.8, 4.0, 20), C, this.torso, [0, 2.0, 0]);
        this.m(torusGeo(1.0, 0.18), this.mat(0xffffff), this.torso, [0, 3.6, 0], 1, 0.04).rotation.x = Math.PI / 2;
        this.head.position.set(0, 4.5, 0); this.torso.add(this.head);
        this.m(sphereGeo(), this.mat(0xf4f4f4), this.head, [0, 0, 0], [0.9, 1.1, 0.85]);
        addEyes(this.head, 2, 0.2, 0.1, 0.72, 0.42, d.eye);
        this.jaw = this.m(torusGeo(0.25, 0.05, Math.PI), basic(0x111111), this.head, [0, -0.45, 0.75], 1, 0);
        for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2; this.armor.push(this.m(coneGeo(0.14, 0.7, 5), this.mat(0xffd23f, 0x332200), this.head, [Math.sin(a) * 0.65, 1.15, Math.cos(a) * 0.55], 1, 0.03)); }
        this.core.scale.setScalar(0.5); this.core.position.set(0, 2.3, 1.05); this.torso.add(this.core);
        armSetup(2.3, 2.8, 1.2, 'float');
        break;
      }
    }
    // core glow halo
    const halo = new THREE.Mesh(sphereGeo(1, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false }));
    halo.scale.setScalar(1.6); this.core.add(halo);
  }

  setPose(p: BossPose) { if (this.pose !== p) { this.pose = p; this.poseT = 0; } }
  kick(a: number) { this.squashV += a * 5; }
  /** knock off one armor piece (visual damage per phase) */
  breakArmor(): THREE.Vector3 | null {
    const a = this.armor.find((x) => x.visible);
    if (!a) return null;
    a.visible = false;
    const v = new THREE.Vector3(); a.getWorldPosition(v); return v;
  }
  handWorld(left: boolean, out = new THREE.Vector3()) { return (left ? this.handL : this.handR).getWorldPosition(out); }

  update(dt: number) {
    this.t += dt; this.poseT += dt;
    const t = this.t, p = this.poseT;
    this.squashV += (-this.squash * 120 - this.squashV * 10) * dt;
    this.squash += this.squashV * dt;
    const s = 1 + clamp(this.squash, -0.25, 0.25);
    this.pivot.scale.set(1 / Math.sqrt(s), s, 1 / Math.sqrt(s));
    let armLx = Math.sin(t * 1.5) * 0.1, armRx = -armLx, armLz = 0.15, armRz = -0.15, headX = Math.sin(t * 1.1) * 0.05, headY = Math.sin(t * 0.7) * 0.15, bodyY = Math.sin(t * 2) * 0.08, jaw = 0, spin = 0;
    switch (this.pose) {
      case 'raise': armLx = armRx = -2.6 * clamp(p / 0.5, 0, 1); bodyY += 0.3 * clamp(p / 0.5, 0, 1); jaw = 0.3; break;
      case 'slam': { const k = clamp(p / 0.12, 0, 1); armLx = armRx = -2.6 + k * 2.4; bodyY = -0.2 * k; jaw = 0.4; break; }
      case 'vacuum': spin = t * 2; armLz = 1.4; armRz = -1.4; jaw = 0.6 + Math.sin(t * 20) * 0.1; break;
      case 'shoot': armRx = -1.4; armLx = -0.3; jaw = 0.25 + Math.sin(t * 25) * 0.1; break;
      case 'charge': armLz = 1.0 + Math.sin(t * 30) * 0.05; armRz = -armLz; bodyY += Math.sin(t * 40) * 0.05; jaw = 0.5; break;
      case 'roar': headX = -0.35; jaw = 0.8; armLz = 1.2; armRz = -1.2; bodyY += Math.sin(t * 50) * 0.04; break;
      case 'stagger': headX = 0.3 + Math.sin(p * 20) * 0.1; armLz = 0.6; armRz = -0.6; bodyY = -0.3; jaw = 0.5; break;
      case 'dead': { const k = clamp(p / 1.2, 0, 1); headX = 0.6 * k; bodyY = -1.2 * k; armLz = 0.9 * k; armRz = -0.9 * k; jaw = 0.6; this.pivot.rotation.z = Math.sin(p * 30) * 0.05 * (1 - k); break; }
      default: break;
    }
    this.torso.position.y = damp(this.torso.position.y, bodyY, 10, dt);
    this.armL.rotation.x = damp(this.armL.rotation.x, armLx, this.pose === 'slam' ? 40 : 8, dt);
    this.armR.rotation.x = damp(this.armR.rotation.x, armRx, this.pose === 'slam' ? 40 : 8, dt);
    this.armL.rotation.z = damp(this.armL.rotation.z, armLz, 8, dt);
    this.armR.rotation.z = damp(this.armR.rotation.z, armRz, 8, dt);
    if (this.def.shape === 'king' || this.def.shape === 'maw') { this.handL.position.y = -1.9 + Math.sin(t * 2) * 0.2; this.handR.position.y = -1.9 + Math.cos(t * 2) * 0.2; }
    if (this.head !== this.torso) { this.head.rotation.x = damp(this.head.rotation.x, headX, 8, dt); this.head.rotation.y = damp(this.head.rotation.y, headY, 4, dt); }
    for (const [i, h] of this.heads.entries()) h.rotation.x = Math.sin(t * 2 + i) * 0.12 + (this.pose === 'roar' ? -0.4 : 0);
    if (this.jaw) {
      if (this.def.shape === 'maw') this.jaw.scale.y = damp(this.jaw.scale.y, 0.6 + jaw, 10, dt);
      else this.jaw.position.y = damp(this.jaw.position.y, (this.def.shape === 'king' ? -0.45 : -0.75) - jaw * 0.35, 12, dt);
    }
    this.torso.rotation.y = this.def.shape === 'satellite' || this.def.shape === 'maw' ? damp(this.torso.rotation.y, spin ? Math.sin(spin) * 0.4 : 0, 4, dt) : 0;
    for (const [i, mo] of this.moons.entries()) mo.rotation.y += dt * (0.8 + i * 0.3) * (this.pose === 'vacuum' ? 4 : 1);
    // eyes blink + rage
    const bl = (t % 4) < 0.12 ? 0.15 : 1;
    for (const e of this.eyes) e.scale.y = damp(e.scale.y, bl * (this.pose === 'roar' ? 1.3 : 1), 25, dt);
    // core + aura polarity color
    const col = this.polarity > 0 ? 0xff3b3b : 0x2f7bff;
    this.coreMat.color.setHex(col);
    this.core.scale.multiplyScalar(1); // keep
    (this.core.children[0] as THREE.Mesh).scale.setScalar(1.5 + Math.sin(t * 8) * 0.15 + this.rage * 0.4);
    const am = this.aura.material as THREE.MeshBasicMaterial;
    am.color.setHex(col);
    am.opacity = 0.25 + Math.sin(t * 6) * 0.1 + (this.pose === 'vacuum' ? 0.4 : 0);
    this.aura.scale.setScalar(this.pose === 'vacuum' ? 1 + ((t * 2) % 1) * -0.5 + 0.5 : 1 + Math.sin(t * 3) * 0.05);
    // flash
    this.flash = Math.max(0, this.flash - dt * 5);
    for (const m of this.mats) m.emissive.setRGB(this.flash, this.flash * 0.9, this.flash * 0.9);
  }
  dispose() { this.root.removeFromParent(); for (const m of this.mats) m.dispose(); }
}
