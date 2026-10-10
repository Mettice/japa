import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { addOutlines, toon } from './style';

// Moving pieces of the street (obstacles, pickups, gates, the runner) built from
// primitives + canvas textures, with toon shading and ink outlines. Static roadside
// scenery lives in scenery.ts (instanced). Materials/geometries are cached and shared.

export const PALETTE = {
  road: '#3A3F4B',
  roadLine: '#F5F1E6',
  sidewalk: '#CDB89A',
  curb: '#8E8577',
  skin: '#6B3E26',
  ink: '#050914',
  cream: '#FFF6E3',
  sun: '#FFC93C',
  leaf: '#2FCB7A',
  chili: '#FF5A4E',
  navy: '#0B1430',
  walls: ['#F2C14E', '#F78154', '#5FAD56', '#4D9078', '#B4436C', '#7A9CC6', '#E8E1D5', '#D98E73', '#9C89B8'],
};

const matCache = new Map<string, THREE.Material>();
export const mat = (color: string) => {
  let m = matCache.get(color);
  if (!m) {
    m = toon({ color });
    matCache.set(color, m);
  }
  return m;
};

const geoCache = new Map<string, THREE.BufferGeometry>();
const box = (w: number, h: number, d: number) => {
  const key = `b${w},${h},${d}`;
  let g = geoCache.get(key);
  if (!g) {
    g = new THREE.BoxGeometry(w, h, d);
    geoCache.set(key, g);
  }
  return g;
};
const cyl = (rt: number, rb: number, h: number, seg = 10) => {
  const key = `c${rt},${rb},${h},${seg}`;
  let g = geoCache.get(key);
  if (!g) {
    g = new THREE.CylinderGeometry(rt, rb, h, seg);
    geoCache.set(key, g);
  }
  return g;
};

export const mesh = (geo: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0) => {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
};

// Merge an untextured multi-part prop into ONE mesh with per-vertex colours, built once and
// shared: a danfo goes from 12 draw calls to 2 (body + outline).
const bakedCache = new Map<string, THREE.BufferGeometry>();
let vertexColorMat: THREE.Material | null = null;
const baked = (key: string, build: () => THREE.Group) => {
  let geometry = bakedCache.get(key);
  if (!geometry) {
    const g = build();
    g.updateMatrixWorld(true);
    const parts: THREE.BufferGeometry[] = [];
    g.traverse((o) => {
      const part = o as THREE.Mesh;
      if (!part.isMesh) return;
      const geo = part.geometry.clone().applyMatrix4(part.matrixWorld);
      const c = (part.material as THREE.MeshToonMaterial).color;
      const n = geo.attributes.position.count;
      const colors = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) colors.set([c.r, c.g, c.b], i * 3);
      geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      parts.push(geo);
    });
    geometry = mergeGeometries(parts)!;
    for (const part of parts) part.dispose();
    bakedCache.set(key, geometry);
  }
  vertexColorMat ??= toon({ vertexColors: true });
  const group = new THREE.Group();
  const body = new THREE.Mesh(geometry, vertexColorMat);
  body.castShadow = true;
  group.add(body);
  return addOutlines(group);
};

// ---------- Canvas textures ----------

const texCache = new Map<string, THREE.CanvasTexture>();

const wrapLines = (ctx: CanvasRenderingContext2D, text: string, maxWidth: number) => {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines;
};

interface SignOptions {
  bg: string;
  fg: string;
  w?: number;
  h?: number;
  font?: string;
  border?: string;
  maxSize?: number;
}

