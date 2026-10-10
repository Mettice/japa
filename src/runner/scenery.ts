import * as THREE from 'three';
import { Instancer, Part, PropHandle, at } from './instancer';
import { SignAtlas, signMaterial } from './signs';
import { toon } from './style';
import type { ZoneDressing } from './world';

// Street scenery, all instanced: a segment is just a list of instance slots, so dozens
// of stalls, kekes and people cost a few dozen draw calls in total.

export const SEG = 24; // scenery segment length (m)
export const LANE_X = 2.2;

// Palette shared with the 2D UI (index.css tokens) plus a few street colours
export const COLORS = {
  ink: '#050914',
  cream: '#FFF6E3',
  sun: '#FFC93C',
  leaf: '#2FCB7A',
  chili: '#FF5A4E',
  sky: '#4FA8FF',
  navy: '#1C2D63',
  road: '#3A3F4B',
  roadLine: '#FFF6E3',
  sidewalk: '#D9C3A0',
  curb: '#8E8577',
  skin: '#6B3E26',
  wood: '#8B5A2B',
  metal: '#5A5F6B',
  tyre: '#1A1A1A',
  walls: ['#FFC93C', '#FF8A5B', '#2FCB7A', '#4FA8FF', '#E86A92', '#FFF6E3', '#B9A6E8', '#F4A259', '#7BD389'],
  shirts: ['#FF5A4E', '#2FCB7A', '#4FA8FF', '#FFC93C', '#B9A6E8', '#FFF6E3', '#F4A259', '#E86A92'],
  umbrellas: ['#FF5A4E', '#FFC93C', '#2FCB7A', '#4FA8FF', '#E86A92'],
  kekes: ['#FFC93C', '#2FCB7A', '#4FA8FF'],
};

// ---------- shared geometry & materials ----------

const geo = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 10),
  cone: new THREE.ConeGeometry(1, 1, 8),
  sphere: new THREE.SphereGeometry(0.5, 10, 8),
  plane: new THREE.PlaneGeometry(1, 1),
};

const matCache = new Map<string, THREE.Material>();
const m = (color: string) => {
  let mat = matCache.get(color);
  if (!mat) {
    mat = toon({ color });
    matCache.set(color, mat);
  }
  return mat;
};
const TINT = '#ffffff'; // tinted parts: white base × per-instance colour

// Tiny parts skip the shadow pass: invisible in a 512px shadow map, but each costs a draw call
const small = { castShadow: false };

const part = (g: THREE.BufferGeometry, color: string, matrix: THREE.Matrix4, opts: Partial<Part> = {}): Part => ({
  geometry: g,
  material: m(color),
  matrix,
  tint: color === TINT,
  ...opts,
});

// Facade: white walls (tinted per building), dark windows, shopfront. One per floor count.
const facadeTexture = (floors: number) => {
  const w = 256;
  const h = 128 * floors;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, w, h);
  for (let f = 0; f < floors - 1; f++) {
    for (let col = 0; col < 3; col++) {
      const x = 28 + col * 76;
      const y = 26 + f * 128;
      ctx.fillStyle = '#050914';
      ctx.fillRect(x - 4, y - 4, 56, 72); // ink frame, like the UI borders
      ctx.fillStyle = '#2A3550';
      ctx.fillRect(x, y, 48, 64);
      ctx.fillStyle = 'rgba(255,214,150,0.55)'; // golden-hour glint
      ctx.fillRect(x, y, 48, 12);
    }
  }
  const gy = (floors - 1) * 128;
  ctx.fillStyle = '#050914';
  ctx.fillRect(36, gy + 50, w - 72, 78);
  ctx.fillStyle = '#3B2A22';
  ctx.fillRect(42, gy + 56, w - 84, 72);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
};

// Ghana-Must-Go plaid
const plaidTexture = () => {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#F2F2F2';
  ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = 'rgba(200,16,46,0.75)';
  for (let i = 0; i < 64; i += 16) ctx.fillRect(i, 0, 6, 64);
  ctx.fillStyle = 'rgba(31,78,158,0.7)';
  for (let i = 8; i < 64; i += 16) ctx.fillRect(0, i, 64, 6);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
};

// ---------- sign boards (own instanced mesh: per-instance atlas UVs) ----------

