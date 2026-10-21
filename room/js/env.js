// Time of day: sun position, sky outside the bay, lamps at night, dust in the
// light, and soft sunbeams. The room keeps its own clock, so a visitor in
// another time zone sees it as it is right now.
import * as THREE from 'three';
import { texture, rng, smoothstep, lerp } from './util.js';
import { ROOM } from './room.js';
import { CLOCK } from './place.js';

const DEG = Math.PI / 180;

function parts(date, timeZone) {
  const p = {};
  new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' })
    .formatToParts(date).forEach((x) => (p[x.type] = +x.value || x.value));
  return p;
}
function utcOffset(date, timeZone) {
  const p = parts(date, timeZone);
  const local = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  return Math.round(((local - date.getTime()) / 3600000) * 4) / 4;
}

export function roomTime(date = new Date()) {
  const p = parts(date, CLOCK.timeZone);
  const year = p.year;
  const pad = (n) => String(n).padStart(2, '0');
  return {
    hour: p.hour + p.minute / 60,
    offset: utcOffset(date, CLOCK.timeZone),
    doy: (Date.UTC(year, p.month - 1, p.day) - Date.UTC(year, 0, 0)) / 86400000,
    date: `${year}-${pad(p.month)}-${pad(p.day)}`,
  };
}

// Textbook solar position: local clock -> UTC -> apparent solar time at this
// longitude (with the equation of time), then declination and hour angle.
export function sun({ hour, offset, doy }) {
  const B = (2 * Math.PI * (doy - 81)) / 364;
  const eot = 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B); // minutes
  const solar = hour - offset + CLOCK.longitude / 15 + eot / 60;
  const decl = 23.44 * DEG * Math.sin((2 * Math.PI * (284 + doy)) / 365);
  const H = (solar - 12) * 15 * DEG;
  const phi = CLOCK.latitude * DEG;
  const e = Math.asin(Math.sin(phi) * Math.sin(decl) + Math.cos(phi) * Math.cos(decl) * Math.cos(H));
  const A = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(decl) * Math.cos(phi)) + Math.PI;
  const rel = A - CLOCK.bayFacing * DEG;
  const dir = new THREE.Vector3(Math.sin(rel) * Math.cos(e), Math.sin(e), -Math.cos(rel) * Math.cos(e));
  return { elevation: e / DEG, dir };
}

export function formatHour(h) {
  const hh = Math.floor(h) % 24, mm = Math.floor((h % 1) * 60);
  return `${((hh + 11) % 12) + 1}:${String(mm).padStart(2, '0')} ${hh < 12 ? 'am' : 'pm'}`;
}

// ----------------------------------------------------------- outside view

function cityscape(night) {
  return texture(160, 160, (g) => {
    const R = rng(21);
    const sky = night ? ['#10172e', '#151d38', '#1b2442', '#222c4c'] : ['#86b6e6', '#98c2ea', '#abcdee', '#bfd9f1'];
    sky.forEach((c, i) => { g.fillStyle = c; g.fillRect(0, i * 16, 160, 16); });
    g.fillRect(0, 64, 160, 96);
    if (night) {
      g.fillStyle = '#dfe4ff';
      for (let i = 0; i < 28; i++) g.fillRect(Math.floor(R() * 160), Math.floor(R() * 48), 1, 1);
      g.fillStyle = '#f2ead0';
      g.fillRect(118, 24, 3, 3); g.fillRect(117, 25, 5, 1); g.fillRect(119, 23, 1, 5);
    } else {
      g.fillStyle = '#e8f2fb';
      for (const [x, y, w] of [[20, 26, 14], [24, 25, 7], [96, 30, 18], [101, 29, 8], [140, 22, 10]]) g.fillRect(x, y, w, 2);
    }
    const lit = night ? '#e9c46a' : null;
    const win = (x, y, w, h, glass) => {
      g.fillStyle = lit && R() < 0.35 ? lit : glass;
      g.fillRect(x, y, w, h);
    };
    // distant towers
    for (let x = -4; x < 160;) {
      const w = 8 + Math.floor(R() * 12), top = 34 + Math.floor(R() * 22);
      g.fillStyle = night ? '#232a45' : '#a7b4c6';
      g.fillRect(x, top, w, 70 - top);
      for (let yy = top + 3; yy < 66; yy += 4) for (let xx = x + 2; xx < x + w - 2; xx += 3) win(xx, yy, 1, 2, night ? '#2b3352' : '#c3cedb');
      x += w + Math.floor(R() * 3);
    }
    // the buildings across the street
    const facade = (x0, x1, top, wall, cornice, glass) => {
      g.fillStyle = wall; g.fillRect(x0, top, x1 - x0, 160 - top);
      g.fillStyle = cornice; g.fillRect(x0 - 1, top, x1 - x0 + 2, 2);
      g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(x0, top + 2, x1 - x0, 1);
      for (let y = top + 6; y < 160; y += 9) {
        for (let x = x0 + 3; x < x1 - 4; x += 7) win(x, y, 3, 5, glass);
        g.fillStyle = cornice; g.fillRect(x0, y + 6, x1 - x0, 1);
      }
    };
    if (night) {
      facade(0, 56, 50, '#3a3f52', '#4a4f63', '#262b3b');
      facade(52, 112, 70, '#383d4e', '#474c5f', '#262b3b');
      facade(108, 160, 46, '#40465a', '#50566b', '#262b3b');
    } else {
      facade(0, 56, 50, '#e6dac2', '#cdbd9d', '#7f8b97');
      facade(52, 112, 70, '#dccaa8', '#c4b08b', '#8a939b');
      facade(108, 160, 46, '#ebe1cc', '#d2c3a4', '#7a8794');
    }
    // the window guard outside the open window
    g.fillStyle = night ? '#7f8597' : '#f1ede6';
    for (let x = 28; x <= 50; x += 3) g.fillRect(x, 66, 1, 25);
    for (const y of [66, 78, 90]) g.fillRect(28, y, 23, 1);
  });
}

