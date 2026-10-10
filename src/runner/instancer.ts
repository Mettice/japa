import * as THREE from 'three';
import { outlineMaterial } from './style';

// Draws every copy of a prop part with ONE draw call (plus one for its outline), instead
// of one call per object. Props are lists of parts; segments add/remove whole props and
// get back a handle so their slots can be freed when the segment scrolls away.

export interface Part {
  geometry: THREE.BufferGeometry;
  material: THREE.Material | THREE.Material[];
  matrix: THREE.Matrix4; // part's offset inside the prop
  tint?: boolean; // takes the per-instance colour passed to add()
  outline?: boolean; // default true
  castShadow?: boolean; // default true
  receiveShadow?: boolean;
}

// Each pool is kept packed: live instances occupy slots 0..count-1 and only those are drawn.
// Removing one moves the last live instance into the gap (and updates its owner's handle),
// so the GPU never processes empty slots.
interface Slotted {
  mesh: THREE.InstancedMesh;
  outline: THREE.InstancedMesh | null;
  count: number;
  owners: Array<PropHandle[number] | undefined>;
  part: Part;
}

export type PropHandle = Array<[Slotted, number]>;

const tmp = new THREE.Matrix4();
const tmpColor = new THREE.Color();
const white = new THREE.Color('#ffffff');

export class Instancer {
  private protos = new Map<string, Slotted[]>();

  constructor(private scene: THREE.Scene, private capacity = 256) {}

  define(name: string, parts: Part[], capacity = this.capacity) {
    const slotted = parts.map((part): Slotted => {
      const mesh = new THREE.InstancedMesh(part.geometry, part.material, capacity);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      if (part.tint) {
        mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3).fill(1), 3);
      }
      mesh.count = 0;
      mesh.castShadow = part.castShadow !== false;
      mesh.receiveShadow = !!part.receiveShadow;
      // Instances spread over the whole street; per-mesh culling would hide them wrongly
      mesh.frustumCulled = false;
      this.scene.add(mesh);

      let outline: THREE.InstancedMesh | null = null;
      if (part.outline !== false) {
        outline = new THREE.InstancedMesh(part.geometry, outlineMaterial(), capacity);
        outline.instanceMatrix = mesh.instanceMatrix; // shares slots: no extra upload
        outline.frustumCulled = false;
        outline.count = 0;
        this.scene.add(outline);
      }
      return { mesh, outline, part, count: 0, owners: [] };
    });
    this.protos.set(name, slotted);
  }

  add(name: string, transform: THREE.Matrix4, color?: THREE.ColorRepresentation): PropHandle {
    const parts = this.protos.get(name);
    if (!parts) throw new Error(`Unknown prop ${name}`);
    const handle: PropHandle = [];
    const c = color !== undefined ? new THREE.Color(color) : white;
    for (const s of parts) {
      if (s.count >= s.mesh.instanceMatrix.count) continue; // pool full: skip this part rather than crash
      const slot = s.count++;
      s.mesh.setMatrixAt(slot, tmp.multiplyMatrices(transform, s.part.matrix));
      if (s.part.tint) s.mesh.setColorAt(slot, c);
      const entry: [Slotted, number] = [s, slot];
      s.owners[slot] = entry;
      handle.push(entry);
      this.sync(s);
    }
    return handle;
  }

  remove(handle: PropHandle) {
    for (const entry of handle) {
      const [s, slot] = entry;
      const last = --s.count;
      if (slot !== last) {
        // Move the last live instance into the freed slot
        s.mesh.getMatrixAt(last, tmp);
        s.mesh.setMatrixAt(slot, tmp);
        if (s.part.tint && s.mesh.instanceColor) {
          s.mesh.getColorAt(last, tmpColor);
          s.mesh.setColorAt(slot, tmpColor);
        }
        const moved = s.owners[last]!;
        moved[1] = slot;
        s.owners[slot] = moved;
      }
      s.owners[last] = undefined;
      this.sync(s);
    }
    handle.length = 0;
  }

  private sync(s: Slotted) {
    s.mesh.count = s.count;
    if (s.outline) s.outline.count = s.count;
    s.mesh.instanceMatrix.needsUpdate = true;
    if (s.part.tint && s.mesh.instanceColor) s.mesh.instanceColor.needsUpdate = true;
  }

  setOutlines(visible: boolean) {
    for (const parts of this.protos.values()) for (const s of parts) if (s.outline) s.outline.visible = visible;
  }

  dispose() {
    for (const parts of this.protos.values()) {
      for (const s of parts) {
        this.scene.remove(s.mesh);
        s.mesh.dispose();
        if (s.outline) {
          this.scene.remove(s.outline);
          s.outline.dispose();
        }
      }
    }
    this.protos.clear();
  }
}

// Helpers for building part offsets
export const at = (x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, ry = 0, rx = 0, rz = 0) =>
  new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
    new THREE.Vector3(sx, sy, sz),
  );