class SignBoards {
  readonly mesh: THREE.InstancedMesh;
  private uvAttr: THREE.InstancedBufferAttribute;
  private free: number[];

  constructor(scene: THREE.Scene, private atlas: SignAtlas, capacity = 128) {
    const g = geo.plane.clone();
    this.uvAttr = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
    g.setAttribute('aSignUv', this.uvAttr);
    this.mesh = new THREE.InstancedMesh(g, signMaterial(atlas), capacity);
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = true;
    const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < capacity; i++) this.mesh.setMatrixAt(i, hidden);
    this.free = Array.from({ length: capacity }, (_, i) => capacity - 1 - i);
    scene.add(this.mesh);
  }

  add(text: string, matrix: THREE.Matrix4): number | null {
    const slot = this.free.pop();
    if (slot === undefined) return null;
    this.mesh.setMatrixAt(slot, matrix);
    this.uvAttr.setXYZW(slot, ...this.atlas.uv(text));
    this.mesh.instanceMatrix.needsUpdate = true;
    this.uvAttr.needsUpdate = true;
    return slot;
  }

  remove(slot: number) {
    this.mesh.setMatrixAt(slot, new THREE.Matrix4().makeScale(0, 0, 0));
    this.mesh.instanceMatrix.needsUpdate = true;
    this.free.push(slot);
  }

  dispose() {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.dispose();
  }
}

// ---------- scenery ----------

export interface SegmentHandle {
  props: PropHandle[];
  signs: number[];
}

const BUILDING_X = 10.2;
const FLOOR_H = 2.6;
const tmpM = new THREE.Matrix4();
const q = new THREE.Quaternion();
const yAxis = new THREE.Vector3(0, 1, 0);

const place = (x: number, y: number, z: number, ry = 0, s = 1) =>
  tmpM.compose(new THREE.Vector3(x, y, z), q.setFromAxisAngle(yAxis, ry), new THREE.Vector3(s, s, s));

export class Scenery {
  private instancer: Instancer;
  private atlas = new SignAtlas();
  private signs: SignBoards;
  private textures: THREE.Texture[] = [];

  constructor(scene: THREE.Scene) {
    this.instancer = new Instancer(scene);
    this.signs = new SignBoards(scene, this.atlas);
    this.defineProps();
  }

