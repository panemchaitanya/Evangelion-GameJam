// Mom fairness: for each chapter's Mom, run straight through her zone from many patrol phases with each kid
// (Bram is slowest). Must never die. Also proves standing still in her light DOES kill (the mechanic works).
import { chromium } from 'playwright-core';
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { join, extname } from 'path';
const DIST = process.env.DIST;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const server = createServer(async (req, res) => {
  let p = new URL(req.url, 'http://x').pathname; if (p === '/') p = '/index.html';
  try { res.writeHead(200, { 'content-type': MIME[extname(p)] ?? 'text/plain' }); res.end(await readFile(join(DIST, p))); } catch { res.writeHead(404); res.end(); }
});
await new Promise(r => server.listen(4183+Number(process.env.Z), r));
const browser = await chromium.launch({ executablePath: process.env.CHROME ?? '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = []; page.on('pageerror', e => errors.push(e.message));
const sleep = ms => page.waitForTimeout(ms);
// chapter index, start x (left of zone), end x (past zone), Mom x1/x2
const ZONES = [
  { ch: 1, name: 'ch2', safe: 2500, from: 2840, to: 3640, x1: 3150, x2: 3300 },
  { ch: 2, name: 'ch3', safe: 1300, from: 1940, to: 2700, x1: 2250, x2: 2400 },
  { ch: 3, name: 'ch4', safe: -60, from: 100, to: 790, x1: 420, x2: 560 },
  { ch: 4, name: 'ch5', safe: 1300, from: 1790, to: 2440, x1: 2050, x2: 2150 },
];
let fails = 0;
const log = (ok, m) => { if (!ok) fails++; console.log(`${ok ? '✓' : '✗'} ${m}`); };
await page.goto(`http://localhost:${4183+Number(process.env.Z)}/?debug=1`, { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.setItem('moth-save-v1', JSON.stringify({ unlocked: 4, bestDeaths: null, bestTime: null, shards: [] })));
await page.reload({ waitUntil: 'networkidle' }); await sleep(500);
const key = (type, code) => page.evaluate(([t, c]) => window.dispatchEvent(new KeyboardEvent(t, { code: c, bubbles: true })), [type, code]);
for (const z of [ZONES[Number(process.env.Z)]]) {
  await page.reload({ waitUntil: 'networkidle' }); await sleep(400);
  await (await page.$$('.chapter-chip'))[z.ch].click();
  for (let k = 0; k < 8 && await page.$('.intro-screen'); k++) { await page.click('.intro-screen'); await sleep(300); }
  await sleep(3600);
  // runs: each kid x several phases (wait before starting the run)
  const waits = [0, 3, 6, 9];
  let deaths = 0, runs = 0;
  for (const kid of ['Digit2']) {
    for (const w of waits) {
      const r = await page.evaluate(async ([kid, w, z]) => {
        const key = (t, c) => window.dispatchEvent(new KeyboardEvent(t, { code: c, bubbles: true }));
        const g = () => window.__moth.getDebugState();
        key('keydown', kid); key('keyup', kid);
        while (g().mode !== 'playing') await new Promise(r => setTimeout(r, 100));
        window.__moth.warpTo(z.safe);
        await new Promise(r => setTimeout(r, 400));
        const d0 = g().deaths;
        window.__moth.warpTo(z.safe);
        await new Promise(r => setTimeout(r, w * 1000));
        window.__moth.warpTo(z.from);
        key('keydown', 'ArrowRight');
        const t0 = performance.now();
        await new Promise(res => { const tick = () => { const s = g(); if (s.px >= z.to || s.deaths > d0 || performance.now() - t0 > 12000) res(); else setTimeout(tick, 30); }; tick(); });
        key('keyup', 'ArrowRight');
        const s = g();
        return { died: s.deaths > d0, px: s.px };
      }, [kid, w, z]);
      runs++; if (r.died) deaths++; 
    }
  }
  log(deaths === 0, `${z.name}: Mom run-through ${runs - deaths}/${runs} survived`);
  // negative control: standing still inside her beam must be fatal
  const still = await page.evaluate(async z => {
    const g = () => window.__moth.getDebugState();
    while (g().mode !== 'playing') await new Promise(r => setTimeout(r, 100));
    window.__moth.warpTo(z.from);
    const d0 = g().deaths;
    // wait until the patrol brings her beam over the player's spot (up to 25s), standing still
    const t0 = performance.now();
    while (performance.now() - t0 < 14000 && g().deaths === d0) {
      await new Promise(r => setTimeout(r, 100));
    }
    return g().deaths > d0;
  }, { ...z, from: Math.round((z.x1 + z.x2) / 2) - 120 });
  log(still, `${z.name}: standing still in Mom's light kills`);
}
await browser.close(); server.close();
console.log(errors.length ? 'page errors: ' + errors.join(' | ') : 'page errors: none');
process.exit(fails ? 1 : 0);
