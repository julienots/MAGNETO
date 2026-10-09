import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

/** Mark a cached resource as shared so per-scene disposal never frees it. */
export function shared<T extends { userData: any }>(o: T): T { o.userData.shared = true; return o; }

/** Free every non-shared geometry/material/texture under a node (scene teardown). */
export function disposeTree(root: THREE.Object3D) {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.geometry && !m.geometry.userData.shared) m.geometry.dispose();
    const mats = m.material ? (Array.isArray(m.material) ? m.material : [m.material]) : [];
    for (const mat of mats) {
      if (mat.userData.shared) continue;
      const map = (mat as THREE.MeshBasicMaterial).map;
      if (map && !map.userData.shared) map.dispose();
      mat.dispose();
    }
  });
}

/* ---------- toon ramp ---------- */
let ramp: THREE.DataTexture | null = null;
export function toonRamp() {
  if (ramp) return ramp;
  const data = new Uint8Array([90, 90, 90, 255, 175, 175, 175, 255, 235, 235, 235, 255, 255, 255, 255, 255]);
  ramp = new THREE.DataTexture(data, 4, 1, THREE.RGBAFormat);
  ramp.minFilter = ramp.magFilter = THREE.NearestFilter;
  ramp.generateMipmaps = false;
  ramp.needsUpdate = true;
  ramp.userData.shared = true;
  return ramp;
}

const matCache = new Map<string, THREE.Material>();
export function toon(color: number, opts: { emissive?: number; emissiveIntensity?: number; transparent?: boolean; opacity?: number; vertexColors?: boolean } = {}) {
  const key = `${color}|${opts.emissive ?? 0}|${opts.emissiveIntensity ?? 1}|${opts.transparent ? 1 : 0}|${opts.opacity ?? 1}|${opts.vertexColors ? 1 : 0}`;
  let m = matCache.get(key) as THREE.MeshToonMaterial | undefined;
  if (!m) {
    m = new THREE.MeshToonMaterial({
      color, gradientMap: toonRamp(),
      emissive: opts.emissive ?? 0, emissiveIntensity: opts.emissiveIntensity ?? 1,
      transparent: !!opts.transparent, opacity: opts.opacity ?? 1,
      vertexColors: !!opts.vertexColors,
    });
    matCache.set(key, shared(m));
  }
  return m;
}
/** Unique (non-cached) toon material for per-entity flashing. */
export function toonUnique(color: number, vertexColors = false) {
  return new THREE.MeshToonMaterial({ color, gradientMap: toonRamp(), vertexColors });
}
export function basic(color: number, opts: { transparent?: boolean; opacity?: number; additive?: boolean; side?: THREE.Side; depthWrite?: boolean } = {}) {
  const key = `b${color}|${opts.opacity ?? 1}|${opts.additive ? 1 : 0}|${opts.side ?? 0}|${opts.depthWrite ?? 1}|${opts.transparent ? 1 : 0}`;
  let m = matCache.get(key) as THREE.MeshBasicMaterial | undefined;
  if (!m) {
    m = new THREE.MeshBasicMaterial({
      color, transparent: !!opts.transparent || !!opts.additive || (opts.opacity ?? 1) < 1, opacity: opts.opacity ?? 1,
      blending: opts.additive ? THREE.AdditiveBlending : THREE.NormalBlending, side: opts.side ?? THREE.FrontSide,
      depthWrite: opts.depthWrite ?? !opts.additive,
    });
    matCache.set(key, shared(m));
  }
  return m;
}