// Text that shrinks to fit a board; used for shop signs, gate doors and banners
export const signTexture = (text: string, { bg, fg, w = 512, h = 256, font = 'Lilita One', border, maxSize = 110 }: SignOptions) => {
  const key = `${text}|${bg}|${fg}|${w}|${h}|${font}|${border}|${maxSize}`;
  const cached = texCache.get(key);
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  if (border) {
    ctx.strokeStyle = border;
    ctx.lineWidth = 16;
    ctx.strokeRect(8, 8, w - 16, h - 16);
  }
  const pad = w * 0.08;
  let size = maxSize;
  let lines: string[] = [];
  for (; size > 18; size -= 4) {
    ctx.font = `${size}px "${font}", "Nunito", sans-serif`;
    lines = wrapLines(ctx, text, w - pad * 2);
    if (lines.length * size * 1.08 <= h - pad * 1.4 && lines.every((l) => ctx.measureText(l).width <= w - pad * 2)) break;
  }
  ctx.fillStyle = fg;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const total = lines.length * size * 1.08;
  lines.forEach((l, i) => ctx.fillText(l, w / 2, h / 2 - total / 2 + size * 1.08 * (i + 0.5)));
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  texCache.set(key, tex);
  return tex;
};

// ---------- Obstacles ----------

export const makeDanfo = () => baked('danfo', () => {
  const g = new THREE.Group();
  const yellow = mat('#F6C200');
  g.add(mesh(box(1.9, 1.5, 4.2), yellow, 0, 1.05, 0));
  g.add(mesh(box(1.92, 0.12, 4.22), mat('#111111'), 0, 1.0, 0)); // black stripe
  g.add(mesh(box(1.92, 0.12, 4.22), mat('#111111'), 0, 0.7, 0));
  g.add(mesh(box(1.94, 0.45, 3.4), mat('#24304A'), 0, 1.5, -0.2)); // windows
  g.add(mesh(box(1.7, 0.4, 0.05), mat('#24304A'), 0, 1.45, 2.11)); // windscreen (faces player)
  for (const [x, z] of [[-0.9, 1.4], [0.9, 1.4], [-0.9, -1.4], [0.9, -1.4]]) {
    const wheel = mesh(cyl(0.35, 0.35, 0.25, 10), mat('#1A1A1A'), x, 0.35, z);
    wheel.rotation.z = Math.PI / 2;
    g.add(wheel);
  }
  // Roof rack with a Ghana-Must-Go bag on top
  g.add(mesh(box(1.5, 0.08, 2.6), mat('#444444'), 0, 1.84, -0.3));
  g.add(mesh(box(0.8, 0.45, 0.6), mat('#C0392B'), 0.2, 2.1, -0.6));
  return g;
});

