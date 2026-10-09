import * as THREE from 'three';
import type { HeroDef, Accessory } from '../../data/heroes';
import { themeById, type SkinTheme } from '../../data/skins';
import { toon, basic, addOutline, sphereGeo, capsuleGeo, rboxGeo, cylGeo, torusGeo, coneGeo, makeEye, blobShadow, shade } from '../toon';
import { disposeTree } from '../toon';
import { clamp, damp, lerp } from '../../core/math';

export type HeroAnim = 'idle' | 'run' | 'victory' | 'defeat' | 'spawn' | 'select' | 'ability' | 'hurt';
export type Expression = 'happy' | 'focus' | 'angry' | 'surprised' | 'sad' | 'ko';

/**
 * Procedurally built, fully animated cartoon hero.
 * All animation is procedural (squash & stretch, overlapping action, facial rig).
 */
export class HeroRig {
  root = new THREE.Group();
  /** visual pivot that receives squash/stretch */
  pivot = new THREE.Group();
  body = new THREE.Group();
  head = new THREE.Group();
  armL = new THREE.Group();
  armR = new THREE.Group();
  footL = new THREE.Group();
  footR = new THREE.Group();
  eyes: THREE.Group[] = [];
  brows: THREE.Mesh[] = [];
  mouthSmile!: THREE.Mesh;
  mouthOpen!: THREE.Mesh;
  glowL!: THREE.Mesh;
  glowR!: THREE.Mesh;
  ring?: THREE.Group;
  orbs: THREE.Mesh[] = [];
  shadow: THREE.Mesh;
  flashMats: THREE.MeshToonMaterial[] = [];
  color: number;
  accent: number;
  theme: SkinTheme;

  // animation state
  anim: HeroAnim = 'idle';
  animT = 0;
  moveSpeed = 0; // 0..1
  field = 0; // 0..1
  polarity = 1;
  push = 0; // punch impulse 0..1
  expression: Expression = 'happy';
  private blinkT = 2;
  private blink = 0;
  private lookX = 0;
  private lookY = 0;
  private lookTX = 0;
  private lookTY = 0;
  private lookTimer = 0;
  private hurtT = 0;
  private time = Math.random() * 10;
  private squash = 0;
  private squashV = 0;

  constructor(public def: HeroDef, skin: SkinTheme = 'default', withShadow = true) {
    const th = themeById(skin);
    this.theme = skin;
    this.color = th.color ?? def.color;
    this.accent = th.accent ?? def.accent;
    const s = def.model.scale;
    this.root.add(this.pivot);
    this.pivot.add(this.body);
    this.pivot.scale.setScalar(s);
    this.shadow = blobShadow(0.55 * s);
    if (withShadow) this.root.add(this.shadow);
    this.build(def, th.emissive, !!th.translucent, !!th.metal, [...def.model.accessories, ...th.extra] as Accessory[]);
  }

  private mat(color: number, emissive = 0) {
    // unique material per rig for hit flash
    const m = new THREE.MeshToonMaterial({ color, gradientMap: (toon(0) as THREE.MeshToonMaterial).gradientMap, emissive });
    this.flashMats.push(m);
    return m;
  }

