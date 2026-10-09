import * as THREE from 'three';
import type { PropKind } from '../../data/levels';
import { Baker, shared, toonRamp, outlineMat, sphereGeo, rboxGeo, cylGeo, torusGeo, coneGeo, capsuleGeo } from '../toon';

export interface PropSpec { r: number; mass: number; hp: number; material: 'wood' | 'metal' | 'ice' | 'rock' | 'robot'; restitution: number; magnetic: number; drag: number; explosive?: boolean }
export const PROP_SPECS: Record<PropKind, PropSpec> = {
  crate: { r: 0.48, mass: 1, hp: 60, material: 'wood', restitution: 0.4, magnetic: 1, drag: 3.2 },
  barrel: { r: 0.45, mass: 1.1, hp: 1, material: 'metal', restitution: 0.4, magnetic: 1, drag: 3.2, explosive: true },
  heavy: { r: 0.62, mass: 4, hp: 400, material: 'metal', restitution: 0.25, magnetic: 0.9, drag: 4.5 },
  car: { r: 0.95, mass: 7, hp: 600, material: 'metal', restitution: 0.3, magnetic: 0.8, drag: 4.5 },
  cell: { r: 0.36, mass: 0.6, hp: 9999, material: 'metal', restitution: 0.5, magnetic: 1.3, drag: 3 },
  debris: { r: 0.42, mass: 0.8, hp: 50, material: 'metal', restitution: 0.55, magnetic: 1.1, drag: 2.2 },
  iceBlock: { r: 0.55, mass: 2, hp: 70, material: 'ice', restitution: 0.3, magnetic: 0.9, drag: 3 },
  magmaRock: { r: 0.5, mass: 1.8, hp: 90, material: 'rock', restitution: 0.3, magnetic: 0.9, drag: 3.5 },
  asteroid: { r: 0.85, mass: 3.2, hp: 500, material: 'rock', restitution: 0.4, magnetic: 0.8, drag: 2 },
  core: { r: 0.8, mass: 12, hp: 99999, material: 'metal', restitution: 0.2, magnetic: 0.25, drag: 5 },
};

const geos = new Map<string, THREE.BufferGeometry>();
let sharedMat: THREE.MeshToonMaterial | null = null;
export function propMaterial() {
  return sharedMat ?? (sharedMat = shared(new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonRamp() })));
}

