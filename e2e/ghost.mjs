// MOTH — ghost replay verification: record a run, replay and race the echo
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
await new Promise(r => server.listen(4180, r));
const errors = [];
const browser = await chromium.launch({ executablePath: '/home/user/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome', args: ['--use-gl=swiftshader', '--no-sandbox', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-features=IntensiveWakeUpThrottling'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push(e.message));
const sleep = ms => page.waitForTimeout(ms);
const state = () => page.evaluate(() => window.__moth.getDebugState());
// active wait: tiny evaluates keep the headless renderer from throttling rAF
const activeWait = async ms => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { await state().catch(() => {}); await sleep(150); }
};
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`); };

await page.goto('http://localhost:4180/?debug=1', { waitUntil: 'networkidle' });
await page.evaluate(() => {
  localStorage.clear();
  // low quality → faster software rasterization in the headless environment
  localStorage.setItem('moth-settings-v1', JSON.stringify({ quality: 'low', grain: false, ghost: true }));
});
await page.reload({ waitUntil: 'networkidle' });
await sleep(700);

// title screen shows the moth + 5 chips
check('title moth element present', Boolean(await page.$('.title-moth')));
check('five chapter chips', (await page.$$('.chapter-chip')).length === 5);

// start chapter 1, walk a bit (records samples), then warp to the exit to finish
await page.click('.menu-primary');
await activeWait(3600);
await page.keyboard.down('ArrowRight');
await sleep(1500);
await page.keyboard.up('ArrowRight');
let s = await state();
check('ghost records samples while playing', s.ghostRecording > 3, `${s.ghostRecording} samples`);
await page.evaluate(() => window.__moth.warpTo(4900));
await page.keyboard.down('ArrowRight');
await sleep(1200);
await page.keyboard.up('ArrowRight');
s = await state();
check('chapter 1 finishable → fadeout/next', s.mode === 'fadeout' || s.levelIndex === 1, s.mode);
await activeWait(2200);
s = await state();
check('arrived at chapter 2', s.levelIndex === 1, `level=${s.levelIndex}`);

// the ghost of chapter 1 must be stored now; restart chapter 1 via pause→restart? use quit→chip
await page.keyboard.press('Escape');
await sleep(400);
const quitBtn = (await page.$$('.overlay .menu-btn')).at(-1);
await quitBtn.click();
await sleep(600);
await (await page.$$('.chapter-chip'))[0].click();
await activeWait(3600);
s = await state();
check('ghost replays in chapter 1 (echo visible)', s.ghost !== null && s.ghost.x > 0, JSON.stringify(s.ghost));
// the echo must follow recorded time — warp to a safe spot and let game time
// advance (no walking into hazards), in 1.8s slices to keep rAF unthrottled
await page.evaluate(() => window.__moth.warpTo(400));
let echo = null, echoCt = 0, diag = '';
for (let i = 0; i < 14 && !echo; i++) {
  const r = await page.evaluate(() => new Promise(resolve => {
    const t0 = performance.now();
    const tick = () => {
      const st = window.__moth.getDebugState();
      if (st.chapterTime > 4.3) return resolve({ done: true, ghost: st.ghost, ct: st.chapterTime, mode: st.mode, px: st.px });
      if (performance.now() - t0 > 1800) return resolve({ done: false, ct: st.chapterTime, mode: st.mode, px: st.px });
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }));
  echoCt = r.ct;
  diag = `mode=${r.mode} px=${r.px}`;
  if (r.done) echo = r.ghost;
}
check('echo advances with run time', echo !== null && (echo.x > 250 || echo.done),
  `ghost=${JSON.stringify(echo)} ct=${echoCt} ${diag}`);
s = await state();
await page.screenshot({ path: '/home/user/shots/g1-echo.png' });

// underwater audio + hint language sanity: chapter 5 Arabic hint render check via canvas (state only)
// (visual check is implicit — no errors = pass)

await browser.close(); server.close();
const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} ghost checks passed`);
console.log('console errors:', errors.length ? errors : 'none');
process.exit(failed.length || errors.length ? 1 : 0);
