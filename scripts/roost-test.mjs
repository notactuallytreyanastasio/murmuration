// Gossip lifecycle test: A meets B; B leaves (A adopts B's flock);
// C meets A (C must catch B's flock secondhand — 1 hop, via A).
// Dev server must be running.
import { chromium } from 'playwright';

const URL = 'http://localhost:5199/';
const browser = await chromium.launch();

async function mkPage(label, seed) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  page.logs = [];
  page.on('console', (m) => {
    const t = m.text();
    page.logs.push(t);
    if (t.includes('murmuration')) console.log(`[${label}]`, t.slice(0, 120));
  });
  await page.goto(`${URL}?seed=${seed}`);
  page.ctx = ctx;
  return page;
}

const until = async (fn, ms, why) => {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (await fn()) return true;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`timeout: ${why}`);
};

const sysLines = (p) => p.evaluate(() =>
  [...document.querySelectorAll('.msg.system')].map((e) => e.textContent));

console.log('— stage 1: A and B meet —');
const a = await mkPage('A', 'roost-alpha-1111');
const b = await mkPage('B', 'roost-beta-2222');
await until(async () =>
  (await sysLines(a)).some((t) => t.includes('roost-beta-2222 joined')), 60000, 'A sees B join');
console.log('✓ A sees B');

console.log('— stage 2: B leaves; A adopts —');
await b.ctx.close();
await until(async () =>
  (await sysLines(a)).some((t) => t.includes('flew on')), 30000, 'A sees B leave');
const roostA = await a.evaluate(() => JSON.parse(localStorage.getItem('murmuration.roost') || '[]'));
if (!roostA.some((r) => r.g.seed === 'roost-beta-2222')) throw new Error('B not in A roost');
console.log('✓ A roost holds:', roostA.map((r) => `${r.g.seed} (${r.hops} hops)`).join(', '));

console.log('— stage 3: C meets A, catches B secondhand —');
const c = await mkPage('C', 'roost-gamma-3333');
await until(async () =>
  (await sysLines(c)).some((t) => t.includes('caught wind of roost-beta-2222')), 90000, 'C catches B via gossip');
const roostC = await c.evaluate(() => JSON.parse(localStorage.getItem('murmuration.roost') || '[]'));
const relayed = roostC.find((r) => r.g.seed === 'roost-beta-2222');
console.log(`✓ C carries roost-beta-2222: ${relayed.hops} hop(s), via ${relayed.from}`);

await browser.close();
console.log('RESULT: GOSSIP LIFECYCLE OK');
