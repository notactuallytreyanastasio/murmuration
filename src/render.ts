import type { Sim } from './sim';

export const BG = '#0b0c10';

// The painting: an offscreen canvas that is never cleared during a flock's
// life. Every frame each bird strokes a faint pigment segment along its path.
// Layers accumulate — recent flight paints over older marks — while the
// birds themselves are drawn crisply on top of the whole painting.
export class Painter {
  canvas = document.createElement('canvas');
  private ctx = this.canvas.getContext('2d')!;
  private w = 0;
  private h = 0;

  constructor(private dpr: number) {}

  // Resizing a canvas erases it, so build a new one and copy the old
  // painting across — the artwork survives window resizes.
  resize(w: number, h: number): void {
    const old = this.canvas;
    const oldW = this.w, oldH = this.h;
    const next = document.createElement('canvas');
    next.width = Math.round(w * this.dpr);
    next.height = Math.round(h * this.dpr);
    const nctx = next.getContext('2d')!;
    nctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    nctx.lineCap = 'round';
    if (oldW > 0 && oldH > 0) nctx.drawImage(old, 0, 0, oldW, oldH);
    this.canvas = next;
    this.ctx = nctx;
    this.w = w;
    this.h = h;
  }

  clear(): void {
    this.ctx.clearRect(0, 0, this.w, this.h);
  }

  deposit(sim: Sim): void {
    const ctx = this.ctx;
    for (const b of sim.birds) {
      ctx.strokeStyle = b.paint;
      ctx.lineWidth = b.size;
      ctx.beginPath();
      ctx.moveTo(b.px, b.py);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
  }
}

// Composite one frame: background, then the painting, then crisp birds.
export function draw(
  ctx: CanvasRenderingContext2D,
  painting: HTMLCanvasElement,
  sim: Sim,
  w: number,
  h: number,
): void {
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(painting, 0, 0, w, h);

  for (const b of sim.birds) {
    const sp = Math.hypot(b.vx, b.vy) || 1;
    const nx = b.vx / sp, ny = b.vy / sp;
    const len = b.size * 3.2;
    const wid = b.size;

    const tipX = b.x + nx * len, tipY = b.y + ny * len;
    const bx = b.x - nx * len * 0.4, by = b.y - ny * len * 0.4;
    const px = -ny * wid, py = nx * wid;

    ctx.fillStyle = b.color;
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(bx + px, by + py);
    ctx.lineTo(bx - px, by - py);
    ctx.closePath();
    ctx.fill();
  }
}
