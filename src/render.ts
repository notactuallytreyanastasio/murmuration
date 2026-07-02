import type { Sim } from './sim';

export const BG = '#0b0c10';
const TRAIL = 'rgba(11, 12, 16, 0.10)'; // low-alpha clear = painterly trails

// Each bird is a small triangle oriented along its velocity.
export function draw(ctx: CanvasRenderingContext2D, sim: Sim, w: number, h: number): void {
  ctx.fillStyle = TRAIL;
  ctx.fillRect(0, 0, w, h);

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
