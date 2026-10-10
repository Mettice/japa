import { useEffect, useRef } from 'react';

export const EMOJI_FONT = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';

export const C = {
  ink: '#050914',
  navy: '#0B1430',
  navy2: '#13204A',
  navy3: '#1C2D63',
  cream: '#FFF6E3',
  sun: '#FFC93C',
  leaf: '#2FCB7A',
  chili: '#FF5A4E',
  sky: '#4FA8FF',
};

export const drawEmoji = (ctx: CanvasRenderingContext2D, emoji: string, x: number, y: number, size: number) => {
  ctx.font = `${size}px ${EMOJI_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(emoji, x, y);
};

export const drawText = (
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  { size = 16, color = C.cream, font = 'Nunito', weight = 900, align = 'center' as CanvasTextAlign, outline = 0 } = {},
) => {
  ctx.font = `${weight} ${size}px "${font}", sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  if (outline) {
    ctx.lineJoin = 'round';
    ctx.lineWidth = outline;
    ctx.strokeStyle = C.ink;
    ctx.strokeText(text, x, y);
  }
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
};

export const roundRect = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
};

// Top-of-screen countdown bar shared by the canvas games
export const drawTimerBar = (ctx: CanvasRenderingContext2D, w: number, remaining: number, total: number) => {
  const pct = Math.max(0, remaining / total);
  roundRect(ctx, 16, 14, w - 32, 14, 7);
  ctx.fillStyle = C.navy2;
  ctx.fill();
  roundRect(ctx, 16, 14, Math.max(14, (w - 32) * pct), 14, 7);
  ctx.fillStyle = pct < 0.25 ? C.chili : C.sun;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = C.ink;
  roundRect(ctx, 16, 14, w - 32, 14, 7);
  ctx.stroke();
};

interface Loop {
  // Game logic. dt is real seconds (≤ MAX_STEP), w/h in CSS pixels
  update: (dt: number, w: number, h: number) => void;
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void;
  tap: (x: number, y: number) => void;
}

// Logic runs on wall-clock time so a phone dropping to 15 fps plays at the same speed,
// just choppier. Long frames are split into small steps so fast movers don't tunnel.
const MAX_STEP = 1 / 30;
// After a big hitch, catch up at most this much (a stalled tab shouldn't fast-forward)
const MAX_CATCH_UP = 0.5;

// Full-size canvas with DPR scaling, a rAF loop and tap (pointerdown) input.
// Handlers live in a ref so games can keep their world in plain mutable objects.
export const useCanvasGame = (loop: Loop) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const loopRef = useRef(loop);
  loopRef.current = loop;

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    let w = 0;
    let h = 0;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      const rect = canvas.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    const onPointer = (e: PointerEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      loopRef.current.tap(e.clientX - rect.left, e.clientY - rect.top);
    };
    canvas.addEventListener('pointerdown', onPointer);

    let raf = 0;
    let last = performance.now();
    const tick = () => {
      const now = performance.now();
      let remaining = Math.min(MAX_CATCH_UP, (now - last) / 1000);
      last = now;
      while (remaining > 0) {
        const dt = Math.min(MAX_STEP, remaining);
        loopRef.current.update(dt, w, h);
        remaining -= dt;
      }
      ctx.clearRect(0, 0, w, h);
      loopRef.current.draw(ctx, w, h);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    // Backgrounded tab = paused game: restart the clock on return instead of jumping ahead
    const onVisibility = () => {
      if (document.visibilityState === 'visible') last = performance.now();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      canvas.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return canvasRef;
};
