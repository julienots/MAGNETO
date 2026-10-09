import * as THREE from 'three';
import { damp, clamp } from '../core/math';
import { HW } from './arena';

/** Portrait follow camera: tilted top-down, keeps the arena width readable, trauma-based shake. */
export class CameraRig {
  cam: THREE.PerspectiveCamera;
  target = new THREE.Vector3();
  private pos = new THREE.Vector3();
  private look = new THREE.Vector3();
  trauma = 0;
  shakeEnabled = true;
  zoom = 1;        // >1 = closer
  zoomTarget = 1;
  pitch = 0.92;    // radians from horizontal
  /** extra framing offset (boss fights look further north) */
  northBias = 0;
  private t = 0;
  visibleWidth = 9.8;
  kickAmt = 0;

  constructor(aspect: number) {
    this.cam = new THREE.PerspectiveCamera(42, aspect, 0.5, 150);
  }
  resize(aspect: number) { this.cam.aspect = aspect; this.cam.updateProjectionMatrix(); }
  shake(amount: number) { if (this.shakeEnabled) this.trauma = Math.min(1, this.trauma + amount); }
  kick(a: number) { this.kickAmt = Math.min(1.5, this.kickAmt + a); }

  /** distance needed so `visibleWidth` fits horizontally at the target depth */
  private distance() {
    const vf = THREE.MathUtils.degToRad(this.cam.fov);
    const hf = 2 * Math.atan(Math.tan(vf / 2) * this.cam.aspect);
    return (this.visibleWidth / 2) / Math.tan(hf / 2) / this.zoom;
  }

  snap() { this.update(1, true); }

  update(dt: number, snap = false) {
    this.t += dt;
    this.zoom = damp(this.zoom, this.zoomTarget, 3, dt);
    this.kickAmt = damp(this.kickAmt, 0, 8, dt);
    const d = this.distance() * (1 - this.kickAmt * 0.04);
    // follow x partially so the whole width stays reachable
    const halfVis = this.visibleWidth / 2 / this.zoom;
    const maxX = Math.max(0, HW + 0.6 - halfVis);
    const fx = clamp(this.target.x * 0.7, -maxX, maxX);
    const fz = this.target.z - 2.2 - this.northBias;
    const lx = fx, lz = fz;
    const px = lx, py = Math.sin(this.pitch) * d, pz = lz + Math.cos(this.pitch) * d;
    const k = snap ? 1 : 1 - Math.exp(-6 * dt);
    this.pos.x += (px - this.pos.x) * k; this.pos.y += (py - this.pos.y) * k; this.pos.z += (pz - this.pos.z) * k;
    this.look.x += (lx - this.look.x) * k; this.look.y = 0; this.look.z += (lz - this.look.z) * k;
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    const s = this.trauma * this.trauma;
    const n = (f: number, o: number) => Math.sin(this.t * f + o) * 0.5 + Math.sin(this.t * f * 2.3 + o * 1.7) * 0.5;
    this.cam.position.set(this.pos.x + n(37, 1) * s * 0.9, this.pos.y + n(41, 2) * s * 0.6, this.pos.z + n(29, 3) * s * 0.5);
    this.cam.lookAt(this.look.x, this.look.y, this.look.z);
    this.cam.rotation.z += n(23, 4) * s * 0.04;
  }

  /** world → screen px */
  project(x: number, y: number, z: number, w: number, h: number, out: { x: number; y: number; visible: boolean }) {
    const v = _v.set(x, y, z).project(this.cam);
    out.x = (v.x * 0.5 + 0.5) * w; out.y = (-v.y * 0.5 + 0.5) * h; out.visible = v.z < 1;
    return out;
  }
  /** screen → ground plane (y=0) */
  unproject(sx: number, sy: number, w: number, h: number, out = new THREE.Vector3()) {
    _v.set((sx / w) * 2 - 1, -(sy / h) * 2 + 1, 0.5).unproject(this.cam);
    _v.sub(this.cam.position).normalize();
    const t = -this.cam.position.y / _v.y;
    return out.copy(this.cam.position).addScaledVector(_v, t);
  }
}
const _v = new THREE.Vector3();
