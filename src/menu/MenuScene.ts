import * as THREE from 'three';
import type { View } from '../core/Game';
import { HeroRig } from '../gfx/models/hero';
import { heroById } from '../data/heroes';
import type { SkinTheme } from '../data/skins';
import { themeById } from '../data/skins';
import { FX } from '../gfx/fx';
import { Baker, toonRamp, outlineMat, rboxGeo, cylGeo, torusGeo, sphereGeo, coneGeo, toon, basic, addOutline } from '../gfx/toon';
import { makePropMesh } from '../gfx/models/props';
import { damp } from '../core/math';

/** The hero's living magnetic workshop — always animated behind the menus. */
export class MenuScene implements View {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(36, 0.5, 0.1, 100);
  hero: HeroRig | null = null;
  fx = new FX();
  private t = 0;
  private floaters: { m: THREE.Object3D; r: number; a: number; y: number; s: number; spin: number }[] = [];
  private coils: THREE.Object3D[] = [];
  private belt: THREE.Object3D[] = [];
  private lamp!: THREE.Group;
  private tesla!: THREE.Vector3;
  private platform!: THREE.Group;
  private camMode: 'home' | 'hero' | 'title' | 'closeup' = 'title';
  private camPos = new THREE.Vector3(0, 3, 12);
  private camLook = new THREE.Vector3(0, 1.4, 0);
  private heroKey = '';
  aspect = 0.5;
  spin = 0; // user drag rotation on hero screen

  constructor() {
    const s = this.scene;
    s.background = new THREE.Color(0x1b1f3a);
    s.fog = new THREE.Fog(0x1b1f3a, 14, 34);
    s.add(new THREE.HemisphereLight(0xfff1e0, 0x3a3f6a, 1.7));
    const key = new THREE.DirectionalLight(0xffe6c0, 2.2); key.position.set(3, 8, 6); s.add(key);
    const rim = new THREE.DirectionalLight(0x6fb0ff, 1.4); rim.position.set(-5, 4, -4); s.add(rim);
    s.add(this.fx.group);
    this.build();
    this.fx.quality = 0.8;
  }

