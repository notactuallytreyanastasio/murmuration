import { genomeFromSeed, type Genome } from './genome';
import { mintSeed, rngFromSeed } from './prng';
import { Perlin3 } from './noise';
import { Sim, type Falcon } from './sim';
import { BG, Painter, draw } from './render';
import { connect } from './net';

const SEED_KEY = 'murmuration.seed';
// One shared sky: every visitor computes the identical flow field, so when
// flocks merge in phase 2 they are already riding the same currents.
const FIELD_SEED = 'the-sky-we-share';

const canvas = document.getElementById('sky') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const hudSeed = document.getElementById('hudSeed')!;
const copyBtn = document.getElementById('copyBtn') as HTMLButtonElement;
const newBtn = document.getElementById('newBtn') as HTMLButtonElement;
const hudPeers = document.getElementById('hudPeers')!;
const chatLog = document.getElementById('chatLog')!;
const chatForm = document.getElementById('chatForm') as HTMLFormElement;
const chatInput = document.getElementById('chatInput') as HTMLInputElement;

let w = innerWidth, h = innerHeight;
const dpr = Math.min(devicePixelRatio || 1, 2);

let seed = new URLSearchParams(location.search).get('seed')
  || localStorage.getItem(SEED_KEY)
  || mintSeed();

const noise = new Perlin3(rngFromSeed(FIELD_SEED));
let sim = new Sim(noise, w, h);
const painter = new Painter(dpr);

// p2p state: peer flocks in our sim, and peers' falcon cursors
let ownGenome = genomeFromSeed(seed);
const peerFlocks = new Map<string, Genome>();
const peerFalcons = new Map<string, { x: number; y: number; active: boolean; seen: number }>();
let roomCount = 0;

function setSeed(next: string): void {
  seed = next;
  localStorage.setItem(SEED_KEY, seed);
  history.replaceState(null, '', `?seed=${encodeURIComponent(seed)}`);
  hudSeed.textContent = seed;
}

function build(): void {
  sim = new Sim(noise, w, h);
  ownGenome = genomeFromSeed(seed);
  // separate spawn stream so the genome's random draws stay stable if
  // spawn logic ever changes
  sim.addFlock(ownGenome, rngFromSeed(seed + ':spawn'));
  for (const [id, g] of peerFlocks) sim.addFlock(g, rngFromSeed(id), true);
  painter.clear(); // a new flock starts a fresh painting
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, w, h);
}

// ---- presence + chat ----
let netStatus = 'finding the swarm…';
function updatePresence(): void {
  hudPeers.textContent =
    roomCount === 0 ? `alone in the sky · ${netStatus}`
    : roomCount === 1 ? '1 other aloft'
    : `${roomCount} others aloft`;
  chatInput.disabled = roomCount === 0;
  chatInput.placeholder = roomCount === 0
    ? 'no one else aloft yet…'
    : 'say something to the sky…';
}

function addChatLine(who: string, hue: number, sat: number, text: string): void {
  const div = document.createElement('div');
  div.className = 'msg';
  const whoSpan = document.createElement('span');
  whoSpan.className = 'who';
  whoSpan.style.color = `hsl(${hue.toFixed(0)}, ${Math.max(sat, 45).toFixed(0)}%, 72%)`;
  whoSpan.textContent = who;
  div.append(whoSpan, document.createTextNode(text));
  pushChat(div);
}

function addSystemLine(text: string): void {
  const div = document.createElement('div');
  div.className = 'msg system';
  div.textContent = text;
  pushChat(div);
}

function pushChat(el: HTMLElement): void {
  chatLog.append(el);
  while (chatLog.children.length > 60) chatLog.firstElementChild!.remove();
  chatLog.scrollTop = chatLog.scrollHeight;
}

const net = connect({
  onFlock: (id, g) => {
    const prev = peerFlocks.get(id);
    if (prev) {
      if (prev.seed === g.seed) return; // duplicate hello, already flying
      sim.removeFlock(prev);
    }
    peerFlocks.set(id, g);
    sim.addFlock(g, rngFromSeed(id), true);
    addSystemLine(`${g.seed} joined your sky`);
  },
  onLeave: (id) => {
    const g = peerFlocks.get(id);
    if (g) {
      sim.removeFlock(g);
      peerFlocks.delete(id);
      addSystemLine(`${g.seed} flew on`);
    }
    peerFalcons.delete(id);
  },
  onFalcon: (id, x, y, active) => {
    peerFalcons.set(id, { x, y, active, seen: performance.now() });
  },
  onChat: (id, text) => {
    const g = peerFlocks.get(id);
    if (g) addChatLine(g.seed, g.hueA, g.sat, text);
    else addChatLine('a stranger', 0, 0, text);
  },
  onCount: (n) => {
    roomCount = n;
    updatePresence();
  },
  onStatus: (s) => {
    netStatus = s;
    updatePresence();
  },
});
if (!net) {
  netStatus = 'p2p unavailable';
}

chatForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = chatInput.value.trim();
  if (!text || !net) return;
  net.sendChat(text);
  addChatLine(ownGenome.seed, ownGenome.hueA, ownGenome.sat, text);
  chatInput.value = '';
});

function resize(): void {
  w = innerWidth; h = innerHeight;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  sim.resize(w, h);
  painter.resize(w, h);
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
// on touch there's no hover: the falcon exists only while a finger is down,
// otherwise it would hang at the last touch point scattering birds forever
addEventListener('pointerup', (e) => {
  if (e.pointerType === 'touch') falcon.active = false;
});
addEventListener('pointercancel', () => { falcon.active = false; });
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
  net?.announce(ownGenome);
});

// ---- main loop, with a one-shot perf adaptation for low-end devices ----
let last = performance.now();
let t = 0;
let frames = 0, fpsClock = 0, adapted = false;
let lastFalconSend = 0, falconWasActive = false;
const activeFalcons: Falcon[] = [];

function loop(now: number): void {
  requestAnimationFrame(loop);
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.05) dt = 0.05; // tab was backgrounded; don't explode the sim

  t += dt;

  // share our falcon (normalized coords — peers have different windows),
  // throttled well below frame rate
  if (net && now - lastFalconSend > 90) {
    lastFalconSend = now;
    if (falcon.active) {
      net.sendFalcon(falcon.x / w, falcon.y / h, true);
      falconWasActive = true;
    } else if (falconWasActive) {
      net.sendFalcon(0, 0, false);
      falconWasActive = false;
    }
  }

  activeFalcons.length = 0;
  activeFalcons.push(falcon);
  for (const pf of peerFalcons.values()) {
    if (pf.active && now - pf.seen < 1600) {
      activeFalcons.push({ x: pf.x * w, y: pf.y * h, active: true });
    }
  }

  sim.step(dt, t, activeFalcons);
  painter.deposit(sim);
  draw(ctx, painter.canvas, sim, w, h);

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
updatePresence();
net?.announce(ownGenome);
requestAnimationFrame(loop);
