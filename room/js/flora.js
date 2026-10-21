// Procedural plants. Each leaf is a small bent grid (midrib fold, droop, cut-outs
// for splits and fenestrations) hung off a petiole pivot so the wind can move it.
import * as THREE from 'three';
import { toon, cyl, rod, box, texture, rng, smoothstep } from './util.js';
import { LAYER_PICK } from './pixel.js';

const Y = new THREE.Vector3(0, 1, 0);
const X = new THREE.Vector3(1, 0, 0);

// ------------------------------------------------------------------ leaves

function blade({ length, width, profile, u0 = 0, segU = 12, segV = 8, fold = 0, cup = 0, curl = 0, keep, color, rib, edge }) {
  const vs = new Set();
  for (let j = 0; j <= segV; j++) vs.add(+(-1 + (2 * j) / segV).toFixed(4));
  if (rib) [-0.075, -0.05, 0, 0.05, 0.075].forEach((v) => vs.add(v));
  if (edge) [-0.86, -0.8, 0.8, 0.86].forEach((v) => vs.add(v));
  const V = [...vs].sort((a, b) => a - b);
  const nV = V.length;

  const base = new THREE.Color(color);
  const ribC = rib && new THREE.Color(rib);
  const edgeC = edge && new THREE.Color(edge);
  const c = new THREE.Color();
  const pos = [], col = [], idx = [];

  for (let i = 0; i <= segU; i++) {
    const u = u0 + ((1 - u0) * i) / segU;
    const hw = (Math.max(0, profile(u)) * width) / 2;
    let my = u * length, mz = 0, ny = 0, nz = 1;
    if (Math.abs(curl) > 1e-4) {
      const a = curl * u, R = length / curl;
      my = R * Math.sin(a);
      mz = -R * (1 - Math.cos(a));
      ny = Math.sin(a);
      nz = Math.cos(a);
    }
    for (const v of V) {
      const off = fold * Math.abs(v) * hw + cup * v * v * hw;
      pos.push(v * hw, my + ny * off, mz + nz * off);
      c.copy(base);
      if (ribC && Math.abs(v) < 0.06 && u > 0.03) c.copy(ribC);
      if (edgeC && Math.abs(v) > 0.83) c.copy(edgeC);
      c.multiplyScalar(0.82 + 0.18 * smoothstep(0, 0.45, u));
      col.push(c.r, c.g, c.b);
    }
  }
  for (let i = 0; i < segU; i++) {
    const uc = u0 + ((1 - u0) * (i + 0.5)) / segU;
    for (let j = 0; j < nV - 1; j++) {
      if (keep && !keep(uc, (V[j] + V[j + 1]) / 2)) continue;
      const a = i * nV + j, b = a + 1, cc = a + nV, d = cc + 1;
      idx.push(a, b, cc, b, d, cc);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

const leafMat = toon(0xffffff, { vertexColors: true, side: THREE.DoubleSide });

// A petiole leaning out toward the pivot's +Z, with a leaf on the end.
function frond(plant, opts) {
  const {
    at = [0, 0, 0], azimuth = 0, tilt = 0.3, len = 0.3, arch = 0.5, radius = 0.01, stem = 0x6d8a4a,
    leaf, leafTilt = 0.3, roll = 0, flex = 1, freq = 2, phase = 0,
  } = opts;
  const pivot = new THREE.Group();
  pivot.position.set(...at);
  pivot.rotation.y = azimuth;
  plant.group.add(pivot);

  const P2 = new THREE.Vector3(0, len * Math.cos(tilt), len * Math.sin(tilt));
  const k = 0.5 + 0.3 * arch;
  const P1 = new THREE.Vector3(0, P2.y * k, P2.z * (1 - k));
  if (radius > 0) {
    const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(), P1, P2);
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 6, radius, 4, false), toon(stem));
    tube.castShadow = tube.receiveShadow = true;
    pivot.add(tube);
    plant.meshes.push(tube);
  }

  let leafPivot = null;
  if (leaf) {
    leafPivot = new THREE.Group();
    leafPivot.position.copy(P2);
    const T = P2.clone().sub(P1).normalize();
    const g = Math.atan2(T.z, T.y) + leafTilt;
    const L = new THREE.Vector3(0, Math.cos(g), Math.sin(g));
    const N = new THREE.Vector3(0, Math.sin(g), -Math.cos(g));
    leafPivot.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(-1, 0, 0), L, N));
    leafPivot.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(Y, roll));
    pivot.add(leafPivot);
    const m = new THREE.Mesh(blade(leaf), leafMat);
    m.castShadow = m.receiveShadow = true;
    leafPivot.add(m);
    plant.meshes.push(m);
  }
  plant.fronds.push({
    pivot, baseQ: pivot.quaternion.clone(), leafPivot, leafBaseQ: leafPivot?.quaternion.clone(),
    flex, freq, phase, world: new THREE.Vector3(),
  });
}

