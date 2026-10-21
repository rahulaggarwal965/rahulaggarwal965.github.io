// The room, rebuilt from photos. Units are metres; y is up.
// Looking at the bay window (south) you face -z; the desk wall is +x, the bed wall is -x.
//
// Width (11 ft), depth (9'3", closet to the bay opening) and the bay's depth
// (40") are tape-measured. Everything else comes from a structure-from-motion
// reconstruction of two walkthrough videos and the photos, scaled by those tape
// measurements and checked against things of known size (an 80" door, a 20" box fan).
import * as THREE from 'three';
import { toon, box, cyl, rod, texture, rng } from './util.js';

export const ROOM = { xMin: -1.675, xMax: 1.675, zMin: -1.41, zMax: 1.41, H: 2.6, T: 0.14 };
// Opening in the north wall from x = left..right; the window wall sits `depth` out
// from it, spanning back[0]..back[1]. On the left a straight return runs `ret` back
// from the opening before the side turns 45°; the right side is angled from the
// corner by the desk.
export const BAY = { left: -0.92, ret: 0.45, right: 1.62, back: [-0.37, 0.62], depth: 1.05, sill: 0.36, head: 2.0, ceil: 2.22 };
// Heights on the double-hung windows: meeting rail, top of the upper sash, blinds.
const SASH = { meet: 1.18, headRail: 1.72, blinds: 2.02 };
export const BEAM = { bottom: 2.25, depth: 0.3 };
export const DESK = { x0: 1.1, x1: 1.66, z0: -1.15, z1: 0.71, top: 0.75 };
// The door sits at the back of a short alcove at the desk end of the south wall.
export const ALCOVE = { x0: 0.88, depth: 0.52 };
const CLOSET = { x0: -1.07, x1: 0.65, h: 1.9 };

const C = {
  wall: 0xeeece7, cap: 0x6b5d50, trim: 0xf7f6f2, slab: 0x5b4636,
  frame: 0x44474c, sheet: 0xf2f1ec, duvet: 0xf8f8f4, greyPillow: 0x55595f,
  navy: 0x1f2940, sherpa: 0xe8e0cf,
  walnut: 0x4b3428, walnutDark: 0x35251c, oakMid: 0x8f6b48, brass: 0xcaa24c,
  ceramic: 0xebe6da, black: 0x1c1d20, charcoal: 0x2c2d31, grey: 0x707176,
  silver: 0xb8bbbf, red: 0xc23a2e, white: 0xf3f3f0,
};

const shadowOnly = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });

// ---------------------------------------------------------------- textures

const floorTex = texture(64, 64, (g) => {
  const R = rng(11);
  const tones = ['#caa067', '#c39660', '#d1a870', '#bd8f59', '#d6ae78', '#c79b63'];
  for (let col = 0; col < 16; col++) {
    let y = -Math.floor(R() * 40);
    while (y < 64) {
      const len = 18 + Math.floor(R() * 30);
      g.fillStyle = tones[Math.floor(R() * tones.length)];
      g.fillRect(col * 4, y, 4, len);
      g.fillStyle = 'rgba(122, 82, 42, 0.22)';
      for (let k = 0; k < 3; k++) g.fillRect(col * 4 + 1 + Math.floor(R() * 2), y + Math.floor(R() * len), 1, 2 + Math.floor(R() * 5));
      g.fillStyle = 'rgba(92, 60, 30, 0.5)';
      g.fillRect(col * 4, y, 4, 1);
      y += len;
    }
    g.fillStyle = 'rgba(92, 60, 30, 0.38)';
    g.fillRect(col * 4 + 3, 0, 1, 64);
  }
}, { repeat: true });
floorTex.repeat.set(0.5, 0.5);

const duvetTex = texture(16, 16, (g) => {
  g.fillStyle = '#f8f8f4';
  g.fillRect(0, 0, 16, 16);
  g.fillStyle = '#e9e9e3';
  g.fillRect(0, 7, 16, 1);
  g.fillRect(7, 0, 1, 16);
}, { repeat: true });
duvetTex.repeat.set(4, 4);

const rattanTex = texture(8, 8, (g) => {
  g.fillStyle = '#c8a670';
  g.fillRect(0, 0, 8, 8);
  g.fillStyle = '#a8864f';
  for (let i = 0; i < 8; i += 2) for (let j = (i / 2) % 2; j < 8; j += 2) g.fillRect(i, j, 1, 1);
}, { repeat: true });
rattanTex.repeat.set(4, 2);

const ridgeTex = texture(8, 4, (g) => {
  g.fillStyle = '#eee9dd';
  g.fillRect(0, 0, 8, 4);
  g.fillStyle = '#d9d2c2';
  g.fillRect(1, 0, 1, 4); g.fillRect(5, 0, 1, 4);
  g.fillRect(0, 2, 8, 1);
}, { repeat: true });
ridgeTex.repeat.set(2, 3);

