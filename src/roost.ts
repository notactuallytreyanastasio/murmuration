import { clampGenome, type Genome } from './genome';

// The roost: flocks you carry. When a visitor leaves, their genome
// perches here and a few of their birds keep flying in your sky. When
// you meet someone, you trade roosts — flocks spread visitor to visitor,
// hop by hop. This is the site's only long-term memory: it lives in
// localStorage and travels through people.

export interface RoostEntry {
  g: Genome;
  from: string;  // seed of the visitor who carried this flock to us
  hops: number;  // 0 = we flew with its creator ourselves
  seen: number;  // epoch ms when this flock was last encountered
}

const KEY = 'murmuration.roost';
export const ROOST_CAP = 12;

function clampHops(h: unknown): number {
  const n = Math.round(Number(h) || 0);
  return Math.min(9, Math.max(0, n));
}

export function loadRoost(): RoostEntry[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(KEY) || '[]');
    if (!Array.isArray(raw)) return [];
    return raw.slice(0, ROOST_CAP).flatMap((e) => {
      if (!e || typeof e !== 'object' || !(e as { g?: unknown }).g) return [];
      const r = e as { g: Genome; from?: unknown; hops?: unknown; seen?: unknown };
      return [{
        g: clampGenome(r.g),
        from: String(r.from ?? 'unknown').slice(0, 64),
        hops: clampHops(r.hops),
        seen: Number(r.seen) || 0,
      }];
    });
  } catch {
    return [];
  }
}

export function saveRoost(roost: RoostEntry[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(roost));
  } catch {
    // storage full or blocked — the roost just won't survive this visit
  }
}

// Merge a candidate flock into the roost. Returns true only if it's a
// new arrival (not a refresh of one we already carry).
export function adopt(roost: RoostEntry[], entry: RoostEntry, ownSeed: string): boolean {
  if (entry.g.seed === ownSeed) return false;
  const existing = roost.find((r) => r.g.seed === entry.g.seed);
  if (existing) {
    existing.seen = Math.max(existing.seen, entry.seen);
    if (entry.hops < existing.hops) {
      existing.hops = entry.hops;
      existing.from = entry.from;
    }
    return false;
  }
  roost.push(entry);
  // eviction: keep close lineage first (fewer hops), then the freshest
  roost.sort((a, b) => a.hops - b.hops || b.seen - a.seen);
  if (roost.length > ROOST_CAP) roost.length = ROOST_CAP;
  return roost.some((r) => r.g.seed === entry.g.seed);
}

export function releaseFromRoost(roost: RoostEntry[], seed: string): RoostEntry | null {
  const i = roost.findIndex((r) => r.g.seed === seed);
  if (i === -1) return null;
  return roost.splice(i, 1)[0];
}

export function agoLabel(seen: number): string {
  const s = Math.max(0, (Date.now() - seen) / 1000);
  if (s < 90) return 'just now';
  if (s < 5400) return `${Math.round(s / 60)}m ago`;
  if (s < 129600) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}