// --------------------------------------------------------------------- pots

const soils = {
  bark: ['#3a2a1f', '#6b4a2e', '#8a6340'],
  leca: ['#3b2b20', '#9a5a32', '#7a4a2a'],
  potting: ['#2e221a', '#44342a', '#5a4636'],
  gritty: ['#4a3626', '#e9e4d8', '#7a5a3c'],
};
function soilTex(kind, seed) {
  const [bg, a, b] = soils[kind];
  return texture(12, 12, (g) => {
    const R = rng(seed);
    g.fillStyle = bg;
    g.fillRect(0, 0, 12, 12);
    for (let i = 0; i < 26; i++) {
      g.fillStyle = R() < 0.5 ? a : b;
      g.fillRect(Math.floor(R() * 12), Math.floor(R() * 12), 1 + (R() < 0.3), 1);
    }
  });
}

const zigzagTex = texture(24, 8, (g) => {
  g.fillStyle = '#ece4c9';
  g.fillRect(0, 0, 24, 8);
  g.fillStyle = '#d6cba8';
  for (let x = 0; x < 24; x++) {
    const y = Math.abs((x % 6) - 3);
    g.fillRect(x, y + 1, 1, 1);
    g.fillRect(x, y + 4, 1, 1);
  }
}, { repeat: true });
zigzagTex.repeat.set(3, 1);

function pot(plant, { rTop, rBot, h, color = 0xffffff, map, soil }) {
  const mat = toon(color, { side: THREE.DoubleSide, ...(map ? { map } : {}) });
  const body = cyl(plant.group, [rTop, rBot, h], [0, 0, 0], mat, { seg: 12, open: true });
  const bottom = cyl(plant.group, [rBot, rBot, 0.01], [0, 0, 0], mat, { seg: 12 });
  const rim = new THREE.Mesh(new THREE.TorusGeometry(rTop, 0.011, 4, 12), mat);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = h;
  rim.castShadow = true;
  plant.group.add(rim);
  const top = h * 0.9;
  const s = new THREE.Mesh(new THREE.CircleGeometry(rTop * 0.97, 12), toon(0xffffff, { map: soil }));
  s.rotation.x = -Math.PI / 2;
  s.position.y = top;
  s.receiveShadow = true;
  plant.group.add(s);
  plant.meshes.push(body, bottom, rim, s);
  return top;
}

// ------------------------------------------------------------------ species

const PROFILES = {
  paddle: (u) => Math.pow(Math.sin(Math.PI * u), 0.55) * (1 - 0.12 * u),
  heart: (u) => {
    if (u >= 0.2) { const t = (u - 0.2) / 0.8; return Math.pow(Math.max(0, 1 - t * t), 0.8); }
    const t = (0.2 - u) / 0.38;
    return Math.sqrt(Math.max(0, 1 - t * t * t));
  },
  ovate: (u) => {
    if (u >= 0.18) { const t = (u - 0.18) / 0.82; return Math.pow(Math.max(0, 1 - t * t), 0.9); }
    const t = (0.18 - u) / 0.26;
    return Math.sqrt(Math.max(0, 1 - t * t));
  },
  sword: (u) => Math.pow(1 - u, 0.85) * (0.75 + 0.25 * smoothstep(0, 0.12, u)),
};

