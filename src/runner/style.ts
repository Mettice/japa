import * as THREE from 'three';

// The 3D look borrows from the 2D card UI: flat toon shading in the same palette, and
// ink outlines about as thick as the cards' 3px borders.

export const INK = '#050914';
export const OUTLINE_PX = 2.5; // CSS pixels, like the UI's border-[3px]

// 3-step ramp: shadow, mid, lit. Nearest filtering keeps the bands crisp.
let gradient: THREE.DataTexture | null = null;
export const toonGradient = () => {
  if (!gradient) {
    gradient = new THREE.DataTexture(new Uint8Array([110, 190, 255]), 3, 1, THREE.RedFormat);
    gradient.minFilter = THREE.NearestFilter;
    gradient.magFilter = THREE.NearestFilter;
    gradient.needsUpdate = true;
  }
  return gradient;
};

export const toon = (params: THREE.MeshToonMaterialParameters = {}) =>
  new THREE.MeshToonMaterial({ gradientMap: toonGradient(), ...params });

// Screen-space outline: inflate each vertex along its normal by a fixed number of pixels
// in clip space, draw back faces in ink. Works for plain meshes and InstancedMesh alike,
// and stays the same thickness however big the prop is scaled.
const outlineUniforms = {
  uThickness: { value: OUTLINE_PX },
  uResolution: { value: new THREE.Vector2(1, 1) },
  uColor: { value: new THREE.Color(INK) },
};

export const setOutlineResolution = (widthPx: number, heightPx: number, cssToPx: number) => {
  outlineUniforms.uResolution.value.set(widthPx, heightPx);
  outlineUniforms.uThickness.value = OUTLINE_PX * cssToPx;
};

let outlineMat: THREE.ShaderMaterial | null = null;
export const outlineMaterial = () => {
  if (outlineMat) return outlineMat;
  outlineMat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {}]),
    vertexShader: /* glsl */ `
      #include <common>
      #include <fog_pars_vertex>
      uniform float uThickness;
      uniform vec2 uResolution;
      void main() {
        mat4 m = modelMatrix;
        #ifdef USE_INSTANCING
          m = modelMatrix * instanceMatrix;
        #endif
        vec4 world = m * vec4(position, 1.0);
        vec3 worldNormal = normalize(mat3(m) * normal);
        vec4 mvPosition = viewMatrix * world;
        vec4 clip = projectionMatrix * mvPosition;
        vec3 viewNormal = mat3(viewMatrix) * worldNormal;
        vec2 dir = length(viewNormal.xy) > 0.0001 ? normalize(viewNormal.xy) : vec2(0.0);
        clip.xy += dir * uThickness / uResolution * 2.0 * clip.w;
        gl_Position = clip;
        #include <fog_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <fog_pars_fragment>
      uniform vec3 uColor;
      void main() {
        gl_FragColor = vec4(uColor, 1.0);
        #include <fog_fragment>
      }
    `,
    side: THREE.BackSide,
    fog: true,
  });
  // Share the live uniforms (resolution/thickness update on resize)
  Object.assign(outlineMat.uniforms, outlineUniforms);
  return outlineMat;
};

// Add an ink outline to every mesh under obj (skips sprites, text planes and outlines)
export const addOutlines = (obj: THREE.Object3D) => {
  const targets: THREE.Mesh[] = [];
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || m.userData.noOutline || m.userData.isOutline) return;
    if (m.geometry instanceof THREE.PlaneGeometry || m.geometry instanceof THREE.CircleGeometry) return;
    targets.push(m);
  });
  for (const m of targets) {
    const outline = new THREE.Mesh(m.geometry, outlineMaterial());
    outline.userData.isOutline = true;
    outline.castShadow = false;
    outline.receiveShadow = false;
    m.add(outline);
  }
  return obj;
};

export const disposeStyle = () => {
  outlineMat?.dispose();
  outlineMat = null;
  gradient?.dispose();
  gradient = null;
};
