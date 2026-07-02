import { genomeFromSeed } from './genome';
import { mintSeed, rngFromSeed } from './prng';
import { Perlin3 } from './noise';
import { Sim, type Falcon } from './sim';
import { BG, draw } from './render';

const SEED_KEY = 'murmuration.seed';
// One shared sky: every visitor computes the identical flow field, so when
// flocks merge in phase 2 they are already riding the same currents.
const FIELD_SEED = 'the-sky-we-share';

const canvas = document.getElementById('sky') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const hudSeed = document.getElementById('hudSeed')!;
const copyBtn = document.getElementById('copyBtn') as HTMLButtonElement;
const newBtn = document.getElementById('newBtn') as HTMLButtonElement;

let w = innerWidth, h = innerHeight;
const dpr = Math.min(devicePixelRatio || 1, 2);

let seed = new URLSearchParams(location.search).get('seed')
  || localStorage.getItem(SEED_KEY)
  || mintSeed();

const noise = new Perlin3(rngFromSeed(FIELD_SEED));
let sim = new Sim(noise, w, h);

function setSeed(next: string): void {
  seed = next;
  localStorage.setItem(SEED_KEY, seed);
  history.replaceState(null, '', `?seed=${encodeURIComponent(seed)}`);
  hudSeed.textContent = seed;
}

function build(): void {
  sim = new Sim(noise, w, h);
  // separate spawn stream so the genome's random draws stay stable if
  // spawn logic ever changes
  sim.addFlock(genomeFromSeed(seed), rngFromSeed(seed + ':spawn'));
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, w, h);
}

function resize(): void {
  w = innerWidth; h = innerHeight;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  sim.resize(w, h);
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, w, h);
}

const falcon: Falcon = { x: 0, y: 0, active: false };
addEventListener('pointermove', (e) => {
  falcon.x = e.clientX; falcon.y = e.clientY; falcon.active = true;
});
addEventListener('pointerdown', (e) => {
  falcon.x = e.clientX; falcon.y = e.clientY; falcon.active = true;
});
document.documentElement.addEventListener('mouseleave', () => { falcon.active = false; });
addEventListener('blur', () => { falcon.active = false; });

copyBtn.addEventListener('click', async () => {
  await navigator.clipboard.writeText(location.href);
  copyBtn.textContent = 'copied';
  setTimeout(() => { copyBtn.textContent = 'copy link'; }, 1200);
});
newBtn.addEventListener('click', () => {
  setSeed(mintSeed());
  build();
});

// ---- main loop, with a one-shot perf adaptation for low-end devices ----
let last = performance.now();
let t = 0;
let frames = 0, fpsClock = 0, adapted = false;

function loop(now: number): void {
  requestAnimationFrame(loop);
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.05) dt = 0.05; // tab was backgrounded; don't explode the sim

  t += dt;
  sim.step(dt, t, falcon);
  draw(ctx, sim, w, h);

  frames++; fpsClock += dt;
  if (!adapted && fpsClock > 4) {
    adapted = true;
    if (frames / fpsClock < 42) {
      sim.birds = sim.birds.filter((_, i) => i % 3 !== 2); // shed a third
    }
  }
}

addEventListener('resize', resize);
setSeed(seed);
resize();
build();
requestAnimationFrame(loop);