function strelitzia(plant, R) {
  const soil = pot(plant, { rTop: 0.165, rBot: 0.13, h: 0.3, color: 0xb0613a, soil: soilTex('bark', 2) });
  const sheath = cyl(plant.group, [0.04, 0.07, 0.17], [0, soil, 0], toon(0x8c9a78), { seg: 7 });
  plant.meshes.push(sheath);
  // [azimuth, tilt, petiole, leaf length, leaf width, droop, splits]; petioles are
  // scaled below so the tallest leaf tops out around 1.3 m, as in the photos
  const fan = [
    [1.5, 0.48, 0.5, 0.48, 0.19, 1.0, 2],
    [-1.7, 0.42, 0.58, 0.5, 0.2, 0.9, 1],
    [1.7, 0.26, 0.74, 0.54, 0.2, 0.55, 3],
    [-1.45, 0.22, 0.8, 0.52, 0.19, 0.5, 0],
    [1.4, 0.12, 0.92, 0.46, 0.17, 0.3, 1],
    [-1.62, 0.14, 0.88, 0.48, 0.18, 0.4, 2],
    [0.1, 0.3, 0.55, 0.42, 0.17, 0.75, 1],
  ];
  fan.forEach(([az, tilt, len, ll, lw, droop, nSplit], i) => {
    const splits = Array.from({ length: nSplit }, () => ({ u: 0.25 + R() * 0.6, s: R() < 0.5 ? -1 : 1 }));
    frond(plant, {
      at: [0, soil + 0.1, 0], azimuth: az + (R() - 0.5) * 0.2, tilt, len: len * 0.62, arch: 0.15, radius: 0.014, stem: 0x8a9878,
      leaf: {
        length: ll, width: lw, profile: PROFILES.paddle, segU: 24, segV: 8, fold: 0.18, curl: droop,
        color: 0x34532f, rib: 0xa9b585,
        keep: (u, v) => !splits.some((sp) => Math.sign(v) === sp.s && Math.abs(v) > 0.1 && Math.abs(u - (sp.u + 0.12 * Math.abs(v))) < 0.03),
      },
      leafTilt: 0.15 + droop * 0.25, roll: (R() - 0.5) * 0.6, flex: 1, freq: 1.4 + R() * 0.5, phase: i * 1.7,
    });
  });
  // the new leaf still rolled up into a spike
  frond(plant, { at: [0.01, soil + 0.1, 0], azimuth: 0.6, tilt: 0.05, len: 0.7, arch: 0, radius: 0.02, stem: 0x7f8f6d, flex: 0.5, freq: 1.2, phase: 0.4 });
}