/* ---------- inverted-hull outline ---------- */
const outlineMats = new Map<string, THREE.ShaderMaterial>();
export function outlineMat(thickness = 0.04, color = 0x14121c) {
  const key = `${thickness}|${color}`;
  let m = outlineMats.get(key);
  if (!m) {
    m = new THREE.ShaderMaterial({
      uniforms: { thickness: { value: thickness }, color: { value: new THREE.Color(color) } },
      vertexShader: `
        uniform float thickness;
        #include <common>
        #include <skinning_pars_vertex>
        void main(){
          vec3 p = position + normal * thickness;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: `uniform vec3 color; void main(){ gl_FragColor = vec4(color, 1.0); }`,
      side: THREE.BackSide,
    });
    outlineMats.set(key, shared(m));
  }
  return m;
}
/** Adds an outline shell to a mesh (shares geometry, 1 extra draw call). */
export function addOutline(mesh: THREE.Mesh, thickness = 0.04) {
  const o = new THREE.Mesh(mesh.geometry, outlineMat(thickness));
  o.name = 'outline';
  o.raycast = () => {};
  mesh.add(o);
  return o;
}

/* ---------- geometry helpers ---------- */
const geoCache = new Map<string, THREE.BufferGeometry>();
export function sphereGeo(r = 1, w = 20, h = 14) {
  const k = `s${r}|${w}|${h}`;
  return geoCache.get(k) ?? geoCache.set(k, shared(new THREE.SphereGeometry(r, w, h))).get(k)!;
}
export function capsuleGeo(r: number, l: number) {
  const k = `c${r}|${l}`;
  return geoCache.get(k) ?? geoCache.set(k, shared(new THREE.CapsuleGeometry(r, l, 6, 14))).get(k)!;
}
export function rboxGeo(w: number, h: number, d: number, r = 0.08) {
  const k = `r${w}|${h}|${d}|${r}`;
  return geoCache.get(k) ?? geoCache.set(k, shared(new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2.1, h / 2.1, d / 2.1)))).get(k)!;
}
export function cylGeo(rt: number, rb: number, h: number, seg = 16) {
  const k = `y${rt}|${rb}|${h}|${seg}`;
  return geoCache.get(k) ?? geoCache.set(k, shared(new THREE.CylinderGeometry(rt, rb, h, seg))).get(k)!;
}
export function torusGeo(r: number, t: number, arc = Math.PI * 2) {
  const k = `t${r}|${t}|${arc}`;
  return geoCache.get(k) ?? geoCache.set(k, shared(new THREE.TorusGeometry(r, t, 8, 24, arc))).get(k)!;
}
export function coneGeo(r: number, h: number, seg = 12) {
  const k = `k${r}|${h}|${seg}`;
  return geoCache.get(k) ?? geoCache.set(k, shared(new THREE.ConeGeometry(r, h, seg))).get(k)!;
}

/** Builder that bakes many colored parts into ONE vertex-colored geometry (1 draw call). */
export class Baker {
  private parts: THREE.BufferGeometry[] = [];
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  add(geo: THREE.BufferGeometry, color: number, pos: [number, number, number] = [0, 0, 0], rot: [number, number, number] = [0, 0, 0], scale: [number, number, number] | number = 1, order: THREE.EulerOrder = 'XYZ') {
    const g = (geo.index ? geo.toNonIndexed() : geo.clone());
    const s = typeof scale === 'number' ? [scale, scale, scale] : scale;
    this.e.set(rot[0], rot[1], rot[2], order);
    this.q.setFromEuler(this.e);
    this.m.compose(new THREE.Vector3(...pos), this.q, new THREE.Vector3(s[0], s[1], s[2]));
    g.applyMatrix4(this.m);
    const c = new THREE.Color(color);
    const n = g.attributes.position.count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'color') g.deleteAttribute(k);
    this.parts.push(g);
    return this;
  }
  build(): THREE.BufferGeometry {
    const g = mergeGeometries(this.parts, false)!;
    g.computeBoundingSphere();
    return g;
  }
}

/** A cartoon eye: white sclera + dark pupil + highlight. Returns group with .pupil for look-at. */
export function makeEye(size: number, pupilColor = 0x14121c, glow?: number) {
  const g = new THREE.Group();
  const white = new THREE.Mesh(sphereGeo(1, 16, 12), glow ? basic(glow) : toon(0xffffff));
  white.scale.set(size, size * 1.15, size * 0.6);
  g.add(white);
  const pupil = new THREE.Group();
  if (!glow) {
    const p = new THREE.Mesh(sphereGeo(1, 12, 10), basic(pupilColor));
    p.scale.set(size * 0.55, size * 0.7, size * 0.3);
    p.position.z = size * 0.42;
    const hl = new THREE.Mesh(sphereGeo(1, 8, 6), basic(0xffffff));
    hl.scale.setScalar(size * 0.18);
    hl.position.set(size * 0.18, size * 0.25, size * 0.6);
    pupil.add(p, hl);
  }
  g.add(pupil);
  (g as any).pupil = pupil;
  (g as any).white = white;
  return g;
}

/** Soft blob shadow (cheap alternative to shadow maps). */
let shadowTex: THREE.Texture | null = null;
export function blobShadow(radius: number) {
  if (!shadowTex) {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const x = c.getContext('2d')!;
    const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(0,0,0,0.55)'); gr.addColorStop(0.6, 'rgba(0,0,0,0.3)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
    shadowTex = shared(new THREE.CanvasTexture(c));
  }
  const m = new THREE.Mesh(planeGeo(), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  m.scale.setScalar(radius * 2.4);
  m.position.y = 0.02;
  m.renderOrder = 1;
  return m;
}
let _plane: THREE.PlaneGeometry | null = null;
export function planeGeo() { return _plane ?? (_plane = shared(new THREE.PlaneGeometry(1, 1))); }

export function hex(c: number) { return '#' + c.toString(16).padStart(6, '0'); }
export function shade(c: number, k: number) {
  const col = new THREE.Color(c);
  if (k >= 0) col.lerp(new THREE.Color(0xffffff), k); else col.lerp(new THREE.Color(0x000000), -k);
  return col.getHex();
}
