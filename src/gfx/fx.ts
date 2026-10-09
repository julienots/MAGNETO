import * as THREE from 'three';
import { toonRamp, rboxGeo } from './toon';

/* ============ GPU-light particle system (one draw call per blend mode) ============ */
class ParticleSystem {
  max: number;
  count = 0;
  pos: Float32Array; vel: Float32Array; col: Float32Array; size: Float32Array; life: Float32Array; maxLife: Float32Array; grav: Float32Array; drag: Float32Array; size0: Float32Array; grow: Float32Array; a0: Float32Array;
  geo = new THREE.BufferGeometry();
  points: THREE.Points;
  private aPos: THREE.BufferAttribute; private aCol: THREE.BufferAttribute; private aSize: THREE.BufferAttribute;
  constructor(max: number, additive: boolean, public scale = 1) {
    this.max = max;
    this.pos = new Float32Array(max * 3); this.vel = new Float32Array(max * 3); this.col = new Float32Array(max * 4);
    this.size = new Float32Array(max); this.life = new Float32Array(max); this.maxLife = new Float32Array(max);
    this.grav = new Float32Array(max); this.drag = new Float32Array(max); this.size0 = new Float32Array(max); this.grow = new Float32Array(max); this.a0 = new Float32Array(max);
    this.aPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('position', this.aPos);
    this.geo.setAttribute('color', this.aCol);
    this.geo.setAttribute('size', this.aSize);
    this.geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    const mat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 300 } },
      vertexShader: `
        attribute float size; attribute vec4 color; varying vec4 vC; uniform float uScale;
        void main(){ vC = color; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = size * uScale / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: additive
        ? `varying vec4 vC; void main(){ vec2 c = gl_PointCoord - 0.5; float d = length(c); float a = smoothstep(0.5, 0.0, d); a *= a; gl_FragColor = vec4(vC.rgb * (1.0 + (1.0-d*2.0)), vC.a * a); }`
        : `varying vec4 vC; void main(){ vec2 c = gl_PointCoord - 0.5; float d = length(c); if(d>0.5) discard; float a = smoothstep(0.5, 0.35, d); gl_FragColor = vec4(vC.rgb, vC.a * a); }`,
      transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(this.geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 10 : 5;
  }
  setScale(h: number) { (this.points.material as THREE.ShaderMaterial).uniforms.uScale.value = h * 0.9 * this.scale; }
  spawn(x: number, y: number, z: number, vx: number, vy: number, vz: number, c: THREE.Color, a: number, size: number, life: number, grav = 0, drag = 1, grow = 0) {
    let i = this.count;
    if (i >= this.max) { i = (Math.random() * this.max) | 0; } else this.count++;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.col[i * 4] = c.r; this.col[i * 4 + 1] = c.g; this.col[i * 4 + 2] = c.b; this.col[i * 4 + 3] = a; this.a0[i] = a;
    this.size[i] = size; this.size0[i] = size; this.life[i] = life; this.maxLife[i] = life; this.grav[i] = grav; this.drag[i] = drag; this.grow[i] = grow;
  }
  update(dt: number) {
    let n = this.count;
    for (let i = 0; i < n; i++) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        // swap-remove
        n--;
        if (i !== n) {
          this.pos.copyWithin(i * 3, n * 3, n * 3 + 3); this.vel.copyWithin(i * 3, n * 3, n * 3 + 3); this.col.copyWithin(i * 4, n * 4, n * 4 + 4);
          this.size[i] = this.size[n]; this.size0[i] = this.size0[n]; this.life[i] = this.life[n]; this.maxLife[i] = this.maxLife[n]; this.grav[i] = this.grav[n]; this.drag[i] = this.drag[n]; this.grow[i] = this.grow[n]; this.a0[i] = this.a0[n];
          i--;
        }
        continue;
      }
      const k = Math.exp(-this.drag[i] * dt);
      this.vel[i * 3] *= k; this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * k - this.grav[i] * dt; this.vel[i * 3 + 2] *= k;
      this.pos[i * 3] += this.vel[i * 3] * dt; this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt; this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      if (this.pos[i * 3 + 1] < 0.02) { this.pos[i * 3 + 1] = 0.02; this.vel[i * 3 + 1] *= -0.4; }
      const t = this.life[i] / this.maxLife[i];
      this.size[i] = this.size0[i] * (this.grow[i] ? 1 + (1 - t) * this.grow[i] : Math.min(1, t * 3));
      this.col[i * 4 + 3] = this.a0[i] * Math.min(1, t * 2.2);
    }
    this.count = n;
    this.geo.setDrawRange(0, n);
    this.aPos.needsUpdate = this.aCol.needsUpdate = this.aSize.needsUpdate = true;
  }
  clear() { this.count = 0; this.geo.setDrawRange(0, 0); }
}

/* ============ instanced debris chunks ============ */
class Debris {
  mesh: THREE.InstancedMesh;
  max = 220; n = 0;
  p = new Float32Array(this.max * 3); v = new Float32Array(this.max * 3); r = new Float32Array(this.max * 3); rv = new Float32Array(this.max * 3); s = new Float32Array(this.max); life = new Float32Array(this.max);
  private m = new THREE.Matrix4(); private q = new THREE.Quaternion(); private e = new THREE.Euler(); private vs = new THREE.Vector3(); private vp = new THREE.Vector3(); private c = new THREE.Color();
  constructor() {
    this.mesh = new THREE.InstancedMesh(rboxGeo(1, 1, 1, 0.15), new THREE.MeshToonMaterial({ gradientMap: toonRamp() }), this.max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0; this.mesh.frustumCulled = false;
    for (let i = 0; i < this.max; i++) this.mesh.setColorAt(i, this.c.set(0xffffff));
  }
  spawn(x: number, y: number, z: number, vx: number, vy: number, vz: number, color: number, size: number, life = 1.6) {
    let i = this.n; if (i >= this.max) i = (Math.random() * this.max) | 0; else this.n++;
    this.p.set([x, y, z], i * 3); this.v.set([vx, vy, vz], i * 3);
    this.r.set([Math.random() * 6, Math.random() * 6, Math.random() * 6], i * 3);
    this.rv.set([(Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20], i * 3);
    this.s[i] = size; this.life[i] = life;
    this.mesh.setColorAt(i, this.c.setHex(color));
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
  update(dt: number) {
    let n = this.n;
    for (let i = 0; i < n; i++) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        n--;
        if (i !== n) {
          this.p.copyWithin(i * 3, n * 3, n * 3 + 3); this.v.copyWithin(i * 3, n * 3, n * 3 + 3); this.r.copyWithin(i * 3, n * 3, n * 3 + 3); this.rv.copyWithin(i * 3, n * 3, n * 3 + 3);
          this.s[i] = this.s[n]; this.life[i] = this.life[n];
          this.mesh.getColorAt(n, this.c); this.mesh.setColorAt(i, this.c);
          i--;
        }
        continue;
      }
      this.v[i * 3 + 1] -= 28 * dt;
      for (let k = 0; k < 3; k++) { this.p[i * 3 + k] += this.v[i * 3 + k] * dt; this.r[i * 3 + k] += this.rv[i * 3 + k] * dt; }
      const sz = this.s[i];
      if (this.p[i * 3 + 1] < sz * 0.5) { this.p[i * 3 + 1] = sz * 0.5; this.v[i * 3 + 1] *= -0.35; this.v[i * 3] *= 0.7; this.v[i * 3 + 2] *= 0.7; this.rv[i * 3] *= 0.6; this.rv[i * 3 + 2] *= 0.6; }
      const sc = sz * Math.min(1, this.life[i] * 2.5);
      this.e.set(this.r[i * 3], this.r[i * 3 + 1], this.r[i * 3 + 2]);
      this.m.compose(this.vp.set(this.p[i * 3], this.p[i * 3 + 1], this.p[i * 3 + 2]), this.q.setFromEuler(this.e), this.vs.set(sc, sc, sc));
      this.mesh.setMatrixAt(i, this.m);
    }
    this.n = n; this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
  clear() { this.n = 0; this.mesh.count = 0; }
}

/* ============ pooled one-shot meshes (rings, flashes, lightning) ============ */
interface Shot { mesh: THREE.Mesh; t: number; dur: number; s0: number; s1: number; a0: number; active: boolean; follow?: THREE.Vector3 }
class ShotPool {
  items: Shot[] = [];
  constructor(make: () => THREE.Mesh, n: number, parent: THREE.Object3D) {
    for (let i = 0; i < n; i++) { const m = make(); m.visible = false; parent.add(m); this.items.push({ mesh: m, t: 0, dur: 1, s0: 1, s1: 2, a0: 1, active: false }); }
  }
  get() { const it = this.items.find((i) => !i.active) ?? this.items.reduce((a, b) => (a.t / a.dur > b.t / b.dur ? a : b)); it.active = true; it.t = 0; it.mesh.visible = true; return it; }
  update(dt: number, ease = (k: number) => 1 - Math.pow(1 - k, 3)) {
    for (const it of this.items) {
      if (!it.active) continue;
      it.t += dt;
      const k = Math.min(1, it.t / it.dur);
      const s = it.s0 + (it.s1 - it.s0) * ease(k);
      it.mesh.scale.set(s, s, s);
      (it.mesh.material as THREE.MeshBasicMaterial).opacity = it.a0 * (1 - k);
      if (k >= 1) { it.active = false; it.mesh.visible = false; }
    }
  }
  clear() { for (const it of this.items) { it.active = false; it.mesh.visible = false; } }
}

export class FX {
  group = new THREE.Group();
  glow = new ParticleSystem(1800, true);
  dust = new ParticleSystem(900, false, 1);
  debris = new Debris();
  rings: ShotPool;
  flashes: ShotPool;
  bolts: { mesh: THREE.Mesh; t: number; active: boolean; geo: THREE.BufferGeometry }[] = [];
  quality = 1; // 0.5 low .. 1 high
  private c = new THREE.Color();

  constructor() {
    this.group.add(this.glow.points, this.dust.points, this.debris.mesh);
    this.rings = new ShotPool(() => {
      const m = new THREE.Mesh(new THREE.RingGeometry(0.82, 1, 48), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      m.rotation.x = -Math.PI / 2; m.renderOrder = 8; return m;
    }, 28, this.group);
    this.flashes = new ShotPool(() => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      m.renderOrder = 9; return m;
    }, 14, this.group);
    for (let i = 0; i < 14; i++) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(20 * 2 * 3), 3));
      const idx: number[] = []; for (let k = 0; k < 19; k++) { const a = k * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      geo.setIndex(idx);
      const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xbff8ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      mesh.frustumCulled = false; mesh.visible = false; mesh.renderOrder = 11;
      this.group.add(mesh);
      this.bolts.push({ mesh, t: 0, active: false, geo });
    }
  }

  setViewport(h: number) { this.glow.setScale(h); this.dust.setScale(h); }

  private q(n: number) { return Math.max(1, Math.round(n * this.quality)); }

  burst(x: number, y: number, z: number, color: number, n = 12, speed = 6, size = 0.5, life = 0.5, opts: { up?: number; grav?: number; drag?: number; additive?: boolean; spread?: number; dirX?: number; dirZ?: number } = {}) {
    const sys = opts.additive === false ? this.dust : this.glow;
    this.c.setHex(color);
    for (let i = 0, N = this.q(n); i < N; i++) {
      let vx: number, vz: number;
      if (opts.dirX !== undefined) {
        const sp = opts.spread ?? 0.6; const a = Math.atan2(opts.dirZ!, opts.dirX) + (Math.random() - 0.5) * sp * 2;
        const s = speed * (0.4 + Math.random() * 0.8); vx = Math.cos(a) * s; vz = Math.sin(a) * s;
      } else {
        const a = Math.random() * Math.PI * 2; const s = speed * (0.3 + Math.random() * 0.9); vx = Math.cos(a) * s; vz = Math.sin(a) * s;
      }
      sys.spawn(x, y, z, vx, (opts.up ?? speed * 0.6) * (0.3 + Math.random()), vz, this.c, 1, size * (0.6 + Math.random() * 0.8), life * (0.6 + Math.random() * 0.8), opts.grav ?? 12, opts.drag ?? 2.5);
    }
  }
  smoke(x: number, y: number, z: number, n = 6, color = 0x3a3a44, size = 1.2) {
    this.c.setHex(color);
    for (let i = 0, N = this.q(n); i < N; i++) {
      const a = Math.random() * Math.PI * 2, s = 1 + Math.random() * 2.5;
      this.dust.spawn(x + Math.cos(a) * 0.3, y, z + Math.sin(a) * 0.3, Math.cos(a) * s, 1 + Math.random() * 2, Math.sin(a) * s, this.c, 0.55, size * (0.6 + Math.random() * 0.6), 0.9 + Math.random() * 0.6, -0.6, 2, 1.8);
    }
  }
  trail(x: number, y: number, z: number, color: number, size = 0.35, life = 0.3) {
    this.c.setHex(color);
    this.glow.spawn(x, y, z, (Math.random() - 0.5) * 0.6, 0.3, (Math.random() - 0.5) * 0.6, this.c, 0.8, size, life, 0, 2);
  }
  /** Particle drawn toward a target (magnet streams). */
  stream(x: number, y: number, z: number, tx: number, tz: number, color: number, speed: number, size = 0.18) {
    this.c.setHex(color);
    const dx = tx - x, dz = tz - z, d = Math.sqrt(dx * dx + dz * dz) || 1;
    this.glow.spawn(x, y, z, (dx / d) * speed, 0, (dz / d) * speed, this.c, 0.9, size, Math.min(0.6, d / speed), 0, 0);
  }
  chunks(x: number, y: number, z: number, color: number, n = 8, speed = 7, size = 0.22) {
    for (let i = 0, N = this.q(n); i < N; i++) {
      const a = Math.random() * Math.PI * 2, s = speed * (0.4 + Math.random() * 0.8);
      this.debris.spawn(x, y, z, Math.cos(a) * s, 4 + Math.random() * speed, Math.sin(a) * s, color, size * (0.6 + Math.random() * 0.9));
    }
  }
  ring(x: number, z: number, color: number, r0 = 0.4, r1 = 4, dur = 0.45, alpha = 0.9, y = 0.08) {
    const it = this.rings.get();
    it.mesh.position.set(x, y, z); it.s0 = r0; it.s1 = r1; it.dur = dur; it.a0 = alpha;
    (it.mesh.material as THREE.MeshBasicMaterial).color.setHex(color);
    it.mesh.scale.setScalar(r0);
  }
  flash(x: number, y: number, z: number, color: number, r0 = 0.5, r1 = 3, dur = 0.25, alpha = 0.9) {
    const it = this.flashes.get();
    it.mesh.position.set(x, y, z); it.s0 = r0; it.s1 = r1; it.dur = dur; it.a0 = alpha;
    (it.mesh.material as THREE.MeshBasicMaterial).color.setHex(color);
    it.mesh.scale.setScalar(r0);
  }
  /** Jagged electric ribbon between two points. */
  lightning(ax: number, ay: number, az: number, bx: number, by: number, bz: number, color = 0xbff8ff, width = 0.18) {
    const b = this.bolts.find((x) => !x.active) ?? this.bolts[0];
    b.active = true; b.t = 0; b.mesh.visible = true;
    (b.mesh.material as THREE.MeshBasicMaterial).color.setHex(color);
    const pos = b.geo.attributes.position as THREE.BufferAttribute;
    const dx = bx - ax, dz = bz - az; const d = Math.sqrt(dx * dx + dz * dz) || 1; const px = -dz / d, pz = dx / d;
    for (let i = 0; i < 20; i++) {
      const k = i / 19;
      const j = i === 0 || i === 19 ? 0 : (Math.random() - 0.5) * Math.min(1.2, d * 0.25);
      const x = ax + dx * k + px * j, z = az + dz * k + pz * j, y = ay + (by - ay) * k + Math.sin(k * Math.PI) * 0.3;
      const w = width * (1 - Math.abs(k - 0.5));
      pos.setXYZ(i * 2, x - px * w, y, z - pz * w);
      pos.setXYZ(i * 2 + 1, x + px * w, y + 0.05, z + pz * w);
    }
    pos.needsUpdate = true;
  }

  update(dt: number) {
    this.glow.update(dt); this.dust.update(dt); this.debris.update(dt);
    this.rings.update(dt); this.flashes.update(dt, (k) => 1 - Math.pow(1 - k, 4));
    for (const b of this.bolts) {
      if (!b.active) continue;
      b.t += dt;
      (b.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - b.t / 0.18) * (Math.random() > 0.3 ? 1 : 0.4);
      if (b.t > 0.18) { b.active = false; b.mesh.visible = false; }
    }
  }
  clear() { this.glow.clear(); this.dust.clear(); this.debris.clear(); this.rings.clear(); this.flashes.clear(); for (const b of this.bolts) { b.active = false; b.mesh.visible = false; } }
}