function monstera(plant, R) {
  const soil = pot(plant, { rTop: 0.125, rBot: 0.1, h: 0.24, color: 0x222326, soil: soilTex('leca', 4) });
  const green = toon(0x3f9a4f);
  plant.meshes.push(
    rod(plant.group, [-0.04, soil, 0.02], [-0.1, soil + 0.62, 0.06], 0.007, green),
    rod(plant.group, [0.05, soil, -0.03], [0.1, soil + 0.5, -0.07], 0.007, green),
    rod(plant.group, [0.02, soil, 0.06], [0.05, soil + 0.42, 0.12], 0.005, toon(0xb5703e)),
    cyl(plant.group, [0.024, 0.03, 0.14], [0, soil, 0], toon(0x6d8a48), { seg: 6 }),
  );
  // ties on the stakes
  for (const [x, y, z] of [[-0.07, soil + 0.3, 0.04], [0.08, soil + 0.26, -0.05], [-0.09, soil + 0.52, 0.055]]) {
    plant.meshes.push(box(plant.group, [0.035, 0.02, 0.035], [x, y, z], green));
  }
  // aerial roots wandering to the floor
  const root = toon(0x8a6a48);
  plant.meshes.push(
    rod(plant.group, [0.02, soil + 0.12, 0.02], [0.2, -0.0, 0.16], 0.005, root),
    rod(plant.group, [-0.02, soil + 0.14, -0.01], [-0.24, 0.0, 0.08], 0.005, root),
  );
  // [azimuth, tilt, petiole, leaf length, colour]
  const leaves = [
    [0.9, 0.95, 0.62, 0.3, 0x5c8a38],
    [-1.4, 0.85, 0.7, 0.28, 0x638f3c],
    [2.6, 0.7, 0.55, 0.26, 0x7aa346],
    [-0.4, 0.45, 0.6, 0.3, 0x5a8636],
    [1.9, 1.05, 0.68, 0.24, 0x8fb04e],
    [-2.4, 0.75, 0.5, 0.22, 0x6a963f],
    [0.2, 0.3, 0.45, 0.2, 0xa9ad55],
  ];
  leaves.forEach(([az, tilt, len, ll, color], i) => {
    const nSplit = ll > 0.25 ? 3 : 2;
    const splits = Array.from({ length: nSplit }, (_, k) => 0.06 + (k * 0.62) / nSplit + R() * 0.06);
    const holes = ll > 0.25;
    frond(plant, {
      at: [0, soil + 0.12, 0], azimuth: az, tilt, len, arch: 0.85, radius: 0.009, stem: 0x84a45a,
      leaf: {
        length: ll, width: ll * 0.9, profile: PROFILES.heart, u0: -0.18, segU: 26, segV: 14, cup: -0.1, curl: 0.5,
        color, rib: 0xb2c97e,
        keep: (u, v) => {
          const a = Math.abs(v);
          if (u < 0.02 && a < 0.4 * (0.02 - u) / 0.2) return false;            // sinus at the base
          for (const s of splits) if (a > 0.45 && Math.abs(u - (s + 0.2 * (a - 0.45))) < 0.035) return false;
          if (holes) for (const s of splits) if (((u - s - 0.02) / 0.035) ** 2 + ((a - 0.27) / 0.09) ** 2 < 1) return false;
          return true;
        },
      },
      leafTilt: 0.45, roll: (R() - 0.5) * 0.8, flex: 1.1, freq: 2.2 + R() * 0.6, phase: i * 2.1,
    });
  });
}

function philodendron(plant, R) {
  const soil = pot(plant, { rTop: 0.07, rBot: 0.056, h: 0.125, map: zigzagTex, soil: soilTex('potting', 6) });
  const leaves = [
    [0.3, 0.55, 0.2, 0.2],
    [1.4, 0.7, 0.17, 0.19],
    [2.5, 0.5, 0.22, 0.21],
    [3.6, 0.75, 0.15, 0.17],
    [4.8, 0.45, 0.2, 0.2],
  ];
  leaves.forEach(([az, tilt, len, ll], i) => {
    frond(plant, {
      at: [0, soil, 0], azimuth: az + (R() - 0.5) * 0.3, tilt, len, arch: 0.35, radius: 0.007, stem: 0x5a2523,
      leaf: { length: ll, width: ll * 0.52, profile: PROFILES.ovate, u0: -0.08, segU: 14, segV: 8, cup: 0.25, curl: 0.35, color: 0x2c4a2a, rib: 0x5b7347 },
      leafTilt: 0.6, roll: (R() - 0.5) * 0.4, flex: 0.55, freq: 2.8, phase: i * 1.3,
    });
  });
  // new leaf, still red and half furled
  frond(plant, {
    at: [0, soil, 0], azimuth: 5.9, tilt: 0.12, len: 0.2, arch: 0.2, radius: 0.007, stem: 0x6a2a24,
    leaf: { length: 0.12, width: 0.06, profile: PROFILES.ovate, u0: -0.05, segU: 10, segV: 6, fold: 0.7, curl: 0.15, color: 0x7d3527, rib: 0x8e4a35 },
    leafTilt: 0.1, flex: 0.5, freq: 3, phase: 0.9,
  });
}

