import * as THREE from 'three';
import type { HeroDef, Accessory, HairStyle } from '../../data/heroes';
import { themeById, type SkinTheme } from '../../data/skins';
import { Baker, toonRamp, outlineMat, sphereGeo, capsuleGeo, rboxGeo, cylGeo, torusGeo, coneGeo, blobShadow, shade, basic, disposeTree, shared } from '../toon';
import { Face, type Expression } from '../face';
import { clamp, damp, lerp } from '../../core/math';

export type HeroAnim = 'idle' | 'run' | 'victory' | 'defeat' | 'spawn' | 'select' | 'ability' | 'hurt';
export type { Expression };

/* ---------------- cached special geometries ---------------- */
const geoCache = new Map<string, THREE.BufferGeometry>();
function cached(key: string, make: () => THREE.BufferGeometry) {
  let g = geoCache.get(key);
  if (!g) { g = shared(make()); geoCache.set(key, g); }
  return g;
}
/** Smooth torso silhouette: hips → waist → chest → shoulders → neck. */
function torsoGeo(kind: string) {
  return cached('torso:' + kind, () => {
    const prof: Record<string, [number, number][]> = {
      compact: [[0.001, 0], [0.17, 0.0], [0.205, 0.05], [0.215, 0.12], [0.205, 0.2], [0.215, 0.28], [0.235, 0.35], [0.215, 0.41], [0.13, 0.455], [0.07, 0.47], [0.001, 0.47]],
      slim: [[0.001, 0], [0.15, 0.0], [0.175, 0.05], [0.17, 0.13], [0.155, 0.2], [0.18, 0.29], [0.205, 0.36], [0.19, 0.42], [0.11, 0.46], [0.06, 0.47], [0.001, 0.47]],
      heavy: [[0.001, 0], [0.2, 0.0], [0.25, 0.06], [0.27, 0.15], [0.26, 0.23], [0.27, 0.31], [0.28, 0.37], [0.25, 0.425], [0.14, 0.46], [0.07, 0.47], [0.001, 0.47]],
      tall: [[0.001, 0], [0.155, 0.0], [0.18, 0.06], [0.17, 0.15], [0.16, 0.24], [0.185, 0.34], [0.205, 0.41], [0.19, 0.47], [0.11, 0.51], [0.06, 0.52], [0.001, 0.52]],
      cloak: [[0.001, 0], [0.16, 0.0], [0.185, 0.06], [0.175, 0.14], [0.17, 0.22], [0.19, 0.31], [0.21, 0.37], [0.2, 0.42], [0.12, 0.46], [0.06, 0.47], [0.001, 0.47]],
    };
    const pts = prof[kind].map(([r, y]) => new THREE.Vector2(r, y));
    const g = new THREE.LatheGeometry(pts, 28);
    g.scale(1, 1, 0.8);
    g.computeVertexNormals();
    return g;
  });
}
function robeGeo() {
  return cached('robe', () => {
    const pts = [[0.001, 0.02], [0.36, 0.0], [0.34, 0.08], [0.29, 0.25], [0.23, 0.42], [0.19, 0.52], [0.001, 0.53]].map(([r, y]) => new THREE.Vector2(r, y));
    const g = new THREE.LatheGeometry(pts, 28); g.scale(1, 1, 0.85); g.computeVertexNormals(); return g;
  });
}
function bootGeo() {
  return cached('boot', () => {
    const pts = [[0.001, 0], [0.085, 0.0], [0.095, 0.02], [0.09, 0.06], [0.075, 0.1], [0.07, 0.13], [0.001, 0.135]].map(([r, y]) => new THREE.Vector2(r, y));
    const g = new THREE.LatheGeometry(pts, 18); g.scale(1, 1, 1.55); g.translate(0, 0, 0.035); g.computeVertexNormals(); return g;
  });
}
/** Little magnet "U" emblem, extruded with a bevel. */
function emblemGeo() {
  return cached('emblem', () => {
    const s = new THREE.Shape();
    s.moveTo(-0.05, 0.05); s.lineTo(-0.05, -0.005); s.absarc(0, -0.005, 0.05, Math.PI, 0, false); s.lineTo(0.05, 0.05); s.lineTo(0.025, 0.05); s.lineTo(0.025, -0.005);
    s.absarc(0, -0.005, 0.025, 0, Math.PI, true); s.lineTo(-0.025, 0.05); s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.015, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 2, curveSegments: 10 });
    g.center(); g.computeVertexNormals(); return g;
  });
}
function boltGeo() {
  return cached('boltShape', () => {
    const s = new THREE.Shape();
    s.moveTo(0.01, 0.07); s.lineTo(-0.04, -0.005); s.lineTo(-0.002, -0.005); s.lineTo(-0.015, -0.07); s.lineTo(0.04, 0.012); s.lineTo(0.004, 0.012); s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.012, bevelEnabled: true, bevelThickness: 0.005, bevelSize: 0.005, bevelSegments: 2 });
    g.center(); g.computeVertexNormals(); return g;
  });
}
const halfSphere = () => cached('halfSphere', () => new THREE.SphereGeometry(1, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2));
const capGeo = (cut: number) => cached('cap' + cut, () => new THREE.SphereGeometry(1, 28, 18, 0, Math.PI * 2, 0, cut));

interface Build { w: number; h: number; limb: number; head: number }
const BUILDS: Record<string, Build> = {
  compact: { w: 1.0, h: 0.92, limb: 1.05, head: 1.08 },
  slim: { w: 0.9, h: 1.0, limb: 0.92, head: 1.0 },
  heavy: { w: 1.0, h: 1.0, limb: 1.3, head: 0.98 },
  tall: { w: 0.95, h: 1.08, limb: 0.95, head: 0.96 },
  cloak: { w: 1.0, h: 1.0, limb: 0.92, head: 1.0 },
};

interface Limb { root: THREE.Group; mid: THREE.Group; end: THREE.Group }

/**
 * Premium procedural cartoon hero with a real joint hierarchy
 * (hips · spine · neck · head · shoulder→elbow→hand · hip→knee→foot),
 * a hand-drawn expressive face, sculpted hair and outfits, secondary motion.
 */