const grilleTex = texture(32, 32, (g) => {
  g.fillStyle = '#f2f2ef';
  g.fillRect(0, 0, 32, 32);
  g.strokeStyle = '#c9cac6';
  for (let r = 4; r < 16; r += 3) {
    g.beginPath();
    g.arc(16, 16, r, 0, Math.PI * 2);
    g.stroke();
  }
  g.fillStyle = '#ffffff';
  g.beginPath(); g.arc(16, 16, 4, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#8d8e8a';
  g.fillRect(15, 14, 2, 4); g.fillRect(15, 14, 3, 1); g.fillRect(15, 17, 3, 1);
});

const keysTex = texture(16, 6, (g) => {
  g.fillStyle = '#3a3b3f';
  g.fillRect(0, 0, 16, 6);
  g.fillStyle = '#56585d';
  for (let y = 0; y < 6; y++) for (let x = (y % 2); x < 16; x += 2) g.fillRect(x, y, 1, 1);
});

const screenTex = texture(48, 28, (g) => {
  g.fillStyle = '#12151c';
  g.fillRect(0, 0, 48, 28);
  g.fillStyle = '#1d2230';
  g.fillRect(0, 0, 48, 2);
  const R = rng(3);
  const cols = ['#6fa8dc', '#93c47d', '#e0a35a', '#b4a7d6', '#8a8f99'];
  for (let y = 4; y < 27; y += 2) {
    let x = 2 + Math.floor(R() * 3) * 2;
    while (x < 44 && R() > 0.18) {
      const len = 2 + Math.floor(R() * 7);
      g.fillStyle = cols[Math.floor(R() * cols.length)];
      g.fillRect(x, y, Math.min(len, 46 - x), 1);
      x += len + 1;
    }
  }
});

const speckleTex = (bg, dots, seed) => texture(8, 8, (g) => {
  const R = rng(seed);
  g.fillStyle = bg;
  g.fillRect(0, 0, 8, 8);
  g.fillStyle = dots;
  for (let i = 0; i < 9; i++) g.fillRect(Math.floor(R() * 8), Math.floor(R() * 8), 1, 1);
});

const dasTex = texture(8, 8, (g) => {
  g.fillStyle = '#d33a2c';
  g.fillRect(0, 0, 8, 8);
  g.fillStyle = '#f4f1ec';
  g.fillRect(0, 5, 8, 3);
  g.fillRect(2, 1, 3, 2);
});

const shadeTex = texture(8, 8, (g) => {
  g.fillStyle = '#f1efe9';
  g.fillRect(0, 0, 8, 8);
  g.fillStyle = '#d6d2c8';
  g.fillRect(0, 1, 8, 1); g.fillRect(0, 3, 8, 1); g.fillRect(0, 5, 8, 1); g.fillRect(0, 7, 8, 1);
}, { repeat: true });
shadeTex.repeat.set(6, 1);

const mirrorTex = texture(16, 48, (g) => {
  for (let y = 0; y < 48; y++) {
    const t = y / 47;
    const c = Math.round(205 + 30 * t);
    g.fillStyle = `rgb(${c - 18}, ${c - 6}, ${c})`;
    g.fillRect(0, y, 16, 1);
  }
  g.fillStyle = 'rgba(255,255,255,0.75)';
  for (let i = 0; i < 10; i++) { g.fillRect(3 + i * 0.5 | 0, 30 - i * 2, 2, 2); }
  for (let i = 0; i < 6; i++) { g.fillRect(9 + i * 0.5 | 0, 22 - i * 2, 1, 2); }
  g.fillStyle = 'rgba(70, 70, 80, 0.35)';
  g.fillRect(5, 36, 6, 12);
});

// The open half of the closet: folded things on the shelf, a rail of shirts
// (the festive sweater included), jeans, and fabric bins along the bottom.
const closetTex = texture(24, 40, (g) => {
  const R = rng(17);
  g.fillStyle = '#232428';
  g.fillRect(0, 0, 24, 40);
  const folded = ['#ece8de', '#6e2b2e', '#17181b', '#9a9ca1', '#f2f0ea', '#3a3c42'];
  for (let x = 1; x < 23;) {
    const w = 3 + Math.floor(R() * 3), h = 2 + Math.floor(R() * 3);
    g.fillStyle = folded[Math.floor(R() * folded.length)];
    g.fillRect(x, 7 - h, Math.min(w, 23 - x), h);
    x += w;
  }
  g.fillStyle = '#8d8f94';
  g.fillRect(0, 7, 24, 1);
  g.fillStyle = '#c9cbd0';
  g.fillRect(0, 9, 24, 1);
  const shirts = ['#d9d6cf', '#ece9e1', '#8f9196', '#7a2f33', '#2f6f9e', '#4a3b30', '#2c2d31', '#55575d', '#e3e0d8'];
  for (let x = 0; x < 24; x += 2) {
    const sweater = x === 16;
    g.fillStyle = sweater ? '#1d1e22' : shirts[Math.floor(R() * shirts.length)];
    const len = sweater ? 13 : 9 + Math.floor(R() * 8);
    g.fillRect(x, 10, 2, len);
    if (sweater) {
      g.fillStyle = '#c8323a';
      for (let y = 12; y < 23; y += 3) g.fillRect(x + (y % 2), y, 1, 1);
      g.fillRect(x, 21, 2, 2);
    }
  }
  g.fillStyle = '#5a5c61';
  g.fillRect(0, 27, 24, 1);
  g.fillStyle = '#2a3346';
  g.fillRect(2, 25, 8, 2); g.fillRect(13, 24, 7, 3);
  for (const x of [1, 9, 17]) {
    g.fillStyle = '#6d6e70';
    g.fillRect(x, 31, 6, 8);
    g.fillStyle = '#4b4c4f';
    g.fillRect(x + 2, 33, 2, 1);
  }
});

// A still life in the thrift-store painting: yellow roses on a dark red ground.
const paintingTex = texture(8, 12, (g) => {
  g.fillStyle = '#5a2a1c';
  g.fillRect(0, 0, 8, 12);
  g.fillStyle = '#7d3a22';
  g.fillRect(0, 7, 8, 5);
  g.fillStyle = '#2e4a26';
  g.fillRect(3, 5, 2, 6); g.fillRect(1, 6, 2, 1); g.fillRect(5, 4, 2, 1);
  g.fillStyle = '#e8b93c';
  g.fillRect(2, 2, 2, 2); g.fillRect(5, 3, 2, 2); g.fillRect(3, 5, 1, 1);
  g.fillStyle = '#f4dc7a';
  g.fillRect(2, 2, 1, 1); g.fillRect(5, 3, 1, 1);
});

// Rice-paper lantern: horizontal ribs.
const lanternTex = texture(4, 32, (g) => {
  g.fillStyle = '#f6f4ee';
  g.fillRect(0, 0, 4, 32);
  g.fillStyle = '#ebe7de';
  g.fillRect(0, 0, 1, 32); // faint vertical seam between paper panels
  g.fillStyle = '#d6d1c4';
  for (let y = 3; y < 32; y += 4) g.fillRect(0, y, 4, 1);
}, { repeat: true });
lanternTex.repeat.set(6, 1);
// Lit from inside, the paper glows and the bamboo ribs show up as dark bands.
const lanternGlowTex = texture(4, 32, (g) => {
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 4, 32);
  g.fillStyle = '#e2e2e2';
  g.fillRect(0, 0, 1, 32);
  g.fillStyle = '#b8b8b8';
  for (let y = 3; y < 32; y += 4) g.fillRect(0, y, 4, 1);
}, { repeat: true });
lanternGlowTex.repeat.set(6, 1);
// Soft light around the lantern at night, drawn as a camera-facing halo.
const haloTex = texture(32, 32, (g) => {
  const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 32, 32);
});

// Rain outside the windows: short pixel streaks, scrolled down the glass.
const rainTex = texture(16, 32, (g) => {
  const R = rng(29);
  for (let i = 0; i < 30; i++) {
    g.fillStyle = R() < 0.6 ? '#eef3f9' : '#c3d0de';
    g.fillRect(Math.floor(R() * 16), Math.floor(R() * 32), 1, 3 + Math.floor(R() * 3));
  }
}, { repeat: true });
rainTex.repeat.set(6, 3);

// ------------------------------------------------------------------- walls

function wallBox(parent, size, pos) {
  const m = box(parent, size, pos, [toon(C.wall), toon(C.wall), toon(C.cap), toon(C.wall), toon(C.wall), toon(C.wall)]);
  m.userData.material = m.material;
  return m;
}

