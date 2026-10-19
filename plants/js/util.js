// Small shared helpers: seeded randomness, toon materials, primitive builders,
// and nearest-filtered canvas textures (the pixel-art look starts here).
import * as THREE from 'three';

export function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

// Four light bands. Everything lit goes through this ramp, so shading reads as
// flat steps instead of smooth gradients.
const ramp = (() => {
  const data = new Uint8Array([105, 165, 215, 255]);
  const tex = new THREE.DataTexture(data, data.length, 1, THREE.RedFormat);
  tex.minFilter = tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
})();

const materials = new Map();
export function toon(color, opts) {
  if (opts) return new THREE.MeshToonMaterial({ color, gradientMap: ramp, ...opts });
  if (!materials.has(color)) materials.set(color, new THREE.MeshToonMaterial({ color, gradientMap: ramp }));
  return materials.get(color);
}

export function texture(w, h, draw, { repeat = false } = {}) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function shadowed(mesh, cast = true, receive = true) {
  mesh.castShadow = cast;
  mesh.receiveShadow = receive;
  return mesh;
}

// Axis-aligned box whose *bottom* sits at y (much easier for placing furniture).
export function box(parent, [w, h, d], [x, y, z], mat, { rot, cast = true, receive = true } = {}) {
  const m = shadowed(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat), cast, receive);
  m.position.set(x, y + h / 2, z);
  if (rot) m.rotation.set(...rot);
  parent.add(m);
  return m;
}

// Cylinder whose bottom sits at y. Few radial segments keeps it chunky.
export function cyl(parent, [rTop, rBot, h], [x, y, z], mat, { seg = 10, open = false, rot, cast = true } = {}) {
  const m = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, seg, 1, open), mat), cast, true);
  m.position.set(x, y + h / 2, z);
  if (rot) m.rotation.set(...rot);
  parent.add(m);
  return m;
}

// A thin tube between two points (bike frame, monitor arm, stakes...).
export function rod(parent, a, b, r, mat, seg = 5) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const len = A.distanceTo(B);
  const m = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, seg), mat));
  m.position.copy(A).add(B).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize());
  parent.add(m);
  return m;
}

// Draw a pixel bitmap (array of strings, '.' = empty) into a canvas context.
export function blit(g, rows, x0, y0, palette) {
  rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      if (ch === '.' || !palette[ch]) return;
      g.fillStyle = palette[ch];
      g.fillRect(x0 + x, y0 + y, 1, 1);
    });
  });
}