function bake(kind: string): THREE.BufferGeometry {
  const b = new Baker();
  switch (kind) {
    case 'crate':
      b.add(rboxGeo(0.82, 0.82, 0.82, 0.08), 0xc98a4b, [0, 0.41, 0]);
      for (const y of [0.12, 0.7]) b.add(rboxGeo(0.86, 0.12, 0.86, 0.03), 0x8a5a2b, [0, y, 0]);
      b.add(rboxGeo(0.1, 0.86, 0.9, 0.02), 0x8a5a2b, [0, 0.41, 0], [0.8, 0, 0]);
      b.add(rboxGeo(0.12, 0.3, 0.02, 0.01), 0x4a8bff, [0, 0.41, 0.43]);
      break;
    case 'barrel':
      b.add(cylGeo(0.4, 0.4, 0.95, 18), 0xe8402c, [0, 0.48, 0]);
      for (const y of [0.15, 0.48, 0.81]) b.add(cylGeo(0.42, 0.42, 0.08, 18), 0x2b2b33, [0, y, 0]);
      b.add(rboxGeo(0.4, 0.3, 0.06, 0.02), 0xffd23f, [0, 0.62, 0.39]);
      b.add(coneGeo(0.1, 0.16, 3), 0x2b2b33, [0, 0.62, 0.43], [Math.PI / 2, 0, 0]);
      break;
    case 'heavy':
      b.add(rboxGeo(1.05, 0.9, 1.05, 0.14), 0x6f7c8c, [0, 0.45, 0]);
      b.add(rboxGeo(1.1, 0.16, 1.1, 0.05), 0xffc23d, [0, 0.82, 0]);
      for (const x of [-0.38, 0.38]) for (const z of [-0.38, 0.38]) b.add(sphereGeo(1, 8, 6), 0x3c4652, [x, 0.9, z], [0, 0, 0], 0.07);
      b.add(rboxGeo(0.5, 0.2, 0.04, 0.02), 0x2b2b33, [0, 0.45, 0.53]);
      break;
    case 'car':
      b.add(rboxGeo(1.25, 0.5, 2.0, 0.22), 0x31a8ff, [0, 0.45, 0]);
      b.add(rboxGeo(1.0, 0.45, 1.0, 0.2), 0x7fd0ff, [0, 0.88, -0.1]);
      b.add(rboxGeo(1.02, 0.3, 0.9, 0.12), 0x15233a, [0, 0.9, -0.1]);
      for (const x of [-0.6, 0.6]) for (const z of [-0.65, 0.65]) b.add(cylGeo(0.24, 0.24, 0.22, 12), 0x1a1a22, [x, 0.24, z], [0, 0, Math.PI / 2]);
      b.add(rboxGeo(0.25, 0.12, 0.05, 0.02), 0xfff3a0, [0.38, 0.5, 1.0]);
      b.add(rboxGeo(0.25, 0.12, 0.05, 0.02), 0xfff3a0, [-0.38, 0.5, 1.0]);
      break;
    case 'cell':
      b.add(capsuleGeo(0.2, 0.36), 0x7dffd8, [0, 0.45, 0]);
      b.add(cylGeo(0.24, 0.24, 0.08, 14), 0x2b3440, [0, 0.72, 0]);
      b.add(cylGeo(0.24, 0.24, 0.08, 14), 0x2b3440, [0, 0.18, 0]);
      break;
    case 'debris':
      b.add(rboxGeo(0.8, 0.22, 0.6, 0.06), 0xc9d4e0, [0, 0.2, 0], [0, 0.3, 0.2]);
      b.add(rboxGeo(0.3, 0.3, 0.3, 0.05), 0x3d8bff, [0.1, 0.4, 0.05], [0.3, 0.2, 0]);
      b.add(cylGeo(0.05, 0.05, 0.6, 6), 0x2a3550, [-0.2, 0.35, 0], [0, 0, 1.1]);
      break;
    case 'iceBlock':
      b.add(rboxGeo(0.95, 0.9, 0.95, 0.12), 0xbff2ff, [0, 0.45, 0]);
      b.add(rboxGeo(0.5, 0.4, 0.05, 0.02), 0xffffff, [0.1, 0.6, 0.48]);
      break;
    case 'magmaRock':
      b.add(sphereGeo(1, 7, 5), 0x3a2220, [0, 0.45, 0], [0.3, 0.6, 0], [0.55, 0.45, 0.5]);
      b.add(sphereGeo(1, 6, 4), 0xff7a1f, [0.15, 0.6, 0.25], [0, 0, 0], 0.18);
      b.add(sphereGeo(1, 6, 4), 0xffb627, [-0.2, 0.5, 0.2], [0, 0, 0], 0.12);
      break;
    case 'asteroid':
      b.add(sphereGeo(1, 8, 6), 0x6a5a8a, [0, 0.8, 0], [0.4, 0.2, 0.1], [0.9, 0.8, 0.85]);
      b.add(sphereGeo(1, 6, 5), 0x4a3d66, [0.4, 1.1, 0.5], [0, 0, 0], 0.25);
      b.add(sphereGeo(1, 6, 5), 0x4a3d66, [-0.5, 0.7, 0.4], [0, 0, 0], 0.2);
      break;
    case 'core':
      b.add(sphereGeo(1, 16, 12), 0x2b2b3a, [0, 0.8, 0], [0, 0, 0], 0.75);
      b.add(torusGeo(0.8, 0.12), 0xffd23f, [0, 0.8, 0], [Math.PI / 2, 0, 0]);
      b.add(torusGeo(0.8, 0.12), 0xffd23f, [0, 0.8, 0], [0, 0, 0]);
      break;
    case 'generator':
      b.add(cylGeo(0.9, 1.1, 0.5, 16), 0x2b3440, [0, 0.25, 0]);
      b.add(cylGeo(0.55, 0.65, 1.6, 16), 0x8fa3b8, [0, 1.2, 0]);
      for (let i = 0; i < 3; i++) b.add(torusGeo(0.62, 0.07), 0xffc23d, [0, 0.7 + i * 0.45, 0], [Math.PI / 2, 0, 0]);
      b.add(sphereGeo(1, 12, 8), 0x2b3440, [0, 2.1, 0], [0, 0, 0], 0.4);
      break;
    case 'protect':
      b.add(cylGeo(1.2, 1.4, 0.5, 20), 0x2b3440, [0, 0.25, 0]);
      b.add(cylGeo(0.3, 0.3, 1.2, 12), 0x8fa3b8, [0.8, 0.9, 0]);
      b.add(cylGeo(0.3, 0.3, 1.2, 12), 0x8fa3b8, [-0.8, 0.9, 0]);
      b.add(rboxGeo(2.0, 0.25, 0.5, 0.08), 0xffc23d, [0, 1.5, 0]);
      break;
    case 'collector':
      b.add(cylGeo(1.6, 1.7, 0.25, 24), 0x2b3440, [0, 0.12, 0]);
      b.add(torusGeo(1.55, 0.12), 0x2ee6a6, [0, 0.3, 0], [Math.PI / 2, 0, 0]);
      for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + Math.PI / 4; b.add(cylGeo(0.12, 0.15, 1.4, 8), 0x8fa3b8, [Math.cos(a) * 1.55, 0.7, Math.sin(a) * 1.55]); }
      break;
  }
  return b.build();
}

export function propGeo(kind: string) {
  let g = geos.get(kind);
  if (!g) { g = shared(bake(kind)); geos.set(kind, g); }
  return g;
}

export function makePropMesh(kind: string, outline = 0.04): THREE.Mesh {
  const g = propGeo(kind);
  const m = new THREE.Mesh(g, propMaterial());
  if (outline > 0) { const o = new THREE.Mesh(g, outlineMat(outline)); m.add(o); }
  return m;
}