function buildWalls(root, hidden) {
  const { xMin, xMax, zMin, zMax, H, T } = ROOM;
  const zA = zMax + ALCOVE.depth; // the wall the door is in
  const STUB = 0.14;
  const walls = [];

  const add = (name, normal, slabs, decor = []) => {
    const stubs = slabs.map((m) => {
      const p = m.geometry.parameters;
      const stub = wallBox(root, [p.width, STUB, p.depth], [m.position.x, 0, m.position.z]);
      stub.visible = false;
      return stub;
    });
    walls.push({ name, normal: new THREE.Vector3(...normal), slabs, stubs, decor, cut: false });
  };

  // West (bed wall); East (desk wall); South (closet, then the door alcove); North (bay).
  const westDecor = [];
  const eastDecor = [];
  const southDecor = [];
  const trimMat = toon(C.trim);
  const len = zMax - zMin;

  // the deep ceiling beams that run along the east and west walls
  const beamH = H - BEAM.bottom;
  westDecor.push(box(root, [BEAM.depth, beamH, len], [xMin + BEAM.depth / 2, BEAM.bottom, 0], toon(C.wall)));
  eastDecor.push(box(root, [BEAM.depth, beamH, len], [xMax - BEAM.depth / 2, BEAM.bottom, 0], toon(C.wall)));

  // baseboards
  const base = (arr, w, d, x, z) => arr.push(box(root, [w, 0.09, d], [x, 0, z], trimMat, { cast: false }));
  base(westDecor, 0.015, len, xMin + 0.0075, 0);
  base(eastDecor, 0.015, zA - zMin, xMax - 0.0075, (zMin + zA) / 2);
  base(southDecor, CLOSET.x0 - xMin, 0.015, (xMin + CLOSET.x0) / 2, zMax - 0.0075);
  base(southDecor, ALCOVE.x0 - CLOSET.x1, 0.015, (CLOSET.x1 + ALCOVE.x0) / 2, zMax - 0.0075);
  base(southDecor, 0.015, ALCOVE.depth, ALCOVE.x0 + 0.0075, (zMax + zA) / 2);

  // closet: two sliding panel doors, both pushed to the west, so the east half is open
  const cw = CLOSET.x1 - CLOSET.x0, mid = (CLOSET.x0 + CLOSET.x1) / 2;
  const inside = new THREE.Mesh(new THREE.PlaneGeometry(cw / 2 - 0.06, CLOSET.h - 0.02), toon(0xffffff, { map: closetTex }));
  inside.position.set(mid + cw / 4 - 0.03, (CLOSET.h - 0.02) / 2, zMax - 0.004);
  inside.rotation.y = Math.PI;
  root.add(inside);
  southDecor.push(inside);
  const doorMat = toon(0xe9eae8);
  for (const [x0, x1, z] of [[CLOSET.x0 + 0.06, mid + 0.02, zMax - 0.03], [CLOSET.x0 + 0.1, mid + 0.06, zMax - 0.065]]) {
    const xc = (x0 + x1) / 2, w = x1 - x0;
    southDecor.push(box(root, [w, CLOSET.h - 0.02, 0.03], [xc, 0, z], doorMat));
    southDecor.push(box(root, [w - 0.16, CLOSET.h - 0.3, 0.012], [xc, 0.14, z - 0.018], toon(0xf3f4f2)));
    southDecor.push(box(root, [0.03, 0.15, 0.01], [x1 - 0.06, 0.92, z - 0.022], toon(C.grey)));
  }
  southDecor.push(box(root, [cw, 0.09, 0.03], [mid, CLOSET.h, zMax - 0.015], trimMat));
  for (const x of [CLOSET.x0 + 0.03, CLOSET.x1 - 0.03]) southDecor.push(box(root, [0.06, CLOSET.h, 0.03], [x, 0, zMax - 0.015], trimMat));
  // light switch by the alcove
  southDecor.push(box(root, [0.07, 0.115, 0.01], [(CLOSET.x1 + ALCOVE.x0) / 2 + 0.02, 1.1, zMax - 0.005], toon(C.white)));

  // the room door at the back of the alcove, hinged on the desk-wall side
  const dx = (ALCOVE.x0 + xMax) / 2;
  southDecor.push(box(root, [0.72, 2.03, 0.04], [dx, 0, zA - 0.02], toon(0xeceeed)));
  southDecor.push(box(root, [0.58, 1.6, 0.01], [dx, 0.24, zA - 0.045], toon(0xf3f4f2)));
  southDecor.push(box(root, [0.84, 0.07, 0.03], [dx, 2.03, zA - 0.015], trimMat));
  southDecor.push(box(root, [0.1, 0.02, 0.02], [ALCOVE.x0 + 0.16, 0.9, zA - 0.07], toon(C.silver)));
  // smoke-alarm speaker above it
  southDecor.push(box(root, [0.12, 0.15, 0.06], [dx, 2.16, zA - 0.03], toon(C.white)));

  add('west', [1, 0, 0], [wallBox(root, [T, H, len + 2 * T], [xMin - T / 2, 0, 0])], westDecor);
  add('east', [-1, 0, 0], [wallBox(root, [T, H, zA - zMin + 2 * T], [xMax + T / 2, 0, (zMin + zA) / 2])], eastDecor);
  add('south', [0, 0, -1], [
    wallBox(root, [ALCOVE.x0 - xMin + T, H, T], [(xMin - T + ALCOVE.x0) / 2, 0, zMax + T / 2]),
    wallBox(root, [T, H, ALCOVE.depth], [ALCOVE.x0 - T / 2, 0, (zMax + zA) / 2]),
    wallBox(root, [xMax - ALCOVE.x0 + 2 * T, H, T], [(ALCOVE.x0 - T + xMax + T) / 2, 0, zA + T / 2]),
  ], southDecor);

  // the thrifted painting, hung on the pier between the headboard and the bay
  const northDecor = [];
  const art = new THREE.Group();
  art.position.set(-1.27, 1.62, zMin);
  root.add(art);
  northDecor.push(
    box(art, [0.33, 0.47, 0.035], [0, -0.235, 0.0175], toon(0x3a2216)),
    box(art, [0.27, 0.41, 0.006], [0, -0.205, 0.036], toon(0xd9c7a0), { cast: false }),
  );
  const canvas = new THREE.Mesh(new THREE.PlaneGeometry(0.21, 0.35), toon(0xffffff, { map: paintingTex }));
  canvas.position.set(0, 0, 0.04);
  art.add(canvas);
  northDecor.push(canvas);

  // north wall: a pier either side of the bay opening, and the header above it
  add('north', [0, 0, 1], [
    wallBox(root, [BAY.left - xMin + T, H, T], [(xMin - T + BAY.left) / 2, 0, zMin - T / 2]),
    wallBox(root, [xMax + T - BAY.right, H, T], [(BAY.right + xMax + T) / 2, 0, zMin - T / 2]),
    wallBox(root, [BAY.right - BAY.left, H - BAY.ceil, T], [(BAY.left + BAY.right) / 2, BAY.ceil, zMin - T / 2]),
  ], northDecor);

  // Invisible ceilings: the camera looks in from above, but sunlight should
  // still only get in through the windows.
  const ceiling = box(root, [xMax - xMin + 2 * T, 0.05, zA - zMin + 2 * T], [0, H, (zMin + zA) / 2], shadowOnly);
  const bayCeil = box(root, [BAY.right - BAY.left + 0.3, 0.05, BAY.depth + 0.25], [(BAY.left + BAY.right) / 2, BAY.ceil, zMin - BAY.depth / 2 - 0.05], shadowOnly);
  hidden.push(ceiling, bayCeil);
  return walls;
}

