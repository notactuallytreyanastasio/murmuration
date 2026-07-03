import { genomeFromSeed, type Genome } from './genome';
import { mintSeed, rngFromSeed } from './prng';
import { Perlin3 } from './noise';
import { Sim, type Falcon } from './sim';
import { BG, Painter, draw, drawBirds } from './render';
import { connect, type RoostWire } from './net';
import { adopt, agoLabel, loadRoost, releaseFromRoost, saveRoost, type RoostEntry } from './roost';

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
const saveBtn = document.getElementById('saveBtn') as HTMLButtonElement;
const roostBtn = document.getElementById('roostBtn') as HTMLButtonElement;
const aboutBtn = document.getElementById('aboutBtn') as HTMLButtonElement;
const welcome = document.getElementById('welcome')!;
const welcomeBtn = document.getElementById('welcomeBtn') as HTMLButtonElement;
const roostPanel = document.getElementById('roostPanel')!;
const roostList = document.getElementById('roostList')!;
const chatLog = document.getElementById('chatLog')!;
const chatForm = document.getElementById('chatForm') as HTMLFormElement;
const chatInput = document.getElementById('chatInput') as HTMLInputElement;

let w = innerWidth, h = innerHeight;
const dpr = Math.min(devicePixelRatio || 1, 2);

const params = new URLSearchParams(location.search);
let seed = params.get('seed') || localStorage.getItem(SEED_KEY) || mintSeed();
if (params.get('bare')) document.body.classList.add('bare');

const noise = new Perlin3(rngFromSeed(FIELD_SEED));
let sim = new Sim(noise, w, h);
const painter = new Painter(dpr);

// p2p state: peer flocks in our sim, and peers' falcon cursors
let ownGenome = genomeFromSeed(seed);
const peerFlocks = new Map<string, Genome>();
const peerFalcons = new Map<string, { x: number; y: number; active: boolean; seen: number }>();
let roomCount = 0;

// the roost: flocks we carry from past encounters (see roost.ts)
const roost = loadRoost();
const echoFlying = new Map<string, Genome>(); // roost seeds currently in the sky
const MAX_ECHOES = 4;
const echoCount = (g: Genome) =>
  Math.min(110, Math.max(24, Math.round(g.count * 0.25)));

function setSeed(next: string): void {
  seed = next;
  localStorage.setItem(SEED_KEY, seed);
  history.replaceState(null, '', `?seed=${encodeURIComponent(seed)}`);
  hudSeed.textContent = seed;
}

// echo flocks: a few of the roost's flocks fly with you, smaller than life
function spawnEchoes(): void {
  for (const r of roost) {
    if (echoFlying.size >= MAX_ECHOES) break;
    if (echoFlying.has(r.g.seed)) continue;
    if ([...peerFlocks.values()].some((g) => g.seed === r.g.seed)) continue;
    sim.addFlock(r.g, rngFromSeed('echo:' + r.g.seed), { fromEdge: true, count: echoCount(r.g) });
    echoFlying.set(r.g.seed, r.g);
  }
}

function build(): void {
  sim = new Sim(noise, w, h);
  ownGenome = genomeFromSeed(seed);
  // separate spawn stream so the genome's random draws stay stable if
  // spawn logic ever changes
  sim.addFlock(ownGenome, rngFromSeed(seed + ':spawn'));
  for (const [id, g] of peerFlocks) sim.addFlock(g, rngFromSeed(id), { fromEdge: true });
  echoFlying.clear();
  spawnEchoes();
  painter.clear(); // a new flock starts a fresh painting
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, w, h);
}

// ---- roost panel ----
function updateRoostUI(): void {
  roostBtn.textContent = roost.length ? `roost (${roost.length})` : 'roost';
  roostList.textContent = '';
  if (!roost.length) {
    const empty = document.createElement('div');
    empty.className = 'roost-empty';
    empty.textContent = 'no adopted flocks yet — meet someone';
    roostList.append(empty);
    return;
  }
  for (const r of roost) {
    const row = document.createElement('div');
    row.className = 'roost-entry';
    const name = document.createElement('span');
    name.className = 'rname';
    name.style.color = `hsl(${r.g.hueA.toFixed(0)}, ${Math.max(r.g.sat, 45).toFixed(0)}%, 72%)`;
    name.textContent = r.g.seed;
    const meta = document.createElement('span');
    meta.className = 'rmeta';
    meta.textContent = r.hops === 0
      ? `flew with you · ${agoLabel(r.seen)}`
      : `via ${r.from} · ${r.hops} hop${r.hops > 1 ? 's' : ''} · ${agoLabel(r.seen)}`;
    const rx = document.createElement('button');
    rx.className = 'rx';
    rx.textContent = '×';
    rx.title = 'release this flock';
    rx.addEventListener('click', () => {
      const released = releaseFromRoost(roost, r.g.seed);
      if (released) {
        const flying = echoFlying.get(r.g.seed);
        if (flying) { sim.removeFlock(flying); echoFlying.delete(r.g.seed); }
        saveRoost(roost);
        spawnEchoes();
        updateRoostUI();
        addSystemLine(`released ${r.g.seed}`);
      }
    });
    row.append(name, meta, rx);
    roostList.append(row);
  }
}