export class HeroRig {
  root = new THREE.Group();
  /** squash & stretch / visibility pivot (kept for compatibility) */
  pivot = new THREE.Group();
  hips = new THREE.Group();
  spine = new THREE.Group();
  neck = new THREE.Group();
  head = new THREE.Group();
  armL!: Limb; armR!: Limb; legL!: Limb; legR!: Limb;
  face!: Face;
  glowL!: THREE.Mesh;
  glowR!: THREE.Mesh;
  ring?: THREE.Group;
  scarf?: THREE.Group;
  tail?: THREE.Group;
  orbs: THREE.Mesh[] = [];
  shadow: THREE.Mesh;
  mat: THREE.MeshToonMaterial;
  color: number;
  accent: number;
  theme: SkinTheme;
  private B: Build;
  private legLen = 0.5;
  private headR = 0.3;
  private base: number;

  // animation state
  anim: HeroAnim = 'idle';
  animT = 0;
  moveSpeed = 0;
  field = 0;
  polarity = 1;
  push = 0;
  expression: Expression = 'happy';
  private blinkT = 2;
  private blink = 0;
  private lookX = 0; private lookY = 0; private lookTX = 0; private lookTY = 0; private lookTimer = 0;
  private hurtT = 0;
  private time = Math.random() * 10;
  private phase = 0;
  private squash = 0;
  private squashV = 0;
  private dropY = 0;
  private exprHold = 0;
  private heldExpr: Expression = 'happy';
  private emBase = new THREE.Color();

