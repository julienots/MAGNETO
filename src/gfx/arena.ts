import * as THREE from 'three';
import type { WorldDef } from '../data/worlds';
import { Baker, toonRamp, rboxGeo, cylGeo, coneGeo, sphereGeo, torusGeo, outlineMat, shade, hex } from './toon';
import { Rng } from '../core/Random';

export const ARENA_W = 14;
export const ARENA_H = 24;
export const HW = ARENA_W / 2;
export const HH = ARENA_H / 2;

function floorTexture(w: WorldDef): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 878;
  const x = c.getContext('2d')!;
  const P = w.palette;
  const tile = 512 / 7; // 2 world units per tile
  const rng = new Rng(w.id * 101);
  x.fillStyle = hex(P.floor); x.fillRect(0, 0, c.width, c.height);
  for (let i = 0; i < 7; i++) for (let j = 0; j < 12; j++) {
    const alt = (i + j) % 2 === 0;
    x.fillStyle = hex(alt ? P.floor : P.floor2);
    x.fillRect(i * tile, j * tile, tile, tile);
    // subtle bevel
    x.fillStyle = 'rgba(255,255,255,0.06)'; x.fillRect(i * tile, j * tile, tile, 3);
    x.fillStyle = 'rgba(0,0,0,0.12)'; x.fillRect(i * tile, j * tile + tile - 3, tile, 3);
  }
  x.lineWidth = 2;
  switch (w.id) {
    case 1: // factory: rivets + diamond plate
      x.fillStyle = 'rgba(0,0,0,0.18)';
      for (let i = 0; i < 7; i++) for (let j = 0; j < 12; j++) for (const [a, b] of [[6, 6], [tile - 6, 6], [6, tile - 6], [tile - 6, tile - 6]]) { x.beginPath(); x.arc(i * tile + a, j * tile + b, 3, 0, 7); x.fill(); }
      x.strokeStyle = 'rgba(255,255,255,0.05)';
      for (let k = 0; k < 400; k++) { const px = rng.range(0, 512), py = rng.range(0, 878); x.beginPath(); x.moveTo(px, py); x.lineTo(px + 6, py + 3); x.stroke(); }
      break;
    case 2: // neon grid
      x.strokeStyle = 'rgba(49,245,255,0.35)'; x.lineWidth = 2;
      for (let i = 0; i <= 7; i++) { x.beginPath(); x.moveTo(i * tile, 0); x.lineTo(i * tile, 878); x.stroke(); }
      for (let j = 0; j <= 12; j++) { x.beginPath(); x.moveTo(0, j * tile); x.lineTo(512, j * tile); x.stroke(); }
      x.strokeStyle = 'rgba(255,61,242,0.25)';
      x.beginPath(); x.moveTo(256, 0); x.lineTo(256, 878); x.stroke();
      break;
    case 3: // station panels
      x.strokeStyle = 'rgba(61,139,255,0.5)'; x.lineWidth = 3;
      for (let j = 0; j < 12; j++) { x.beginPath(); x.moveTo(0, j * tile + tile / 2); x.lineTo(512, j * tile + tile / 2); x.stroke(); }
      x.fillStyle = 'rgba(255,122,0,0.5)';
      for (let k = 0; k < 20; k++) x.fillRect(rng.int(0, 6) * tile + 10, rng.int(0, 11) * tile + 10, 8, 8);
      break;
    case 4: // lava cracks
      x.strokeStyle = 'rgba(255,110,30,0.75)'; x.lineWidth = 3; x.shadowColor = '#ff6a1f'; x.shadowBlur = 8;
      for (let k = 0; k < 26; k++) { let px = rng.range(0, 512), py = rng.range(0, 878); x.beginPath(); x.moveTo(px, py); for (let s = 0; s < 5; s++) { px += rng.range(-30, 30); py += rng.range(-30, 30); x.lineTo(px, py); } x.stroke(); }
      x.shadowBlur = 0;
      break;
    case 5: // ice cracks + snow
      x.strokeStyle = 'rgba(255,255,255,0.6)'; x.lineWidth = 1.5;
      for (let k = 0; k < 30; k++) { let px = rng.range(0, 512), py = rng.range(0, 878); x.beginPath(); x.moveTo(px, py); for (let s = 0; s < 4; s++) { px += rng.range(-25, 25); py += rng.range(-25, 25); x.lineTo(px, py); } x.stroke(); }
      x.fillStyle = 'rgba(255,255,255,0.5)';
      for (let k = 0; k < 120; k++) { x.beginPath(); x.arc(rng.range(0, 512), rng.range(0, 878), rng.range(1, 4), 0, 7); x.fill(); }
      break;
    case 6: // stars
      for (let k = 0; k < 260; k++) { x.fillStyle = `rgba(255,255,255,${rng.range(0.2, 0.9)})`; x.beginPath(); x.arc(rng.range(0, 512), rng.range(0, 878), rng.range(0.5, 2.2), 0, 7); x.fill(); }
      x.strokeStyle = 'rgba(255,92,240,0.25)'; x.lineWidth = 2;
      for (let k = 0; k < 6; k++) { x.beginPath(); x.arc(256, 439, 60 + k * 70, 0, 7); x.stroke(); }
      break;
    case 7: // void checker glitch
      for (let i = 0; i < 14; i++) for (let j = 0; j < 24; j++) { if ((i + j) % 2) { x.fillStyle = 'rgba(255,255,255,0.05)'; x.fillRect(i * tile / 2, j * tile / 2, tile / 2, tile / 2); } }
      for (let k = 0; k < 18; k++) { x.fillStyle = k % 2 ? 'rgba(255,45,85,0.35)' : 'rgba(80,220,255,0.3)'; x.fillRect(rng.range(0, 512), rng.range(0, 878), rng.range(30, 160), rng.range(2, 6)); }
      break;
  }
  // hazard border
  const stripe = 14;
  x.save();
  x.beginPath(); x.rect(0, 0, 512, 878); x.rect(stripe, stripe, 512 - stripe * 2, 878 - stripe * 2); x.clip('evenodd');
  for (let k = -900; k < 1400; k += 24) { x.fillStyle = (k / 24) % 2 ? hex(P.accent) : '#1b1b22'; x.beginPath(); x.moveTo(k, 0); x.lineTo(k + 12, 0); x.lineTo(k + 12 + 878, 878); x.lineTo(k + 878, 878); x.fill(); }
  x.restore();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export interface ArenaVisual { group: THREE.Group; animated: ((dt: number, t: number) => void)[]; dispose: () => void }