// Cut-away: walls between the camera and the room drop to a stub, but keep
// casting shadows so the light still behaves like it's an enclosed room.
export function setWallCut(wall, cut, hidden) {
  if (wall.cut === cut) return;
  wall.cut = cut;
  for (const m of wall.slabs) {
    m.material = cut ? shadowOnly : m.userData.material;
    const i = hidden.indexOf(m);
    if (cut && i < 0) hidden.push(m);
    if (!cut && i >= 0) hidden.splice(i, 1);
  }
  wall.stubs.forEach((m) => (m.visible = cut));
  wall.decor.forEach((m) => (m.visible = !cut));
}

// ------------------------------------------------------------------ floor

function buildFloor(root) {
  const { xMin, xMax, zMin, zMax, T } = ROOM;
  const zb = zMin - BAY.depth, zA = zMax + ALCOVE.depth;
  const pts = [
    [xMin - T, zMax + T], [ALCOVE.x0 - T, zMax + T], [ALCOVE.x0 - T, zA + T], [xMax + T, zA + T],
    [xMax + T, zMin - T], [BAY.right + 0.07, zMin - T],
    [BAY.back[1] + 0.09, zb - 0.13], [BAY.back[0] - 0.09, zb - 0.13],
    [BAY.left - 0.09, zMin - BAY.ret - 0.04], [BAY.left - 0.09, zMin - T], [xMin - T, zMin - T],
  ];
  const shape = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)));
  const depth = 0.32;
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, -depth, 0);
  const floor = new THREE.Mesh(geo, [toon(0xffffff, { map: floorTex }), toon(C.slab)]);
  floor.receiveShadow = true;
  root.add(floor);
}

// -------------------------------------------------------------- bay window

// Faces run left to right as seen from inside; `win` is where the window sits
// along each face (metres from its left end). The left one is open.
const ZB = ROOM.zMin - BAY.depth;
const BAY_FACES = [
  { a: [BAY.left, ROOM.zMin], b: [BAY.left, ROOM.zMin - BAY.ret], win: null },
  { a: [BAY.left, ROOM.zMin - BAY.ret], b: [BAY.back[0], ZB], win: [0.04, 0.78], open: true },
  { a: [BAY.back[0], ZB], b: [BAY.back[1], ZB], win: [0.1, 0.91] },
  { a: [BAY.back[1], ZB], b: [BAY.right, ROOM.zMin], win: [0.08, 0.83] },
];

function buildBay(root, ctx) {
  const white = toon(C.trim);
  const wallMat = toon(C.wall);
  const shadeMat = toon(0xffffff, { map: shadeTex });
  const glint = ctx.glintMat;

  BAY_FACES.forEach((f, idx) => {
    const dx = f.b[0] - f.a[0], dz = f.b[1] - f.a[1];
    const w = Math.hypot(dx, dz);
    const g = new THREE.Group();
    g.position.set((f.a[0] + f.b[0]) / 2, 0, (f.a[1] + f.b[1]) / 2);
    g.rotation.y = Math.atan2(-dz / w, dx / w);
    root.add(g);
    g.updateMatrixWorld();
    if (!f.win) {
      box(g, [w, BAY.ceil, 0.17], [0, 0, -0.025], wallMat);
      return;
    }

    const [wa, wb] = f.win;
    const ow = wb - wa;                 // window width
    const cx = (wa + wb) / 2 - w / 2;   // window centre, local x
    const y0 = BAY.sill + 0.035;        // bottom of the glass
    const { meet, headRail, blinds: shadeBot } = SASH;

    // solid wall either side of the window, knee wall below, header above
    if (wa > 0.001) box(g, [wa, BAY.ceil, 0.17], [-w / 2 + wa / 2, 0, -0.025], wallMat);
    if (w - wb > 0.001) box(g, [w - wb, BAY.ceil, 0.17], [w / 2 - (w - wb) / 2, 0, -0.025], wallMat);
    box(g, [ow, BAY.sill, 0.16], [cx, 0, -0.02], wallMat);
    box(g, [ow + 0.06, 0.035, 0.23], [cx, BAY.sill, 0.06], white);
    box(g, [ow, BAY.ceil - BAY.head, 0.16], [cx, BAY.head, -0.02], wallMat);

    // outside view, behind everything (doesn't block sunlight)
    const view = new THREE.Mesh(new THREE.PlaneGeometry(ow, BAY.head - y0), ctx.viewMat);
    view.position.set(cx, (BAY.head + y0) / 2, -0.07);
    g.add(view);
    g.updateMatrixWorld(true);
    const pos = view.geometry.attributes.position, uv = view.geometry.attributes.uv;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(view.matrixWorld);
      uv.setXY(i, 0.5 + v.x / 4, (v.y + 1.2) / 4);
    }
    // fog and rain, between the view and the glass (weather.js turns them on)
    for (const [mat, z] of [[ctx.hazeMat, -0.066], [ctx.rainMat, -0.062]]) {
      const m = new THREE.Mesh(view.geometry, mat);
      m.position.set(cx, (BAY.head + y0) / 2, z);
      g.add(m);
      ctx.overlays.push(m);
    }

    // sash frames
    const lift = f.open ? 0.42 : 0;
    const rail = (yy, h, z = 0) => box(g, [ow, h, 0.045], [cx, yy, z], white);
    const stiles = (ya, yb, z = 0) => {
      for (const s of [-1, 1]) box(g, [0.045, yb - ya, 0.045], [cx + s * (ow / 2 - 0.0225), ya, z], white);
    };
    // upper sash (outer track)
    rail(meet, 0.06, -0.03);
    stiles(meet, headRail, -0.03);
    // lower sash (inner track); the open window has it pushed up
    rail(y0 + lift, 0.07, 0.02);
    rail(meet - 0.05 + lift, 0.06, 0.02);
    stiles(y0 + lift, meet + lift, 0.02);
    // head rail + transom
    box(g, [ow + 0.02, 0.11, 0.12], [cx, headRail, 0], white);
    box(g, [0.035, BAY.head - headRail - 0.11, 0.04], [cx, headRail + 0.11, -0.02], white);

    // glass glints (short diagonal highlights)
    const glintAt = (x, y) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.022, 0.22), glint);
      m.position.set(x, y, -0.055);
      m.rotation.z = -0.7;
      g.add(m);
    };
    glintAt(cx - ow / 2 + 0.17, 1.78);
    glintAt(cx - ow / 2 + 0.23, 1.73);
    if (!f.open) glintAt(cx - ow / 2 + 0.17, 1.0);

    // raised venetian blinds under their valance, plus the pull cords
    box(g, [ow + 0.06, 0.11, 0.1], [cx, BAY.ceil - 0.11, 0.06], white);
    box(g, [ow, BAY.ceil - 0.11 - shadeBot, 0.07], [cx, shadeBot, 0.06], shadeMat);
    for (const s of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(cx + s * (ow / 2 - 0.1), shadeBot, 0.1);
      g.add(pivot);
      box(pivot, [0.008, 0.38, 0.008], [0, -0.38, 0], white, { cast: false });
      box(pivot, [0.02, 0.03, 0.02], [0, -0.41, 0], white, { cast: false });
      ctx.cords.push({ pivot, phase: idx * 1.3 + s, gain: f.open ? 1 : 0.35 });
    }

    if (f.open) {
      // where the breeze comes in: the gap under the raised sash
      const c = new THREE.Vector3(cx, (y0 + y0 + lift) / 2, 0).applyMatrix4(g.matrixWorld);
      const n = new THREE.Vector3(0, 0, 1).transformDirection(g.matrixWorld);
      const along = new THREE.Vector3(1, 0, 0).transformDirection(g.matrixWorld);
      ctx.openWindow = { center: c, normal: n, along, width: ow, height: lift };
    }
    ctx.faces.push({ group: g, x0: cx - ow / 2, x1: cx + ow / 2, y0, yTop: shadeBot });
  });
}