// ------------------------------------------------------------- particles

class Motes {
  constructor(scene, count = 60) {
    const pos = new Float32Array(count * 3);
    this.seed = [];
    for (let i = 0; i < count; i++) {
      this.seed.push({ x: -1.2 + Math.random() * 2.5, y: 0.3 + Math.random() * 2.1, z: -2.45 + Math.random() * 1.45, p: Math.random() * 6.28, s: 0.5 + Math.random() });
    }
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.mat = new THREE.PointsMaterial({ color: 0xfff1d0, size: 1, sizeAttenuation: false, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.drift = 0;
  }
  update(t, dt, wind, light) {
    this.drift += dt * wind.strength(t) * 0.12;
    const a = this.geo.attributes.position;
    this.seed.forEach((m, i) => {
      const z = -2.45 + ((m.z + 2.45 + this.drift * m.s) % 1.45 + 1.45) % 1.45;
      a.setXYZ(i, m.x + 0.05 * Math.sin(t * 0.3 * m.s + m.p) + this.drift * 0.4 * m.s % 0.4, m.y + 0.06 * Math.sin(t * 0.21 * m.s + m.p * 2), z);
    });
    a.needsUpdate = true;
    this.mat.opacity = 0.55 * light * (0.6 + 0.4 * Math.sin(t * 1.3));
  }
}

class Beams {
  constructor(scene, faces) {
    this.faces = faces;
    this.mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    this.meshes = faces.map(() => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(8 * 3), 3));
      geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(8 * 4), 4));
      geo.setIndex([0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7]);
      const m = new THREE.Mesh(geo, this.mat);
      m.frustumCulled = false;
      scene.add(m);
      return m;
    });
  }
  update(sunDir, strength, color) {
    const L = sunDir.clone().negate();
    const p = new THREE.Vector3(), n = new THREE.Vector3();
    this.faces.forEach((f, i) => {
      const mesh = this.meshes[i];
      n.set(0, 0, 1).transformDirection(f.group.matrixWorld);
      const facing = L.dot(n);
      mesh.visible = strength > 0.01 && facing > 0.05 && L.y < -0.02;
      if (!mesh.visible) return;
      const pos = mesh.geometry.attributes.position, col = mesh.geometry.attributes.color;
      const corners = [[f.x0, f.y0], [f.x1, f.y0], [f.x1, f.yTop], [f.x0, f.yTop]];
      corners.forEach(([x, y], k) => {
        p.set(x, y, -0.07).applyMatrix4(f.group.matrixWorld);
        let t = p.y / -L.y;
        if (L.x < 0) t = Math.min(t, (p.x - ROOM.xMin) / -L.x);
        if (L.x > 0) t = Math.min(t, (ROOM.xMax - p.x) / L.x);
        if (L.z > 0) t = Math.min(t, (ROOM.zMax - p.z) / L.z);
        pos.setXYZ(k, p.x, p.y, p.z);
        pos.setXYZ(k + 4, p.x + L.x * t, p.y + L.y * t, p.z + L.z * t);
        const a = 0.13 * strength * Math.min(1, facing * 2);
        col.setXYZW(k, color.r, color.g, color.b, a);
        col.setXYZW(k + 4, color.r, color.g, color.b, 0);
      });
      pos.needsUpdate = col.needsUpdate = true;
    });
  }
}

// --------------------------------------------------------------- lighting

