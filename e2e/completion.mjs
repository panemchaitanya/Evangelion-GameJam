// MOTH — chapter 5 full-completion run, driven inside the page (frame-accurate)
import { chromium } from 'playwright-core';
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { join, extname } from 'path';
const DIST = '/home/user/moth/dist';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const server = createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p === '/') p = '/index.html';
  try { res.writeHead(200, { 'content-type': MIME[extname(p)] ?? 'text/plain' }); res.end(await readFile(join(DIST, p))); }
  catch { res.writeHead(404); res.end(); }
});
await new Promise(r => server.listen(4176, r));
const errors = [];
const browser = await chromium.launch({ executablePath: '/home/user/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome', args: ['--use-gl=swiftshader', '--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push(e.message));
const sleep = ms => page.waitForTimeout(ms);
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`); };

await page.goto('http://localhost:4176/?debug=1', { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.setItem('moth-save-v1', JSON.stringify({ unlocked: 4, bestDeaths: null, bestTime: null, shards: [] })));
await page.reload({ waitUntil: 'networkidle' });
await sleep(700);
await (await page.$$('.chapter-chip'))[4].click();
await sleep(3800);

// install the in-page driver once
await page.evaluate(() => {
  window.__drive = (steps, timeoutMs = 25000) => new Promise(resolve => {
    const key = (type, code) => window.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true }));
    const g = () => window.__moth.getDebugState();
    const tap = (code, ms = 90) => { key('keydown', code); setTimeout(() => key('keyup', code), ms); };
    let i = 0, lastPaddle = 0, lastDodge = 0;
    const t0 = performance.now();
    let stepT = 0;
    const tick = () => {
      const s = g();
      const t = performance.now() - t0;
      if (s.mode === 'dying') return resolve({ ok: false, why: 'died', s });
      if (t > timeoutMs) return resolve({ ok: false, why: 'timeout', s });
      const step = steps[i];
      if (!step) return resolve({ ok: true, s });
      let done = false;
      switch (step.do) {
        case 'warp': window.__moth.warpTo(step.x); done = true; break;
        case 'hold': key('keydown', step.key); done = true; break;
        case 'letgo': key('keyup', step.key); done = true; break;
        case 'wait': done = t - stepT > step.ms; break;
        case 'jump': tap('Space', step.ms ?? 110); done = true; break;
        case 'untilRope': done = s.heldRope; break;
        case 'untilGrounded': done = s.grounded && !s.heldRope; break;
        case 'untilPx': done = step.gt ? s.px > step.x : s.px < step.x; break;
        case 'untilGate': done = (s.gates?.[0] ?? 0) > 0.95; break;
        case 'untilMode': done = s.mode === step.mode || (step.mode === 'ending' && (s.mode === 'fadeout' || s.mode === 'finished')); break;
        case 'swingRelease': {
          const r = s.ropes[step.idx];
          if (!s.heldRope) done = true;
          else if (r && r.angle > (step.angle ?? 0.35) && r.angVel > 0.4) { tap('Space', 70); done = true; }
          break;
        }
        case 'paddleAcross': {
          if (t - lastPaddle > 320) { lastPaddle = t; tap('Space', 50); }
          done = s.px > step.x;
          break;
        }
        case 'stalkerRun': {
          // sprint right; jump over lunges; stand on the plate until the latching gate rises
          const st = s.stalkers[0];
          const stX = s.stalkerDetail?.[0]?.x ?? 1e9;
          const dist = Math.abs(s.px + 10 - stX);
          const gateOpen = (s.gates?.[0] ?? 0) > 0.95;
          if ((st === 'lungeTele' || st === 'lunge') && dist < 240 && s.grounded && t - lastDodge > 500) {
            lastDodge = t; tap('Space', 320); // long jump over the lunge
          }
          if (!gateOpen && s.px >= 4550 && s.px <= 4635) key('keyup', 'ArrowRight'); // stand on plate
          else if (gateOpen || s.px < 4550) key('keydown', 'ArrowRight');
          done = s.px > 4710;
          break;
        }
      }
      if (done) { i++; stepT = t; }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
});

const seg = async (name, steps, okWhen) => {
  const r = await page.evaluate(({ steps, okWhen }) => {
    const pred = new Function('s', `return ${okWhen}`);
    return window.__drive(steps).then(res => ({ ...res, pass: res.ok && pred(res.s) }));
  }, { steps, okWhen });
  check(name, r.pass, `px=${r.s.px} mode=${r.s.mode}${r.why ? ' ' + r.why : ''}`);
  return r;
};

// ── SEG A+B: both rope pits in one run ──
await seg('seg A: rope 1 crossed', [
  { do: 'warp', x: 700 }, { do: 'wait', ms: 250 },
  { do: 'hold', key: 'ArrowRight' }, { do: 'wait', ms: 420 }, { do: 'jump', ms: 300 },
  { do: 'untilRope' }, { do: 'swingRelease', idx: 0 },
  { do: 'untilPx', x: 1080, gt: true }, { do: 'letgo', key: 'ArrowRight' },
], 's.px >= 1080');

await seg('seg B: rope 2 crossed', [
  { do: 'warp', x: 1380 }, { do: 'wait', ms: 250 },
  { do: 'hold', key: 'ArrowRight' }, { do: 'wait', ms: 430 }, { do: 'jump', ms: 300 },
  { do: 'untilRope' }, { do: 'swingRelease', idx: 1 },
  { do: 'untilPx', x: 1780, gt: true }, { do: 'letgo', key: 'ArrowRight' },
], 's.px >= 1780');

// ── SEG C: crumble bridge ──
await seg('seg C: bridge crossed', [
  { do: 'warp', x: 2380 }, { do: 'wait', ms: 250 },
  { do: 'hold', key: 'ArrowRight' }, { do: 'untilPx', x: 3010, gt: true }, { do: 'letgo', key: 'ArrowRight' },
], 's.px > 3010');

// ── SEG D: stalker corridor + latching gate ──
await seg('seg D: escaped through the gate', [
  { do: 'warp', x: 3300 }, { do: 'wait', ms: 300 },
  { do: 'hold', key: 'ArrowRight' }, { do: 'stalkerRun' }, { do: 'letgo', key: 'ArrowRight' },
], 's.px > 4710');

// ── SEG E: swim both pools ──
await seg('seg E: swam both pools', [
  { do: 'warp', x: 4780 }, { do: 'wait', ms: 250 },
  { do: 'hold', key: 'ArrowRight' }, { do: 'paddleAcross', x: 5670 }, { do: 'letgo', key: 'ArrowRight' },
], 's.px > 5670');

// ── SEG F: finale ropes over collapsing ledges ──
await seg('seg F1: rope 3 to ledges', [
  { do: 'warp', x: 6030 }, { do: 'wait', ms: 250 },
  { do: 'hold', key: 'ArrowRight' }, { do: 'wait', ms: 250 }, { do: 'jump', ms: 300 },
  { do: 'untilRope' }, { do: 'swingRelease', idx: 2 },
  { do: 'untilPx', x: 6185, gt: true },
], 's.px >= 6185');

await seg('seg F2: ledge + rope 4 to the ascension', [
  { do: 'untilGrounded' }, { do: 'wait', ms: 150 }, { do: 'jump', ms: 300 }, // sprint, leap for rope 4
  { do: 'untilRope' }, { do: 'swingRelease', idx: 3 },
  { do: 'untilPx', x: 6615, gt: true }, { do: 'letgo', key: 'ArrowRight' },
], 's.px >= 6615');

// ── SEG G: reach the exit ──
await seg('seg G: reached the exit light', [
  { do: 'hold', key: 'ArrowRight' }, { do: 'untilMode', mode: 'ending' }, { do: 'letgo', key: 'ArrowRight' },
], 's.mode === "fadeout" || s.mode === "finished" || s.px > 6740');

// ending flow: end cards -> ward reveal -> ending screen
await sleep(2500);
let cardsSeen = 0;
while (await page.$('.intro-screen')) { cardsSeen++; await page.click('.intro-screen'); await sleep(450); if (cardsSeen > 12) break; }
check('end cards play (3)', cardsSeen === 3, `saw ${cardsSeen}`);
check('ward reveal screen', Boolean(await page.$('.ward-screen')));
check('ward: three sleepers, one counted star', (await page.$$('.ward-kid')).length === 3 && (await page.$$('.ward-star.counted')).length === 1);
await sleep(7500);
await page.screenshot({ path: '/tmp/e2e/ward.png' });
await page.click('.ward-screen'); await sleep(900);
check('ending screen after final chapter', Boolean(await page.$('.ending-screen')));
check('ending reads they never left', (await page.textContent('.ending-title')) === 'they never left');
check('restart button reads dream again', (await page.textContent('.ending-inner .menu-btn')) === 'dream again');
await page.screenshot({ path: '/tmp/e2e/ending.png' });

await browser.close(); server.close();
const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} completion checks passed`);
console.log('console errors:', errors.length ? errors : 'none');
process.exit(failed.length || errors.length ? 1 : 0);
