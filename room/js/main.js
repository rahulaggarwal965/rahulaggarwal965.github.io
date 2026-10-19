import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { PixelPipeline, LAYER_HOVER, LAYER_SELECT, LAYER_PICK } from './pixel.js';
import { buildRoom, setWallCut } from './room.js';
import { buildPlant, animatePlant, setPlantLayer } from './flora.js';
import { Wind, Streaks } from './wind.js';
import { Environment, roomTime, formatHour } from './env.js';
import { Mirror } from './mirror.js';
import { loadWeather, sample } from './weather.js';
import { loadPlants, loadPublicLog, Gardener } from './store.js';
import { UI, icon } from './ui.js';
import { lerp } from './util.js';

const $ = (id) => document.getElementById(id);
const stage = $('stage');
const canvas = $('room');
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

const state = { plants: [], events: [], selected: null, hovered: null, gardener: new Gardener(), weather: null };
let ui;
let view = null; // 3D bits, when WebGL is available

const VERB = { water: 'water', feed: 'feed', check: 'check', note: 'note on' };

async function onAction(event, removeId) {
  const g = state.gardener;
  if (event) {
    const msg = `[plants] ${VERB[event.type]} ${event.plant}${event.note ? `: ${event.note}` : ''}`;
    state.events = await g.mutate((evs) => [...evs, event], msg);
  } else if (removeId) {
    state.events = await g.mutate((evs) => evs.filter((e) => e.id !== removeId), `[plants] undo ${removeId}`);
  } else {
    state.events = (await g.read()).events;
  }
  ui.render();
}

function select(p) {
  if (state.selected === p) {
    if (p) view?.focus(p);
    return;
  }
  if (view && state.selected) setPlantLayer(state.selected, LAYER_SELECT, false);
  state.selected = p;
  try {
    history.replaceState(null, '', p ? `#${p.def.id}` : location.pathname + location.search);
  } catch { /* sandboxed */ }
  if (view && p) {
    setPlantLayer(p, LAYER_SELECT, true);
    view.focus(p);
  }
  ui.render();
}

function hover(p) {
  if (state.hovered === p) return;
  if (view && state.hovered) setPlantLayer(state.hovered, LAYER_HOVER, false);
  state.hovered = p;
  if (view && p) setPlantLayer(p, LAYER_HOVER, true);
  canvas.style.cursor = p ? 'pointer' : '';
}

function webgl2() {
  try { return !!document.createElement('canvas').getContext('webgl2'); } catch { return false; }
}

// ------------------------------------------------------------------- 3D