  private defineProps() {
    const I = this.instancer;
    const flat = { outline: false, castShadow: false, receiveShadow: true };

    // Ground
    I.define('road', [part(geo.box, COLORS.road, at(0, -0.01, 0, LANE_X * 3.8, 0.02, SEG), flat)], 16);
    I.define('dash', [part(geo.box, COLORS.roadLine, at(0, 0.01, 0, 0.12, 0.02, 1.8), flat)], 160);
    I.define('sidewalk', [part(geo.box, COLORS.sidewalk, at(0, 0.1, 0, 3.4, 0.2, SEG), { ...flat })], 32);
    I.define('curb', [part(geo.box, COLORS.curb, at(0, 0.14, 0, 0.25, 0.28, SEG), { castShadow: false, receiveShadow: true })], 32);

    // Buildings: unit box per floor count; the facade sits on +x (faces the road for the
    // left side; right-side buildings are rotated 180°)
    for (const floors of [1, 2, 3]) {
      const facade = facadeTexture(floors);
      this.textures.push(facade);
      const plain = m(TINT);
      const front = toon({ map: facade });
      const roof = m('#C9BBAA');
      const h = floors * FLOOR_H;
      I.define(
        `bldg${floors}`,
        [
          {
            geometry: geo.box,
            material: [front, plain, roof, plain, plain, plain],
            matrix: at(0, h / 2, 0, 5, h, 5.2),
            tint: true,
            receiveShadow: true,
          },
        ],
        64,
      );
    }
    I.define('tank', [part(geo.cyl, '#2D2D2D', at(0, 0.45, 0, 1, 0.9, 1)), part(geo.cyl, '#2D2D2D', at(0, 0.95, 0, 0.5, 0.1, 0.5), small)], 96);

    // Market stall with a coloured umbrella
    I.define('stall', [
      part(geo.box, COLORS.wood, at(0, 0.4, 0, 1.6, 0.8, 1.0)),
      part(geo.box, COLORS.chili, at(-0.5, 0.92, 0, 0.35, 0.25, 0.35), small),
      part(geo.box, COLORS.sun, at(0, 0.92, 0.1, 0.35, 0.25, 0.35), small),
      part(geo.box, COLORS.leaf, at(0.5, 0.92, -0.1, 0.35, 0.25, 0.35), small),
      part(geo.cyl, COLORS.metal, at(0, 1.4, 0, 0.08, 2.0, 0.08), { outline: false }),
      part(geo.cone, TINT, at(0, 2.45, 0, 1.3, 0.55, 1.3)),
    ], 128);

    // Keke (tricycle): parked along the curb, facing down the road (-z)
    I.define('keke', [
      part(geo.box, TINT, at(0, 0.75, 0.25, 1.25, 0.9, 1.6)),
      part(geo.box, TINT, at(0, 0.62, -0.85, 0.75, 0.65, 0.7)),
      part(geo.box, '#1D2B53', at(0, 1.55, 0.05, 1.35, 0.1, 2.1)),
      part(geo.box, '#1D2B53', at(0, 1.2, -0.9, 0.08, 0.7, 0.08), { outline: false, ...small }),
      part(geo.box, '#24304A', at(0, 1.05, -0.55, 1.1, 0.4, 0.05), small),
      part(geo.cyl, COLORS.tyre, at(0, 0.28, -1.15, 0.56, 0.18, 0.56, 0, 0, Math.PI / 2)),
      part(geo.cyl, COLORS.tyre, at(-0.62, 0.28, 0.75, 0.56, 0.18, 0.56, 0, 0, Math.PI / 2)),
      part(geo.cyl, COLORS.tyre, at(0.62, 0.28, 0.75, 0.56, 0.18, 0.56, 0, 0, Math.PI / 2)),
    ], 64);

    // Okada (motorbike) with its rider waiting for a passenger
    I.define('okada', [
      part(geo.cyl, COLORS.tyre, at(0, 0.32, -0.62, 0.64, 0.14, 0.64, 0, 0, Math.PI / 2)),
      part(geo.cyl, COLORS.tyre, at(0, 0.32, 0.62, 0.64, 0.14, 0.64, 0, 0, Math.PI / 2)),
      part(geo.box, COLORS.chili, at(0, 0.62, 0, 0.3, 0.32, 1.2)),
      part(geo.box, COLORS.ink, at(0, 0.84, 0.2, 0.34, 0.12, 0.7), small),
      part(geo.box, COLORS.metal, at(0, 1.0, -0.58, 0.7, 0.06, 0.06), { outline: false, ...small }),
      part(geo.box, '#27375E', at(0, 0.92, 0.25, 0.42, 0.18, 0.5), small), // rider's legs
      part(geo.box, TINT, at(0, 1.3, 0.3, 0.5, 0.6, 0.32)), // rider's shirt
      part(geo.sphere, COLORS.skin, at(0, 1.78, 0.28, 0.42, 0.42, 0.42)),
      part(geo.sphere, '#B22222', at(0, 1.86, 0.28, 0.48, 0.32, 0.48), small), // helmet
    ], 64);

    I.define('generator', [
      part(geo.box, COLORS.chili, at(0, 0.3, 0, 0.9, 0.6, 0.6)),
      part(geo.box, '#2D2D2D', at(0, 0.68, 0, 0.7, 0.15, 0.45), small),
    ], 64);

    const plaid = plaidTexture();
    this.textures.push(plaid);
    I.define('gmg', [{ geometry: geo.box, material: toon({ map: plaid }), matrix: at(0, 0.26, 0, 0.75, 0.52, 0.45) }], 96);

    // Idle pedestrian: shirt colour per instance
    I.define('npc', [
      part(geo.box, '#27375E', at(0, 0.42, 0, 0.42, 0.84, 0.24)),
      part(geo.box, TINT, at(0, 1.12, 0, 0.6, 0.66, 0.32)),
      part(geo.sphere, COLORS.skin, at(0, 1.66, 0, 0.5, 0.5, 0.5)),
      part(geo.box, COLORS.ink, at(0, 1.86, 0, 0.44, 0.12, 0.44), { outline: false, ...small }),
    ], 192);

    I.define('pole', [
      part(geo.cyl, '#6B6B6B', at(0, 2.75, 0, 0.18, 5.5, 0.18)),
      part(geo.box, '#6B6B6B', at(0, 5.4, 0.5, 0.08, 0.08, 1.2), { outline: false, ...small }),
    ], 64);
  }

