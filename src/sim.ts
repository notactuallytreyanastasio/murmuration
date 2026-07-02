import type { Genome } from './genome';
import type { Perlin3 } from './noise';

// One Sim holds many flocks and simulates all birds in a single spatial
// grid. Design consequence (deliberate, for phase 2): separation applies
// between ALL birds, but alignment and cohesion only bind birds to their
// own flock — so merged flocks interleave without dissolving into each
// other. The merge is visible; the identities survive.

export interface Bird {
  x: number; y: number;
  vx: number; vy: number;
  size: number;
  color: string;
  g: Genome;
}

export interface Falcon { x: number; y: number; active: boolean; }

const R = 46;        // neighbor radius, px
const R2 = R * R;

export class Sim {
  birds: Bird[] = [];
  private grid = new Map<number, Bird[]>();

  constructor(private noise: Perlin3, public w: number, public h: number) {}

  resize(w: number, h: number): void { this.w = w; this.h = h; }

  addFlock(g: Genome, rand: () => number, count = g.count): void {
    const cx = this.w * (0.25 + rand() * 0.5);
    const cy = this.h * (0.25 + rand() * 0.5);
    const heading = rand() * Math.PI * 2;
    for (let i = 0; i < count; i++) {
      const a = rand() * Math.PI * 2;
      const d = Math.sqrt(rand()) * Math.min(this.w, this.h) * 0.18;
      const hue = (rand() < 0.65 ? g.hueA : g.hueB) + (rand() - 0.5) * 14;
      this.birds.push({
        x: cx + Math.cos(a) * d,
        y: cy + Math.sin(a) * d,
        vx: Math.cos(heading) * g.maxSpeed * 0.6,
        vy: Math.sin(heading) * g.maxSpeed * 0.6,
        size: g.size * (0.7 + rand() * 0.6),
        color: `hsla(${hue.toFixed(1)}, ${g.sat.toFixed(0)}%, ${g.light.toFixed(0)}%, 0.85)`,
        g,
      });
    }
  }

  step(dt: number, t: number, falcon: Falcon): void {
    const { w, h, grid } = this;
    grid.clear();
    const key = (cx: number, cy: number) => cx * 73856093 ^ cy * 19349663;

    for (const b of this.birds) {
      const k = key(Math.floor(b.x / R), Math.floor(b.y / R));
      let list = grid.get(k);
      if (!list) grid.set(k, (list = []));
      list.push(b);
    }

    const fieldScale = 0.0016;
    const tScale = 0.045;

    for (const b of this.birds) {
      const g = b.g;
      let sepX = 0, sepY = 0;
      let aliX = 0, aliY = 0, aliN = 0;
      let cohX = 0, cohY = 0, cohN = 0;

      const cx = Math.floor(b.x / R), cy = Math.floor(b.y / R);
      for (let ix = cx - 1; ix <= cx + 1; ix++) {
        for (let iy = cy - 1; iy <= cy + 1; iy++) {
          const list = grid.get(key(ix, iy));
          if (!list) continue;
          for (const o of list) {
            if (o === b) continue;
            const dx = o.x - b.x, dy = o.y - b.y;
            const d2 = dx * dx + dy * dy;
            if (d2 > R2 || d2 === 0) continue;
            const d = Math.sqrt(d2);
            const push = (1 - d / R) / d;   // stronger the closer they are
            sepX -= dx * push;
            sepY -= dy * push;
            if (o.g === g) {
              aliX += o.vx; aliY += o.vy; aliN++;
              cohX += o.x; cohY += o.y; cohN++;
            }
          }
        }
      }

      let ax = sepX * g.separation * 60;
      let ay = sepY * g.separation * 60;

      if (aliN > 0) {
        ax += (aliX / aliN - b.vx) * g.alignment * 1.6;
        ay += (aliY / aliN - b.vy) * g.alignment * 1.6;
      }
      if (cohN > 0) {
        ax += (cohX / cohN - b.x) * g.cohesion * 3.2;
        ay += (cohY / cohN - b.y) * g.cohesion * 3.2;
      }

      // ride the shared flow field
      const ang = this.noise.noise(b.x * fieldScale, b.y * fieldScale, t * tScale) * Math.PI * 2.4;
      ax += (Math.cos(ang) * g.maxSpeed - b.vx) * g.flowAffinity * 0.9;
      ay += (Math.sin(ang) * g.maxSpeed - b.vy) * g.flowAffinity * 0.9;

      // the cursor is a falcon
      if (falcon.active) {
        const dx = b.x - falcon.x, dy = b.y - falcon.y;
        const d2 = dx * dx + dy * dy;
        const fr = 70 + g.skittish * 130;
        if (d2 < fr * fr && d2 > 0.01) {
          const d = Math.sqrt(d2);
          const push = (1 - d / fr) * 2200 / d;
          ax += dx * push;
          ay += dy * push;
        }
      }

      const amax = g.steer * 4;
      const a2 = ax * ax + ay * ay;
      if (a2 > amax * amax) {
        const s = amax / Math.sqrt(a2);
        ax *= s; ay *= s;
      }

      b.vx += ax * dt;
      b.vy += ay * dt;

      const v2 = b.vx * b.vx + b.vy * b.vy;
      const vmax = g.maxSpeed, vmin = g.maxSpeed * 0.45;
      if (v2 > vmax * vmax) {
        const s = vmax / Math.sqrt(v2);
        b.vx *= s; b.vy *= s;
      } else if (v2 < vmin * vmin && v2 > 1e-4) {
        const s = vmin / Math.sqrt(v2);
        b.vx *= s; b.vy *= s;
      }

      b.x += b.vx * dt;
      b.y += b.vy * dt;

      // toroidal wrap with a small margin so birds slip off one edge
      // and return on the other without popping
      const m = 12;
      if (b.x < -m) b.x += w + 2 * m; else if (b.x > w + m) b.x -= w + 2 * m;
      if (b.y < -m) b.y += h + 2 * m; else if (b.y > h + m) b.y -= h + 2 * m;
    }
  }
}
