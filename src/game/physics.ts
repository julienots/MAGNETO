/**
 * Arcade 2D physics on the XZ ground plane (+ cosmetic height for juggling arcs).
 * Circles vs circles, circles vs axis-aligned rects, spatial hash broadphase.
 * Every magnetic body carries mass, polarity, force susceptibility, resistance,
 * friction, restitution and destructibility.
 */
export type BodyKind = 'player' | 'enemy' | 'prop' | 'boss' | 'target';

export class Body {
  static nextId = 1;
  id = Body.nextId++;
  x = 0; z = 0; vx = 0; vz = 0;
  y = 0; vy = 0; // visual height
  r = 0.5;
  mass = 1;
  invMass = 1;
  restitution = 0.45;
  /** linear damping per second (scaled by world friction) */
  drag = 3.5;
  /** 0..1 how strongly the magnet affects it */
  magnetic = 1;
  /** 0 neutral metal, ±1 charged */
  charge: 0 | 1 | -1 = 0;
  /** 0..1 resistance to magnetic force */
  resist = 0;
  isStatic = false;
  /** no collisions at all (phasing, falling in pits) */
  ghost = false;
  /** collide only with walls (held objects, etc.) */
  wallOnly = false;
  alive = true;
  kind: BodyKind = 'prop';
  owner: any = null;
  // gameplay
  thrown = 0;            // seconds of "projectile" status remaining
  chain = 0;             // chain id this body belongs to
  held = false;
  frozen = 0;
  portalCd = 0;
  lastSafeX = 0; lastSafeZ = 0;
  setMass(m: number) { this.mass = m; this.invMass = m > 0 && !this.isStatic ? 1 / m : 0; return this; }
  get speed() { return Math.sqrt(this.vx * this.vx + this.vz * this.vz); }
}

export interface Rect { x0: number; z0: number; x1: number; z1: number; tag?: string; bouncy?: number }

export type CollideFn = (a: Body, b: Body | null, impact: number, nx: number, nz: number, wall?: Rect) => void;

export class PhysicsWorld {
  bodies: Body[] = [];
  walls: Rect[] = [];
  friction = 1;
  gravity = 30;
  /** global drift force (flip gravity mechanic) */
  driftX = 0; driftZ = 0;
  onCollide: CollideFn | null = null;
  private cell = 2;
  private grid = new Map<number, Body[]>();
  private pairs = new Set<number>();
  maxSpeed = 40;