  private build() {
    const s = this.scene;
    // floor
    const fb = new Baker();
    fb.add(rboxGeo(30, 0.4, 24, 0.1), 0x2a2f52, [0, -0.2, -4]);
    for (let i = -6; i <= 6; i++) fb.add(rboxGeo(0.06, 0.02, 24, 0.01), 0x343a66, [i * 2, 0.01, -4]);
    for (let j = -6; j <= 4; j++) fb.add(rboxGeo(30, 0.02, 0.06, 0.01), 0x343a66, [0, 0.01, j * 2]);
    // back wall + shelves
    fb.add(rboxGeo(30, 12, 0.6, 0.1), 0x262b4c, [0, 6, -10]);
    for (const y of [2.6, 4.6]) {
      fb.add(rboxGeo(5, 0.2, 1.2, 0.05), 0x8a5a2b, [-6.5, y, -9.3]);
      fb.add(rboxGeo(5, 0.2, 1.2, 0.05), 0x8a5a2b, [6.5, y, -9.3]);
    }
    for (let i = 0; i < 4; i++) fb.add(rboxGeo(0.8, 0.8, 0.8, 0.08), [0xc98a4b, 0xe8402c, 0x6f7c8c, 0x31a8ff][i], [-8 + i * 1.1, 3.1, -9.3]);
    for (let i = 0; i < 3; i++) fb.add(cylGeo(0.3, 0.3, 0.8, 12), [0xffd23f, 0x2ee6a6, 0xff4d4d][i], [5 + i * 1.2, 5.1, -9.3]);
    // big pipes
    fb.add(cylGeo(0.35, 0.35, 30, 12), 0xf2a33a, [0, 9, -9.4], [0, 0, Math.PI / 2]);
    fb.add(cylGeo(0.25, 0.25, 12, 12), 0x8a95a3, [-10, 6, -9.2]);
    fb.add(cylGeo(0.25, 0.25, 12, 12), 0x8a95a3, [10, 6, -9.2]);
    // workbench
    fb.add(rboxGeo(3.2, 0.25, 1.4, 0.06), 0x8a5a2b, [-4.6, 1.2, -5]);
    for (const x of [-5.9, -3.3]) fb.add(rboxGeo(0.2, 1.2, 0.2, 0.04), 0x5a3a1e, [x, 0.6, -5]);
    fb.add(rboxGeo(0.7, 0.4, 0.5, 0.06), 0xff4d4d, [-5.2, 1.5, -5]);
    fb.add(torusGeo(0.3, 0.1, Math.PI), 0xff3b3b, [-4.1, 1.65, -5], [0, 0, 0]);
    // conveyor in the back
    fb.add(rboxGeo(14, 0.5, 1.2, 0.1), 0x3c4652, [0, 0.9, -8.2]);
    fb.add(rboxGeo(14.2, 0.1, 1.0, 0.03), 0x1b1b22, [0, 1.18, -8.2]);
    const g = fb.build();
    const m = new THREE.Mesh(g, new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonRamp() }));
    m.add(new THREE.Mesh(g, outlineMat(0.04)));
    s.add(m);

    // hero platform
    this.platform = new THREE.Group();
    const plat = new THREE.Mesh(cylGeo(1.6, 1.8, 0.4, 32), toon(0x3a3f6a)); plat.position.y = 0.2; addOutline(plat, 0.05);
    const ring = new THREE.Mesh(torusGeo(1.62, 0.07), basic(0xffd23f)); ring.rotation.x = Math.PI / 2; ring.position.y = 0.41;
    const glow = new THREE.Mesh(new THREE.CircleGeometry(1.5, 32), new THREE.MeshBasicMaterial({ color: 0xff4d4d, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.rotation.x = -Math.PI / 2; glow.position.y = 0.42;
    this.platform.add(plat, ring, glow);
    this.platform.position.set(0, 0, 0);
    s.add(this.platform);

    // giant magnetic coil machine behind the hero
    for (let i = 0; i < 3; i++) {
      const c = new THREE.Mesh(torusGeo(2.6 + i * 0.5, 0.12), basic(i % 2 ? 0x2f7bff : 0xff3b3b));
      c.position.set(0, 3.2, -6.5); c.rotation.x = Math.PI / 2 + 0.2; s.add(c); this.coils.push(c);
    }
    const core = new THREE.Mesh(sphereGeo(1, 20, 16), basic(0xfff1a0)); core.scale.setScalar(0.5); core.position.set(0, 3.2, -6.5); s.add(core); this.coils.push(core);
    const coreGlow = new THREE.Mesh(sphereGeo(1, 20, 16), new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false })); coreGlow.scale.setScalar(1.1); core.add(coreGlow);
    const pillar = new THREE.Mesh(cylGeo(0.5, 0.8, 3, 12), toon(0x3c4652)); pillar.position.set(0, 1.5, -6.5); addOutline(pillar, 0.04); s.add(pillar);

    // tesla coil
    const tc = new THREE.Group(); tc.position.set(4.6, 0, -5.5); s.add(tc);
    const tb = new THREE.Mesh(cylGeo(0.4, 0.6, 2.4, 12), toon(0x6f7c8c)); tb.position.y = 1.2; addOutline(tb, 0.04); tc.add(tb);
    for (let i = 0; i < 4; i++) { const r = new THREE.Mesh(torusGeo(0.42, 0.06), toon(0xc98a4b)); r.rotation.x = Math.PI / 2; r.position.y = 0.6 + i * 0.4; tc.add(r); }
    const top = new THREE.Mesh(torusGeo(0.5, 0.2), toon(0xd8e2ee)); top.rotation.x = Math.PI / 2; top.position.y = 2.6; addOutline(top, 0.04); tc.add(top);
    this.tesla = new THREE.Vector3(4.6, 2.7, -5.5);

    // hanging lamp
    this.lamp = new THREE.Group(); this.lamp.position.set(-2.5, 8, -3); s.add(this.lamp);
    const cord = new THREE.Mesh(cylGeo(0.03, 0.03, 3, 6), basic(0x111111)); cord.position.y = -1.5; this.lamp.add(cord);
    const shade = new THREE.Mesh(coneGeo(0.6, 0.6, 16), toon(0xffd23f)); shade.position.y = -3.1; addOutline(shade, 0.03); this.lamp.add(shade);
    const bulb = new THREE.Mesh(sphereGeo(1, 10, 8), basic(0xfff8d0)); bulb.scale.setScalar(0.18); bulb.position.y = -3.4; this.lamp.add(bulb);

    // floating objects orbiting the coil
    const kinds = ['crate', 'barrel', 'debris', 'heavy', 'cell', 'crate', 'debris', 'barrel'];
    kinds.forEach((k, i) => {
      const mesh = makePropMesh(k, 0.04); mesh.scale.setScalar(0.65);
      s.add(mesh);
      this.floaters.push({ m: mesh, r: 3.4 + (i % 3) * 0.7, a: (i / kinds.length) * Math.PI * 2, y: 2.4 + (i % 4) * 0.7, s: 0.25 + (i % 3) * 0.08, spin: 0.5 + Math.random() });
    });
    // conveyor boxes
    for (let i = 0; i < 5; i++) {
      const b = makePropMesh(i % 2 ? 'crate' : 'heavy', 0.03); b.scale.setScalar(0.6); b.position.set(-7 + i * 3, 1.25, -8.2); s.add(b); this.belt.push(b);
    }
  }

  setHero(id: string, skinTheme: SkinTheme = 'default', anim: 'spawn' | 'select' = 'select') {
    const key = id + ':' + skinTheme;
    if (key === this.heroKey) { this.hero?.play(anim); return; }
    this.heroKey = key;
    if (this.hero) {
      this.fx.burst(0, 1.2, 0, 0xffffff, 24, 6, 0.5, 0.5);
      this.hero.dispose();
    }
    const def = heroById(id);
    this.hero = new HeroRig(def, skinTheme);
    this.hero.root.position.set(0, 0.4, 0);
    this.hero.root.scale.setScalar(1.25);
    this.scene.add(this.hero.root);
    this.hero.play(anim);
    this.fx.ring(0, 0, def.color, 0.3, 3, 0.5, 0.9, 0.45);
    (this.platform.children[2] as THREE.Mesh).material = new THREE.MeshBasicMaterial({ color: def.color, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false });
    const aura = themeById(skinTheme).aura;
    (this.hero as any).aura = aura;
  }

  tapHero() { this.hero?.play('select'); this.fx.burst(0, 2, 0, 0xffd23f, 12, 5, 0.4, 0.5); }
  victory() { this.hero?.play('victory'); }
  setCam(mode: 'home' | 'hero' | 'title' | 'closeup') { this.camMode = mode; if (mode !== 'hero') this.spin = 0; }

  resize(w: number, h: number) { this.aspect = w / h; this.camera.aspect = this.aspect; this.camera.updateProjectionMatrix(); this.fx.setViewport(h); }

  update(dt: number) {
    this.t += dt;
    const t = this.t;
    // camera framing (portrait: hero in the lower-middle third)
    const narrow = this.aspect < 0.6 ? 1 : 0.8;
    const targets = {
      title: { p: new THREE.Vector3(Math.sin(t * 0.15) * 1.5, 3.4, 13 * narrow), l: new THREE.Vector3(0, 3.2, -2) },
      home: { p: new THREE.Vector3(Math.sin(t * 0.2) * 0.4, 3.0, 14 * narrow), l: new THREE.Vector3(0, 2.0, 0) },
      hero: { p: new THREE.Vector3(0, 3.2, 22 * narrow), l: new THREE.Vector3(0, -1.4, 0) },
      closeup: { p: new THREE.Vector3(0, 1.8, 9.5), l: new THREE.Vector3(0, 1.55, 0) },
    }[this.camMode];
    const k = 1 - Math.exp(-3 * dt);
    this.camPos.lerp(targets.p, k); this.camLook.lerp(targets.l, k);
    this.camera.position.copy(this.camPos); this.camera.lookAt(this.camLook);

    // living workshop
    this.coils.forEach((c, i) => { if (i < 3) { c.rotation.z += dt * (0.4 + i * 0.3) * (i % 2 ? -1 : 1); c.rotation.x = Math.PI / 2 + 0.2 + Math.sin(t * 0.7 + i) * 0.1; } else c.scale.setScalar(0.5 + Math.sin(t * 4) * 0.05); });
    for (const f of this.floaters) {
      f.a += dt * f.s;
      f.m.position.set(Math.cos(f.a) * f.r, f.y + Math.sin(t * 1.3 + f.a * 3) * 0.3, -6.5 + Math.sin(f.a) * f.r * 0.5);
      f.m.rotation.y += dt * f.spin; f.m.rotation.x += dt * f.spin * 0.5;
      if (Math.random() < 0.01) this.fx.stream(f.m.position.x, f.m.position.y, f.m.position.z, 0, -6.5, 0xff8080, 3, 0.15);
    }
    for (const b of this.belt) { b.position.x += dt * 1.2; if (b.position.x > 7.5) b.position.x = -7.5; }
    this.lamp.rotation.z = Math.sin(t * 0.9) * 0.08;
    if (Math.random() < dt * 1.3) {
      const a = Math.random() * Math.PI * 2;
      this.fx.lightning(this.tesla.x, this.tesla.y, this.tesla.z, this.tesla.x + Math.cos(a) * 1.6, this.tesla.y + 0.5 - Math.random() * 1.4, this.tesla.z + Math.sin(a) * 1.2, 0xbff8ff, 0.05);
      this.fx.burst(this.tesla.x, this.tesla.y, this.tesla.z, 0xbff8ff, 4, 3, 0.2, 0.3, { grav: 0 });
    }
    if (Math.random() < dt * 4) this.fx.glow.spawn((Math.random() - 0.5) * 14, 0.2, -2 - Math.random() * 6, (Math.random() - 0.5) * 0.4, 0.4 + Math.random() * 0.5, 0, new THREE.Color(0xffd23f), 0.7, 0.12, 3, -0.05, 0.2);
    // hero
    if (this.hero) {
      this.hero.field = this.camMode === 'home' || this.camMode === 'title' ? Math.max(0, Math.sin(t * 0.6)) * 0.35 : 0;
      this.hero.polarity = Math.sin(t * 0.5) > 0 ? 1 : -1;
      this.hero.root.rotation.y = damp(this.hero.root.rotation.y, this.spin + (this.camMode === 'home' ? Math.sin(t * 0.4) * 0.15 : 0), 6, dt);
      this.hero.update(dt);
      const aura = (this.hero as any).aura as string;
      if (aura && aura !== 'none' && Math.random() < 0.4) {
        const col = { fire: 0xff7a1f, snow: 0xe8f8ff, stars: 0xff9df5, sparks: 0xffd23f, wisps: 0xbfe3ff, bolts: 0x31f5ff }[aura] ?? 0xffffff;
        const a = Math.random() * Math.PI * 2;
        this.fx.glow.spawn(Math.cos(a) * 0.7, 0.6 + Math.random() * 1.8, Math.sin(a) * 0.7, 0, aura === 'snow' ? -0.4 : 1, 0, new THREE.Color(col), 0.9, 0.2, 0.7, 0, 1);
      }
    }
    this.fx.update(dt);
  }
}