export class Environment {
  constructor(scene, fxScene, room) {
    this.room = room;
    this.dayTex = cityscape(false);
    this.nightTex = cityscape(true);

    this.hemi = new THREE.HemisphereLight(0xe6eeff, 0xc9a985, 1.8);
    this.sun = new THREE.DirectionalLight(0xfff2dc, 2.6);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    Object.assign(this.sun.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4, near: 0.5, far: 20 });
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.015;
    this.sun.target.position.set(0, 0.6, -0.8);
    scene.add(this.hemi, this.sun, this.sun.target);

    this.lamps = room.lamps.map((l) => {
      const p = new THREE.PointLight(l.color, 0, 5, 1.4);
      p.position.copy(l.pos);
      scene.add(p);
      return { light: p, mat: l.mat, day: l.mat.color.clone(), paper: l.paper != null ? new THREE.Color(l.paper) : null, glow: l.glow ?? 1 };
    });
    this.screenLight = new THREE.PointLight(0x7fa6ff, 0, 1.6, 1.5);
    this.screenLight.position.copy(room.screenPos);
    scene.add(this.screenLight);

    this.motes = new Motes(fxScene);
    this.beams = new Beams(fxScene, room.faces);
    this.daylight = 1;
    this.direct = 1;
    this.wx = null;
  }

  // A sample from weather.js (or null for fair weather); applied on the next setTime.
  setWeather(wx) {
    this.wx = wx;
  }

  setTime(rt) {
    const { elevation: e, dir } = sun(rt);
    this.elevation = e;
    const day = smoothstep(-5, 6, e);
    const low = 1 - smoothstep(3, 24, e);
    const on = 1 - smoothstep(-3, 5, e);
    this.daylight = day;

    // Clouds and fog swallow the direct sun first, then grey and dim the sky light.
    const wx = this.wx;
    const cloud = wx?.cloud ?? 0, fog = wx?.fog ?? 0, rain = wx?.rainRate ?? 0;
    const direct = (1 - 0.85 * smoothstep(0.25, 0.95, cloud)) * (1 - 0.7 * fog) * (1 - 0.5 * rain);
    const grey = Math.max(0.6 * smoothstep(0.4, 1, cloud), 0.7 * fog, 0.6 * rain);
    this.direct = direct;

    const sunCol = new THREE.Color(0xfff2dc).lerp(new THREE.Color(0xffa860), low);
    this.sun.color.copy(sunCol);
    this.sun.intensity = 2.8 * smoothstep(-1, 5, e) * direct;
    this.sun.position.copy(this.sun.target.position).addScaledVector(dir, 10);

    this.hemi.color.copy(new THREE.Color(0x3c4a7a).lerp(new THREE.Color(0xf3f1ec).lerp(new THREE.Color(0xdde2e8), grey), day));
    this.hemi.groundColor.copy(new THREE.Color(0x2a2420).lerp(new THREE.Color(0xd8c6aa), day));
    this.hemi.intensity = lerp(1.35, 2.7, day) * (1 - 0.15 * grey);

    for (const l of this.lamps) {
      l.light.intensity = 3.2 * on;
      l.mat.emissiveIntensity = 0.85 * on * l.glow;
      if (l.paper) l.mat.color.copy(l.day).lerp(l.paper, on);
    }
    this.screenLight.intensity = 0.9 * on;

    const r = this.room;
    const night = e < -4;
    r.viewMat.map = night ? this.nightTex : this.dayTex;
    r.viewMat.color.copy(night ? new THREE.Color(0xffffff) : new THREE.Color(0xffffff).lerp(new THREE.Color(0xffbf95), low * 0.8 * direct));
    if (!night) r.viewMat.color.lerp(new THREE.Color(0xaab3be), 0.7 * grey);
    r.viewMat.needsUpdate = true;
    r.hazeMat.opacity = fog * (night ? 0.35 : 0.6) + 0.12 * grey * day;
    r.rainMat.opacity = rain > 0 ? (night ? 0.35 : 0.55) + 0.35 * rain : 0;
    r.rainMat.visible = rain > 0;
    this.rainSpeed = 1.2 + 1.6 * rain;
    r.glintMat.color.copy(new THREE.Color(0x58607a).lerp(new THREE.Color(0xffffff), day));
    r.mirrorMat.color.copy(new THREE.Color(0x4c5366).lerp(new THREE.Color(0xffffff), day));
    r.screenMat.color.copy(new THREE.Color(0x8a8a8a).lerp(new THREE.Color(0xffffff), on));

    this.beams.update(dir, this.sun.intensity / 2.8, sunCol);
  }

  update(t, dt, wind) {
    this.motes.update(t, dt, wind, this.daylight * this.direct * smoothstep(2, 10, this.elevation ?? 0));
    const rain = this.room.rainMat;
    if (rain.visible) {
      rain.map.offset.y += dt * this.rainSpeed;
      rain.map.offset.x = 0.04 * Math.sin(t * 0.7) * wind.strength(t);
    }
  }

  setPixelRatio(dpr) {
    this.motes.mat.size = 1 / dpr;
  }
}
