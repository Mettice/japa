import { useRef } from 'react';
import { C, drawEmoji, drawText, drawTimerBar, roundRect, useCanvasGame } from './canvas';
import { MiniGameProps } from './types';
import { sound } from '../utils/audio';

const DURATION = 15;
const START_POS = 4; // your 1-based place in line
const MAX_CUTS = 5; // cuts at which the score reaches 0
// Thumb-sized: every person is ≥ 44px, cutters sit on a 56px disc, taps count within 50px
const PERSON_SIZE = 44;
const CUTTER_SIZE = 50;
const CUTTER_DISC = 28; // radius of the tappable disc behind each cutter
const HIT_RADIUS = 50;
const SHOO_LINES = ['Comot!', 'Go back!', 'Line dey!', 'Shoo!', 'Abeg!'];
const CUTTERS = ['🏃🏿‍♂️', '🏃🏾‍♀️', '🏃🏽‍♂️', '🏃🏿‍♀️'];
const QUEUE_PEOPLE = ['🧍🏿‍♂️', '🧍🏾‍♀️', '🧍🏿', '🧍🏽‍♂️', '🧍🏾'];

interface Cutter {
  side: -1 | 1; // -1 comes from the left
  sx: number;
  sy: number;
  t: number; // 0..1 along the path to the queue
  duration: number;
  state: 'walk' | 'shoo';
  x: number;
  y: number;
  vx: number;
  vy: number;
  emoji: string;
}

interface Floater {
  text: string;
  x: number;
  y: number;
  life: number;
  color: string;
}

