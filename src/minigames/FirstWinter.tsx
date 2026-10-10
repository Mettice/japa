import { useRef } from 'react';
import { C, drawEmoji, drawText, drawTimerBar, roundRect, useCanvasGame } from './canvas';
import { MiniGameProps } from './types';
import { sound } from '../utils/audio';

const DURATION = 18;
const COLD_START = 20;
const COLD_PER_SEC = 7; // ~11s to freeze if you do nothing
const BILL_COLD = 10; // tapping a bill also chills you
const HIT_PAD = 14;

interface ItemKind {
  kind: 'warm' | 'bill';
  emoji?: string;
  label: string;
  warmth: number; // cold removed when tapped
}

const WARM: ItemKind[] = [
  { kind: 'warm', emoji: '🔥', label: 'Heater', warmth: 30 },
  { kind: 'warm', emoji: '☕', label: 'Hot chocolate', warmth: 18 },
  { kind: 'warm', emoji: '🧥', label: 'Thick jacket', warmth: 25 },
];
const BILLS: ItemKind[] = [
  { kind: 'bill', label: 'RENT €650', warmth: 0 },
  { kind: 'bill', label: 'NAVIGO €86', warmth: 0 },
  { kind: 'bill', label: 'WU: SEND MONEY', warmth: 0 },
];

interface Item extends ItemKind {
  x: number;
  y: number;
  vy: number;
  spin: number;
  w: number;
  h: number;
}

interface Floater {
  text: string;
  x: number;
  y: number;
  life: number;
  color: string;
}