const stripeTexture = () => {
  const key = 'stripes';
  const cached = texCache.get(key);
  if (cached) return cached;
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 32;
  const ctx = c.getContext('2d')!;
  for (let i = 0; i < 8; i++) {
    ctx.fillStyle = i % 2 ? '#FFFFFF' : '#E63946';
    ctx.beginPath();
    ctx.moveTo(i * 16, 0);
    ctx.lineTo(i * 16 + 16, 0);
    ctx.lineTo(i * 16, 32);
    ctx.lineTo(i * 16 - 16, 32);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  texCache.set(key, tex);
  return tex;
};

let barrierMat: THREE.Material | null = null;

// Low barrier: jump it (or change lane)
export const makeBarrier = () => {
  const g = new THREE.Group();
  const bar = new THREE.Mesh(box(1.9, 0.35, 0.18), barrierMat ??= toon({ map: stripeTexture() }));
  bar.position.y = 0.55;
  bar.castShadow = true;
  g.add(bar);
  g.add(mesh(box(0.12, 0.6, 0.12), mat('#333333'), -0.8, 0.3, 0));
  g.add(mesh(box(0.12, 0.6, 0.12), mat('#333333'), 0.8, 0.3, 0));
  return addOutlines(g);
};

// High banner: slide under it (or change lane)
export const makeBanner = (text: string) => {
  const g = new THREE.Group();
  g.add(mesh(box(0.1, 2.6, 0.1), mat('#5A5A5A'), -1.0, 1.3, 0));
  g.add(mesh(box(0.1, 2.6, 0.1), mat('#5A5A5A'), 1.0, 1.3, 0));
  const board = new THREE.Mesh(
    new THREE.PlaneGeometry(2.1, 0.75),
    new THREE.MeshBasicMaterial({ map: signTexture(text, { bg: '#FFF6E3', fg: '#7B2CBF', w: 512, h: 184, border: '#7B2CBF', maxSize: 80 }), side: THREE.DoubleSide }),
  );
  board.position.set(0, 1.75, 0.06);
  g.add(board);
  return addOutlines(g);
};

// ---------- Pickups ----------

export const makeCash = () => baked('cash', () => {
  const g = new THREE.Group();
  g.add(mesh(box(0.55, 0.12, 0.3), mat('#2E8B57'), 0, 0, 0));
  g.add(mesh(box(0.55, 0.12, 0.3), mat('#3CB371'), 0, 0.13, 0));
  g.add(mesh(box(0.12, 0.27, 0.32), mat('#FFF6E3'), 0, 0.065, 0)); // band
  return g;
});

export const makePapers = () => baked('papers', () => {
  const g = new THREE.Group();
  g.add(mesh(box(0.5, 0.06, 0.38), mat('#2F6FDB'), 0, 0, 0)); // folder
  g.add(mesh(box(0.42, 0.04, 0.32), mat('#FFFFFF'), 0, 0.05, 0));
  g.add(mesh(box(0.08, 0.07, 0.4), mat('#E63946'), 0.12, 0.05, 0)); // ribbon
  return g;
});

export const makeJollof = () => baked('jollof', () => {
  const g = new THREE.Group();
  g.add(mesh(cyl(0.32, 0.26, 0.08, 12), mat('#FFFFFF'), 0, 0, 0));
  const mound = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat('#E8590C'));
  mound.position.y = 0.04;
  g.add(mound);
  return g;
});

export const makePhoneOff = () => baked('phoneoff', () => {
  const g = new THREE.Group();
  g.add(mesh(box(0.3, 0.55, 0.06), mat('#222222'), 0, 0, 0));
  g.add(mesh(box(0.24, 0.42, 0.02), mat('#4FA8FF'), 0, 0.02, 0.035));
  return g;
});

// Family WhatsApp message: a sprite, always facing the camera
export const makeBubble = (text: string) => {
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: signTexture(text, { bg: '#25D366', fg: '#FFFFFF', w: 512, h: 200, maxSize: 72, font: 'Nunito' }) }),
  );
  sprite.scale.set(1.7, 0.66, 1);
  return sprite;
};

// ---------- Choice gate ----------

export interface GateLabels {
  left: string;
  right: string;
  name: string;
  emoji: string;
  color: string;
}

export const LANE_X = 2.2;

export const makeGate = ({ left, right, name, emoji, color }: GateLabels) => {
  const g = new THREE.Group();
  const frame = mat('#2B2B2B');
  // Gantry: outer posts, beam, and a middle pillar that blocks the centre lane
  // Beam sits above the chase camera (y≈4.3) so the camera never flies through it
  g.add(mesh(box(0.3, 5.8, 0.3), frame, -LANE_X * 1.55, 2.9, 0));
  g.add(mesh(box(0.3, 5.8, 0.3), frame, LANE_X * 1.55, 2.9, 0));
  g.add(mesh(box(LANE_X * 3.4, 0.35, 0.35), frame, 0, 5.8, 0));
  g.add(mesh(box(1.5, 4.0, 0.5), mat(color), 0, 2.0, 0));
  const pillarSign = new THREE.Mesh(
    new THREE.PlaneGeometry(1.4, 1.4),
    new THREE.MeshBasicMaterial({ map: signTexture(`${emoji} ${name}`, { bg: color, fg: '#FFFFFF', w: 256, h: 256, maxSize: 64 }) }),
  );
  pillarSign.position.set(0, 2.6, 0.26);
  g.add(pillarSign);

  // Paper doors you burst through
  const door = (text: string, bg: string, fg: string, x: number) => {
    const d = new THREE.Mesh(
      new THREE.PlaneGeometry(2.0, 2.9),
      new THREE.MeshBasicMaterial({
        map: signTexture(text, { bg, fg, w: 384, h: 556, border: '#050914', maxSize: 74 }),
        side: THREE.DoubleSide,
        transparent: true,
      }),
    );
    d.position.set(x, 1.55, 0);
    g.add(d);
    return d;
  };
  const leftDoor = door(left, '#FF5A4E', '#FFF6E3', -LANE_X);
  const rightDoor = door(right, '#2FCB7A', '#050914', LANE_X);
  addOutlines(g);
  return { group: g, leftDoor, rightDoor };
};