export default function EmbassyQueue({ rng, onFinish }: MiniGameProps) {
  const world = useRef({
    time: 0,
    spawnIn: 0.5,
    cutters: [] as Cutter[],
    floaters: [] as Floater[],
    cuts: 0,
    shooed: 0,
    shake: 0,
    shakeX: 0,
    shakeY: 0,
    playerY: 0,
    done: false,
  }).current;

  const layout = (w: number, h: number) => {
    const gateY = 64;
    const spacing = Math.max(50, Math.min(62, (h - 190) / 10));
    const slotY = (i: number) => gateY + 76 + i * spacing;
    return { gateY, spacing, slotY, cx: w / 2, playerSlot: START_POS - 1 + world.cuts };
  };

  const finish = () => {
    if (world.done) return;
    world.done = true;
    const position = START_POS + world.cuts;
    onFinish({
      result: { score: Math.max(0, 1 - world.cuts / MAX_CUTS) },
      emoji: world.cuts === 0 ? '🏆' : world.cuts <= 2 ? '😤' : '😩',
      headline: world.cuts === 0 ? `You held position #${position}!` : `You slipped to position #${position}`,
      detail: `${world.shooed} line-cutters chased away · ${world.cuts} got in front of you`,
    });
  };

  const canvasRef = useCanvasGame({
    tap: (x, y) => {
      if (world.done) return;
      let best: Cutter | null = null;
      let bestD = HIT_RADIUS;
      for (const c of world.cutters) {
        if (c.state !== 'walk') continue;
        const d = Math.hypot(c.x - x, c.y - y);
        if (d < bestD) {
          best = c;
          bestD = d;
        }
      }
      if (!best) return;
      best.state = 'shoo';
      best.vx = -best.side * 520;
      best.vy = -160;
      world.shooed++;
      world.floaters.push({ text: SHOO_LINES[Math.floor(rng() * SHOO_LINES.length)], x: best.x, y: best.y - 36, life: 0.8, color: C.leaf });
      sound.playClick();
      sound.triggerHaptic('light');
    },

    update: (dt, w, h) => {
      const L = layout(w, h);
      if (!world.playerY) world.playerY = L.slotY(L.playerSlot);

      if (!world.done) {
        world.time += dt;
        if (world.time >= DURATION) finish();

        world.spawnIn -= dt;
        if (world.spawnIn <= 0) {
          const progress = world.time / DURATION;
          world.spawnIn = 1.0 - 0.45 * progress + rng() * 0.25;
          const side = rng() < 0.5 ? -1 : 1;
          const behind = world.playerY + 50;
          world.cutters.push({
            side,
            sx: side < 0 ? -40 : w + 40,
            sy: behind + rng() * Math.max(60, h - behind - 70),
            t: 0,
            duration: 2.1 - 0.8 * progress,
            state: 'walk',
            x: side < 0 ? -40 : w + 40,
            y: h,
            vx: 0,
            vy: 0,
            emoji: CUTTERS[Math.floor(rng() * CUTTERS.length)],
          });
        }
      }

      const targetY = world.playerY - L.spacing / 2;
      for (const c of world.cutters) {
        if (c.state === 'walk') {
          if (!world.done) c.t = Math.min(1, c.t + dt / c.duration);
          const tx = L.cx + c.side * 26;
          const e = c.t * c.t * (3 - 2 * c.t); // ease in-out
          c.x = c.sx + (tx - c.sx) * e;
          c.y = c.sy + (targetY - c.sy) * e + Math.sin(c.t * 18) * 3;
          if (c.t >= 1) {
            // Got in front of you
            world.cuts++;
            c.state = 'shoo';
            c.x = -999;
            world.shake = 0.35;
            world.floaters.push({ text: '−1 place 😤', x: L.cx + 80, y: world.playerY - 24, life: 1.1, color: C.chili });
            sound.playSwipe('left');
            sound.triggerHaptic('medium');
          }
        } else {
          c.x += c.vx * dt;
          c.y += c.vy * dt;
          c.vy += 600 * dt;
        }
      }
      world.cutters = world.cutters.filter((c) => c.x > -90 && c.x < w + 90 && c.y < h + 90);
      for (const f of world.floaters) {
        f.life -= dt;
        f.y -= 40 * dt;
      }
      world.floaters = world.floaters.filter((f) => f.life > 0);
      world.playerY += (L.slotY(L.playerSlot) - world.playerY) * Math.min(1, dt * 8);
      world.shake = Math.max(0, world.shake - dt);
      world.shakeX = (rng() - 0.5) * 10 * world.shake;
      world.shakeY = (rng() - 0.5) * 10 * world.shake;
    },

    draw: (ctx, w, h) => {
      const L = layout(w, h);
      ctx.save();
      ctx.translate(world.shakeX, world.shakeY);

      ctx.fillStyle = C.navy;
      ctx.fillRect(0, 0, w, h);
      // Pavement lane for the queue
      const lane = 56;
      ctx.fillStyle = C.navy2;
      ctx.fillRect(L.cx - lane, L.gateY + 30, lane * 2, h);
      ctx.setLineDash([10, 12]);
      ctx.strokeStyle = 'rgba(255,246,227,0.25)';
      ctx.lineWidth = 3;
      for (const dx of [-lane, lane]) {
        ctx.beginPath();
        ctx.moveTo(L.cx + dx, L.gateY + 30);
        ctx.lineTo(L.cx + dx, h);
        ctx.stroke();
      }
      ctx.setLineDash([]);

      // Embassy gate
      roundRect(ctx, L.cx - 96, L.gateY - 36, 192, 66, 14);
      ctx.fillStyle = C.navy3;
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = C.ink;
      ctx.stroke();
      drawEmoji(ctx, '🏛️', L.cx - 56, L.gateY - 3, 40);
      drawText(ctx, 'EMBASSY', L.cx + 22, L.gateY - 3, { size: 22, font: 'Lilita One', weight: 400, color: C.sun });

      // People ahead of and behind you
      const playerOffset = world.playerY - L.slotY(L.playerSlot);
      for (let i = 0; i < 14; i++) {
        if (i === L.playerSlot) continue;
        const y = L.slotY(i) + (i > L.playerSlot ? playerOffset : 0);
        if (y > h + 30) break;
        drawEmoji(ctx, QUEUE_PEOPLE[i % QUEUE_PEOPLE.length], L.cx, y, PERSON_SIZE);
      }

      // You
      ctx.beginPath();
      ctx.arc(L.cx, world.playerY, 30, 0, Math.PI * 2);
      ctx.fillStyle = C.sun;
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = C.ink;
      ctx.stroke();
      drawEmoji(ctx, '🧍🏾‍♂️', L.cx, world.playerY, PERSON_SIZE);
      roundRect(ctx, L.cx + 38, world.playerY - 15, 84, 30, 10);
      ctx.fillStyle = C.sun;
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.stroke();
      drawText(ctx, `YOU #${START_POS + world.cuts}`, L.cx + 80, world.playerY + 1, { size: 15, color: C.ink });

      // Cutters, each on a red disc so the tap target is obvious
      for (const c of world.cutters) {
        if (c.state === 'walk') {
          ctx.beginPath();
          ctx.arc(c.x, c.y, CUTTER_DISC, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(255,90,78,0.35)';
          ctx.fill();
          ctx.lineWidth = 3;
          ctx.strokeStyle = C.chili;
          ctx.stroke();
        }
        ctx.save();
        ctx.translate(c.x, c.y);
        if (c.state === 'walk' && c.side < 0) ctx.scale(-1, 1); // runner emoji faces left
        if (c.state === 'shoo') ctx.rotate(c.side * 0.6);
        drawEmoji(ctx, c.emoji, 0, 0, CUTTER_SIZE);
        ctx.restore();
        if (c.state === 'walk' && c.t > 0.6) {
          drawText(ctx, '!', c.x, c.y - 42, { size: 30, color: C.chili, font: 'Lilita One', weight: 400, outline: 6 });
        }
        if (c.state === 'shoo') drawEmoji(ctx, '💨', c.x + c.side * 34, c.y, 28);
      }

      for (const f of world.floaters) {
        ctx.globalAlpha = Math.min(1, f.life * 2);
        drawText(ctx, f.text, f.x, f.y, { size: 24, color: f.color, font: 'Lilita One', weight: 400, outline: 6 });
        ctx.globalAlpha = 1;
      }
      ctx.restore();

      drawTimerBar(ctx, w, DURATION - world.time, DURATION);
      if (world.time < 2.5) {
        drawText(ctx, 'Tap the line-cutters before they pass you!', w / 2, h - 36, { size: 17, outline: 5 });
      }
    },
  });

  return <canvas ref={canvasRef} className="w-full h-full block touch-none" />;
}