export default function FirstWinter({ rng, onFinish }: MiniGameProps) {
  const world = useRef({
    time: 0,
    cold: COLD_START,
    spawnIn: 0.3,
    items: [] as Item[],
    floaters: [] as Floater[],
    snow: Array.from({ length: 60 }, () => ({ x: rng(), y: rng(), r: 1 + rng() * 2.5, s: 20 + rng() * 40 })),
    bills: 0,
    warmed: 0,
    flash: 0,
    flashColor: C.chili,
    done: false,
  }).current;

  const finish = (frozen: boolean) => {
    if (world.done) return;
    world.done = true;
    const survived = !frozen;
    const score = survived ? 0.6 + 0.4 * (1 - world.cold / 100) : 0.4 * (world.time / DURATION);
    onFinish({
      result: { score, penalties: world.bills },
      emoji: survived ? '🧣' : '🥶',
      headline: survived ? 'You survived your first winter!' : 'Frozen like ice block!',
      detail: `${world.warmed} warm-ups grabbed · ${world.bills} bill${world.bills === 1 ? '' : 's'} paid`,
    });
  };

  const canvasRef = useCanvasGame({
    tap: (x, y) => {
      if (world.done) return;
      // Topmost (last drawn) item wins
      for (let i = world.items.length - 1; i >= 0; i--) {
        const it = world.items[i];
        if (Math.abs(x - it.x) > it.w / 2 + HIT_PAD || Math.abs(y - it.y) > it.h / 2 + HIT_PAD) continue;
        world.items.splice(i, 1);
        if (it.kind === 'warm') {
          world.cold = Math.max(0, world.cold - it.warmth);
          world.warmed++;
          world.flash = 0.25;
          world.flashColor = C.sun;
          world.floaters.push({ text: `+warm ${it.emoji}`, x: it.x, y: it.y, life: 0.8, color: C.sun });
          sound.playClick();
          sound.triggerHaptic('light');
        } else {
          world.bills++;
          world.cold = Math.min(100, world.cold + BILL_COLD);
          world.flash = 0.35;
          world.flashColor = C.chili;
          world.floaters.push({ text: '−money 💸', x: it.x, y: it.y, life: 1, color: C.chili });
          sound.playSwipe('left');
          sound.triggerHaptic('medium');
        }
        return;
      }
    },

    update: (dt, w, h) => {
      if (!world.done) {
        world.time += dt;
        world.cold = Math.min(100, world.cold + COLD_PER_SEC * dt);
        if (world.cold >= 100) finish(true);
        else if (world.time >= DURATION) finish(false);

        world.spawnIn -= dt;
        if (world.spawnIn <= 0) {
          const progress = world.time / DURATION;
          world.spawnIn = 0.6 - 0.2 * progress + rng() * 0.2;
          const isBill = rng() < 0.38 + 0.12 * progress;
          const kind = isBill ? BILLS[Math.floor(rng() * BILLS.length)] : WARM[Math.floor(rng() * WARM.length)];
          const iw = isBill ? 128 : 56;
          const ih = isBill ? 48 : 56;
          world.items.push({
            ...kind,
            x: iw / 2 + 12 + rng() * (w - iw - 24),
            y: -ih,
            vy: 130 + rng() * 60 + 90 * progress,
            spin: (rng() - 0.5) * 0.5,
            w: iw,
            h: ih,
          });
        }
        for (const it of world.items) it.y += it.vy * dt;
        world.items = world.items.filter((it) => it.y < h + 60);
      }
      for (const f of world.floaters) {
        f.life -= dt;
        f.y -= 50 * dt;
      }
      world.floaters = world.floaters.filter((f) => f.life > 0);
      world.flash = Math.max(0, world.flash - dt);
      for (const s of world.snow) s.y = (s.y + (s.s * dt) / h) % 1;
    },

    draw: (ctx, w, h) => {
      const sky = ctx.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, '#1B2C66');
      sky.addColorStop(1, '#6E8BC9');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, h);

      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      for (const s of world.snow) {
        ctx.beginPath();
        ctx.arc(s.x * w, s.y * h, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
      // Snow ground
      ctx.fillStyle = '#EAF2FF';
      ctx.fillRect(0, h - 70, w, 70);

      // You, shivering harder as it gets colder
      const jitter = (world.cold / 100) * 4;
      drawEmoji(ctx, '🧍🏿‍♂️', w / 2 + (rng() - 0.5) * jitter * 2, h - 105, 64);
      if (world.cold > 60) drawEmoji(ctx, '🥶', w / 2 + 36, h - 140, 30);

      for (const it of world.items) {
        ctx.save();
        ctx.translate(it.x, it.y);
        ctx.rotate(it.spin);
        if (it.kind === 'bill') {
          roundRect(ctx, -it.w / 2, -it.h / 2, it.w, it.h, 8);
          ctx.fillStyle = '#FFFFFF';
          ctx.fill();
          ctx.lineWidth = 3;
          ctx.strokeStyle = C.chili;
          ctx.stroke();
          drawText(ctx, '🧾', -it.w / 2 + 16, 0, { size: 18 });
          drawText(ctx, it.label, 10, 0, { size: 12, color: C.chili });
        } else {
          ctx.beginPath();
          ctx.arc(0, 0, it.w / 2, 0, Math.PI * 2);
          ctx.fillStyle = C.sun;
          ctx.fill();
          ctx.lineWidth = 4;
          ctx.strokeStyle = C.ink;
          ctx.stroke();
          drawEmoji(ctx, it.emoji!, 0, 2, 32);
        }
        ctx.restore();
      }

      for (const f of world.floaters) {
        ctx.globalAlpha = Math.min(1, f.life * 2);
        drawText(ctx, f.text, f.x, f.y, { size: 20, color: f.color, font: 'Lilita One', weight: 400, outline: 6 });
        ctx.globalAlpha = 1;
      }

      if (world.flash > 0) {
        ctx.globalAlpha = world.flash;
        ctx.fillStyle = world.flashColor;
        ctx.fillRect(0, 0, w, h);
        ctx.globalAlpha = 1;
      }

      // Cold meter
      drawTimerBar(ctx, w, DURATION - world.time, DURATION);
      const mx = 16;
      const my = 40;
      const mw = w - 32;
      roundRect(ctx, mx, my, mw, 24, 12);
      ctx.fillStyle = C.navy2;
      ctx.fill();
      roundRect(ctx, mx, my, Math.max(24, (mw * world.cold) / 100), 24, 12);
      ctx.fillStyle = world.cold > 75 ? C.chili : C.sky;
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = C.ink;
      roundRect(ctx, mx, my, mw, 24, 12);
      ctx.stroke();
      drawText(ctx, `🥶 COLD ${Math.round(world.cold)}%`, w / 2, my + 12, { size: 14, outline: 4 });

      if (world.time < 2.5) {
        drawText(ctx, 'Tap warm things. Don’t touch the bills!', w / 2, h - 30, { size: 16, color: C.ink });
      }
    },
  });

  return <canvas ref={canvasRef} className="w-full h-full block touch-none" />;
}