function init3D() {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  const pipeline = new PixelPipeline(renderer);

  const scene = new THREE.Scene();
  const fxScene = new THREE.Scene();
  const room = buildRoom();
  scene.add(room.root);
  state.plants.forEach((p, i) => {
    Object.assign(p, buildPlant(p.def, 101 + i * 17));
    scene.add(p.outer);
  });

  const env = new Environment(scene, fxScene, room);
  const mirror = new Mirror(room.mirrorGlass);
  const wind = new Wind(room.openWindow);
  if (reduceMotion) wind.calm = 0.35;
  const streaks = reduceMotion ? null : new Streaks(fxScene, wind);

  // camera: orthographic "diorama" view, orbiting within limits
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 50);
  const home = { target: new THREE.Vector3(0.0, 1.0, -0.3), polar: 0.98, azimuth: 0.62, zoom: 1 };
  camera.position.setFromSphericalCoords(22, home.polar, home.azimuth).add(home.target);
  const controls = new OrbitControls(camera, canvas);
  controls.target.copy(home.target);
  Object.assign(controls, {
    enableDamping: true, dampingFactor: 0.08,
    minPolarAngle: 0.35, maxPolarAngle: 1.22,
    minAzimuthAngle: -1.4, maxAzimuthAngle: 1.4,
    minZoom: 0.85, maxZoom: 5,
    zoomToCursor: true, screenSpacePanning: true,
  });
  controls.update();
  const bounds = new THREE.Box3(new THREE.Vector3(-1.8, 0, -2.6), new THREE.Vector3(1.8, 1.8, 1.9));
  const before = new THREE.Vector3();
  controls.addEventListener('change', () => {
    before.copy(controls.target);
    controls.target.clamp(bounds.min, bounds.max);
    camera.position.add(before.sub(controls.target).negate());
  });

  // sizing: render at 1/px of the CSS size, then upscale with hard pixels
  let px = 3, canvasBox = { x: 0, y: 0, w: 1, h: 1 };
  function resize() {
    const w = stage.clientWidth, h = stage.clientHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    px = Math.max(2, Math.round(Math.min(w, h * 1.7) / 470));
    const lw = Math.floor(w / px), lh = Math.floor(h / px);
    renderer.setPixelRatio(dpr);
    renderer.setSize(lw * px, lh * px);
    pipeline.setSize(lw, lh);
    mirror.setSize(lw, lh);
    env.setPixelRatio(dpr);
    const aspect = lw / lh;
    const halfH = Math.max(2.85, 3.8 / aspect);
    Object.assign(camera, { top: halfH, bottom: -halfH, left: -halfH * aspect, right: halfH * aspect });
    camera.updateProjectionMatrix();
    canvasBox = { x: (w - lw * px) / 2, y: (h - lh * px) / 2, w: lw * px, h: lh * px };
  }
  new ResizeObserver(resize).observe(stage);
  resize();

  function applyTheme() {
    const css = getComputedStyle(document.documentElement);
    scene.background = new THREE.Color(css.getPropertyValue('--bg').trim());
    pipeline.uniforms.uSelectColor.value.set(css.getPropertyValue('--select').trim());
  }
  applyTheme();
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
  new MutationObserver(applyTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  // The room keeps its own clock. The slider scrubs through the day;
  // "now" goes back to live. ?hour=21 opens it at 9pm.
  const params = new URLSearchParams(location.search);
  const hourParam = parseFloat(params.get('hour'));
  let override = Number.isFinite(hourParam) ? ((hourParam % 24) + 24) % 24 : null;
  const range = $('clock-range'), clockLabel = $('clock-label'), nowBtn = $('clock-now'), clockIcon = $('clock-icon');
  // ?weather=rain (or fog, cloudy, clear) previews the room in that weather
  const PREVIEW = { clear: 0, cloudy: 3, fog: 45, rain: 63 };
  const forced = PREVIEW[params.get('weather')];
  const clockWx = $('clock-wx');
  function applyTime() {
    const rt = roomTime();
    if (override != null) rt.hour = override;
    const wx = forced != null
      ? sample({ current: { temp: 58, code: forced, cloud: forced ? 1 : 0, wind: 12, rain: forced === 63 ? 2 : 0 } }, rt, true)
      : sample(state.weather, rt, override == null);
    env.setWeather(wx);
    env.setTime(rt);
    wind.weather = wx ? Math.min(1.8, Math.max(0.45, 0.45 + wx.wind / 14)) : 1;
    range.value = rt.hour;
    clockLabel.textContent = formatHour(rt.hour);
    nowBtn.hidden = override == null;
    const night = env.daylight < 0.5;
    const kind = wx?.kind === 'snow' ? 'rain' : wx?.kind;
    const ico = kind === 'rain' ? icon('rain', 'var(--water)')
      : kind === 'fog' ? icon('fog', 'var(--fg)')
        : kind === 'cloudy' ? icon('cloud', 'var(--fg)')
          : night ? icon('moon', 'var(--fg)') : icon('sun', 'var(--warn)');
    if (clockIcon.innerHTML !== ico) clockIcon.innerHTML = ico;
    clockWx.textContent = wx ? `${Math.round(wx.temp)}°F` : '';
    clockWx.title = wx ? `${Math.round(wx.temp)}°F, ${wx.label}, wind ${Math.round(wx.wind)} mph` : '';
    clockWx.hidden = !wx;
  }
  range.addEventListener('input', () => {
    override = +range.value;
    applyTime();
  });
  nowBtn.addEventListener('click', () => {
    override = null;
    applyTime();
  });
  $('clock').hidden = false;
  setInterval(applyTime, 30000);
  applyTime();

  // walls between the camera and the room fold down
  const viewDir = new THREE.Vector3();
  function updateWalls() {
    camera.getWorldDirection(viewDir).setY(0).normalize();
    for (const w of room.walls) setWallCut(w, w.normal.dot(viewDir) > 0.25, room.hidden);
  }
  // ...but the mirror sees the whole room
  function withAllWalls(draw) {
    const cut = room.walls.map((w) => w.cut);
    room.walls.forEach((w) => setWallCut(w, false, room.hidden));
    draw();
    room.walls.forEach((w, i) => setWallCut(w, cut[i], room.hidden));
  }

  // picking
  const raycaster = new THREE.Raycaster();
  raycaster.layers.set(LAYER_PICK);
  const ndc = new THREE.Vector2();
  const proxies = state.plants.map((p) => p.proxy);
  function pick(e) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const hit = raycaster.intersectObjects(proxies, false)[0];
    return hit ? state.plants.find((p) => p.proxy === hit.object) : null;
  }
  let down = null;
  canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; });
  canvas.addEventListener('pointermove', (e) => { if (!e.buttons) hover(pick(e)); });
  canvas.addEventListener('pointerleave', () => hover(null));
  canvas.addEventListener('pointerup', (e) => {
    if (!down) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    down = null;
    if (moved < 6) select(pick(e));
  });

  // fly to a plant, keeping it clear of the sidebar (or the bottom sheet on phones)
  let tween = null;
  const right = new THREE.Vector3(), up = new THREE.Vector3();
  function focus(p) {
    const zoom = Math.max(camera.zoom, 2.2);
    const to = p.focus.clone();
    const worldPerCss = (camera.right - camera.left) / zoom / canvasBox.w;
    right.setFromMatrixColumn(camera.matrixWorld, 0);
    up.setFromMatrixColumn(camera.matrixWorld, 1);
    if (window.innerWidth > 760) to.addScaledVector(right, 186 * worldPerCss);
    else to.addScaledVector(up, -0.3 * canvasBox.h * worldPerCss);
    tween = { t0: performance.now(), dur: reduceMotion ? 1 : 750, fromT: controls.target.clone(), toT: to, fromZ: camera.zoom, toZ: zoom };
  }
  const offset = new THREE.Vector3();
  function stepTween(now) {
    if (!tween) return;
    const k = Math.min(1, (now - tween.t0) / tween.dur);
    const e = k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2;
    offset.copy(camera.position).sub(controls.target);
    controls.target.lerpVectors(tween.fromT, tween.toT, e);
    camera.position.copy(controls.target).add(offset);
    camera.zoom = lerp(tween.fromZ, tween.toZ, e);
    camera.updateProjectionMatrix();
    if (k >= 1) tween = null;
  }

  // labels follow the plants, snapped to the art-pixel grid
  const v = new THREE.Vector3();
  function project(p) {
    v.copy(p).project(camera);
    if (Math.abs(v.x) > 1.05 || Math.abs(v.y) > 1.05) return null;
    const x = canvasBox.x + ((v.x + 1) / 2) * canvasBox.w;
    const y = canvasBox.y + ((1 - v.y) / 2) * canvasBox.h;
    return { x: Math.round(x / px) * px, y: Math.round(y / px) * px };
  }

  let onScreen = true;
  new IntersectionObserver(([en]) => (onScreen = en.isIntersecting)).observe(stage);
  const clock = new THREE.Clock();
  let t = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(clock.getDelta(), 0.05);
    if (!onScreen || document.hidden) return;
    t += dt;
    stepTween(now);
    controls.update();
    updateWalls();
    for (const p of state.plants) animatePlant(p, t, wind);
    room.animate(t, wind);
    streaks?.update(t, dt, 0.35 + 0.65 * env.daylight);
    env.update(t, dt, wind);
    mirror.render(renderer, scene, camera, withAllWalls);
    pipeline.render(scene, fxScene, camera, { hidden: room.hidden, hasHover: !!state.hovered, hasSelect: !!state.selected });
    ui.positionTags(project);
  }
  requestAnimationFrame(frame);

  // handy when poking at it from the console
  window.__room = { scene, camera, controls, env, wind, streaks, state, pipeline, renderer, mirror };
  return { focus, applyTime };
}

