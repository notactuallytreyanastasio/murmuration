// Deterministic randomness: seed string -> hash -> sfc32 stream.
// Same seed must produce the same flock on every machine, forever.

export function cyrb128(str: string): [number, number, number, number] {
  let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
  for (let i = 0, k; i < str.length; i++) {
    k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  return [(h1 ^ h2 ^ h3 ^ h4) >>> 0, (h2 ^ h1) >>> 0, (h3 ^ h1) >>> 0, (h4 ^ h1) >>> 0];
}

export function sfc32(a: number, b: number, c: number, d: number): () => number {
  return () => {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}

export function rngFromSeed(seed: string): () => number {
  const [a, b, c, d] = cyrb128(seed);
  return sfc32(a, b, c, d);
}

const ADJ = [
  'amber', 'ashen', 'blue', 'brave', 'briar', 'cedar', 'cinder', 'coral',
  'dawn', 'dusk', 'ember', 'fern', 'gale', 'gilt', 'hazel', 'hollow',
  'iron', 'ivory', 'juniper', 'keen', 'larch', 'lunar', 'moss', 'north',
  'ochre', 'pale', 'quiet', 'rain', 'rowan', 'salt', 'slate', 'solar',
  'thorn', 'tidal', 'umber', 'vesper', 'wild', 'winter', 'wren', 'yarrow',
];
const NOUN = [
  'sky', 'reed', 'cliff', 'estuary', 'field', 'grove', 'harbor', 'heath',
  'hill', 'lark', 'marsh', 'meadow', 'moor', 'pine', 'pond', 'ridge',
  'river', 'roost', 'shore', 'spire', 'starling', 'steppe', 'stone', 'storm',
  'strand', 'thicket', 'tor', 'vale', 'wave', 'wind',
];

// Minting uses Math.random on purpose: it only happens once per visitor,
// and everything downstream of the seed is deterministic.
export function mintSeed(): string {
  const pick = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)];
  return `${pick(ADJ)}-${pick(NOUN)}-${1000 + Math.floor(Math.random() * 9000)}`;
}
