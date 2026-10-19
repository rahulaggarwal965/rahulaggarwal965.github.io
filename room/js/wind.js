// The breeze: a gusty strength signal that travels in from the open window,
// plus little pixel streaks that ride the gusts into the room.
import * as THREE from 'three';
import { smoothstep } from './util.js';

export class Wind {
  constructor(win) {
    this.source = win.center.clone();
    this.dir = win.normal.clone().setY(0).normalize();
    this.axis = new THREE.Vector3(0, 1, 0).cross(this.dir).normalize();
    this.win = win;
    this.calm = 1;    // turned down for reduced motion
    this.weather = 1; // how windy it actually is outside (main.js sets it)
  }

  // Steady breathing plus a slow envelope that every 20–40 s turns into a gust.
  strength(t) {
    const base = 0.3 + 0.1 * Math.sin(t * 0.37) + 0.07 * Math.sin(t * 0.91 + 1.7);
    const env = Math.max(0, Math.sin(t * 0.19) * Math.sin(t * 0.127 + 0.8));
    const gust = 2.2 * env ** 2.5 * (0.8 + 0.2 * Math.sin(t * 2.1));
    return Math.max(0, (base + gust) * this.calm * this.weather);
  }

  // Local strength: delayed by the distance from the window, and fading with it.
  at(p, t) {
    const d = p.distanceTo(this.source);
    return this.strength(t - d / 1.8) * (0.3 + 0.7 * Math.exp(-d / 1.6));
  }
}

const TRAIL = 10;

export class Streaks {
  constructor(scene, wind, count = 14) {
    this.wind = wind;
    this.items = [];
    // pale sky blue rather than white, so the streaks still read over the white duvet
    this.tint = new THREE.Color(0xa9cbe8);
    const mat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false });
    for (let i = 0; i < count; i++) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRAIL * 3), 3));
      geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(TRAIL * 4), 4));
      const line = new THREE.Line(geo, mat);
      line.frustumCulled = false;
      line.visible = false;
      scene.add(line);
      this.items.push({ line, born: -1e9, life: 0, p0: new THREE.Vector3(), speed: 1, amp: 0, phase: 0, rise: 0 });
    }
    this.side = new THREE.Vector3();
    this.tmp = new THREE.Vector3();
    this.cooldown = 0;
  }

  spawn(s, t) {
    const w = this.wind.win;
    s.born = t;
    s.life = 1.6 + Math.random() * 1.6;
    s.p0.copy(w.center)
      .addScaledVector(w.along, (Math.random() - 0.5) * w.width * 0.9)
      .add(this.tmp.set(0, (Math.random() - 0.5) * Math.max(0.1, w.height) * 1.2, 0));
    s.speed = 1.1 + Math.random() * 0.7;
    s.amp = 0.06 + Math.random() * 0.12;
    s.phase = Math.random() * 6.28;
    s.rise = (Math.random() - 0.4) * 0.15;
    s.line.visible = true;
  }

  point(s, tau, out) {
    const d = this.wind.dir;
    this.side.set(-d.z, 0, d.x);
    return out.copy(s.p0)
      .addScaledVector(d, s.speed * tau)
      .addScaledVector(this.side, s.amp * Math.sin(tau * 2.4 + s.phase))
      .add(this.tmp.set(0, s.rise * tau + 0.05 * Math.sin(tau * 3.3 + s.phase), 0));
  }

  update(t, dt, brightness = 1) {
    const w = this.wind.strength(t);
    this.cooldown -= dt;
    const p = new THREE.Vector3();
    for (const s of this.items) {
      const age = t - s.born;
      if (age > s.life) {
        s.line.visible = false;
        if (this.cooldown <= 0 && w > 0.75 && Math.random() < (w - 0.7) * dt * 6) {
          this.spawn(s, t);
          this.cooldown = 0.12;
        }
        continue;
      }
      const fade = smoothstep(0, 0.25, age) * smoothstep(s.life, s.life - 0.6, age) * brightness;
      const pos = s.line.geometry.attributes.position;
      const col = s.line.geometry.attributes.color;
      for (let k = 0; k < TRAIL; k++) {
        const tau = Math.max(0, age - k * 0.045);
        this.point(s, tau, p);
        pos.setXYZ(k, p.x, p.y, p.z);
        col.setXYZW(k, this.tint.r, this.tint.g, this.tint.b, fade * (1 - k / TRAIL) * 0.95);
      }
      pos.needsUpdate = col.needsUpdate = true;
    }
  }
}
