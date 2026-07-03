import type { Genome } from './genome';
import type { Perlin3 } from './noise';

// One Sim holds many flocks and simulates all birds in a single spatial
// grid. Design consequence (deliberate, for phase 2): separation applies
// between ALL birds, but alignment and cohesion only bind birds to their
// own flock — so merged flocks interleave without dissolving into each
// other. The merge is visible; the identities survive.

export interface Bird {
  x: number; y: number;
  px: number; py: number;   // position last frame, for paint strokes
  vx: number; vy: number;
  size: number;
  color: string;            // body color, drawn crisp on top
  paint: string;            // pigment color, low alpha, accumulates below
  g: Genome;
}

export interface Falcon { x: number; y: number; active: boolean; }

const R = 46;             // neighbor radius, px
const R2 = R * R;
const MAX_BIRDS = 2600;   // total budget across all flocks, for perf

export class Sim {
  birds: Bird[] = [];
  private grid = new Map<number, Bird[]>();

  constructor(private noise: Perlin3, public w: number, public h: number) {}

  resize(w: number, h: number): void { this.w = w; this.h = h; }

  // fromEdge: peer flocks enter from a screen edge, flying inward,
  // so a new arrival is visible as an arrival. count overrides the
  // genome's own size (echo flocks from the roost fly smaller).
  addFlock(g: Genome, rand: () => number, opts: { fromEdge?: boolean; count?: number } = {}): void {
    const fromEdge = opts.fromEdge ?? false;
    const count = Math.min(opts.count ?? g.count, MAX_BIRDS - this.birds.length);
    if (count <= 0) return;

    let cx: number, cy: number, heading: number;
    if (fromEdge) {
      const side = Math.floor(rand() * 4);
      const along = 0.15 + rand() * 0.7;
      if (side === 0) { cx = this.w * 0.06; cy = this.h * along; }
      else if (side === 1) { cx = this.w * 0.94; cy = this.h * along; }
      else if (side === 2) { cx = this.w * along; cy = this.h * 0.06; }
      else { cx = this.w * along; cy = this.h * 0.94; }
      heading = Math.atan2(this.h / 2 - cy, this.w / 2 - cx);
    } else {
      cx = this.w * (0.25 + rand() * 0.5);
      cy = this.h * (0.25 + rand() * 0.5);
      heading = rand() * Math.PI * 2;
    }

    for (let i = 0; i < count; i++) {
      const a = rand() * Math.PI * 2;
      const d = Math.sqrt(rand()) * Math.min(this.w, this.h) * (fromEdge ? 0.1 : 0.18);
      const hue = (rand() < 0.65 ? g.hueA : g.hueB) + (rand() - 0.5) * 14;
      const x = cx + Math.cos(a) * d;
      const y = cy + Math.sin(a) * d;
      this.birds.push({
        x, y, px: x, py: y,
        vx: Math.cos(heading) * g.maxSpeed * 0.6,
        vy: Math.sin(heading) * g.maxSpeed * 0.6,
        size: g.size * (0.7 + rand() * 0.6),
        color: `hsla(${hue.toFixed(1)}, ${g.sat.toFixed(0)}%, ${g.light.toFixed(0)}%, 0.85)`,
        paint: `hsla(${hue.toFixed(1)}, ${(g.sat * 0.9).toFixed(0)}%, ${(g.light * 0.82).toFixed(0)}%, 0.07)`,
        g,
      });
    }
  }

  removeFlock(g: Genome): void {
    this.birds = this.birds.filter((b) => b.g !== g);
  }

  // Keep only `keep` birds of a flock — the ones that stay behind when
  // their visitor leaves.
  thinFlock(g: Genome, keep: number): void {
    let kept = 0;
    this.birds = this.birds.filter((b) => b.g !== g || ++kept <= keep);
  }

  step(dt: number, t: number, falcons: Falcon[]): void {
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

      // every cursor in the room is a falcon — yours and your peers'
      for (const f of falcons) {
        if (!f.active) continue;
        const dx = b.x - f.x, dy = b.y - f.y;
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

      b.px = b.x;
      b.py = b.y;
      b.x += b.vx * dt;
      b.y += b.vy * dt;

      // toroidal wrap with a small margin so birds slip off one edge
      // and return on the other without popping; shift px/py by the same
      // amount so paint strokes never streak across the whole canvas
      const m = 12;
      if (b.x < -m) { b.x += w + 2 * m; b.px += w + 2 * m; }
      else if (b.x > w + m) { b.x -= w + 2 * m; b.px -= w + 2 * m; }
      if (b.y < -m) { b.y += h + 2 * m; b.py += h + 2 * m; }
      else if (b.y > h + m) { b.y -= h + 2 * m; b.py -= h + 2 * m; }
    }
  }
}