/** Builds the arena visuals (floor, walls, outside decor, lights) for a world. */
export function buildArena(w: WorldDef, scene: THREE.Scene, quality: number): ArenaVisual {
  const g = new THREE.Group();
  const P = w.palette;
  const anim: ((dt: number, t: number) => void)[] = [];
  scene.background = new THREE.Color(P.sky);
  scene.fog = new THREE.Fog(P.fog, 30, 70);

  // lights
  const hemi = new THREE.HemisphereLight(0xffffff, P.ambient, 1.6);
  const dir = new THREE.DirectionalLight(P.light, 2.2);
  dir.position.set(-6, 16, 10);
  const amb = new THREE.AmbientLight(P.ambient, 0.5);
  g.add(hemi, dir, amb);

  // floor
  const floorTex = floorTexture(w);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(ARENA_W, ARENA_H), new THREE.MeshToonMaterial({ map: floorTex, gradientMap: toonRamp() }));
  floor.rotation.x = -Math.PI / 2;
  g.add(floor);
  // underground plane (outside)
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(120, 140), new THREE.MeshBasicMaterial({ color: shade(P.sky, w.id === 3 || w.id === 6 || w.id === 7 ? 0 : -0.1) }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -1.2;
  g.add(ground);

  // walls (baked)
  const wb = new Baker();
  const wallH = 1.0, t = 0.8;
  wb.add(rboxGeo(ARENA_W + t * 2, wallH, t, 0.15), P.wall, [0, wallH / 2 - 0.2, -HH - t / 2]);
  wb.add(rboxGeo(ARENA_W + t * 2, wallH * 0.6, t, 0.15), P.wall, [0, wallH * 0.3 - 0.2, HH + t / 2]);
  wb.add(rboxGeo(t, wallH, ARENA_H, 0.15), P.wall, [-HW - t / 2, wallH / 2 - 0.2, 0]);
  wb.add(rboxGeo(t, wallH, ARENA_H, 0.15), P.wall, [HW + t / 2, wallH / 2 - 0.2, 0]);
  // posts
  for (const x of [-HW - t / 2, HW + t / 2]) for (let z = -HH; z <= HH; z += 4) wb.add(rboxGeo(t * 1.25, wallH * 1.35, t * 1.25, 0.15), P.trim, [x, wallH * 0.55, z]);
  for (let x = -HW; x <= HW; x += 3.5) wb.add(rboxGeo(t * 1.25, wallH * 1.35, t * 1.25, 0.15), P.trim, [x, wallH * 0.55, -HH - t / 2]);
  // lower trim
  wb.add(rboxGeo(ARENA_W + t * 4, 0.3, ARENA_H + t * 4, 0.1), P.trim, [0, -0.3, 0]);
  const wallGeo = wb.build();
  const wallMat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonRamp() });
  const walls = new THREE.Mesh(wallGeo, wallMat);
  walls.add(new THREE.Mesh(wallGeo, outlineMat(0.05)));
  g.add(walls);

  // outside decor (baked per world, 1-2 draw calls)
  const db = new Baker();
  const glowB = new Baker();
  const rng = new Rng(w.id * 7);
  const side = (fn: (x: number, z: number, s: number) => void, n: number) => {
    for (let i = 0; i < n; i++) {
      const s = i % 2 ? 1 : -1;
      const x = s * (HW + rng.range(2.2, 7));
      const z = rng.range(-HH - 6, HH + 2);
      fn(x, z, s);
    }
    for (let i = 0; i < Math.ceil(n / 3); i++) fn(rng.range(-HW - 3, HW + 3), -HH - rng.range(2.5, 9), 0);
  };
  let hasGlow = false;
  switch (w.id) {
    case 1:
      side((x, z) => {
        const k = rng.int(0, 3);
        if (k === 0) { db.add(cylGeo(0.6, 0.8, rng.range(4, 9), 12), 0x8a95a3, [x, 2, z]); db.add(cylGeo(0.85, 0.85, 0.4, 12), 0xf2a33a, [x, 4.5, z]); }
        else if (k === 1) { db.add(rboxGeo(2.5, rng.range(2, 4), 2.5, 0.2), 0x4f5b68, [x, 1, z]); db.add(rboxGeo(2.6, 0.3, 2.6, 0.08), 0xffc23d, [x, 2.2, z]); }
        else if (k === 2) { db.add(torusGeo(1.2, 0.35), 0x6f7c8c, [x, 1.5, z], [0, rng.range(0, 3), 0]); }
        else { for (let s = 0; s < 3; s++) db.add(rboxGeo(1, 1, 1, 0.08), 0xc98a4b, [x + rng.range(-0.6, 0.6), 0.5 + s, z]); }
      }, 16);
      db.add(cylGeo(0.3, 0.3, ARENA_W + 12, 10), 0xd04a3a, [0, 3.5, -HH - 2], [0, 0, Math.PI / 2]);
      break;
    case 2: hasGlow = true;
      side((x, z) => {
        const h = rng.range(4, 14), wd = rng.range(1.8, 3.2);
        db.add(rboxGeo(wd, h, wd, 0.1), rng.pick([0x2b2450, 0x1c1840, 0x3a2a6a]), [x, h / 2 - 1, z]);
        for (let k = 1; k < h - 1; k += 1.2) glowB.add(rboxGeo(wd * 0.8, 0.15, wd * 1.02, 0.02), rng.pick([0xff3df2, 0x31f5ff, 0xffd23f]), [x, k - 1, z]);
      }, 22);
      break;
    case 3: hasGlow = true;
      side((x, z) => {
        db.add(rboxGeo(rng.range(1.5, 3), 0.4, rng.range(3, 6), 0.1), 0xc9d4e0, [x, rng.range(-0.5, 2), z]);
        db.add(cylGeo(0.08, 0.08, 3, 6), 0x2a3550, [x, 1.5, z]);
        glowB.add(sphereGeo(1, 8, 6), 0xff7a00, [x, 3.1, z], [0, 0, 0], 0.15);
      }, 14);
      for (let i = 0; i < 160; i++) glowB.add(sphereGeo(1, 4, 3), 0xffffff, [rng.range(-40, 40), rng.range(-6, -2), rng.range(-50, 20)], [0, 0, 0], rng.range(0.03, 0.09));
      break;
    case 4: hasGlow = true;
      side((x, z) => { const h = rng.range(2, 6); db.add(coneGeo(rng.range(1.5, 3), h, 7), 0x3a2220, [x, h / 2 - 1, z]); glowB.add(sphereGeo(1, 6, 4), 0xff7a1f, [x, h - 1, z], [0, 0, 0], 0.5); }, 16);
      glowB.add(rboxGeo(4, 0.1, 70, 0.02), 0xff5a1f, [-HW - 4, -0.9, -10]); glowB.add(rboxGeo(4, 0.1, 70, 0.02), 0xff5a1f, [HW + 4, -0.9, -10]);
      break;
    case 5:
      side((x, z) => { const h = rng.range(2, 6); db.add(coneGeo(rng.range(0.5, 1.2), h, 6), rng.pick([0xbff2ff, 0x9fd8ff, 0xffffff]), [x, h / 2 - 1, z]); db.add(sphereGeo(1, 8, 6), 0xffffff, [x + 1, -0.5, z], [0, 0, 0], [1.6, 0.8, 1.4]); }, 20);
      break;
    case 6: hasGlow = true;
      side((x, z) => db.add(sphereGeo(1, 7, 5), rng.pick([0x6a5a8a, 0x4a3d66, 0x8a6abf]), [x, rng.range(-0.5, 4), z], [rng.next(), rng.next(), 0], rng.range(0.6, 1.8)), 16);
      for (let i = 0; i < 200; i++) glowB.add(sphereGeo(1, 4, 3), rng.pick([0xffffff, 0xff9df5, 0xbfe3ff]), [rng.range(-40, 40), rng.range(-8, -2), rng.range(-50, 20)], [0, 0, 0], rng.range(0.03, 0.1));
      glowB.add(sphereGeo(1, 20, 14), 0xff5cf0, [-14, 6, -30], [0, 0, 0], 5);
      break;
    case 7: hasGlow = true;
      side((x, z) => { const s = rng.range(0.6, 2); db.add(rboxGeo(s, s, s, 0.05), rng.chance(0.5) ? 0xffffff : 0x18181f, [x, rng.range(0, 6), z], [rng.next() * 3, rng.next() * 3, 0]); }, 24);
      for (let i = 0; i < 8; i++) glowB.add(rboxGeo(rng.range(2, 8), 0.05, 0.05, 0.01), 0xff2d55, [rng.range(-12, 12), rng.range(0, 6), rng.range(-30, 0)]);
      break;
  }
  const decoGeo = db.build();
  const deco = new THREE.Mesh(decoGeo, new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonRamp() }));
  if (quality > 0.6) deco.add(new THREE.Mesh(decoGeo, outlineMat(0.05)));
  g.add(deco);
  let glowMesh: THREE.Mesh | null = null;
  if (hasGlow) {
    glowMesh = new THREE.Mesh(glowB.build(), new THREE.MeshBasicMaterial({ vertexColors: true }));
    g.add(glowMesh);
  }
  if (w.id === 2) anim.push((_dt, tt) => { if (glowMesh) (glowMesh.material as THREE.MeshBasicMaterial).color.setScalar(0.8 + Math.sin(tt * 3) * 0.2); });
  if (w.id === 7) anim.push((_dt, tt) => { deco.rotation.y = Math.sin(tt * 0.1) * 0.02; });

  scene.add(g);
  return {
    group: g,
    animated: anim,
    dispose: () => {
      g.removeFromParent();
      floorTex.dispose(); floor.geometry.dispose(); (floor.material as THREE.Material).dispose();
      wallGeo.dispose(); wallMat.dispose(); decoGeo.dispose(); (deco.material as THREE.Material).dispose();
      if (glowMesh) { glowMesh.geometry.dispose(); (glowMesh.material as THREE.Material).dispose(); }
      ground.geometry.dispose();
    },
  };
}