  add(b: Body) { this.bodies.push(b); return b; }
  remove(b: Body) { b.alive = false; }
  addWall(x0: number, z0: number, x1: number, z1: number, tag?: string) { const w = { x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1), tag }; this.walls.push(w); return w; }

  step(dt: number) {
    // purge dead
    if (this.bodies.some((b) => !b.alive)) this.bodies = this.bodies.filter((b) => b.alive);
    const sub = 2; const h = dt / sub;
    for (let s = 0; s < sub; s++) {
      this.integrate(h);
      this.broadphase();
      this.collideBodies();
      this.collideWalls();
    }
  }

  private integrate(dt: number) {
    for (const b of this.bodies) {
      if (b.isStatic) continue;
      if (b.frozen > 0) { b.vx *= 0.8; b.vz *= 0.8; }
      if (!b.held) { b.vx += this.driftX * dt; b.vz += this.driftZ * dt; }
      const damp = Math.exp(-b.drag * this.friction * dt * (b.y > 0.05 ? 0.15 : 1));
      b.vx *= damp; b.vz *= damp;
      const sp = b.speed;
      if (sp > this.maxSpeed) { const k = this.maxSpeed / sp; b.vx *= k; b.vz *= k; }
      b.x += b.vx * dt; b.z += b.vz * dt;
      // cosmetic height
      if (!b.held) {
        if (b.y > 0 || b.vy > 0) {
          b.vy -= this.gravity * dt; b.y += b.vy * dt;
          if (b.y <= 0) { b.y = 0; b.vy = b.vy < -6 ? -b.vy * 0.35 : 0; }
        }
      }
      if (b.thrown > 0) b.thrown -= dt;
      if (b.portalCd > 0) b.portalCd -= dt;
    }
  }

  private key(ix: number, iz: number) { return (ix + 512) * 4096 + (iz + 512); }
  private broadphase() {
    this.grid.clear();
    const c = this.cell;
    for (const b of this.bodies) {
      if (b.ghost || b.wallOnly) continue;
      const x0 = Math.floor((b.x - b.r) / c), x1 = Math.floor((b.x + b.r) / c);
      const z0 = Math.floor((b.z - b.r) / c), z1 = Math.floor((b.z + b.r) / c);
      for (let ix = x0; ix <= x1; ix++) for (let iz = z0; iz <= z1; iz++) {
        const k = this.key(ix, iz);
        let arr = this.grid.get(k);
        if (!arr) { arr = []; this.grid.set(k, arr); }
        arr.push(b);
      }
    }
  }

  private collideBodies() {
    this.pairs.clear();
    for (const arr of this.grid.values()) {
      for (let i = 0; i < arr.length; i++) for (let j = i + 1; j < arr.length; j++) {
        const a = arr[i], b = arr[j];
        const pk = a.id < b.id ? a.id * 100003 + b.id : b.id * 100003 + a.id;
        if (this.pairs.has(pk)) continue;
        this.pairs.add(pk);
        this.resolve(a, b);
      }
    }
  }

  private resolve(a: Body, b: Body) {
    if (a.isStatic && b.isStatic) return;
    // held objects don't collide with the player holding them
    if ((a.held && b.kind === 'player') || (b.held && a.kind === 'player')) return;
    if (a.held && b.held) return;
    const dx = b.x - a.x, dz = b.z - a.z;
    const rr = a.r + b.r;
    const d2 = dx * dx + dz * dz;
    if (d2 >= rr * rr || d2 < 1e-9) return;
    // airborne bodies fly over small ones
    if (Math.abs(a.y - b.y) > rr * 1.2) return;
    const d = Math.sqrt(d2);
    const nx = dx / d, nz = dz / d;
    const pen = rr - d;
    const im = a.invMass + b.invMass;
    if (im === 0) return;
    // positional correction
    const corr = pen / im;
    a.x -= nx * corr * a.invMass; a.z -= nz * corr * a.invMass;
    b.x += nx * corr * b.invMass; b.z += nz * corr * b.invMass;
    // impulse
    const rvx = b.vx - a.vx, rvz = b.vz - a.vz;
    const vn = rvx * nx + rvz * nz;
    if (vn > 0) return;
    const e = Math.min(a.restitution, b.restitution);
    const j = (-(1 + e) * vn) / im;
    a.vx -= j * nx * a.invMass; a.vz -= j * nz * a.invMass;
    b.vx += j * nx * b.invMass; b.vz += j * nz * b.invMass;
    this.onCollide?.(a, b, -vn, nx, nz);
  }

  private collideWalls() {
    for (const b of this.bodies) {
      if (b.isStatic || b.ghost) continue;
      for (const w of this.walls) {
        const cx = Math.max(w.x0, Math.min(b.x, w.x1));
        const cz = Math.max(w.z0, Math.min(b.z, w.z1));
        let dx = b.x - cx, dz = b.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 > b.r * b.r) continue;
        let nx: number, nz: number, pen: number;
        if (d2 > 1e-9) {
          const d = Math.sqrt(d2); nx = dx / d; nz = dz / d; pen = b.r - d;
        } else {
          // center inside rect: push out along smallest axis
          const l = b.x - w.x0, r = w.x1 - b.x, t = b.z - w.z0, bt = w.z1 - b.z;
          const m = Math.min(l, r, t, bt);
          if (m === l) { nx = -1; nz = 0; pen = l + b.r; } else if (m === r) { nx = 1; nz = 0; pen = r + b.r; } else if (m === t) { nx = 0; nz = -1; pen = t + b.r; } else { nx = 0; nz = 1; pen = bt + b.r; }
        }
        b.x += nx * pen; b.z += nz * pen;
        const vn = b.vx * nx + b.vz * nz;
        if (vn < 0) {
          const e = w.bouncy ?? b.restitution;
          b.vx -= (1 + e) * vn * nx; b.vz -= (1 + e) * vn * nz;
          this.onCollide?.(b, null, -vn, nx, nz, w);
        }
      }
    }
  }

  /** Query bodies within radius (linear scan; bodies count stays < 150). */
  query(x: number, z: number, r: number, out: Body[] = []) {
    out.length = 0;
    for (const b of this.bodies) {
      if (!b.alive) continue;
      const dx = b.x - x, dz = b.z - z, rr = r + b.r;
      if (dx * dx + dz * dz < rr * rr) out.push(b);
    }
    return out;
  }

  /** Is the point inside any wall? */
  blocked(x: number, z: number, r = 0) {
    for (const w of this.walls) if (x + r > w.x0 && x - r < w.x1 && z + r > w.z0 && z - r < w.z1) return true;
    return false;
  }
}