// ---------- Player ----------

export interface PlayerRig {
  group: THREE.Group;
  body: THREE.Group; // everything that leans/slides
  legL: THREE.Object3D;
  legR: THREE.Object3D;
  armL: THREE.Object3D;
  armR: THREE.Object3D;
}

export const makePlayer = (): PlayerRig => {
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);
  const shirt = mat('#1E9E5A');
  const jeans = mat('#27375E');
  const skin = mat(PALETTE.skin);

  const limb = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, len: number) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, 0);
    pivot.add(mesh(geo, m, 0, -len / 2, 0));
    body.add(pivot);
    return pivot;
  };

  const legL = limb(box(0.24, 0.7, 0.26), jeans, -0.17, 0.75, 0.7);
  const legR = limb(box(0.24, 0.7, 0.26), jeans, 0.17, 0.75, 0.7);
  body.add(mesh(box(0.62, 0.72, 0.36), shirt, 0, 1.1, 0));
  const armL = limb(box(0.16, 0.62, 0.18), skin, -0.42, 1.42, 0.62);
  const armR = limb(box(0.16, 0.62, 0.18), skin, 0.42, 1.42, 0.62);
  body.add(mesh(new THREE.SphereGeometry(0.27, 12, 10), skin, 0, 1.72, 0));
  body.add(mesh(box(0.5, 0.14, 0.5), mat('#111111'), 0, 1.93, 0)); // flat-top hair
  // Ghana-Must-Go bag on the back
  body.add(mesh(box(0.56, 0.48, 0.3), mat('#C0392B'), 0, 1.1, 0.34));
  body.add(mesh(box(0.58, 0.08, 0.32), mat('#1F4E9E'), 0, 1.18, 0.34));
  body.add(mesh(box(0.08, 0.5, 0.32), mat('#1F4E9E'), 0.1, 1.1, 0.34));

  // Blob shadow
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.45, 16),
    new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.28, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.02;
  shadow.name = 'shadow';
  shadow.userData.noOutline = true;
  group.add(shadow);
  addOutlines(body);

  return { group, body, legL, legR, armL, armR };
};

// Free per-instance resources (planes, sign/sprite materials) when a prop leaves the scene.
// Cached box/cylinder geometries, Lambert materials and textures are shared and kept.
export const release = (obj: THREE.Object3D) => {
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.geometry instanceof THREE.PlaneGeometry || m.geometry instanceof THREE.CircleGeometry) m.geometry.dispose();
    const material = (o as THREE.Mesh | THREE.Sprite).material;
    if (material instanceof THREE.MeshBasicMaterial || material instanceof THREE.SpriteMaterial) material.dispose();
  });
};

export const disposeModelCaches = () => {
  for (const g of bakedCache.values()) g.dispose();
  bakedCache.clear();
  vertexColorMat?.dispose();
  vertexColorMat = null;
  barrierMat?.dispose();
  barrierMat = null;
  for (const m of matCache.values()) m.dispose();
  for (const g of geoCache.values()) g.dispose();
  for (const t of texCache.values()) t.dispose();
  matCache.clear();
  geoCache.clear();
  texCache.clear();
};
