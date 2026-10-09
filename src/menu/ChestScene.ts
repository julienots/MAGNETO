import * as THREE from 'three';
import type { View } from '../core/Game';
import { chestById, type ChestId } from '../data/chests';
import { FX } from '../gfx/fx';
import { disposeTree, rboxGeo, toonRamp, addOutline, torusGeo, sphereGeo, cylGeo, basic, shade } from '../gfx/toon';
import { audio } from '../audio/Audio';
import { haptics } from '../platform/Haptics';
import { RARITY_COLORS } from '../data/types';

/** Dramatic chest opening: anticipation (light, shakes) → burst → reveal. */
export class ChestScene implements View {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(40, 0.5, 0.1, 100);
  fx = new FX();
  private chest = new THREE.Group();
  private lid = new THREE.Group();
  private rays = new THREE.Group();
  private glow: THREE.Mesh;
  private t = 0;
  private shake = 0;
  private charge = 0;
  opened = false;
  private openT = 0;
  taps = 0;
  needed = 1;
  private color = new THREE.Color();
  private dropY = 6;
  private rarityIdx = 0;

  constructor(public id: ChestId) {
    const def = chestById(id);
    this.needed = def.taps;
    this.rarityIdx = ['common', 'rare', 'epic', 'legendary', 'mythic'].indexOf(def.rarity);
    this.color.set(RARITY_COLORS[def.rarity]);
    const s = this.scene;
    s.background = new THREE.Color(0x0b0d1f);
    s.add(new THREE.HemisphereLight(0xffffff, 0x303060, 1.8));
    const d = new THREE.DirectionalLight(0xffffff, 2); d.position.set(2, 6, 5); s.add(d);
    // backdrop radial gradient
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const x = c.getContext('2d')!;
    const gr = x.createRadialGradient(128, 128, 10, 128, 128, 128);
    gr.addColorStop(0, '#' + this.color.getHexString()); gr.addColorStop(0.4, 'rgba(40,30,90,0.6)'); gr.addColorStop(1, 'rgba(10,12,30,0)');
    x.fillStyle = gr; x.fillRect(0, 0, 256, 256);
    const bg = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
    bg.position.set(0, 2, -8); s.add(bg);
    // rays
    for (let i = 0; i < 12; i++) {
      const ray = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 14), new THREE.MeshBasicMaterial({ color: def.glow, transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      ray.position.y = 7; ray.rotation.z = (i / 12) * Math.PI * 2; ray.geometry.translate(0, 0, 0);
      const holder = new THREE.Group(); holder.rotation.z = (i / 12) * Math.PI * 2; ray.rotation.z = 0; ray.position.set(0, 7, 0); holder.add(ray);
      this.rays.add(holder);
    }
    this.rays.position.set(0, 1.4, -1);
    s.add(this.rays);
    // chest model
    const mat = (col: number) => new THREE.MeshToonMaterial({ color: col, gradientMap: toonRamp(), side: THREE.DoubleSide });
    const body = new THREE.Mesh(rboxGeo(2.4, 1.4, 1.6, 0.18), mat(def.color)); body.position.y = 0.7; addOutline(body, 0.05); this.chest.add(body);
    for (const xx of [-0.9, 0.9]) { const band = new THREE.Mesh(rboxGeo(0.25, 1.45, 1.65, 0.06), mat(def.trim)); band.position.set(xx, 0.7, 0); this.chest.add(band); }
    const lock = new THREE.Mesh(rboxGeo(0.45, 0.55, 0.15, 0.08), mat(0xffd23f)); lock.position.set(0, 1.0, 0.82); addOutline(lock, 0.03); this.chest.add(lock);
    this.lid.position.set(0, 1.4, -0.8);
    const lidMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 2.4, 20, 1, false, 0, Math.PI), mat(shade(def.color, 0.1)));
    lidMesh.rotation.z = Math.PI / 2; lidMesh.rotation.y = 0; lidMesh.position.set(0, 0, 0.8); addOutline(lidMesh, 0.05);
    this.lid.add(lidMesh);
    for (const xx of [-0.9, 0.9]) { const band = new THREE.Mesh(new THREE.CylinderGeometry(0.83, 0.83, 0.25, 20, 1, false, 0, Math.PI), mat(def.trim)); band.rotation.z = Math.PI / 2; band.position.set(xx, 0, 0.8); this.lid.add(band); }
    const gem = new THREE.Mesh(sphereGeo(1, 12, 10), basic(def.glow)); gem.scale.setScalar(0.22); gem.position.set(0, 0.75, 0.8); this.lid.add(gem);
    this.chest.add(this.lid);
    if (id === 'cosmic' || id === 'mythic') { const halo = new THREE.Mesh(torusGeo(1.8, 0.05), basic(def.glow)); halo.rotation.x = Math.PI / 2; halo.position.y = 0.1; this.chest.add(halo); }
    const ped = new THREE.Mesh(cylGeo(2, 2.3, 0.4, 32), mat(0x2a2f52)); ped.position.y = -0.2; addOutline(ped, 0.05); s.add(ped);
    this.glow = new THREE.Mesh(sphereGeo(1, 20, 14), new THREE.MeshBasicMaterial({ color: def.glow, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.glow.position.y = 1.4; this.glow.scale.setScalar(1.5);
    this.chest.add(this.glow);
    this.chest.position.y = this.dropY;
    s.add(this.chest);
    s.add(this.fx.group);
    this.camera.position.set(0, 3.2, 9.5); this.camera.lookAt(0, 1.3, 0);
  }

  resize(w: number, h: number) { this.camera.aspect = w / h; this.camera.fov = w / h < 0.6 ? 44 : 34; this.camera.updateProjectionMatrix(); this.fx.setViewport(h); }

  /** Returns true when the chest bursts open. */
  tap(): boolean {
    if (this.opened || this.chest.position.y > 0.05) return false;
    this.taps++;
    this.shake = 0.5 + this.taps * 0.25;
    this.charge = this.taps / this.needed;
    audio.chestShake(this.taps);
    haptics.medium();
    this.fx.burst(0, 1.4, 0.5, this.color.getHex(), 10 + this.taps * 6, 5 + this.taps, 0.4, 0.5);
    if (this.taps >= this.needed) {
      this.opened = true; this.openT = 0;
      audio.chestBurst(this.rarityIdx);
      haptics.heavy();
      const c = this.color.getHex();
      this.fx.flash(0, 1.5, 0, 0xffffff, 0.5, 6, 0.5, 1);
      this.fx.ring(0, 0, c, 0.5, 8, 0.7, 1, 0.2);
      this.fx.burst(0, 1.6, 0, c, 60, 12, 0.7, 1.2, { up: 14 });
      this.fx.burst(0, 1.6, 0, 0xffe14d, 40, 9, 0.4, 1.0, { up: 12 });
      this.fx.chunks(0, 1.6, 0, 0xffd23f, 16, 8, 0.2);
      return true;
    }
    return false;
  }

  update(dt: number) {
    this.t += dt;
    const ch = this.chest;
    if (ch.position.y > 0) {
      ch.position.y = Math.max(0, ch.position.y - dt * 14);
      if (ch.position.y === 0) { audio.impact(1, 'wood'); haptics.medium(); this.fx.ring(0, 0, 0xffffff, 0.5, 4, 0.4, 0.8, 0.05); this.fx.smoke(0, 0.2, 0, 8, 0x5a5a8a, 1.4); ch.scale.set(1.2, 0.75, 1.2); }
    }
    ch.scale.lerp(new THREE.Vector3(1, 1, 1), 1 - Math.exp(-8 * dt));
    this.shake = Math.max(0, this.shake - dt * 2);
    ch.rotation.z = Math.sin(this.t * 50) * 0.08 * this.shake;
    ch.rotation.y = Math.sin(this.t * 0.6) * 0.15;
    // anticipation glow pulsing faster with each tap
    const gm = this.glow.material as THREE.MeshBasicMaterial;
    if (!this.opened) {
      gm.opacity = 0.08 + this.charge * 0.3 + Math.sin(this.t * (4 + this.charge * 12)) * 0.08;
      if (Math.random() < 0.15 + this.charge * 0.5) this.fx.stream((Math.random() - 0.5) * 6, Math.random() * 4, (Math.random() - 0.5) * 3, 0, 0, this.color.getHex(), 4, 0.15);
      // light leaking from the lid seam
      this.lid.rotation.x = -Math.abs(Math.sin(this.t * 30)) * 0.05 * this.shake;
      this.rays.children.forEach((r, i) => ((r.children[0] as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = this.charge * 0.12 * (0.5 + 0.5 * Math.sin(this.t * 3 + i)));
    } else {
      this.openT += dt;
      this.lid.rotation.x = Math.max(-2.1, this.lid.rotation.x - dt * 14);
      gm.opacity = Math.max(0.15, 0.9 - this.openT * 0.8);
      this.glow.scale.setScalar(1.5 + Math.min(1, this.openT * 3) * 1.5);
      this.rays.rotation.z += dt * 0.4;
      this.rays.children.forEach((r, i) => ((r.children[0] as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = Math.min(0.35, this.openT) * (0.6 + 0.4 * Math.sin(this.t * 2 + i)));
      if (Math.random() < 0.6) this.fx.glow.spawn((Math.random() - 0.5) * 1.6, 1.6, (Math.random() - 0.5) * 1, (Math.random() - 0.5) * 2, 6 + Math.random() * 4, (Math.random() - 0.5) * 2, this.color, 0.9, 0.3, 1.2, 4, 0.5);
    }
    this.fx.update(dt);
  }
  dispose() { disposeTree(this.scene); this.scene.clear(); }
}