// --------------------------------------------------------------- furniture

function lamp(parent, x, y, z, lamps) {
  cyl(parent, [0.05, 0.055, 0.3], [x, y, z], toon(0xffffff, { map: ridgeTex }), { seg: 12 });
  rod(parent, [x, y + 0.3, z], [x, y + 0.42, z], 0.008, toon(C.silver));
  const shadeMat = toon(0xefe9dc, { side: THREE.DoubleSide, emissive: 0xffb466, emissiveIntensity: 0 });
  cyl(parent, [0.15, 0.165, 0.21], [x, y + 0.3, z], shadeMat, { seg: 14, open: true });
  cyl(parent, [0.012, 0.012, 0.03], [x, y + 0.51, z], toon(C.silver), { seg: 6 });
  lamps.push({ pos: new THREE.Vector3(x, y + 0.4, z), mat: shadeMat, color: 0xffa456 });
}

function buildBed(root) {
  const g = new THREE.Group();
  root.add(g);
  const x0 = ROOM.xMin + 0.07, len = 1.91, z0 = ROOM.zMin + 0.01, wid = 1.37; // a full, its long side along the bay opening
  const cx = x0 + len / 2, cz = z0 + wid / 2;
  const duvet = toon(0xffffff, { map: duvetTex });

  box(g, [len, 0.25, wid], [cx, 0.05, cz], toon(C.frame));
  box(g, [len - 0.04, 0.2, wid - 0.04], [cx, 0.3, cz], toon(C.sheet));
  const dl = len - 0.42, dcx = x0 + 0.42 + dl / 2;
  box(g, [dl + 0.04, 0.1, wid + 0.08], [dcx, 0.46, cz], duvet);
  box(g, [dl + 0.04, 0.22, 0.03], [dcx, 0.26, z0 - 0.025], duvet);
  box(g, [dl + 0.04, 0.22, 0.03], [dcx, 0.26, z0 + wid + 0.025], duvet);
  box(g, [0.03, 0.22, wid + 0.08], [x0 + len + 0.03, 0.26, cz], duvet);
  // a rumpled ridge so the duvet doesn't look like a brick
  box(g, [0.5, 0.06, wid - 0.1], [x0 + 0.62, 0.53, cz + 0.03], duvet, { rot: [0, 0.12, 0] });

  // headboard: three upholstered channels
  const hb = toon(0x4b4f56);
  box(g, [0.07, 0.48, wid + 0.12], [ROOM.xMin + 0.035, 0.05, cz], hb);
  for (const [y, h] of [[0.53, 0.15], [0.69, 0.15], [0.85, 0.15]]) box(g, [0.085, h, wid + 0.12], [ROOM.xMin + 0.043, y, cz], hb);

  // pillows
  const pillow = toon(C.sheet);
  box(g, [0.36, 0.13, 0.56], [x0 + 0.24, 0.5, cz - 0.32], pillow, { rot: [0, 0.05, 0.08] });
  box(g, [0.36, 0.13, 0.56], [x0 + 0.24, 0.5, cz + 0.32], pillow, { rot: [0, -0.04, 0.08] });
  box(g, [0.12, 0.5, 0.52], [x0 + 0.12, 0.5, cz - 0.26], toon(C.greyPillow), { rot: [0, 0, -0.32] });

  // folded navy blanket on sherpa
  box(g, [0.56, 0.05, 0.5], [x0 + 1.35, 0.56, cz - 0.15], toon(C.sherpa), { rot: [0, 0.12, 0] });
  box(g, [0.55, 0.09, 0.48], [x0 + 1.35, 0.61, cz - 0.16], toon(C.navy), { rot: [0, 0.12, 0] });
}

function buildNightstand(root, lamps) {
  const x = ROOM.xMin + 0.2, z = 0.35; // just south of the headboard
  const wood = toon(C.oakMid);
  const rattan = toon(0xffffff, { map: rattanTex });
  for (const [dx, dz] of [[-0.16, -0.25], [-0.16, 0.25], [0.16, -0.25], [0.16, 0.25]]) box(root, [0.04, 0.08, 0.04], [x + dx, 0, z + dz], wood);
  box(root, [0.38, 0.5, 0.56], [x, 0.08, z], wood);
  box(root, [0.4, 0.03, 0.58], [x, 0.58, z], wood);
  box(root, [0.4, 0.03, 0.02], [x, 0.61, z - 0.28], wood);
  box(root, [0.4, 0.03, 0.02], [x, 0.61, z + 0.28], wood);
  for (const y of [0.12, 0.35]) {
    box(root, [0.02, 0.19, 0.48], [x + 0.19, y, z], rattan);
    box(root, [0.02, 0.015, 0.08], [x + 0.205, y + 0.165, z], toon(C.brass));
  }
  lamp(root, x - 0.05, 0.61, z + 0.13, lamps);
  cyl(root, [0.036, 0.036, 0.23], [x + 0.08, 0.61, z - 0.05], toon(C.white));
  cyl(root, [0.026, 0.03, 0.045], [x + 0.08, 0.84, z - 0.05], toon(C.charcoal));
  box(root, [0.075, 0.01, 0.15], [x + 0.1, 0.61, z - 0.18], toon(C.black), { rot: [0, 0.3, 0] });
  // foam roller standing beside it
  cyl(root, [0.075, 0.075, 0.45], [ROOM.xMin + 0.12, 0, z + 0.47], toon(C.charcoal));
}