  constructor(public def: HeroDef, skin: SkinTheme = 'default', withShadow = true) {
    const th = themeById(skin);
    this.theme = skin;
    this.color = th.color ?? def.color;
    this.accent = th.accent ?? def.accent;
    this.B = BUILDS[def.model.body] ?? BUILDS.compact;
    this.base = def.model.scale * 1.18;
    this.mat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonRamp(), emissive: th.emissive });
    this.emBase.setHex(th.emissive);
    if (th.translucent) { this.mat.transparent = true; this.mat.opacity = 0.85; }
    this.root.add(this.pivot);
    this.pivot.add(this.hips);
    this.pivot.scale.setScalar(this.base);
    this.shadow = blobShadow(0.55 * def.model.scale);
    if (withShadow) this.root.add(this.shadow);
    this.build(def, [...def.model.accessories, ...th.extra] as Accessory[], !!th.metal);
  }

  /* ======================================================== build */
  private mesh(parent: THREE.Object3D, bake: (b: Baker) => void, outline = 0.012) {
    const b = new Baker(); bake(b);
    const g = b.build();
    const m = new THREE.Mesh(g, this.mat);
    if (outline > 0) { const o = new THREE.Mesh(g, outlineMat(outline)); o.raycast = () => {}; m.add(o); }
    parent.add(m);
    return m;
  }

  private build(def: HeroDef, acc: Accessory[], metal: boolean) {
    const M = def.model, B = this.B;
    const suit = this.color, trim = this.accent;
    const dark = shade(trim, -0.55) === 0 ? 0x22223a : mix3(shade(trim, -0.6), 0x22223a, 0.5);
    const skin = def.skinTone;
    const metalC = 0xc8d2de;
    const hairC = M.hairColor;
    const L = B.limb;
    const cloak = M.body === 'cloak';
    const heavy = M.body === 'heavy';

    // ---- dimensions
    const thigh = 0.21 * B.h, shin = 0.19 * B.h, footH = 0.1;
    this.legLen = thigh + shin + footH;
    const torsoH = (M.body === 'tall' ? 0.52 : 0.47) * B.h;
    const hipW = (heavy ? 0.13 : 0.1) * B.w;
    const shoulderX = (heavy ? 0.29 : M.body === 'slim' ? 0.21 : 0.24) * B.w;
    const shoulderY = torsoH * 0.82;
    this.headR = 0.3 * B.head;
    const HR = this.headR;

    this.hips.position.y = this.legLen;
    this.hips.add(this.spine);

    // ---- pelvis / shorts or robe
    if (cloak) {
      this.mesh(this.hips, (b) => {
        const robe = shade(suit, -0.35);
        b.add(robeGeo(), robe, [0, -this.legLen + 0.02, 0], [0, 0, 0], [B.w, (this.legLen + 0.06) / 0.53, B.w]);
        b.add(torusGeo(0.355, 0.022), trim, [0, -this.legLen + 0.035, 0], [Math.PI / 2, 0, 0], [B.w, B.w * 0.85, 1]);
        // tattered hem points
        for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; b.add(coneGeo(0.05, 0.12, 4), robe, [Math.sin(a) * 0.33 * B.w, -this.legLen + 0.0, Math.cos(a) * 0.29 * B.w], [Math.PI, 0, 0]); }
        // front panel + sash
        b.add(rboxGeo(0.12, this.legLen * 0.9, 0.03, 0.01), suit, [0, -this.legLen * 0.5, 0.22], [-0.38, 0, 0]);
        b.add(torusGeo(0.19, 0.03), trim, [0, 0.02, 0], [Math.PI / 2, 0, 0], [1, 0.85, 1]);
      }, 0.014);
    } else {
      this.mesh(this.hips, (b) => {
        b.add(sphereGeo(1, 20, 14), dark, [0, 0.0, 0], [0, 0, 0], [0.19 * B.w * (heavy ? 1.3 : 1), 0.11, 0.15 * B.w * (heavy ? 1.25 : 1)]);
      });
    }

    // ---- chest (torso + outfit details, baked)
    const tk = M.body;
    const tw = heavy ? 1.3 : 1;
    this.mesh(this.spine, (b) => {
      b.add(torsoGeo(tk), suit, [0, -0.02, 0], [0, 0, 0], [tw, 1, tw]);
      // two-tone chest panel
      b.add(sphereGeo(1, 20, 14), trim, [0, torsoH * 0.58, 0.115 * tw], [0, 0, 0], [0.15 * tw, 0.11, 0.07]);
      if (def.id === 'volt') b.add(boltGeo(), 0xffe14d, [0, torsoH * 0.6, 0.185 * tw], [0, 0, 0], 1.5);
      else {
        b.add(emblemGeo(), 0xff3b3b, [-0.02, torsoH * 0.6, 0.18 * tw], [0, 0, 0], 1.3);
        b.add(emblemGeo(), 0x2f7bff, [0.022, torsoH * 0.6, 0.181 * tw], [0, 0, 0], [0.55, 1.3, 1.3]);
      }
      // belt + buckle
      b.add(torusGeo(0.18 * B.w * tw, 0.028), dark, [0, 0.04, 0], [Math.PI / 2, 0, 0], [1, 0.8, 1]);
      b.add(rboxGeo(0.09, 0.06, 0.03, 0.012), metalC, [0, 0.04, 0.15 * B.w * tw]);
      // collar
      b.add(torusGeo(0.1, 0.035), trim, [0, torsoH - 0.015, 0], [Math.PI / 2, 0, 0]);
      // shoulder pads
      for (const s of [-1, 1]) b.add(halfSphere(), trim, [s * shoulderX * 0.92, shoulderY + 0.015, 0], [0, 0, -s * 0.5], [0.085 * L, 0.07 * L, 0.085 * L]);
      // side stripes
      for (const s of [-1, 1]) b.add(capsuleGeo(0.012, torsoH * 0.55), trim, [s * 0.19 * B.w * tw, torsoH * 0.35, 0.05], [0, 0, s * 0.05]);
      // back accessories
      if (acc.includes('tank')) {
        b.add(capsuleGeo(0.09, 0.22), trim, [0, torsoH * 0.55, -0.24 * tw], [0, 0, 0]);
        b.add(capsuleGeo(0.06, 0.18), dark, [0.11, torsoH * 0.52, -0.21 * tw]);
        b.add(cylGeo(0.035, 0.035, 0.05, 10), metalC, [0, torsoH * 0.55 + 0.21, -0.24 * tw]);
      }
      if (acc.includes('backpack')) {
        b.add(rboxGeo(0.3, 0.3, 0.14, 0.05), dark, [0, torsoH * 0.55, -0.22 * tw]);
        b.add(torusGeo(0.08, 0.03), 0xff3b3b, [-0.07, torsoH * 0.6, -0.3 * tw], [0, 0, 0]);
        b.add(torusGeo(0.08, 0.03), 0x2f7bff, [0.07, torsoH * 0.6, -0.3 * tw], [0, 0, 0]);
        for (const s of [-1, 1]) b.add(cylGeo(0.03, 0.045, 0.12, 10), metalC, [s * 0.1, torsoH * 0.36, -0.24 * tw]);
      }
      if (acc.includes('coils')) for (let i = 0; i < 3; i++) b.add(torusGeo(0.06 - i * 0.008, 0.018), trim, [0, torsoH * 0.45 + i * 0.07, -0.19 * tw], [0, 0, 0]);
      if (acc.includes('fin')) b.add(coneGeo(0.08, 0.3, 4), trim, [0, torsoH * 0.6, -0.2 * tw], [-0.6, 0, 0], [0.3, 1, 1]);
      if (acc.includes('spikes')) for (const s of [-1, 1]) b.add(coneGeo(0.03, 0.1, 6), metalC, [s * shoulderX, shoulderY + 0.07, 0], [0, 0, -s * 0.4]);
      if (metal) for (const s of [-1, 1]) b.add(rboxGeo(0.12, 0.16, 0.05, 0.02), metalC, [s * 0.08, torsoH * 0.35, 0.165 * tw]);
      if (cloak) {
        // cape over the shoulders
        b.add(capGeo(1.2), trim, [0, torsoH * 0.92, -0.02], [0.15, 0, 0], [0.27 * B.w, 0.34, 0.24]);
      }
    }, 0.012);

    // ---- neck + head
    this.neck.position.y = torsoH - 0.01;
    this.spine.add(this.neck);
    this.mesh(this.neck, (b) => b.add(capsuleGeo(0.055, 0.04), skin, [0, 0.03, 0]), 0.008);
    this.head.position.y = HR * 0.92 + 0.02;
    this.neck.add(this.head);
    this.mesh(this.head, (b) => {
      b.add(sphereGeo(1, 32, 24), skin, [0, 0, 0], [0, 0, 0], [HR * 1.04, HR * 0.94, HR * 0.98]);
      // cheeks give a softer chibi jaw
      b.add(sphereGeo(1, 16, 12), skin, [0, -HR * 0.3, HR * 0.24], [0, 0, 0], [HR * 0.7, HR * 0.42, HR * 0.6]);
      // ears
      if (M.hair !== 'hood') for (const s of [-1, 1]) {
        b.add(sphereGeo(1, 14, 10), skin, [s * HR * 0.98, -HR * 0.02, -HR * 0.02], [0, 0, 0], [HR * 0.14, HR * 0.2, HR * 0.12]);
        b.add(sphereGeo(1, 10, 8), shade(skin, -0.2), [s * HR * 1.03, -HR * 0.02, 0], [0, 0, 0], [HR * 0.05, HR * 0.1, HR * 0.06]);
      }
      // nose
      b.add(sphereGeo(1, 12, 10), shade(skin, -0.06), [0, -HR * 0.16, HR * 0.93], [0, 0, 0], [HR * 0.08, HR * 0.06, HR * 0.06]);
      this.buildHair(b, M.hair, HR, hairC, trim);
      this.buildHeadAcc(b, acc, HR, trim, dark, metalC);
    }, 0.013);
    // face
    this.face = new Face({ eyeColor: M.eyeColor, eyes: M.eyes, skin, brow: shade(hairC === 0xf2f6ff ? 0x8a9ab8 : hairC, -0.35), lashes: def.id === 'orbit', blush: M.hair !== 'hood', shadowed: false }, HR);
    this.face.mesh.scale.set(1.04, 0.94, 0.98);
    this.head.add(this.face.mesh);
    if (acc.includes('halo')) {
      const h = new THREE.Mesh(torusGeo(HR * 0.75, 0.025), basic(0xfff3a0));
      h.rotation.x = Math.PI / 2; h.position.y = HR * 1.35; this.head.add(h);
    }

    // ---- arms
    const upper = 0.15 * L, fore = 0.14 * L;
    const sleeve = cloak ? trim : suit;
    const giant = M.gloves === 'giant';
    this.armL = this.limb(this.spine, [-shoulderX, shoulderY, 0]);
    this.armR = this.limb(this.spine, [shoulderX, shoulderY, 0]);
    for (const [arm, s] of [[this.armL, -1], [this.armR, 1]] as const) {
      this.mesh(arm.root, (b) => {
        b.add(sphereGeo(1, 16, 12), sleeve, [0, 0, 0], [0, 0, 0], 0.065 * L);
        b.add(capsuleGeo(0.055 * L, upper * 0.7), sleeve, [0, -upper / 2, 0]);
        b.add(torusGeo(0.058 * L, 0.014), trim, [0, -upper * 0.85, 0], [Math.PI / 2, 0, 0]);
      });
      arm.mid.position.y = -upper;
      this.mesh(arm.mid, (b) => {
        b.add(capsuleGeo(0.05 * L, fore * 0.75), giant || cloak ? sleeve : skin, [0, -fore / 2, 0]);
        if (heavy) b.add(sphereGeo(1, 12, 10), trim, [0, -0.005, 0.03], [0, 0, 0], 0.045 * L);
      });
      arm.end.position.y = -fore;
      this.buildHand(arm.end, M.gloves, s, L, trim, dark, skin);
    }

    // ---- legs
    for (const [leg, s] of [['legL', -1], ['legR', 1]] as const) {
      const lg = this.limb(this.hips, [s * hipW, -0.02, 0]);
      (this as any)[leg] = lg;
      if (!cloak) {
        this.mesh(lg.root, (b) => b.add(capsuleGeo(0.07 * L, thigh * 0.7), dark, [0, -thigh / 2, 0]));
        lg.mid.position.y = -thigh;
        this.mesh(lg.mid, (b) => {
          b.add(capsuleGeo(0.062 * L, shin * 0.7), dark, [0, -shin / 2, 0]);
          b.add(halfSphere(), trim, [0, -0.005, 0.035], [Math.PI / 2, 0, 0], [0.06 * L, 0.035, 0.05 * L]);
        });
        lg.end.position.y = -shin;
      } else {
        lg.mid.position.y = -thigh; lg.end.position.y = -shin;
      }
      // boot
      this.mesh(lg.end, (b) => {
        b.add(bootGeo(), heavy ? shade(dark, 0.1) : trim, [0, -footH, 0.0], [0, 0, 0], [1.05 * L * (heavy ? 1.15 : 1), 1, 1.05 * L]);
        b.add(rboxGeo(0.2 * L * (heavy ? 1.15 : 1), 0.035, 0.3 * L, 0.015), 0x1a1a26, [0, -footH + 0.012, 0.035]);
        b.add(torusGeo(0.07, 0.016), metalC, [0, -footH + 0.11, 0.01], [Math.PI / 2, 0, 0], [1.05, 1.5, 1]);
      });
    }

    // ---- scarf with flowing tail (secondary motion)
    if (acc.includes('scarf')) {
      this.mesh(this.neck, (b) => b.add(torusGeo(0.09, 0.04), trim, [0, 0.0, 0.0], [Math.PI / 2 + 0.15, 0, 0], [1.05, 1, 1]));
      this.scarf = new THREE.Group(); this.scarf.position.set(0.05, 0.0, -0.08); this.neck.add(this.scarf);
      this.mesh(this.scarf, (b) => {
        b.add(rboxGeo(0.08, 0.025, 0.2, 0.01), trim, [0, 0, -0.1], [0.2, 0, 0]);
        b.add(rboxGeo(0.07, 0.022, 0.16, 0.01), trim, [0.03, -0.02, -0.25], [0.35, 0.2, 0]);
      });
    }
    // ---- orbit ring
    if (acc.includes('ring')) {
      const g = new THREE.Group(); g.position.y = 0.2;
      const t = new THREE.Mesh(torusGeo(0.62, 0.018), basic(this.accent)); t.rotation.x = Math.PI / 2; g.add(t);
      for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; this.mesh(g, (b) => b.add(sphereGeo(1, 12, 10), i === 1 ? 0xff3b3b : this.accent, [Math.cos(a) * 0.62, 0, Math.sin(a) * 0.62], [0, 0, 0], 0.06)); }
      g.rotation.x = 0.35; this.hips.add(g); this.ring = g;
    }
  }

  private limb(parent: THREE.Object3D, pos: [number, number, number]): Limb {
    const root = new THREE.Group(), mid = new THREE.Group(), end = new THREE.Group();
    root.position.set(...pos); root.add(mid); mid.add(end); parent.add(root);
    return { root, mid, end };
  }

  private buildHand(hand: THREE.Group, kind: string, s: number, L: number, trim: number, dark: number, skin: number) {
    const glowMat = new THREE.MeshBasicMaterial({ color: 0xff3b3b, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    let glowR = 0.1;
    if (kind === 'giant' || kind === 'normal') {
      const k = kind === 'giant' ? 1.4 * L : 0.95 * L;
      glowR = 0.11 * k;
      this.mesh(hand, (b) => {
        // cuff
        b.add(cylGeo(0.07 * k, 0.085 * k, 0.07 * k, 16), dark, [0, 0, 0]);
        b.add(torusGeo(0.08 * k, 0.012 * k), trim, [0, -0.02 * k, 0], [Math.PI / 2, 0, 0]);
        // palm
        b.add(rboxGeo(0.15 * k, 0.12 * k, 0.1 * k, 0.04 * k), trim, [0, -0.09 * k, 0.005 * k]);
        // fingers (curled, chunky)
        for (let i = 0; i < 4; i++) {
          const fx = (-0.052 + i * 0.035) * k;
          b.add(capsuleGeo(0.019 * k, 0.04 * k), trim, [fx, -0.16 * k, 0.025 * k], [0.55, 0, 0]);
          b.add(capsuleGeo(0.017 * k, 0.03 * k), trim, [fx, -0.19 * k, 0.06 * k], [1.3, 0, 0]);
        }
        b.add(capsuleGeo(0.021 * k, 0.045 * k), trim, [-s * 0.08 * k, -0.1 * k, 0.04 * k], [0.6, 0, -s * 0.8]);
        if (kind === 'giant') {
          // magnetic poles on the knuckles
          b.add(rboxGeo(0.07 * k, 0.04 * k, 0.05 * k, 0.012 * k), 0xff3b3b, [-0.035 * k, -0.07 * k, 0.058 * k]);
          b.add(rboxGeo(0.07 * k, 0.04 * k, 0.05 * k, 0.012 * k), 0x2f7bff, [0.035 * k, -0.07 * k, 0.058 * k]);
          b.add(rboxGeo(0.16 * k, 0.025 * k, 0.11 * k, 0.01 * k), 0xc8d2de, [0, -0.035 * k, 0.005 * k]);
        }
      }, 0.01);
    } else if (kind === 'claws') {
      glowR = 0.09;
      this.mesh(hand, (b) => {
        b.add(sphereGeo(1, 14, 10), dark, [0, -0.05, 0], [0, 0, 0], [0.07, 0.06, 0.06]);
        for (const i of [-1, 0, 1]) b.add(coneGeo(0.018, 0.12, 8), trim, [i * 0.03, -0.12, 0.03], [Math.PI / 2 + 0.9, 0, 0]);
      });
    } else if (kind === 'orbs') {
      glowR = 0.12;
      this.mesh(hand, (b) => { b.add(sphereGeo(1, 14, 10), skin, [0, -0.04, 0], [0, 0, 0], 0.05); b.add(cylGeo(0.05, 0.055, 0.04, 12), trim, [0, 0.0, 0]); });
      const orb = new THREE.Mesh(sphereGeo(1, 16, 12), new THREE.MeshToonMaterial({ color: this.accent, gradientMap: toonRamp(), emissive: this.accent, emissiveIntensity: 0.35 }));
      orb.scale.setScalar(0.08); orb.position.set(0, -0.13, 0.08); hand.add(orb); this.orbs.push(orb);
    }
    const glow = new THREE.Mesh(sphereGeo(1, 14, 10), glowMat);
    glow.scale.setScalar(glowR * 1.7);
    glow.position.set(0, -0.1 * (kind === 'giant' ? 1.4 : 1), 0.03);
    hand.add(glow);
    if (s < 0) this.glowL = glow; else this.glowR = glow;
  }

  private buildHair(b: Baker, style: HairStyle, R: number, c: number, trim: number) {
    const hl = shade(c, 0.2), lo = shade(c, -0.15);
    const _q = new THREE.Quaternion(), _e = new THREE.Euler(), up = new THREE.Vector3(0, 1, 0);
    /** A clump of hair growing from the skull at (theta from top, phi around, 0 = front), bent toward `flow`. */
    const tuft = (theta: number, phi: number, flow: [number, number, number], bend: number, len: number, rad: number, col = c, kind: 'cone' | 'blob' = 'cone') => {
      const n = new THREE.Vector3(Math.sin(theta) * Math.sin(phi), Math.cos(theta), Math.sin(theta) * Math.cos(phi));
      const d = n.clone().multiplyScalar(1 - bend).add(new THREE.Vector3(...flow).normalize().multiplyScalar(bend)).normalize();
      _q.setFromUnitVectors(up, d); _e.setFromQuaternion(_q, 'XYZ');
      const base = n.clone().multiplyScalar(R * 0.9);
      const p = base.add(d.clone().multiplyScalar((len * R) / 2));
      if (kind === 'cone') b.add(coneGeo(rad * R, len * R, 8), col, [p.x, p.y, p.z], [_e.x, _e.y, _e.z]);
      else b.add(sphereGeo(1, 12, 10), col, [p.x, p.y, p.z], [_e.x, _e.y, _e.z], [rad * R, len * R * 0.5, rad * R]);
    };
    // skull cover: full back/top, hairline cut above the forehead
    const cap = (cut: number, sc = 1.07, tilt = -0.42) => b.add(capGeo(cut), c, [0, R * 0.02, -R * 0.04], [tilt, 0, 0], [R * sc * 1.04, R * sc * 0.97, R * sc]);
    const sideburns = () => { for (const s of [-1, 1]) tuft(1.25, s * 1.3, [0, -1, 0.1], 0.9, 0.38, 0.12, c); };
    switch (style) {
      case 'spiky': {
        cap(1.5, 1.08, -0.22);
        // crown: big anime spikes sweeping back & up
        for (let i = 0; i < 9; i++) { const ph = Math.PI + (i / 8 - 0.5) * 2.6; tuft(0.55 + (i % 2) * 0.35, ph, [0, 0.35, -1], 0.55, 0.85 + (i % 3) * 0.12, 0.3, i % 2 ? hl : c); }
        tuft(0.15, Math.PI, [0, 1, -0.6], 0.4, 0.9, 0.3, c);
        tuft(0.4, -0.5, [0.2, 1, -0.3], 0.35, 0.75, 0.28, hl);
        // bangs over the forehead
        for (let i = 0; i < 6; i++) { const ph = (i / 5 - 0.5) * 1.7; tuft(0.42 + Math.abs(ph) * 0.12, ph, [ph * 0.35, -1, 0.45], 0.8, 0.85 - Math.abs(ph) * 0.18, 0.25, i % 2 ? c : hl); }
        sideburns();
        break;
      }
      case 'flame': {
        cap(1.45);
        for (let i = 0; i < 7; i++) { const ph = (i / 6 - 0.5) * 2.2 + Math.PI * (i % 2 ? 0.08 : 0); tuft(0.3 + (i % 3) * 0.18, ph, [0, 1, -0.25], 0.65, 1.25 - Math.abs(i - 3) * 0.12, 0.27, i % 2 ? hl : c); }
        for (let i = 0; i < 5; i++) tuft(1.0, Math.PI + (i / 4 - 0.5) * 2, [0, 0.4, -1], 0.6, 0.8, 0.26, lo);
        for (let i = 0; i < 3; i++) tuft(0.7, (i - 1) * 0.45, [0, 0.6, 1], 0.5, 0.55, 0.2, hl);
        sideburns();
        break;
      }
      case 'buzz': {
        cap(1.45, 1.045, -0.3);
        // flat-top block
        b.add(rboxGeo(R * 1.55, R * 0.5, R * 1.6, R * 0.2), c, [0, R * 0.82, -R * 0.12], [-0.12, 0, 0]);
        b.add(rboxGeo(R * 1.45, R * 0.08, R * 1.5, R * 0.03), hl, [0, R * 1.08, -R * 0.12], [-0.12, 0, 0]);
        sideburns();
        break;
      }
      case 'ponytail': {
        cap(1.55, 1.08, -0.38);
        // side-swept fringe made of pointed locks
        for (let i = 0; i < 7; i++) { const ph = -1.0 + i * 0.3; tuft(0.55 + (i % 2) * 0.08, ph, [1, -0.8, 0.55], 0.72, 0.7 - Math.abs(ph - 0.3) * 0.12, 0.2, i % 2 ? hl : c); }
        for (const s of [-1, 1]) tuft(1.3, s * 1.25, [0, -1, 0.2], 0.9, 0.75, 0.14, c);
        b.add(sphereGeo(1, 12, 10), trim, [0, R * 0.5, -R * 1.0], [0, 0, 0], R * 0.17);
        break;
      }
      case 'mohawk': {
        cap(1.3, 1.02, -0.3);
        for (let i = 0; i < 7; i++) { const th = -0.15 + i * 0.36; tuft(Math.abs(th), th < 0 ? 0 : Math.PI, [0, 1, -0.4], 0.35, 1.0 - Math.abs(i - 2) * 0.08, 0.26, i % 2 ? hl : c); }
        break;
      }
      case 'slick': {
        cap(1.5, 1.07, -0.45);
        for (let i = 0; i < 7; i++) { const ph = (i / 6 - 0.5) * 1.8; tuft(0.45, ph, [0, 0.15, -1], 0.85, 1.0, 0.26, i % 2 ? hl : c); }
        for (let i = 0; i < 4; i++) tuft(1.2, Math.PI + (i / 3 - 0.5) * 1.6, [0, -0.2, -1], 0.7, 0.75, 0.24, lo);
        tuft(0.5, 0.25, [0.4, 0.5, 1], 0.5, 0.55, 0.18, hl); // loose front lock
        break;
      }
      case 'hood': {
        // phantom: long swept fringe hiding one eye + cloth mask over the lower face
        cap(1.55, 1.08, -0.3);
        for (let i = 0; i < 5; i++) tuft(0.55 + i * 0.05, -0.15 + i * 0.22, [0.9, -1, 0.5], 0.82, 1.05 - i * 0.08, 0.24, i % 2 ? hl : c);
        for (let i = 0; i < 6; i++) tuft(0.9, Math.PI + (i / 5 - 0.5) * 2.2, [0, -0.3, -1], 0.7, 0.85, 0.24, i % 2 ? lo : c);
        tuft(0.25, Math.PI * 0.9, [0.3, 1, -0.6], 0.45, 0.8, 0.25, hl);
        b.add(new THREE.SphereGeometry(1, 28, 12, Math.PI / 2 - 1.25, 2.5, 1.72, 0.95), trim, [0, 0, 0], [0, 0, 0], [R * 1.08, R * 0.98, R * 1.04]);
        b.add(torusGeo(R * 0.95, R * 0.1), trim, [0, -R * 0.62, 0], [Math.PI / 2, 0, 0], [1.05, 1, 1]);
        break;
      }
      case 'bob': case 'afro':
        b.add(sphereGeo(1, 24, 18), c, [0, R * 0.25, -R * 0.12], [0, 0, 0], R * (style === 'afro' ? 1.35 : 1.12));
        break;
    }
  }

  private buildHeadAcc(b: Baker, acc: Accessory[], R: number, trim: number, dark: number, metalC: number) {
    for (const a of new Set(acc)) {
      switch (a) {
        case 'antenna': // magnetic headset
          for (const s of [-1, 1]) b.add(cylGeo(R * 0.24, R * 0.24, R * 0.16, 16), dark, [s * R * 1.02, 0, 0], [0, 0, Math.PI / 2]);
          for (const s of [-1, 1]) b.add(cylGeo(R * 0.15, R * 0.15, R * 0.18, 16), trim, [s * R * 1.06, 0, 0], [0, 0, Math.PI / 2]);
          b.add(cylGeo(R * 0.025, R * 0.025, R * 0.5, 8), dark, [R * 1.08, R * 0.32, -R * 0.05], [0, 0, -0.25]);
          b.add(sphereGeo(1, 12, 10), 0xff3b3b, [R * 1.15, R * 0.6, -R * 0.05], [0, 0, 0], R * 0.1);
          break;
        case 'goggles':
          b.add(torusGeo(R * 1.0, R * 0.07), dark, [0, R * 0.38, 0], [Math.PI / 2 - 0.35, 0, 0]);
          for (const s of [-1, 1]) {
            b.add(cylGeo(R * 0.24, R * 0.26, R * 0.16, 18), metalC, [s * R * 0.32, R * 0.62, R * 0.72], [Math.PI / 2 - 0.75, 0, 0]);
            b.add(cylGeo(R * 0.18, R * 0.18, R * 0.04, 18), 0x7ff8ff, [s * R * 0.32, R * 0.67, R * 0.79], [Math.PI / 2 - 0.75, 0, 0]);
          }
          break;
        case 'horns':
          b.add(torusGeo(R * 1.0, R * 0.08), dark, [0, R * 0.42, 0], [Math.PI / 2 - 0.3, 0, 0]);
          for (const s of [-1, 1]) b.add(coneGeo(R * 0.15, R * 0.65, 10), 0xfff1d6, [s * R * 0.78, R * 0.75, R * 0.1], [0, 0, -s * 0.6]);
          break;
        case 'crown':
          for (let i = 0; i < 5; i++) { const an = (i / 5) * Math.PI * 2; b.add(coneGeo(R * 0.12, R * 0.35, 6), 0xffd23f, [Math.sin(an) * R * 0.55, R * 1.0, Math.cos(an) * R * 0.55], [0, 0, 0]); }
          b.add(torusGeo(R * 0.6, R * 0.07), 0xffd23f, [0, R * 0.88, 0], [Math.PI / 2, 0, 0]);
          break;
        case 'spikes':
          for (let i = -1; i <= 1; i++) b.add(coneGeo(R * 0.1, R * 0.4, 6), metalC, [i * R * 0.35, R * 0.95, -R * 0.3], [-0.5, 0, i * 0.3]);
          break;
        case 'fin':
          b.add(coneGeo(R * 0.3, R * 1.0, 4), trim, [0, R * 1.0, -R * 0.2], [-0.5, 0, 0], [0.35, 1, 1.2]);
          break;
      }
    }
  }

  /** Ponytail is animated separately (bounces when running). */
  private ensureTail() {
    if (this.tail || this.def.model.hair !== 'ponytail') return;
    const R = this.headR;
    this.tail = new THREE.Group(); this.tail.position.set(0, R * 0.5, -R * 0.95); this.head.add(this.tail);
    this.mesh(this.tail, (b) => {
      b.add(capsuleGeo(R * 0.2, R * 0.6), this.def.model.hairColor, [0, -R * 0.35, -R * 0.12], [-0.35, 0, 0]);
      b.add(coneGeo(R * 0.2, R * 0.5, 10), shade(this.def.model.hairColor, 0.15), [0, -R * 0.95, -R * 0.32], [Math.PI - 0.35, 0, 0]);
    });
  }

  /* ======================================================== API */
  play(a: HeroAnim) {
    this.anim = a; this.animT = 0;
    if (a === 'spawn') this.dropY = 6;
    if (a === 'hurt') this.hurtT = 0.35;
  }
  kick(amount = 1) { this.squashV += amount * 6; }
  punch() { this.push = 1; this.kick(0.6); this.showExpr('angry', 0.35); }
  hurt() { this.hurtT = 0.35; this.kick(-1.2); this.showExpr('surprised', 0.5); }
  showExpr(e: Expression, t: number) { this.heldExpr = e; this.exprHold = t; }
  setFlash(v: number) { (this.mat.emissive as THREE.Color).setRGB(this.emBase.r + v, this.emBase.g + v * 0.95, this.emBase.b + v * 0.95); }
  dispose() { this.face.dispose(); disposeTree(this.root); this.root.removeFromParent(); }

  /* ======================================================== animation */
  update(dt: number) {
    this.ensureTail();
    this.time += dt; this.animT += dt;
    const t = this.time;
    // spring squash
    this.squashV += (-this.squash * 180 - this.squashV * 14) * dt;
    this.squash += this.squashV * dt;
    const sq = clamp(this.squash, -0.3, 0.3);
    // blink & gaze
    this.blinkT -= dt;
    if (this.blinkT <= 0) { this.blink = 0.13; this.blinkT = 1.8 + Math.random() * 2.6; if (Math.random() < 0.15) this.blinkT = 0.25; }
    this.blink = Math.max(0, this.blink - dt);
    this.lookTimer -= dt;
    if (this.lookTimer <= 0) { this.lookTX = (Math.random() - 0.5) * 1.2; this.lookTY = (Math.random() - 0.5) * 0.7; this.lookTimer = 0.7 + Math.random() * 2; }
    this.lookX = damp(this.lookX, this.lookTX, 12, dt); this.lookY = damp(this.lookY, this.lookTY, 12, dt);
    this.push = Math.max(0, this.push - dt * 4);
    this.hurtT = Math.max(0, this.hurtT - dt);
    this.exprHold = Math.max(0, this.exprHold - dt);

    const ms = this.moveSpeed;
    const f = this.field;
    // pose targets (radians). Arm rest pose: slightly out and bent.
    const P = {
      hipY: 0, hipRX: 0, hipRY: 0, hipRZ: 0, spineRX: 0, spineRY: 0, spineRZ: 0, headRX: 0, headRY: 0, headRZ: 0,
      lSh: [0.12, 0, 0.42], rSh: [0.12, 0, 0.42], lEl: -0.22, rEl: -0.22,
      lTh: 0, rTh: 0, lKn: 0, rKn: 0, lFt: 0, rFt: 0, legSpread: 0,
    } as any;
    let expr: Expression = f > 0.35 ? 'focus' : 'happy';
    let spin = 0;

    switch (this.anim) {
      case 'idle':
      case 'run': {
        const breathe = Math.sin(t * 2.2);
        this.phase += dt * (6 + ms * 8) * (ms > 0.05 ? 1 : 0);
        const ph = this.phase;
        const runK = clamp(ms * 1.3, 0, 1);
        // idle
        P.hipY = breathe * 0.008 * (1 - runK);
        P.spineRX = breathe * 0.02 * (1 - runK);
        P.headRZ = Math.sin(t * 1.1) * 0.05 * (1 - runK);
        P.lSh[0] = Math.sin(t * 2.2) * 0.04; P.rSh[0] = -P.lSh[0];
        P.legSpread = 0.06;
        // run cycle
        if (runK > 0) {
          const s = Math.sin(ph), c = Math.cos(ph);
          P.hipY += Math.abs(Math.sin(ph)) * 0.06 * runK - 0.025 * runK;
          P.hipRY = s * 0.18 * runK;
          P.spineRY = -s * 0.28 * runK;
          P.spineRX = 0.24 * runK;
          P.headRX = -0.18 * runK;
          P.lTh = -s * 0.95 * runK; P.rTh = s * 0.95 * runK;
          P.lKn = Math.max(0, c) * 1.35 * runK + 0.15 * runK; P.rKn = Math.max(0, -c) * 1.35 * runK + 0.15 * runK;
          P.lFt = -P.lTh * 0.3; P.rFt = -P.rTh * 0.3;
          P.lSh = [s * 1.0 * runK, 0, 0.22]; P.rSh = [-s * 1.0 * runK, 0, 0.22];
          P.lEl = -0.9 * runK - 0.3; P.rEl = -0.9 * runK - 0.3;
        }
        // magnet stance: arms forward, palms out
        if (f > 0) {
          const k = clamp(f * 1.4, 0, 1);
          const pol = this.polarity;
          for (const [sh, sgn] of [[P.lSh, 1], [P.rSh, 1]] as const) {
            sh[0] = lerp(sh[0], pol > 0 ? -1.35 : -1.5, k);
            sh[1] = lerp(sh[1], 0, k);
            sh[2] = lerp(sh[2], sgn * (pol > 0 ? 0.35 : 0.12), k);
          }
          P.lEl = lerp(P.lEl, pol > 0 ? -0.35 : -0.1, k); P.rEl = lerp(P.rEl, pol > 0 ? -0.35 : -0.1, k);
          P.spineRX += (pol > 0 ? -0.1 : 0.08) * k;
          // jittery effort when pulling hard
          P.spineRZ += Math.sin(t * 40) * 0.015 * k;
        }
        if (this.push > 0) {
          const k = this.push;
          P.lSh = [-1.6 * k + P.lSh[0] * (1 - k), 0, 0.05]; P.rSh = [-1.6 * k + P.rSh[0] * (1 - k), 0, 0.05];
          P.lEl = lerp(P.lEl, 0, k); P.rEl = lerp(P.rEl, 0, k);
          P.spineRX += 0.3 * k; P.hipY -= 0.03 * k;
          expr = 'angry';
        }
        break;
      }
      case 'victory': {
        const p = this.animT;
        const jump = Math.max(0, Math.sin(p * 6)) * 0.35;
        P.hipY = jump;
        spin = p < 0.55 ? (p / 0.55) * Math.PI * 2 : 0;
        const pump = Math.sin(p * 12) * 0.25;
        P.rSh = [-2.9 + pump, 0, 0.2]; P.rEl = -0.2;
        P.lSh = [0, 0, 0.9]; P.lEl = -1.6;
        P.lTh = jump > 0.05 ? -0.5 : 0; P.lKn = jump > 0.05 ? 1.0 : 0;
        P.rTh = jump > 0.05 ? -0.2 : 0; P.rKn = jump > 0.05 ? 0.6 : 0;
        P.headRX = -0.25; P.headRZ = Math.sin(p * 5) * 0.12;
        if (jump < 0.02 && Math.sin((p - dt) * 6) > 0) this.kick(0.3);
        expr = p % 1.6 < 0.9 ? 'laugh' : 'happy';
        break;
      }
      case 'defeat': {
        const k = clamp(this.animT / 0.7, 0, 1);
        P.hipY = -this.legLen * 0.62 * k;
        P.lTh = -1.5 * k; P.rTh = -1.4 * k; P.lKn = 0.2 * k; P.rKn = 0.3 * k;
        P.spineRX = -0.45 * k; P.headRX = 0.35 * k; P.headRZ = 0.2 * k;
        P.lSh = [0.3 * k, 0, 0.9 * k]; P.rSh = [0.3 * k, 0, 0.9 * k]; P.lEl = -0.2; P.rEl = -0.2;
        expr = 'ko';
        break;
      }
      case 'spawn': {
        if (this.dropY > 0) {
          this.dropY = Math.max(0, this.dropY - dt * 20);
          if (this.dropY === 0) { this.kick(-2.2); this.showExpr('smug', 0.8); }
          P.lSh = [-0.3, 0, 2.4]; P.rSh = [-0.3, 0, 2.4]; P.lTh = -0.6; P.lKn = 1.0; P.rTh = -0.2; P.rKn = 0.4;
          expr = 'surprised';
        } else {
          const k = clamp(1 - this.animT * 1.5, 0, 1);
          P.hipY = -0.08 * k; P.lKn = 0.5 * k; P.rKn = 0.5 * k; P.lTh = -0.25 * k; P.rTh = -0.25 * k;
          P.lSh = [0.12, 0, 0.42 + 0.5 * k]; P.rSh = [0.12, 0, 0.42 + 0.5 * k];
        }
        if (this.animT > 1.0) this.anim = 'idle';
        break;
      }
      case 'select': {
        const p = this.animT;
        P.hipY = Math.max(0, Math.sin(p * 7)) * 0.18 * Math.max(0, 1 - p);
        P.rSh = [0, 0, 2.6]; P.rEl = -0.4 + Math.sin(p * 16) * 0.45;
        P.lSh = [-0.2, 0, 0.45]; P.lEl = -1.4;
        P.headRZ = -0.18; P.spineRZ = 0.08;
        expr = 'laugh';
        if (p > 1.4) this.anim = 'idle';
        break;
      }
      case 'ability': {
        const p = this.animT;
        spin = p < 0.4 ? (p / 0.4) * Math.PI * 2 : 0;
        P.lSh = [0, 0, 1.55]; P.rSh = [0, 0, 1.55]; P.lEl = 0; P.rEl = 0;
        P.hipY = Math.sin(clamp(p / 0.4, 0, 1) * Math.PI) * 0.3;
        P.lTh = -0.4; P.lKn = 0.8; P.rTh = 0.2;
        expr = 'angry';
        if (p > 0.6) this.anim = 'idle';
        break;
      }
      case 'hurt': this.anim = 'idle'; break;
    }
    if (this.hurtT > 0) { expr = 'surprised'; P.spineRX -= 0.25 * (this.hurtT / 0.35); P.headRX += 0.2 * (this.hurtT / 0.35); }
    if (this.exprHold > 0 && this.anim !== 'defeat') expr = this.heldExpr;

    // ---- apply with damping (smooth blending between states)
    const k = 1 - Math.exp(-18 * dt);
    const ap = (o: THREE.Object3D, x: number, y: number, z: number) => { o.rotation.x += (x - o.rotation.x) * k; o.rotation.y += (y - o.rotation.y) * k; o.rotation.z += (z - o.rotation.z) * k; };
    this.hips.position.y += (this.legLen + P.hipY - this.hips.position.y) * k;
    ap(this.hips, P.hipRX, P.hipRY + spin, P.hipRZ);
    if (spin) this.hips.rotation.y = spin;
    ap(this.spine, P.spineRX, P.spineRY, P.spineRZ);
    ap(this.head, P.headRX + this.lookY * -0.08, P.headRY + this.lookX * 0.18, P.headRZ);
    // convention: positive Z = arm away from the body on both sides
    ap(this.armL.root, P.lSh[0], P.lSh[1], -P.lSh[2]);
    ap(this.armR.root, P.rSh[0], P.rSh[1], -P.rSh[2]);
    ap(this.armL.mid, P.lEl, 0, 0); ap(this.armR.mid, P.rEl, 0, 0);
    ap(this.legL.root, P.lTh, 0, -P.legSpread); ap(this.legR.root, P.rTh, 0, P.legSpread);
    ap(this.legL.mid, P.lKn, 0, 0); ap(this.legR.mid, P.rKn, 0, 0);
    ap(this.legL.end, P.lFt, 0, P.legSpread); ap(this.legR.end, P.rFt, 0, -P.legSpread);
    // keep feet on the ground when hips drop (defeat sits)
    // squash & stretch + drop-in
    const s = 1 + sq;
    this.pivot.scale.set(this.base / Math.sqrt(s), this.base * s, this.base / Math.sqrt(s));
    this.pivot.position.y = this.dropY;

    // secondary motion
    if (this.scarf) { this.scarf.rotation.x = -0.2 - ms * 0.9 + Math.sin(t * 14) * 0.08 * (0.3 + ms); this.scarf.rotation.y = Math.sin(t * 3) * 0.2; }
    if (this.tail) { this.tail.rotation.x = 0.2 + ms * 0.6 + Math.sin(this.phase * 2) * 0.15 * ms + Math.sin(t * 2) * 0.05; this.tail.rotation.z = Math.sin(this.phase) * 0.25 * ms; }
    if (this.ring) this.ring.rotation.y += dt * (1.5 + f * 6);
    for (const [i, o] of this.orbs.entries()) { o.position.y = -0.13 + Math.sin(t * 3 + i * 2) * 0.03; o.rotation.y += dt * 4; }

    // glove glow
    const glowCol = this.polarity > 0 ? 0xff3b3b : 0x2f7bff;
    for (const g of [this.glowL, this.glowR]) {
      if (!g) continue;
      const m = g.material as THREE.MeshBasicMaterial;
      m.color.setHex(glowCol);
      m.opacity = damp(m.opacity, Math.max(f * (0.55 + Math.sin(t * 30) * 0.15), this.push * 0.95), 20, dt);
      g.scale.setScalar((0.17 + f * 0.05 + this.push * 0.08) * (this.def.model.gloves === 'giant' ? 1.4 : 1));
    }

    // face
    this.expression = expr;
    const blink = this.blink > 0 ? 1 : 0;
    const talk = expr === 'angry' || expr === 'laugh' ? 0.5 + Math.abs(Math.sin(t * 9)) * 0.5 : 0;
    this.face.set(expr, blink, this.lookX, this.lookY, talk);

    this.setFlash(this.hurtT > 0 ? (Math.sin(this.hurtT * 60) > 0 ? 0.6 : 0) : 0);
  }
}

function mix3(a: number, b: number, t: number) {
  const ca = new THREE.Color(a), cb = new THREE.Color(b);
  return ca.lerp(cb, t).getHex();
}
