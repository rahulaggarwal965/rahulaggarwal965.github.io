// Pixel-art render pipeline.
//
// The scene is drawn into small render targets (one "art pixel" = several screen
// pixels), then a single composite pass upscales with nearest sampling and adds:
//   - dark outlines where depth jumps (silhouettes)
//   - light outlines where normals change sharply (creases)
//   - a 1px outline around the hovered / selected plant
// It's the same idea as three.js' RenderPixelatedPass, extended with a selection mask.
import * as THREE from 'three';

export const LAYER_HOVER = 1;
export const LAYER_SELECT = 2;
export const LAYER_PICK = 3;

const VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const FRAG = /* glsl */ `
uniform sampler2D tColor, tDepth, tNormal, tMask, tMaskDepth;
uniform vec4 uRes;
uniform float uNear, uFar, uDepthEdge, uNormalEdge, uDepthThresh;
uniform vec3 uHoverColor, uSelectColor;
varying vec2 vUv;

// Orthographic depth is linear, so this gives distances in metres.
float lin(float d) { return uNear + d * (uFar - uNear); }
float depthAt(vec2 o) { return lin(texture2D(tDepth, vUv + o * uRes.zw).r); }
vec3 normalAt(vec2 o) { return texture2D(tNormal, vUv + o * uRes.zw).rgb * 2.0 - 1.0; }

float depthEdge(float d) {
  float diff = 0.0;
  diff += clamp(depthAt(vec2( 1.0, 0.0)) - d, 0.0, 1.0);
  diff += clamp(depthAt(vec2(-1.0, 0.0)) - d, 0.0, 1.0);
  diff += clamp(depthAt(vec2( 0.0, 1.0)) - d, 0.0, 1.0);
  diff += clamp(depthAt(vec2( 0.0,-1.0)) - d, 0.0, 1.0);
  return step(uDepthThresh, diff);
}

float neighborNormalEdge(vec2 o, float d, vec3 n) {
  float dd = depthAt(o) - d;
  vec3 nn = normalAt(o);
  float towardBias = clamp(smoothstep(-0.01, 0.01, dot(n - nn, vec3(1.0))), 0.0, 1.0);
  float shallower = clamp(sign(dd * 0.25 + 0.0025), 0.0, 1.0);
  return (1.0 - dot(n, nn)) * shallower * towardBias;
}

float normalEdge(float d, vec3 n) {
  float e = 0.0;
  e += neighborNormalEdge(vec2( 0.0,-1.0), d, n);
  e += neighborNormalEdge(vec2( 0.0, 1.0), d, n);
  e += neighborNormalEdge(vec2(-1.0, 0.0), d, n);
  e += neighborNormalEdge(vec2( 1.0, 0.0), d, n);
  return step(0.1, e);
}

// Mask channels: r = hovered, g = selected. Only counts where the plant is
// actually visible (not hidden behind the bed, say).
vec2 maskAt(vec2 o) {
  vec2 uv = vUv + o * uRes.zw;
  vec2 m = texture2D(tMask, uv).rg;
  float vis = step(lin(texture2D(tMaskDepth, uv).r), lin(texture2D(tDepth, uv).r) + 0.03);
  return m * vis;
}

void main() {
  vec3 col = texture2D(tColor, vUv).rgb;
  float d = depthAt(vec2(0.0));
  vec3 n = normalAt(vec2(0.0));

  float de = depthEdge(d);
  float ne = de > 0.0 ? 0.0 : normalEdge(d, n);
  col *= de > 0.0 ? (1.0 - uDepthEdge) : (1.0 + uNormalEdge * ne);

  vec2 self = maskAt(vec2(0.0));
  vec2 nb = max(max(maskAt(vec2(1.0, 0.0)), maskAt(vec2(-1.0, 0.0))),
                max(maskAt(vec2(0.0, 1.0)), maskAt(vec2(0.0, -1.0))));
  if (self.g < 0.5 && nb.g > 0.5) col = uSelectColor;
  else if (self.r < 0.5 && self.g < 0.5 && nb.r > 0.5) col = uHoverColor;
  else if (self.r > 0.5) col *= 1.15;

  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

function target(w, h, type) {
  const rt = new THREE.WebGLRenderTarget(w, h, {
    type,
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    generateMipmaps: false,
    depthTexture: new THREE.DepthTexture(w, h),
  });
  return rt;
}

export class PixelPipeline {
  constructor(renderer) {
    this.renderer = renderer;
    this.normalMat = new THREE.MeshNormalMaterial({ side: THREE.DoubleSide });
    this.hoverMat = new THREE.MeshBasicMaterial({ color: 0xff0000, side: THREE.DoubleSide });
    this.selectMat = new THREE.MeshBasicMaterial({ color: 0x00ff00, side: THREE.DoubleSide });
    this.uniforms = {
      tColor: { value: null }, tDepth: { value: null }, tNormal: { value: null },
      tMask: { value: null }, tMaskDepth: { value: null },
      uRes: { value: new THREE.Vector4() },
      uNear: { value: 0.1 }, uFar: { value: 60 },
      uDepthEdge: { value: 0.42 }, uNormalEdge: { value: 0.28 }, uDepthThresh: { value: 0.12 },
      uHoverColor: { value: new THREE.Color(0xffffff) },
      uSelectColor: { value: new THREE.Color(0xffd34d) },
    };
    this.quad = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: VERT, fragmentShader: FRAG, depthTest: false, depthWrite: false }),
    );
    this.quad.frustumCulled = false;
    this.quadScene = new THREE.Scene();
    this.quadScene.add(this.quad);
    this.quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.width = this.height = 0;
  }

  setSize(w, h) {
    if (w === this.width && h === this.height) return;
    this.width = w;
    this.height = h;
    for (const rt of [this.beauty, this.normals, this.mask]) rt?.dispose();
    this.beauty = target(w, h, THREE.HalfFloatType);
    this.normals = target(w, h, THREE.HalfFloatType);
    this.mask = target(w, h, THREE.UnsignedByteType);
    const u = this.uniforms;
    u.uRes.value.set(w, h, 1 / w, 1 / h);
    u.tColor.value = this.beauty.texture;
    u.tDepth.value = this.beauty.depthTexture;
    u.tNormal.value = this.normals.texture;
    u.tMask.value = this.mask.texture;
    u.tMaskDepth.value = this.mask.depthTexture;
  }

  // hidden: objects to drop from the normal pass (invisible shadow casters, lines).
  render(scene, fxScene, camera, { hidden = [], hasHover = false, hasSelect = false } = {}) {
    const r = this.renderer;
    const u = this.uniforms;
    u.uNear.value = camera.near;
    u.uFar.value = camera.far;

    // 1. colour (+ particles on top, which never write depth so they get no outlines)
    r.shadowMap.needsUpdate = true;
    r.setRenderTarget(this.beauty);
    r.render(scene, camera);
    r.autoClear = false;
    r.render(fxScene, camera);
    r.autoClear = true;

    // 2. view-space normals
    const bg = scene.background;
    scene.background = null;
    const vis = hidden.map((o) => o.visible);
    hidden.forEach((o) => (o.visible = false));
    scene.overrideMaterial = this.normalMat;
    r.setRenderTarget(this.normals);
    r.setClearColor(0x000000, 0);
    r.render(scene, camera);

    // 3. selection mask: only plant meshes tagged on the hover/select layers
    r.setRenderTarget(this.mask);
    r.clear();
    if (hasHover || hasSelect) {
      const layers = camera.layers.mask;
      r.autoClear = false;
      if (hasHover) {
        scene.overrideMaterial = this.hoverMat;
        camera.layers.set(LAYER_HOVER);
        r.render(scene, camera);
      }
      if (hasSelect) {
        scene.overrideMaterial = this.selectMat;
        camera.layers.set(LAYER_SELECT);
        r.render(scene, camera);
      }
      r.autoClear = true;
      camera.layers.mask = layers;
    }
    scene.overrideMaterial = null;
    hidden.forEach((o, i) => (o.visible = vis[i]));
    scene.background = bg;

    // 4. composite to the canvas
    r.setRenderTarget(null);
    r.render(this.quadScene, this.quadCam);
  }
}