// ----------------------------------------------------------------- boot

async function main() {
  const defs = await loadPlants();
  state.plants = defs.map((def) => ({ def }));
  ui = new UI(state, { onSelect: select, onHover: hover, onAction });

  if (state.gardener.signedIn) {
    try {
      state.events = (await state.gardener.read()).events;
    } catch (e) {
      state.events = await loadPublicLog();
      ui.toast(`Couldn't read the log from GitHub (${e.message}). Showing the published copy.`);
    }
  } else {
    state.events = await loadPublicLog();
  }

  if (webgl2()) {
    try {
      view = init3D();
    } catch (e) {
      console.error(e);
      $('fallback').hidden = false;
    }
  } else {
    $('fallback').hidden = false;
  }
  ui.render();
  setInterval(() => ui.render(), 10 * 60 * 1000); // statuses roll over at midnight

  // the real weather outside: shapes the scene and how fast the pots dry
  const refreshWeather = async () => {
    const w = await loadWeather();
    if (!w) return;
    state.weather = w;
    view?.applyTime();
    ui.render();
  };
  refreshWeather();
  setInterval(refreshWeather, 15 * 60 * 1000);

  // /room/#monstera opens with that plant selected
  const linked = state.plants.find((p) => p.def.id === decodeURIComponent(location.hash.slice(1)));
  if (linked) select(linked);
}

main().catch((e) => {
  console.error(e);
  $('fallback').hidden = false;
  $('fallback').textContent = `Something went wrong loading the plants: ${e.message}`;
});