  private mesh(geo: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D, pos: [number, number, number], scale: [number, number, number] | number = 1, outline = 0.035) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(...pos);
    if (typeof scale === 'number') m.scale.setScalar(scale); else m.scale.set(...scale);
    if (outline > 0) addOutline(m, outline / Math.max(0.3, typeof scale === 'number' ? scale : Math.max(...scale)));
    parent.add(m);
    return m;
  }

  private build(def: HeroDef, emissive: number, translucent: boolean, metal: boolean, acc: Accessory[]) {
    const M = def.model;
    const main = this.mat(this.color, emissive);
    if (translucent) { main.transparent = true; main.opacity = 0.78; }
    const dark = this.mat(shade(this.accent, -0.1), 0);
    const acc2 = this.mat(this.accent, emissive);
    const skin = this.mat(metal ? 0xc8d0da : def.skinTone);
    const darkM = basic(0x14121c);

    /* ---- body ---- */
    let bodyTop = 1.0, headY = 1.35, headR = 0.46, shoulderX = 0.5, shoulderY = 0.75;
    switch (M.body) {
      case 'compact':
        this.mesh(sphereGeo(), main, this.body, [0, 0.62, 0], [0.5, 0.48, 0.44]);
        this.mesh(cylGeo(0.36, 0.42, 0.14, 18), dark, this.body, [0, 0.42, 0], 1, 0.03); // belt
        bodyTop = 1.0; headY = 1.38; headR = 0.48; shoulderX = 0.5; shoulderY = 0.72;
        break;
      case 'slim':
        this.mesh(capsuleGeo(0.3, 0.42), main, this.body, [0, 0.68, 0]);
        this.mesh(cylGeo(0.31, 0.33, 0.1, 18), dark, this.body, [0, 0.5, 0], 1, 0.03);
        bodyTop = 1.05; headY = 1.42; headR = 0.44; shoulderX = 0.4; shoulderY = 0.82;
        break;
      case 'heavy':
        this.mesh(rboxGeo(1.05, 0.85, 0.78, 0.28), main, this.body, [0, 0.7, 0]);
        this.mesh(rboxGeo(0.7, 0.42, 0.1, 0.06), dark, this.body, [0, 0.72, 0.38], 1, 0.025);
        bodyTop = 1.12; headY = 1.48; headR = 0.42; shoulderX = 0.66; shoulderY = 0.88;
        break;
      case 'tall':
        this.mesh(capsuleGeo(0.32, 0.62), main, this.body, [0, 0.78, 0]);
        this.mesh(torusGeo(0.33, 0.05), acc2, this.body, [0, 0.95, 0], 1, 0.02).rotation.x = Math.PI / 2;
        bodyTop = 1.22; headY = 1.6; headR = 0.42; shoulderX = 0.42; shoulderY = 0.98;
        break;
      case 'cloak':
        this.mesh(coneGeo(0.55, 1.15, 18), main, this.body, [0, 0.6, 0]);
        this.mesh(torusGeo(0.3, 0.06), acc2, this.body, [0, 0.95, 0], 1, 0.02).rotation.x = Math.PI / 2;
        bodyTop = 1.05; headY = 1.4; headR = 0.44; shoulderX = 0.42; shoulderY = 0.85;
        break;
    }
    void bodyTop;

    /* ---- feet ---- */
    if (M.body !== 'cloak') {
      for (const [f, x] of [[this.footL, -0.2], [this.footR, 0.2]] as const) {
        f.position.set(x * (M.body === 'heavy' ? 1.3 : 1), 0.12, 0.02);
        this.mesh(sphereGeo(), dark, f, [0, 0, 0.05], [0.16, 0.12, 0.22]);
        this.body.add(f);
      }
    }

    /* ---- head ---- */
    this.head.position.y = headY;
    this.body.add(this.head);
    const faceZ = headR * 0.86;
    switch (M.head) {
      case 'round': this.mesh(sphereGeo(), skin, this.head, [0, 0, 0], headR); break;
      case 'square': this.mesh(rboxGeo(headR * 2, headR * 1.8, headR * 1.8, 0.18), skin, this.head, [0, 0, 0]); break;
      case 'visor':
        this.mesh(sphereGeo(), main, this.head, [0, 0, 0], headR);
        this.mesh(rboxGeo(headR * 1.7, headR * 0.7, headR * 0.5, 0.12), basic(0x0d0f1a), this.head, [0, 0.02, headR * 0.72], 1, 0.025);
        break;
      case 'dome':
        this.mesh(sphereGeo(), skin, this.head, [0, 0, 0], headR);
        { const g = new THREE.Mesh(sphereGeo(1, 20, 12), new THREE.MeshToonMaterial({ color: 0xbff6ff, transparent: true, opacity: 0.35, gradientMap: (toon(0) as THREE.MeshToonMaterial).gradientMap }));
          g.scale.setScalar(headR * 1.25); g.position.y = 0.05; this.head.add(g); }
        break;
      case 'hood':
        this.mesh(sphereGeo(), basic(0x0b0814), this.head, [0, 0, 0.02], headR * 0.92, 0);
        this.mesh(coneGeo(headR * 1.25, headR * 2.6, 18), main, this.head, [0, headR * 0.35, -0.08]).rotation.x = -0.25;
        break;
    }

    /* ---- face ---- */
    const eyeY = M.head === 'visor' ? 0.02 : 0.06;
    const glowEyes = M.eyes === 'glow' || M.eyes === 'visor' || M.head === 'hood';
    const eyeGlowColor = M.eyes === 'visor' ? 0x7ff8ff : this.accent;
    if (M.eyes === 'cyclops') {
      const e = makeEye(headR * 0.4, 0x14121c, M.head === 'visor' ? 0x7ff8ff : undefined);
      e.position.set(0, eyeY, faceZ + (M.head === 'visor' ? 0.06 : 0));
      this.head.add(e); this.eyes.push(e);
    } else {
      const sz = M.eyes === 'narrow' ? headR * 0.26 : headR * 0.3;
      for (const x of [-1, 1]) {
        const e = makeEye(sz, 0x14121c, glowEyes ? eyeGlowColor : undefined);
        e.position.set(x * headR * 0.38, eyeY, faceZ + (M.head === 'visor' ? 0.08 : 0));
        e.rotation.y = x * 0.18;
        if (M.eyes === 'narrow') e.scale.y = 0.75;
        this.head.add(e); this.eyes.push(e);
        // brows
        if (!glowEyes) {
          const b = new THREE.Mesh(rboxGeo(sz * 1.5, sz * 0.32, sz * 0.3, 0.04), darkM);
          b.position.set(x * headR * 0.38, eyeY + sz * 1.45, faceZ + 0.04);
          this.head.add(b); this.brows.push(b);
        }
      }
    }
    // mouth
    this.mouthSmile = new THREE.Mesh(torusGeo(headR * 0.18, headR * 0.045, Math.PI), darkM);
    this.mouthSmile.rotation.z = Math.PI;
    this.mouthSmile.position.set(0, -headR * 0.32, faceZ + 0.02);
    this.mouthOpen = new THREE.Mesh(sphereGeo(1, 12, 8), basic(0x3a0f18));
    this.mouthOpen.scale.set(headR * 0.16, headR * 0.2, headR * 0.08);
    this.mouthOpen.position.set(0, -headR * 0.34, faceZ);
    this.mouthOpen.visible = false;
    if (M.head !== 'visor' && M.head !== 'hood') this.head.add(this.mouthSmile, this.mouthOpen);

    /* ---- arms + gloves ---- */
    const gloveR = M.gloves === 'giant' ? 0.3 : M.gloves === 'claws' ? 0.2 : 0.2;
    for (const [arm, x] of [[this.armL, -1], [this.armR, 1]] as const) {
      arm.position.set(x * shoulderX, shoulderY, 0);
      this.body.add(arm);
      if (M.gloves !== 'orbs' && M.gloves !== 'none') {
        this.mesh(capsuleGeo(0.08, 0.22), skin, arm, [x * 0.12, -0.14, 0], 1, 0.025).rotation.z = x * 0.6;
        const hand = new THREE.Group(); hand.position.set(x * 0.26, -0.28, 0.06); arm.add(hand);
        if (M.gloves === 'claws') {
          this.mesh(sphereGeo(), dark, hand, [0, 0, 0], gloveR * 0.8);
          for (const k of [-1, 0, 1]) this.mesh(coneGeo(0.05, 0.22, 8), acc2, hand, [k * 0.07, -0.02, 0.17], 1, 0.015).rotation.x = Math.PI / 2;
        } else {
          this.mesh(sphereGeo(), acc2, hand, [0, 0, 0], gloveR);
          this.mesh(cylGeo(gloveR * 0.8, gloveR * 0.9, gloveR * 0.5), dark, hand, [0, gloveR * 0.6, 0], 1, 0.02);
          if (M.gloves === 'giant') {
            // magnet horseshoe tips
            this.mesh(rboxGeo(gloveR * 0.5, gloveR * 0.35, gloveR * 0.5, 0.05), this.mat(0xff3b3b), hand, [-gloveR * 0.45, -gloveR * 0.15, gloveR * 0.75], 1, 0.015);
            this.mesh(rboxGeo(gloveR * 0.5, gloveR * 0.35, gloveR * 0.5, 0.05), this.mat(0x2f7bff), hand, [gloveR * 0.45, -gloveR * 0.15, gloveR * 0.75], 1, 0.015);
          }
        }
        const glow = new THREE.Mesh(sphereGeo(1, 14, 10), new THREE.MeshBasicMaterial({ color: 0xff3b3b, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
        glow.scale.setScalar(gloveR * 1.6);
        hand.add(glow);
        if (x < 0) this.glowL = glow; else this.glowR = glow;
      } else {
        const orb = this.mesh(sphereGeo(), acc2, arm, [x * 0.25, -0.15, 0.1], 0.17);
        this.orbs.push(orb);
        const glow = new THREE.Mesh(sphereGeo(1, 14, 10), new THREE.MeshBasicMaterial({ color: 0xff3b3b, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
        glow.scale.setScalar(1.7); orb.add(glow);
        if (x < 0) this.glowL = glow; else this.glowR = glow;
      }
    }

    /* ---- accessories ---- */
    const top = headR * (M.head === 'square' ? 0.9 : 1);
    const uniq = [...new Set(acc)];
    for (const a of uniq) {
      switch (a) {
        case 'antenna':
          this.mesh(cylGeo(0.025, 0.025, 0.35, 8), darkM, this.head, [0.12, top + 0.15, 0], 1, 0);
          this.mesh(sphereGeo(), this.mat(0xff3b3b, 0x551111), this.head, [0.12, top + 0.36, 0], 0.08, 0.02);
          break;
        case 'coils':
          for (let i = 0; i < 3; i++) this.mesh(torusGeo(0.11, 0.035), acc2, this.body, [0, 0.95 + i * 0.1, -0.33], 1, 0.015);
          break;
        case 'backpack':
          this.mesh(rboxGeo(0.62, 0.62, 0.3, 0.1), dark, this.body, [0, 0.78, -0.42]);
          this.mesh(cylGeo(0.09, 0.09, 0.5, 10), acc2, this.body, [0.22, 1.05, -0.45], 1, 0.02);
          this.mesh(cylGeo(0.09, 0.09, 0.5, 10), acc2, this.body, [-0.22, 1.05, -0.45], 1, 0.02);
          break;
        case 'tank':
          this.mesh(capsuleGeo(0.17, 0.42), acc2, this.body, [0, 0.85, -0.5]);
          break;
        case 'crown':
          for (let i = 0; i < 5; i++) { const ang = (i / 5) * Math.PI * 2; this.mesh(coneGeo(0.07, 0.2, 6), this.mat(0xffd23f, 0x332200), this.head, [Math.sin(ang) * 0.24, top + 0.08, Math.cos(ang) * 0.24], 1, 0.015); }
          break;
        case 'halo': {
          const h = new THREE.Mesh(torusGeo(0.3, 0.035), basic(0xfff3a0));
          h.rotation.x = Math.PI / 2; h.position.y = top + 0.32; this.head.add(h);
          break;
        }
        case 'horns':
          for (const x of [-1, 1]) { const h = this.mesh(coneGeo(0.09, 0.34, 10), this.mat(0xfff1d6), this.head, [x * 0.3, top * 0.75, 0], 1, 0.02); h.rotation.z = -x * 0.5; }
          break;
        case 'fin':
          this.mesh(coneGeo(0.14, 0.5, 4), acc2, this.head, [0, top + 0.12, -0.1], [0.4, 1, 1.2], 0.02).rotation.x = -0.5;
          break;
        case 'spikes':
          for (let i = -2; i <= 2; i++) this.mesh(coneGeo(0.07, 0.24, 6), acc2, this.head, [i * 0.12, top * 0.92, -0.08 - Math.abs(i) * 0.02], 1, 0.015).rotation.x = -0.4;
          break;
        case 'goggles':
          this.mesh(torusGeo(headR * 0.95, 0.04), darkM, this.head, [0, headR * 0.45, 0], 1, 0).rotation.x = Math.PI / 2 - 0.25;
          for (const x of [-1, 1]) this.mesh(cylGeo(0.11, 0.11, 0.08, 14), this.mat(0x7ff8ff, 0x113344), this.head, [x * 0.17, headR * 0.55, headR * 0.82], 1, 0.02).rotation.x = Math.PI / 2 - 0.4;
          break;
        case 'scarf':
          this.mesh(torusGeo(0.3, 0.09), acc2, this.body, [0, headY - headR * 0.85, 0], 1, 0.02).rotation.x = Math.PI / 2;
          this.mesh(rboxGeo(0.18, 0.42, 0.06, 0.03), acc2, this.body, [0.15, headY - headR * 1.25, -0.28], 1, 0.02);
          break;
        case 'ring': {
          const g = new THREE.Group(); g.position.y = 0.7;
          const t = this.mesh(torusGeo(0.78, 0.04), basic(this.accent), g, [0, 0, 0], 1, 0); t.rotation.x = Math.PI / 2;
          for (let i = 0; i < 3; i++) { const ang = (i / 3) * Math.PI * 2; this.mesh(sphereGeo(), acc2, g, [Math.cos(ang) * 0.78, 0, Math.sin(ang) * 0.78], 0.08, 0.02); }
          g.rotation.x = 0.35;
          this.body.add(g); this.ring = g;
          break;
        }
      }
    }
  }

  /* ---------------- API ---------------- */
  play(a: HeroAnim) { this.anim = a; this.animT = 0; if (a === 'spawn') this.pivot.position.y = 6; if (a === 'hurt') this.hurtT = 0.35; }
  kick(amount = 1) { this.squashV += amount * 6; }
  punch() { this.push = 1; this.kick(0.6); }
  hurt() { this.hurtT = 0.35; this.kick(-1.2); this.expression = 'surprised'; }
  setFlash(v: number) {
    for (const m of this.flashMats) (m.emissive as THREE.Color).setRGB(v, v * 0.95, v * 0.95);
  }
  dispose() { disposeTree(this.root); this.root.removeFromParent(); }

  update(dt: number) {
    this.time += dt; this.animT += dt;
    const t = this.time;
    // spring squash
    this.squashV += (-this.squash * 180 - this.squashV * 14) * dt;
    this.squash += this.squashV * dt;
    const sq = clamp(this.squash, -0.35, 0.35);
    // blink
    this.blinkT -= dt;
    if (this.blinkT <= 0) { this.blink = 0.14; this.blinkT = 1.8 + Math.random() * 2.8; }
    this.blink = Math.max(0, this.blink - dt);
    // look around
    this.lookTimer -= dt;
    if (this.lookTimer <= 0) { this.lookTX = (Math.random() - 0.5) * 0.9; this.lookTY = (Math.random() - 0.5) * 0.5; this.lookTimer = 0.8 + Math.random() * 2; }
    this.lookX = damp(this.lookX, this.lookTX, 10, dt); this.lookY = damp(this.lookY, this.lookTY, 10, dt);
    this.push = Math.max(0, this.push - dt * 4);
    this.hurtT = Math.max(0, this.hurtT - dt);

    let bodyY = 0, lean = 0, armLx = 0, armRx = 0, armLz = 0, armRz = 0, headTilt = 0, spin = 0, footL = 0, footR = 0, flop = 0;
    const ms = this.moveSpeed;
    let expr: Expression = this.field > 0.2 ? 'focus' : 'happy';

    switch (this.anim) {
      case 'idle':
      case 'run': {
        const breathe = Math.sin(t * 2.4) * 0.03;
        const run = Math.abs(Math.sin(t * 13)) * 0.12 * ms;
        bodyY = breathe + run;
        lean = ms * 0.22;
        armLx = Math.sin(t * 13) * 0.7 * ms; armRx = -armLx;
        armLz = 0.15 + Math.sin(t * 2.4) * 0.05; armRz = -armLz;
        footL = Math.max(0, Math.sin(t * 13)) * 0.18 * ms; footR = Math.max(0, -Math.sin(t * 13)) * 0.18 * ms;
        headTilt = Math.sin(t * 1.3) * 0.06;
        // magnetic pose: arms forward
        const f = this.field;
        armLx = lerp(armLx, -1.35, f); armRx = lerp(armRx, -1.35, f);
        armLz = lerp(armLz, 0.25, f); armRz = lerp(armRz, -0.25, f);
        lean -= f * (this.polarity > 0 ? 0.12 : -0.08);
        if (this.push > 0) { armLx = -1.6; armRx = -1.6; armLz = -0.15 * this.push; armRz = 0.15 * this.push; lean += 0.25 * this.push; }
        break;
      }
      case 'victory': {
        const ph = this.animT;
        const jump = Math.abs(Math.sin(ph * 5)) * 0.6;
        bodyY = jump; spin = ph < 0.7 ? ph * Math.PI * 2 / 0.7 : 0;
        armLz = 2.6 + Math.sin(ph * 10) * 0.2; armRz = -armLz;
        armLx = 0; armRx = 0;
        if (jump < 0.05) this.kick(0.25);
        expr = 'happy';
        headTilt = Math.sin(ph * 6) * 0.15;
        break;
      }
      case 'defeat': {
        const p = clamp(this.animT / 0.6, 0, 1);
        flop = p * 1.35; bodyY = -p * 0.25;
        armLz = 1.2 * p; armRz = -1.2 * p;
        expr = 'ko';
        break;
      }
      case 'spawn': {
        const y = this.pivot.position.y;
        if (y > 0) {
          this.pivot.position.y = Math.max(0, y - dt * 22);
          if (this.pivot.position.y === 0) { this.kick(-2.2); }
        }
        armLz = 1.6; armRz = -1.6; expr = 'surprised';
        if (this.animT > 0.9) this.anim = 'idle';
        break;
      }
      case 'select': {
        const ph = this.animT;
        bodyY = Math.max(0, Math.sin(ph * 7)) * 0.35 * Math.max(0, 1 - ph);
        armRz = -2.5 + Math.sin(ph * 14) * 0.4; armRx = 0;
        armLz = 0.2;
        expr = 'happy';
        if (ph > 1.4) this.anim = 'idle';
        break;
      }
      case 'ability': {
        const ph = this.animT;
        spin = ph < 0.45 ? (ph / 0.45) * Math.PI * 2 : 0;
        armLz = 1.4; armRz = -1.4; bodyY = Math.sin(clamp(ph / 0.45, 0, 1) * Math.PI) * 0.5;
        expr = 'angry';
        if (ph > 0.6) this.anim = 'idle';
        break;
      }
      case 'hurt': this.anim = 'idle'; break;
    }
    if (this.hurtT > 0) expr = 'surprised';

    // apply
    this.body.position.y = bodyY;
    this.body.rotation.x = lean;
    this.body.rotation.y = spin;
    this.pivot.rotation.x = -flop;
    const s = 1 + sq;
    this.pivot.scale.set(this.def.model.scale / Math.sqrt(s), this.def.model.scale * s, this.def.model.scale / Math.sqrt(s));
    this.head.rotation.z = headTilt;
    this.head.rotation.x = -lean * 0.5;
    this.armL.rotation.set(armLx, 0, armLz);
    this.armR.rotation.set(armRx, 0, armRz);
    this.footL.position.y = 0.12 + footL; this.footR.position.y = 0.12 + footR;
    if (this.ring) this.ring.rotation.y += dt * (1.5 + this.field * 6);
    for (const [i, o] of this.orbs.entries()) o.position.y = -0.15 + Math.sin(t * 3 + i * 2) * 0.08;

    // glove glow
    const glowCol = this.polarity > 0 ? 0xff3b3b : 0x2f7bff;
    for (const g of [this.glowL, this.glowR]) {
      if (!g) continue;
      const m = g.material as THREE.MeshBasicMaterial;
      m.color.setHex(glowCol);
      m.opacity = damp(m.opacity, Math.max(this.field * (0.5 + Math.sin(t * 30) * 0.15), this.push * 0.9), 20, dt);
    }

    // face
    this.expression = expr;
    const blinkS = this.blink > 0 || expr === 'ko' ? 0.1 : expr === 'focus' ? 0.8 : expr === 'surprised' ? 1.25 : 1;
    for (const e of this.eyes) {
      e.scale.y = damp(e.scale.y, blinkS * (this.def.model.eyes === 'narrow' ? 0.75 : 1), 30, dt);
      const p = (e as any).pupil as THREE.Group;
      p.position.x = this.lookX * 0.06; p.position.y = this.lookY * 0.05;
    }
    const browRot = expr === 'angry' || expr === 'focus' ? 0.35 : (expr as Expression) === 'sad' ? -0.3 : expr === 'surprised' ? -0.1 : 0;
    const browY = expr === 'surprised' ? 0.05 : 0;
    this.brows.forEach((b, i) => { b.rotation.z = damp(b.rotation.z, (i === 0 ? -1 : 1) * browRot, 18, dt); b.userData.by ??= b.position.y; b.position.y = b.userData.by + browY; });
    const open = expr === 'surprised' || expr === 'angry' || this.push > 0.3 || (this.anim === 'victory');
    this.mouthOpen.visible = open;
    this.mouthSmile.visible = !open && expr !== 'ko';
    if (this.mouthOpen.visible) this.mouthOpen.scale.y = 0.06 + (expr === 'surprised' ? 0.06 : 0.03) + Math.abs(Math.sin(t * 8)) * 0.02;
    this.mouthSmile.rotation.z = (expr as Expression) === 'sad' ? 0 : Math.PI;

    // hurt flash
    this.setFlash(this.hurtT > 0 ? (Math.sin(this.hurtT * 60) > 0 ? 0.6 : 0) : 0);
  }
}
