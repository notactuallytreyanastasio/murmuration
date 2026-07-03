import { chromium } from 'playwright';

const URL = 'http://localhost:5199/';
const browser = await chromium.launch({ headless: true });

async function mkPage(label, seed) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  page.logs = [];
  page.on('console', (m) => {
    const t = m.text();
    page.logs.push(t);
    if (t.includes('murmuration') || t.toLowerCase().includes('error')) {
      console.log(`[${label}]`, t.slice(0, 200));
    }
  });
  page.on('pageerror', (e) => console.log(`[${label} pageerror]`, e.message.slice(0, 200)));
  await page.goto(`${URL}?seed=${seed}`);
  return page;
}

const a = await mkPage('A', 'alpha-test-1111');
const b = await mkPage('B', 'beta-test-2222');

const deadline = Date.now() + 60000;
let joined = false;
while (Date.now() < deadline) {
  const aj = a.logs.some((t) => t.includes('peer joined'));
  const bj = b.logs.some((t) => t.includes('peer joined'));
  if (aj && bj) { joined = true; break; }
  await new Promise((r) => setTimeout(r, 1000));
}

for (const [label, p] of [['A', a], ['B', b]]) {
  const hud = await p.evaluate(() => document.getElementById('hudPeers')?.textContent);
  console.log(`[${label}] hud: ${hud}`);
}
console.log('RESULT:', joined ? 'PEERS CONNECTED' : 'NO CONNECTION AFTER 60s');
await browser.close();
process.exit(joined ? 0 : 1);