function buildDesk(root, lamps, ctx) {
  const { x0, x1, z0, z1, top } = DESK;
  const xc = (x0 + x1) / 2, zc = (z0 + z1) / 2;
  const walnut = toon(C.walnut), dark = toon(C.walnutDark);
  box(root, [x1 - x0, 0.035, z1 - z0], [xc, top - 0.035, zc], walnut);
  box(root, [0.02, 0.07, z1 - z0 - 0.1], [x0 + 0.04, top - 0.105, zc], dark);
  for (const z of [z0 + 0.04]) for (const x of [x0 + 0.04, x1 - 0.04]) box(root, [0.045, top - 0.035, 0.045], [x, 0, z], dark);
  // two-drawer pedestal with an open cubby, at the south end
  const pz = z1 - 0.22;
  box(root, [x1 - x0 - 0.02, top - 0.035, 0.42], [xc, 0, pz], dark);
  box(root, [0.01, 0.2, 0.36], [x0 + 0.005, 0.36, pz], toon(0x231811));
  for (const y of [0.04, 0.2]) {
    box(root, [0.012, 0.15, 0.37], [x0 - 0.002, y + 0.02, pz], walnut);
    box(root, [0.02, 0.014, 0.1], [x0 - 0.01, y + 0.12, pz], toon(C.black));
  }

  // radiator along the solid part of the bay's right face, with a board on it
  // for the box fan
  const rad = new THREE.Group();
  rad.position.set(1.35, 0, -1.49);
  rad.rotation.y = -0.81;
  root.add(rad);
  box(rad, [0.5, 0.025, 0.26], [0, 0.45, 0], toon(0x8a7a66));
  for (let i = 0; i < 8; i++) box(rad, [0.04, 0.4, 0.16], [-0.21 + i * 0.06, 0.04, -0.02], toon(0x7d8085));
  const fan = new THREE.Group();
  fan.position.set(1.4, 0.475, -1.27);
  fan.rotation.y = -0.88;
  root.add(fan);
  box(fan, [0.54, 0.54, 0.12], [0, 0.02, 0], toon(C.white));
  const face = new THREE.Mesh(new THREE.PlaneGeometry(0.49, 0.49), toon(0xffffff, { map: grilleTex }));
  face.position.set(0, 0.29, 0.061);
  face.receiveShadow = true;
  fan.add(face);
  for (const s of [-1, 1]) box(fan, [0.06, 0.02, 0.16], [s * 0.2, 0, 0], toon(C.white));

  // books, the Crumbee box, keys
  box(root, [0.16, 0.05, 0.24], [1.28, top, -0.96], toon(0x1d2331), { rot: [0, 0.15, 0] });
  box(root, [0.15, 0.04, 0.225], [1.28, top + 0.005, -0.96], toon(0xe8e0cc), { rot: [0, 0.15, 0] });
  box(root, [0.085, 0.085, 0.085], [1.27, top + 0.05, -0.98], toon(0xffffff, { map: speckleTex('#bcd2e6', '#2f4a73', 5) }), { rot: [0, 0.4, 0] });
  box(root, [0.05, 0.008, 0.02], [1.22, top, -0.62], toon(C.brass), { rot: [0, 0.6, 0] });
  box(root, [0.04, 0.008, 0.015], [1.24, top, -0.6], toon(C.silver), { rot: [0, -0.3, 0] });

  // closed laptop behind the snake plant
  box(root, [0.22, 0.016, 0.31], [1.53, top, -0.74], toon(0x2b2c30), { rot: [0, -0.06, 0] });

  // ultrawide monitor on an arm clamped to the back edge
  const mon = new THREE.Group();
  mon.position.set(1.58, 0, -0.38);
  root.add(mon);
  box(mon, [0.035, 0.37, 0.82], [0, 0.83, 0], toon(C.black));
  box(mon, [0.04, 0.04, 0.82], [-0.002, 0.8, 0], toon(0x3a3c40));
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.79, 0.33), ctx.screenMat);
  screen.rotation.y = -Math.PI / 2;
  screen.position.set(-0.019, 1.015, 0);
  mon.add(screen);
  const arm = toon(C.silver);
  box(root, [0.08, 0.02, 0.1], [1.63, top, -0.2], arm);
  rod(root, [1.63, top, -0.2], [1.63, top + 0.2, -0.2], 0.018, arm);
  rod(root, [1.63, top + 0.2, -0.2], [1.61, top + 0.25, -0.38], 0.015, arm);
  ctx.screenPos = new THREE.Vector3(1.4, 1.0, -0.38);

  // keyboard + mouse
  box(root, [0.13, 0.022, 0.43], [1.27, top, -0.3], toon(0xffffff, { map: keysTex }));
  box(root, [0.1, 0.035, 0.065], [1.27, top, 0.03], toon(C.charcoal));

  // DAS clay on a white book
  box(root, [0.15, 0.03, 0.21], [1.27, top, 0.38], toon(C.white), { rot: [0, -0.1, 0] });
  box(root, [0.12, 0.035, 0.17], [1.27, top + 0.03, 0.38], toon(0xffffff, { map: dasTex }), { rot: [0, -0.1, 0] });

  lamp(root, 1.55, top, 0.52, lamps);
}

