import * as THREE from 'three';
import rawSigns from '../data/signs.json';
import type { City } from '../types/game';
import type { ZoneDressing } from './world';

export type ZoneId = 'market' | 'documents' | 'appointment' | 'business';

interface SignFile {
  zones: Record<ZoneId, ZoneDressing>;
}

const fill = (text: string, city: City | null) =>
  text
    .replace(/\{market\}/g, city?.places.market ?? 'Computer Village')
    .replace(/\{currency\}/g, city?.currency.symbol ?? '₦')
    .replace(/\{city\}/g, city?.name ?? 'Lagos');

// Zone dressing from signs.json with the city's names filled in
export const zoneDressing = (zone: ZoneId, city: City | null): ZoneDressing => {
  const z = (rawSigns as unknown as SignFile).zones[zone];
  return {
    stalls: z.stalls,
    signs: z.signs.map((s) => fill(s, city).toUpperCase()),
    banners: z.banners.map((s) => fill(s, city)),
    bubbles: z.bubbles.map((s) => fill(s, city)),
  };
};

// One texture holds every shop sign; each instanced board picks its cell by UV offset.
// Signs are drawn into the next free cell the first time they're used.
const COLS = 2;
const ROWS = 21;
const CELL_W = 512;
const CELL_H = 96;

export class SignAtlas {
  readonly texture: THREE.CanvasTexture;
  private canvas = document.createElement('canvas');
  private ctx: CanvasRenderingContext2D;
  private cells = new Map<string, number>();

  constructor() {
    this.canvas.width = COLS * CELL_W;
    this.canvas.height = ROWS * CELL_H;
    this.ctx = this.canvas.getContext('2d')!;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 4;
  }

  // UV rect (offsetX, offsetY, scaleX, scaleY) for a sign, drawing it if new
  uv(text: string): [number, number, number, number] {
    let cell = this.cells.get(text);
    if (cell === undefined) {
      cell = this.cells.size;
      if (cell >= COLS * ROWS) {
        console.warn(`Sign atlas full (${COLS * ROWS}); "${text}" reuses the first sign`);
        cell = 0;
      } else {
        this.draw(text, cell);
        this.cells.set(text, cell);
      }
    }
    const col = cell % COLS;
    const row = Math.floor(cell / COLS);
    // Canvas y grows down, UV v grows up (flipY)
    return [col / COLS, 1 - (row + 1) / ROWS, 1 / COLS, 1 / ROWS];
  }

  private draw(text: string, cell: number) {
    const { ctx } = this;
    const x = (cell % COLS) * CELL_W;
    const y = Math.floor(cell / COLS) * CELL_H;
    // Cream board, ink border, red letters: like the stickers in the 2D UI
    ctx.fillStyle = '#FFF6E3';
    ctx.fillRect(x, y, CELL_W, CELL_H);
    ctx.strokeStyle = '#050914';
    ctx.lineWidth = 10;
    ctx.strokeRect(x + 5, y + 5, CELL_W - 10, CELL_H - 10);
    ctx.fillStyle = '#C8102E';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    let size = 54;
    do {
      ctx.font = `${size}px "Lilita One", "Nunito", sans-serif`;
      size -= 2;
    } while (ctx.measureText(text).width > CELL_W - 40 && size > 16);
    ctx.fillText(text, x + CELL_W / 2, y + CELL_H / 2 + 2);
    this.texture.needsUpdate = true;
  }

  dispose() {
    this.texture.dispose();
  }
}

// Toon material that reads its map from a per-instance UV rect (attribute aSignUv)
export const signMaterial = (atlas: SignAtlas) => {
  const material = new THREE.MeshToonMaterial({ map: atlas.texture });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aSignUv;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_MAP\n  vMapUv = uv * aSignUv.zw + aSignUv.xy;\n#endif');
  };
  material.customProgramCacheKey = () => 'sign-atlas';
  return material;
};