function sansevieria(plant, R) {
  const soil = pot(plant, { rTop: 0.07, rBot: 0.054, h: 0.105, color: 0xb86a43, soil: soilTex('gritty', 8) });
  const n = 9;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1); // 0 = outer (old), 1 = inner (young)
    frond(plant, {
      at: [0, soil, 0], azimuth: i * 2.4, tilt: 0, len: 0.01, radius: 0,
      leaf: {
        length: 0.13 + 0.12 * t * (0.8 + 0.4 * R()), width: 0.048, profile: PROFILES.sword, segU: 10, segV: 6,
        fold: 0.55, curl: 0.25 - 0.2 * t, color: 0x6d8466, edge: 0x8e4a32,
      },
      leafTilt: 1.05 - 0.85 * t, roll: (R() - 0.5) * 0.3, flex: 0.12, freq: 3.5, phase: i,
    });
  }
}

const MODELS = { strelitzia, monstera, philodendron, sansevieria };

// ------------------------------------------------------------------- plant

function stand(group, h) {
  const wood = toon(0x9a7350);
  box(group, [0.34, 0.03, 0.34], [0, h - 0.03, 0], wood);
  for (const [x, z] of [[-0.14, -0.14], [-0.14, 0.14], [0.14, -0.14], [0.14, 0.14]]) box(group, [0.03, h - 0.03, 0.03], [x, 0, z], wood);
  box(group, [0.3, 0.02, 0.3], [0, h * 0.35, 0], wood);
}

const pickMat = new THREE.MeshBasicMaterial();

export function buildPlant(def, seed) {
  const R = rng(seed);
  const outer = new THREE.Group();
  outer.position.set(...def.position);
  const plant = { def, group: new THREE.Group(), outer, fronds: [], meshes: [] };
  outer.add(plant.group);
  if (def.stand > 0) {
    stand(outer, def.stand);
    plant.group.position.y = def.stand;
  }
  MODELS[def.model](plant, R);

  // picking proxy + label anchor from the plant's real extent
  outer.updateMatrixWorld(true);
  const bb = new THREE.Box3();
  plant.meshes.forEach((m) => bb.expandByObject(m));
  const size = bb.getSize(new THREE.Vector3());
  const center = bb.getCenter(new THREE.Vector3());
  const r = Math.max(0.12, Math.min(size.x, size.z) * 0.42);
  const proxy = new THREE.Mesh(new THREE.CylinderGeometry(r, r, size.y, 8), pickMat);
  proxy.position.copy(center).sub(outer.position);
  proxy.layers.set(LAYER_PICK);
  proxy.userData.plant = plant;
  outer.add(proxy);
  plant.proxy = proxy;
  plant.top = new THREE.Vector3(center.x, bb.max.y + 0.06, center.z);
  plant.focus = center.clone();
  plant.extent = size;

  for (const f of plant.fronds) f.pivot.getWorldPosition(f.world);
  return plant;
}

const qSway = new THREE.Quaternion(), qTwist = new THREE.Quaternion(), qNod = new THREE.Quaternion();

export function animatePlant(plant, t, wind, calm = 1) {
  for (const f of plant.fronds) {
    const w = wind.at(f.world, t) * calm;
    const sway = f.flex * (0.1 * w + 0.05 * w * Math.sin(t * f.freq + f.phase)) + 0.01 * calm * Math.sin(t * 0.7 + f.phase);
    f.pivot.quaternion.copy(qSway.setFromAxisAngle(wind.axis, sway)).multiply(f.baseQ);
    if (f.leafPivot) {
      const tw = f.flex * 0.3 * w * Math.sin(t * f.freq * 1.7 + f.phase * 2);
      const nod = f.flex * (0.1 * w + 0.07 * w * Math.sin(t * f.freq * 1.3 + f.phase));
      f.leafPivot.quaternion.copy(f.leafBaseQ).multiply(qTwist.setFromAxisAngle(Y, tw)).multiply(qNod.setFromAxisAngle(X, nod));
    }
  }
}

export function setPlantLayer(plant, layer, on) {
  for (const m of plant.meshes) on ? m.layers.enable(layer) : m.layers.disable(layer);
}