// Leaning by the closet: the skateboard and the backpack.
function buildCorner(root) {
  const z = ROOM.zMax;
  const deck = new THREE.Group();
  deck.position.set(0.77, 0, z - 0.06);
  deck.rotation.x = 0.13;
  root.add(deck);
  box(deck, [0.2, 0.78, 0.014], [0, 0.02, 0], toon(0x1b1b1e));
  box(deck, [0.2, 0.05, 0.016], [0, 0.76, 0], toon(0x8a5a33));
  box(deck, [0.07, 0.07, 0.003], [0, 0.32, -0.008], toon(0xdedede));
  for (const y of [0.15, 0.62]) {
    box(deck, [0.14, 0.025, 0.05], [0, y, 0.035], toon(C.silver));
    for (const s of [-1, 1]) cyl(deck, [0.027, 0.027, 0.03], [s * 0.085, y - 0.01, 0.06], toon(0xd9cdb3), { rot: [0, 0, Math.PI / 2], seg: 8 });
  }

  const pack = new THREE.Group();
  pack.position.set(0.12, 0, z - 0.32);
  pack.rotation.y = 0.5;
  root.add(pack);
  box(pack, [0.46, 0.1, 0.32], [0, 0, 0], toon(0x8a6a48));
  box(pack, [0.44, 0.13, 0.3], [0.01, 0.08, 0], toon(0x3b3e42), { rot: [0, 0, 0.06] });
  box(pack, [0.2, 0.06, 0.24], [-0.06, 0.2, 0.01], toon(0x55595e));
  box(pack, [0.04, 0.012, 0.3], [0.2, 0.0, 0.2], toon(0x6f6656), { rot: [0, 0.4, 0] });
}

function buildChair(root) {
  const g = new THREE.Group();
  g.position.set(0.72, 0, -0.3);
  g.rotation.y = 0.1;
  root.add(g);
  const blk = toon(C.black);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    box(g, [0.3, 0.035, 0.045], [Math.cos(a) * 0.15, 0.05, -Math.sin(a) * 0.15], blk, { rot: [0, a, 0] });
    box(g, [0.04, 0.05, 0.04], [Math.cos(a) * 0.29, 0, -Math.sin(a) * 0.29], blk);
  }
  cyl(g, [0.025, 0.025, 0.35], [0, 0.08, 0], toon(C.grey), { seg: 6 });
  box(g, [0.48, 0.07, 0.48], [0, 0.43, 0], blk);
  box(g, [0.05, 0.58, 0.45], [-0.26, 0.52, 0], toon(0x26272b), { rot: [0, 0, 0.1] });
  for (const s of [-1, 1]) box(g, [0.26, 0.04, 0.05], [0, 0.65, s * 0.25], blk);
  // grey hoodie thrown over the back
  const hood = toon(0x6f7073);
  box(g, [0.16, 0.12, 0.5], [-0.29, 1.02, 0], hood, { rot: [0, 0, 0.1] });
  box(g, [0.05, 0.62, 0.46], [-0.35, 0.42, 0], hood, { rot: [0, 0, 0.12] });
  box(g, [0.05, 0.4, 0.1], [-0.18, 0.6, 0.24], hood, { rot: [0, 0, -0.2] });
}

function buildBike(root, hidden) {
  const g = new THREE.Group();
  g.position.set(0.05, 0, ROOM.zMin - BAY.depth + 0.46); // leaning on the centre window
  g.rotation.x = -0.07;
  root.add(g);
  const frame = toon(0x202125);
  const accent = toon(C.red);
  const P = {
    bb: [-0.04, 0.29, 0], seat: [-0.2, 0.86, 0], headTop: [0.4, 0.86, 0], headBot: [0.43, 0.7, 0],
    rear: [-0.52, 0.335, 0], front: [0.52, 0.335, 0],
  };
  for (const x of [-0.52, 0.52]) {
    const tire = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.017, 4, 28), toon(C.black));
    tire.position.set(x, 0.335, 0);
    tire.castShadow = true;
    g.add(tire);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.305, 0.008, 3, 28), toon(0x3b3d42));
    rim.position.set(x, 0.335, 0);
    g.add(rim);
    const pts = [];
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      pts.push(new THREE.Vector3(x, 0.335, 0), new THREE.Vector3(x + Math.cos(a) * 0.3, 0.335 + Math.sin(a) * 0.3, 0));
    }
    const spokes = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x8c8e93 }));
    g.add(spokes);
    hidden.push(spokes);
    cyl(g, [0.025, 0.025, 0.08], [x, 0.295, 0], toon(C.grey), { rot: [Math.PI / 2, 0, 0], seg: 6 });
  }
  rod(g, P.seat, P.headTop, 0.019, frame);
  rod(g, P.bb, P.headBot, 0.025, frame);
  rod(g, [0.06, 0.4, 0], [0.3, 0.6, 0], 0.027, accent);
  rod(g, P.bb, P.seat, 0.02, frame);
  rod(g, P.bb, P.rear, 0.014, frame);
  rod(g, P.seat, P.rear, 0.012, frame);
  rod(g, [-0.3, 0.3, 0], [-0.14, 0.29, 0], 0.017, accent);
  rod(g, P.headBot, P.headTop, 0.024, frame);
  rod(g, P.headBot, P.front, 0.015, frame);
  rod(g, P.seat, [-0.24, 0.98, 0], 0.013, toon(C.grey));
  box(g, [0.26, 0.045, 0.12], [-0.26, 0.98, 0], toon(C.black));
  rod(g, P.headTop, [0.46, 0.95, 0], 0.016, frame);
  rod(g, [0.46, 0.95, -0.26], [0.46, 0.95, 0.26], 0.012, frame);
  for (const s of [-1, 1]) rod(g, [0.46, 0.95, s * 0.18], [0.46, 0.95, s * 0.26], 0.017, toon(C.black));
  // chainring on the side facing the room, pedals
  cyl(g, [0.1, 0.1, 0.012], [-0.04, 0.29, 0.03], toon(0x2a2b2f), { rot: [Math.PI / 2, 0, 0], seg: 12 });
  rod(g, [-0.04, 0.29, 0.05], [0.08, 0.2, 0.05], 0.012, toon(0x2a2b2f));
  box(g, [0.09, 0.02, 0.08], [0.1, 0.18, 0.09], toon(C.black));
  // helmet hanging off the bars
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), toon(0x1a1b1e, { side: THREE.DoubleSide }));
  helmet.scale.set(1.15, 0.9, 1);
  helmet.position.set(0.47, 0.78, 0.17);
  helmet.rotation.set(0.25, 0.3, -0.35);
  helmet.castShadow = true;
  g.add(helmet);
  box(g, [0.06, 0.02, 0.14], [0.47, 0.8, 0.17], toon(0x6d6f75), { rot: [0.25, 0.3, -0.35] });
}

function buildMirror(root, ctx) {
  const g = new THREE.Group();
  g.position.set(0.98, 0, -1.71); // leaning in front of the bay's right window, facing the bed
  g.rotation.set(-0.08, -0.81, 0, 'YXZ');
  root.add(g);
  const W = 0.52, Hs = 1.38, R = W / 2;
  const arch = (w, inset) => {
    const r = w / 2;
    const s = new THREE.Shape();
    s.moveTo(-r, inset);
    s.lineTo(r, inset);
    s.lineTo(r, Hs);
    s.absarc(0, Hs, r, 0, Math.PI, false);
    s.lineTo(-r, inset);
    return s;
  };
  const outer = arch(W, 0);
  outer.holes.push(arch(W - 0.05, 0.025));
  const frame = new THREE.Mesh(new THREE.ExtrudeGeometry(outer, { depth: 0.025, bevelEnabled: false, curveSegments: 10 }), toon(C.black));
  frame.castShadow = frame.receiveShadow = true;
  g.add(frame);
  const glassGeo = new THREE.ShapeGeometry(arch(W - 0.05, 0.025), 10);
  const uv = glassGeo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) + R) / W, uv.getY(i) / (Hs + R));
  const glass = new THREE.Mesh(glassGeo, ctx.mirrorMat);
  glass.position.z = 0.012;
  g.add(glass);
  ctx.mirrorGlass = glass; // mirror.js turns this into a real reflection
}

