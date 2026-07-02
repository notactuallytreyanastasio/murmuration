import { rngFromSeed } from './prng';

// A genome is everything that makes a flock *itself*: pure numeric params,
// derived deterministically from the seed. In phase 2 this object (plus the
// seed) is the only thing that ever crosses the wire — nothing executable.

export interface Genome {
  seed: string;
  count: number;        // birds in the flock
  size: number;         // base body size, px
  hueA: number;         // primary hue, degrees
  hueB: number;         // secondary hue, degrees
  sat: number;          // %
  light: number;        // %
  cohesion: number;     // pull toward flockmates' centroid
  separation: number;   // push away from anyone too close (any flock)
  alignment: number;    // match flockmates' heading
  maxSpeed: number;     // px/s
  steer: number;        // max steering accel, px/s^2
  flowAffinity: number; // how strongly they ride the shared flow field
  skittish: number;     // 0..1 — falcon (cursor) flee radius/urgency
}

export function genomeFromSeed(seed: string): Genome {
  const r = rngFromSeed(seed);
  const range = (lo: number, hi: number) => lo + r() * (hi - lo);

  const hueA = r() * 360;
  const analogous = r() < 0.72; // mostly harmonious neighbors, sometimes a bold complement
  const hueB = (hueA + (analogous ? range(18, 48) : range(150, 210))) % 360;

  return {
    seed,
    count: Math.round(range(380, 720)),
    size: range(1.5, 3.0),
    hueA,
    hueB,
    sat: range(58, 88),
    light: range(55, 74),
    cohesion: range(0.25, 0.9),
    separation: range(0.9, 1.8),
    alignment: range(0.5, 1.3),
    maxSpeed: range(130, 230),
    steer: range(260, 560),
    flowAffinity: range(0.35, 1.1),
    skittish: range(0.3, 1.0),
  };
}

// Phase-2 ingress guard: clamp a received genome into safe ranges so a
// hostile peer can't send us a million invisible warp-speed birds.
export function clampGenome(g: Genome): Genome {
  const clamp = (v: number, lo: number, hi: number) =>
    Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : lo;
  return {
    seed: String(g.seed).slice(0, 64),
    count: Math.round(clamp(g.count, 40, 900)),
    size: clamp(g.size, 1, 4),
    hueA: clamp(g.hueA, 0, 360),
    hueB: clamp(g.hueB, 0, 360),
    sat: clamp(g.sat, 30, 95),
    light: clamp(g.light, 35, 85),
    cohesion: clamp(g.cohesion, 0, 1.5),
    separation: clamp(g.separation, 0, 2.5),
    alignment: clamp(g.alignment, 0, 2),
    maxSpeed: clamp(g.maxSpeed, 60, 320),
    steer: clamp(g.steer, 100, 800),
    flowAffinity: clamp(g.flowAffinity, 0, 1.6),
    skittish: clamp(g.skittish, 0, 1),
  };
}
