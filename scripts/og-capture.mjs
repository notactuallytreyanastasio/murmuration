// Capture og.png: a real painting grown by the actual sim.
// Usage: node scripts/og-capture.mjs <seed> [outfile] (dev server must be running)
import { chromium } from 'playwright';

const seed = process.argv[2] ?? 'vesper-starling-4821';
const out = process.argv[3] ?? 'public/og.png';

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1200, height: 630 },
  deviceScaleFactor: 1,
});
const page = await ctx.newPage();
await page.goto(`http://localhost:5199/?seed=${seed}&warp=90&bare=1`, { timeout: 90000 });
await page.waitForTimeout(2500); // a couple of live frames on top of the warp
await page.screenshot({ path: out });
await browser.close();
console.log(`captured ${out} (seed: ${seed})`);
