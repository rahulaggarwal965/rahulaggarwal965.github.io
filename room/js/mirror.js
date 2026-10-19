// The floor mirror. Each frame the room is drawn again from the camera's
// reflection in the glass, at the same low resolution as the main view, and
// projected back onto the glass (the same trick as three.js' Reflector, made to
// work with the orthographic camera). It's blended with the glass tint so the
// reflection reads as a mirror, not a hole.
import * as THREE from 'three';

const VERT = /* glsl */ `
uniform mat4 textureMatrix;
varying vec4 vProj;
varying vec2 vUv;
void main() {
  vUv = uv;
  vProj = textureMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const FRAG = /* glsl */ `
uniform sampler2D tMirror, tGlass;
uniform vec3 uTint;
uniform float uMix, uLive;
varying vec4 vProj;
varying vec2 vUv;
void main() {
  vec3 glass = texture2D(tGlass, vUv).rgb * uTint;
  vec3 refl = texture2DProj(tMirror, vProj).rgb * vec3(0.9, 0.95, 1.0);
  // the painted glints stay on top of the reflection
  float glint = smoothstep(0.9, 1.0, texture2D(tGlass, vUv).r);
  vec3 col = mix(glass, refl, uMix * uLive * (1.0 - glint));
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

const BIAS = new THREE.Matrix4().set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);

export class Mirror {
  // glass: the mesh to turn into a mirror; its current material supplies the
  // tint texture and colour (which the lighting keeps updating).
  constructor(glass, { mix = 0.62 } = {}) {
    this.glass = glass;
    this.target = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      generateMipmaps: false,
    });
    this.camera = new THREE.OrthographicCamera();
    this.clip = new THREE.Plane();
    this.uniforms = {
      tMirror: { value: this.target.texture },
      tGlass: { value: glass.material.map },
      uTint: { value: glass.material.color },
      textureMatrix: { value: new THREE.Matrix4() },
      uMix: { value: mix },
      uLive: { value: 0 },
    };
    glass.material = new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: VERT, fragmentShader: FRAG });
  }

  setSize(w, h) {
    this.target.setSize(w, h);
  }

  // Call before the main render. Skips the work when the camera can't see the
  // front of the glass. `around` wraps the extra render (to un-cut the walls).
  render(renderer, scene, camera, around = (draw) => draw()) {
    const g = this.glass;
    const cam = this.camera;
    g.updateMatrixWorld();
    const p = new THREE.Vector3().setFromMatrixPosition(g.matrixWorld);
    const n = new THREE.Vector3(0, 0, 1).transformDirection(g.matrixWorld);
    const look = camera.getWorldDirection(new THREE.Vector3());
    // fade in as the glass turns toward the camera, rather than popping
    const facing = -look.dot(n);
    this.uniforms.uLive.value = THREE.MathUtils.smoothstep(facing, 0.02, 0.25);
    if (facing <= 0.02) return false;

    // the camera, reflected in the plane of the glass
    cam.copy(camera);
    const eye = camera.getWorldPosition(new THREE.Vector3());
    const reflect = (v) => v.sub(p).reflect(n).add(p);
    cam.position.copy(reflect(eye.clone()));
    cam.up.set(0, 1, 0).applyQuaternion(camera.quaternion).reflect(n);
    cam.lookAt(reflect(eye.clone().add(look)));
    cam.updateMatrixWorld();

    this.uniforms.textureMatrix.value.copy(BIAS).multiply(cam.projectionMatrix).multiply(cam.matrixWorldInverse).multiply(g.matrixWorld);

    // Only draw what's in front of the glass: tilt the near plane onto it
    // (Lengyel's oblique clipping, in the general form that also holds for an
    // orthographic projection). Only z changes, so the texture lookup above is unaffected.
    this.clip.setFromNormalAndCoplanarPoint(n, p);
    this.clip.constant -= 0.01;
    this.clip.applyMatrix4(cam.matrixWorldInverse);
    const c = new THREE.Vector4(this.clip.normal.x, this.clip.normal.y, this.clip.normal.z, this.clip.constant);
    const q = new THREE.Vector4(Math.sign(c.x), Math.sign(c.y), 1, 1).applyMatrix4(cam.projectionMatrixInverse);
    c.multiplyScalar(2 / c.dot(q));
    const e = cam.projectionMatrix.elements;
    e[2] = c.x - e[3];
    e[6] = c.y - e[7];
    e[10] = c.z - e[11];
    e[14] = c.w - e[15];

    g.visible = false;
    renderer.setRenderTarget(this.target);
    around(() => renderer.render(scene, cam));
    g.visible = true;
    return true;
  }
}
