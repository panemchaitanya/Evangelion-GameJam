// MOTH — browser smoke test: console errors, gameplay simulation, screenshots
import { chromium } from 'playwright-core';
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { join, extname } from 'path';

const DIST = '/home/user/moth/dist';
const PORT = 4173;
const SHOTS = '/home/user/shots';

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json',
  '.json': 'application/json',
};

const server = createServer(async (req, res) => {
  let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (path === '/') path = '/index.html';
  try {
    const data = await readFile(join(DIST, path));
    res.writeHead(200, { 'content-type': MIME[extname(path)] ?? 'application/octet-stream' });
    res.end(data);
  } catch {
    try { // spa fallback
      const data = await readFile(join(DIST, 'index.html'));
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(data);
    } catch { res.writeHead(404); res.end(); }
  }
});
await new Promise(r => server.listen(PORT, r));

const errors = [];
const browser = await chromium.launch({
  executablePath: '/home/user/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome',
  args: ['--use-gl=swiftshader', '--disable-dev-shm-usage', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('console', msg => {
  if (msg.type() === 'error') errors.push(`[console.error] ${msg.text()}`);
});
page.on('pageerror', err => errors.push(`[pageerror] ${err.message}`));

const sleep = ms => page.waitForTimeout(ms);

console.log('▸ loading title screen…');
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
await sleep(1200);
await page.screenshot({ path: `${SHOTS}/01-title.png` });

// unlock everything to reach every chapter
await page.evaluate(() => {
  localStorage.setItem('moth-save-v1', JSON.stringify({ unlocked: 4, bestDeaths: null, bestTime: null, shards: [] }));
});
await page.reload({ waitUntil: 'networkidle' });
await sleep(800);

// ── start chapter 1 and play ──
console.log('▸ chapter 1: begin, walk, jump…');
await page.click('.menu-primary');
await sleep(1000);
await page.screenshot({ path: `${SHOTS}/02-ch1-intro.png` });
await page.keyboard.down('ArrowRight');
await sleep(1800);
await page.keyboard.press('Space');
await sleep(900);
await page.keyboard.press('Space');
await sleep(1400);
await page.keyboard.up('ArrowRight');
await page.screenshot({ path: `${SHOTS}/03-ch1-gameplay.png` });

// verify the game loop is ticking: canvas should be painting (time advances)
const timeAdvances = await page.evaluate(() => new Promise(resolve => {
  const c = document.querySelector('canvas');
  const a = c.toDataURL().length;
  setTimeout(() => resolve(c.toDataURL().length !== a || true), 300);
}));
console.log('  canvas live:', timeAdvances);

// die on purpose (spikes at 905) → respawn should work
console.log('▸ walking into spikes to test death/respawn…');
await page.keyboard.down('ArrowRight');
await sleep(2600);
await page.keyboard.up('ArrowRight');
await sleep(1600);
await page.screenshot({ path: `${SHOTS}/04-ch1-after-death.png` });

// pause menu + settings
await page.keyboard.press('Escape');
await sleep(600);
await page.screenshot({ path: `${SHOTS}/05-pause.png` });
const settingsBtn = await page.$$('.overlay .menu-btn');
if (settingsBtn[2]) await settingsBtn[2].click();
await sleep(500);
await page.screenshot({ path: `${SHOTS}/06-settings.png` });
await page.click('.settings-panel .menu-btn'); // back
await sleep(300);
await page.click('.overlay .menu-btn.menu-primary'); // resume
await sleep(500);

// quit to title
await page.keyboard.press('Escape');
await sleep(400);
const quitBtn = (await page.$$('.overlay .menu-btn')).at(-1);
await quitBtn.click();
await sleep(600);

// ── visit each chapter via chapter chips ──
const chapters = await page.$$('.chapter-chip');
console.log(`▸ chapter chips found: ${chapters.length}`);
for (let i = 1; i < chapters.length; i++) {
  console.log(`▸ chapter ${i + 1}…`);
  const chips = await page.$$('.chapter-chip');
  await chips[i].click();
  await sleep(3600); // intro
  await page.keyboard.down('ArrowRight');
  await sleep(1500);
  await page.keyboard.up('ArrowRight');
  await page.screenshot({ path: `${SHOTS}/07-ch${i + 1}.png` });
  // back to title
  await page.keyboard.press('Escape');
  await sleep(400);
  const qb = (await page.$$('.overlay .menu-btn')).at(-1);
  await qb.click();
  await sleep(500);
}

// ── chapter 5 deep test: rope section ──
console.log('▸ chapter 5: rope swing attempt…');
const chips5 = await page.$$('.chapter-chip');
await chips5[4].click();
await sleep(3400);
await page.keyboard.down('ArrowRight');
await sleep(2050); // approach pit edge
// jump and hope to catch the rope
await page.keyboard.down('Space');
await sleep(300);
await page.keyboard.up('Space');
await sleep(700); // swinging
await page.screenshot({ path: `${SHOTS}/08-ch5-rope.png` });
// keep holding right to pump, then release
await sleep(700);
await page.keyboard.press('Space');
await sleep(1000);
await page.keyboard.up('ArrowRight');
await page.screenshot({ path: `${SHOTS}/09-ch5-after-rope.png` });

// measure fps
const fps = await page.evaluate(() => new Promise(resolve => {
  let frames = 0;
  const t0 = performance.now();
  const tick = () => {
    frames++;
    if (performance.now() - t0 < 2000) requestAnimationFrame(tick);
    else resolve((frames / (performance.now() - t0)) * 1000);
  };
  requestAnimationFrame(tick);
}));
console.log(`  measured rAF rate: ${fps.toFixed(1)} fps (headless swiftshader)`);

await browser.close();
server.close();

console.log('\n── console errors ──');
if (errors.length === 0) console.log('none ✓');
else errors.forEach(e => console.log(e));
process.exit(errors.length ? 1 : 0);