  buildSegment(index: number, zone: ZoneDressing, rng: () => number): SegmentHandle {
    const I = this.instancer;
    const h: SegmentHandle = { props: [], signs: [] };
    const zc = -index * SEG - SEG / 2;
    const pick = <T,>(xs: T[]) => xs[Math.floor(rng() * xs.length)];
    const add = (name: string, matrix: THREE.Matrix4, color?: string) => h.props.push(I.add(name, matrix, color));

    add('road', place(0, 0, zc));
    for (let z = -SEG / 2 + 1; z < SEG / 2; z += 4) {
      add('dash', place(-LANE_X / 2, 0, zc + z));
      add('dash', place(LANE_X / 2, 0, zc + z));
    }

    for (const side of [-1, 1] as const) {
      add('sidewalk', place(side * 5.9, 0, zc));
      add('curb', place(side * 4.2, 0, zc));
      // Left side faces +x already; right side turns round
      const face = side < 0 ? 0 : Math.PI;

      for (let z = -SEG / 2 + 2.7; z < SEG / 2; z += 5.4) {
        const floors = 1 + Math.floor(rng() * 3);
        const bz = zc + z;
        add(`bldg${floors}`, place(side * BUILDING_X, 0, bz, face), pick(COLORS.walls));
        if (floors >= 2 && rng() < 0.6) add('tank', place(side * (BUILDING_X + 0.8), floors * FLOOR_H, bz + 0.6));
        if (rng() < 0.75) {
          // Sign board over the shopfront, just proud of the facade
          const sx = side * (BUILDING_X - 2.5 - 0.04);
          const sign = new THREE.Matrix4().compose(
            new THREE.Vector3(sx, 2.25, bz),
            q.setFromAxisAngle(yAxis, side < 0 ? Math.PI / 2 : -Math.PI / 2),
            new THREE.Vector3(4.4, 0.82, 1),
          );
          const slot = this.signs.add(pick(zone.signs), sign);
          if (slot !== null) h.signs.push(slot);
        }
      }

      // Sidewalk life: denser than before, varied per zone
      for (let z = -SEG / 2 + 1.5; z < SEG / 2; z += 3) {
        const pz = zc + z + (rng() - 0.5) * 1.2;
        const roll = rng();
        const inner = side * (5.2 + rng() * 1.4);
        if (zone.stalls && roll < 0.24) add('stall', place(inner, 0.2, pz, rng() * Math.PI), pick(COLORS.umbrellas));
        else if (roll < 0.34) add('keke', place(side * 4.85, 0.2, pz, rng() < 0.5 ? 0 : Math.PI), pick(COLORS.kekes));
        else if (roll < 0.44) add('okada', place(side * 4.75, 0.2, pz, rng() < 0.5 ? 0.15 : Math.PI - 0.15), pick(COLORS.shirts));
        else if (roll < 0.66) {
          // One or two people standing around, facing the road
          const n = rng() < 0.4 ? 2 : 1;
          for (let i = 0; i < n; i++) add('npc', place(inner + i * 0.5 * side, 0.2, pz + i * 0.6, face + (rng() - 0.5) * 1.6), pick(COLORS.shirts));
        } else if (roll < 0.74) add('generator', place(inner, 0.2, pz, rng() * Math.PI));
        else if (roll < 0.84) {
          add('gmg', place(inner, 0.2, pz, rng() * Math.PI));
          if (rng() < 0.5) add('gmg', place(inner, 0.72, pz, rng() * Math.PI, 0.9));
        } else if (roll < 0.92) add('pole', place(side * 5.0, 0.2, pz));
      }
    }
    return h;
  }

  removeSegment(h: SegmentHandle) {
    for (const p of h.props) this.instancer.remove(p);
    for (const s of h.signs) this.signs.remove(s);
  }

  setOutlines(visible: boolean) {
    this.instancer.setOutlines(visible);
  }

  dispose() {
    this.instancer.dispose();
    this.signs.dispose();
    this.atlas.dispose();
    for (const t of this.textures) t.dispose();
    for (const mat of matCache.values()) mat.dispose();
    matCache.clear();
  }
}