// A paper globe lantern hung from a ceiling hook over the bed; its cord runs
// across the ceiling to the corner by the bay and down the wall.
function buildLantern(root, lamps) {
  const { H } = ROOM;
  const x = -0.53, z = -0.7, r = 0.22, cy = 2.08;
  const cord = toon(C.white);
  const mat = toon(0xffffff, { map: lanternTex, emissive: 0xff6a12, emissiveMap: lanternGlowTex, emissiveIntensity: 0 }); // a deep orange bulb
  const globe = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), mat);
  globe.position.set(x, cy, z);
  globe.scale.y = 0.94;
  globe.castShadow = globe.receiveShadow = true;
  root.add(globe);
  // The bulb sits in the middle, so the paper facing you glows hardest and the
  // rim, where you look through more paper, stays darker (in a few flat steps).
  mat.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      {
        vec3 vd = isOrthographic ? vec3(0.0, 0.0, 1.0) : normalize(vViewPosition);
        float f = floor(pow(clamp(dot(normal, vd), 0.0, 1.0), 1.4) * 4.0) / 4.0;
        totalEmissiveRadiance *= mix(0.3, 1.9, f);
      }`);
  };
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex, color: 0xffa860, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
  halo.position.set(x, cy, z);
  halo.scale.setScalar(r * 7); // env.js puts it in the effects scene, with the dust motes
  cyl(root, [0.05, 0.05, 0.01], [x, cy - r * 0.94 - 0.005, z], toon(C.silver), { seg: 8 });
  box(root, [0.05, 0.01, 0.05], [x, H - 0.01, z], cord);
  rod(root, [x, H - 0.01, z], [x, cy + r * 0.9, z], 0.005, cord);
  const cx = ROOM.xMin + BEAM.depth + 0.02, cz = ROOM.zMin + 0.03;
  rod(root, [x, H - 0.02, z], [cx, H - 0.03, cz], 0.004, cord);
  rod(root, [cx, H - 0.03, cz], [cx, BEAM.bottom - 0.01, cz], 0.004, cord);
  rod(root, [cx, BEAM.bottom - 0.01, cz], [ROOM.xMin + 0.02, BEAM.bottom - 0.01, cz], 0.004, cord);
  rod(root, [ROOM.xMin + 0.02, BEAM.bottom - 0.01, cz], [ROOM.xMin + 0.02, 0.2, cz], 0.004, cord);
  box(root, [0.025, 0.07, 0.025], [ROOM.xMin + 0.025, 1.12, cz], cord);
  // lit from inside, the paper itself turns orange rather than white
  lamps.push({ pos: new THREE.Vector3(x, cy, z), mat, color: 0xff6a12, paper: 0x8a3a0e, glow: 1.8, power: 1.8, halo });
}

// The bamboo plant stand in the bay's left corner: three round white trays at
// different heights. Plant positions in plants.json sit on these trays.
export const PLANT_STAND = [
  { x: -0.43, z: -1.6, y: 0.71, r: 0.13 }, // snake plant
  { x: -0.74, z: -1.58, y: 0.49, r: 0.14 }, // monstera
  { x: -0.22, z: -1.74, y: 0.08, r: 0.17 }, // bird of paradise
];

function buildPlantStand(root) {
  const bamboo = toon(0xd2a96a), tray = toon(0xf1f0eb);
  for (const t of PLANT_STAND) {
    const legR = t.r * 0.72;
    for (let i = 0; i < 3; i++) {
      const a = i * (Math.PI * 2 / 3) + 0.5;
      const lx = t.x + legR * Math.cos(a), lz = t.z + legR * Math.sin(a);
      cyl(root, [0.012, 0.012, t.y - 0.02], [lx, 0, lz], bamboo, { seg: 6 });
    }
    if (t.y > 0.3) {
      // a bamboo ring partway down holds the legs together
      cyl(root, [legR + 0.01, legR + 0.01, 0.02], [t.x, t.y * 0.32, t.z], bamboo, { seg: 12, open: true });
    }
    cyl(root, [t.r, t.r * 0.96, 0.03], [t.x, t.y - 0.03, t.z], tray, { seg: 16 });
    cyl(root, [t.r + 0.004, t.r + 0.004, 0.012], [t.x, t.y, t.z], tray, { seg: 16, open: true });
  }
}

// --------------------------------------------------------------------- all

export function buildRoom() {
  const root = new THREE.Group();
  const hidden = [];
  const ctx = {
    viewMat: new THREE.MeshBasicMaterial({ color: 0xffffff }),
    glintMat: new THREE.MeshBasicMaterial({ color: 0xffffff }),
    mirrorMat: new THREE.MeshBasicMaterial({ map: mirrorTex }),
    hazeMat: new THREE.MeshBasicMaterial({ color: 0xe6eaee, transparent: true, opacity: 0, depthWrite: false }),
    rainMat: new THREE.MeshBasicMaterial({ map: rainTex, transparent: true, opacity: 0, depthWrite: false, visible: false }),
    overlays: [],
    screenMat: new THREE.MeshBasicMaterial({ map: screenTex }),
    cords: [],
    faces: [],
    lamps: [],
    openWindow: null,
  };
  const walls = buildWalls(root, hidden);
  buildFloor(root);
  buildBay(root, ctx);
  buildBed(root);
  buildNightstand(root, ctx.lamps);
  buildDesk(root, ctx.lamps, ctx);
  buildChair(root);
  buildCorner(root);
  buildLantern(root, ctx.lamps);
  buildPlantStand(root);
  buildBike(root, hidden);
  buildMirror(root, ctx);
  hidden.push(...ctx.overlays);

  return {
    root, walls, hidden, ...ctx,
    animate(t, wind) {
      for (const c of ctx.cords) {
        const w = wind.strength(t - 0.2) * c.gain;
        c.pivot.rotation.x = -0.25 * w - 0.08 * w * Math.sin(t * 3.1 + c.phase);
        c.pivot.rotation.z = 0.05 * w * Math.sin(t * 2.3 + c.phase * 2);
      }
    },
  };
}