// ---- first-visit explainer ----
const WELCOMED_KEY = 'murmuration.welcomed';
if (!localStorage.getItem(WELCOMED_KEY) && !params.get('bare')) {
  welcome.hidden = false;
}
welcomeBtn.addEventListener('click', () => {
  welcome.hidden = true;
  localStorage.setItem(WELCOMED_KEY, '1');
});
welcome.addEventListener('click', (e) => {
  if (e.target === welcome) {
    welcome.hidden = true;
    localStorage.setItem(WELCOMED_KEY, '1');
  }
});
aboutBtn.addEventListener('click', () => {
  welcome.hidden = false;
});

roostBtn.addEventListener('click', () => {
  roostPanel.hidden = !roostPanel.hidden;
  if (!roostPanel.hidden) updateRoostUI();
});

const wireRoost = (): RoostWire[] =>
  roost.map((r) => ({ g: r.g, hops: r.hops, seen: r.seen }));

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
    // if we were flying their echo from the roost, the real thing replaces it
    const echo = echoFlying.get(g.seed);
    if (echo) { sim.removeFlock(echo); echoFlying.delete(g.seed); }
    peerFlocks.set(id, g);
    sim.addFlock(g, rngFromSeed(id), { fromEdge: true });
    const known = roost.find((r) => r.g.seed === g.seed);
    if (known) { known.seen = Date.now(); saveRoost(roost); }
    addSystemLine(`${g.seed} joined your sky`);
  },
  onJoin: (id) => {
    if (roost.length) net?.sendRoost(wireRoost(), id);
  },
  onLeave: (id) => {
    const g = peerFlocks.get(id);
    if (g) {
      peerFlocks.delete(id);
      // adoption: a few of their birds stay with you, and their genome
      // perches in your roost to be carried onward
      adopt(roost, { g, from: g.seed, hops: 0, seen: Date.now() }, ownGenome.seed);
      saveRoost(roost);
      if (roost.some((r) => r.g.seed === g.seed) && echoFlying.size < MAX_ECHOES) {
        sim.thinFlock(g, echoCount(g));
        echoFlying.set(g.seed, g);
        addSystemLine(`${g.seed} flew on — some of their birds stayed with you`);
      } else {
        sim.removeFlock(g);
        addSystemLine(`${g.seed} flew on`);
      }
      updateRoostUI();
    }
    peerFalcons.delete(id);
  },
  onRoost: (id, entries) => {
    const carrier = peerFlocks.get(id)?.seed ?? 'a passing stranger';
    let newcomers = 0;
    for (const e of entries) {
      if ([...peerFlocks.values()].some((g) => g.seed === e.g.seed)) continue;
      const isNew = adopt(
        roost,
        { g: e.g, from: carrier, hops: e.hops + 1, seen: e.seen },
        ownGenome.seed,
      );
      if (isNew) {
        newcomers++;
        addSystemLine(`caught wind of ${e.g.seed} (via ${carrier})`);
      }
    }
    if (newcomers) {
      saveRoost(roost);
      spawnEchoes();
      updateRoostUI();
    }
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

saveBtn.addEventListener('click', () => {
  const out = document.createElement('canvas');
  out.width = Math.round(w * dpr);
  out.height = Math.round(h * dpr);
  const octx = out.getContext('2d')!;
  octx.fillStyle = BG;
  octx.fillRect(0, 0, out.width, out.height);
  octx.drawImage(painter.canvas, 0, 0);
  octx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawBirds(octx, sim);
  out.toBlob((blob) => {
    if (!blob) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `murmuration-${seed}.png`;
    a.click();
    URL.revokeObjectURL(a.href);
  });
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

// ?warp=N — pre-run N seconds of simulation instantly so the painting
// arrives already developed (used for OG-image capture, fun regardless)
const warpSecs = Math.min(Number(params.get('warp')) || 0, 240);
if (warpSecs > 0) {
  const step = 1 / 60;
  for (let i = 0; i < warpSecs * 60; i++) {
    t += step;
    sim.step(step, t, [falcon]);
    painter.deposit(sim);
  }
}

updatePresence();
updateRoostUI();
net?.announce(ownGenome);
requestAnimationFrame(loop);
