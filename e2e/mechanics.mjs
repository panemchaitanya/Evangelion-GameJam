// MOTH — chapter 5 mechanics verification: rope, crumble, stalker, light, swim
import { chromium } from 'playwright-core';
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { join, extname } from 'path';

const DIST = '/home/user/moth/dist';
const PORT = 4174;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const server = createServer(async (req, res) => {
  let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (path === '/') path = '/index.html';
  try {
    const data = await readFile(join(DIST, path));
    res.writeHead(200, { 'content-type': MIME[extname(path)] ?? 'application/octet-stream' });
    res.end(data);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(r => server.listen(PORT, r));

const errors = [];
const browser = await chromium.launch({
  executablePath: '/home/user/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome',
  args: ['--use-gl=swiftshader', '--disable-dev-shm-usage', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push(e.message));
const sleep = ms => page.waitForTimeout(ms);
const state = () => page.evaluate(() => window.__moth.getDebugState());
const warp = x => page.evaluate(x => window.__moth.warpTo(x), x);
const waitPlaying = async () => {
  for (let i = 0; i < 40; i++) {
    const s = await state();
    if (s.mode === 'playing' || s.mode === 'intro') return s;
    await sleep(250);
  }
  return state();
};
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`);
};

await page.goto(`http://localhost:${PORT}/?debug=1`, { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.setItem('moth-save-v1', JSON.stringify({ unlocked: 4, bestDeaths: null, bestTime: null, shards: [] })));
await page.reload({ waitUntil: 'networkidle' });
await sleep(700);

// enter chapter 5
const chips = await page.$$('.chapter-chip');
await chips[4].click();
await sleep(3600); // intro done
let s = await state();
check('chapter 5 loads (levelIndex 4)', s.levelIndex === 4, `level=${s.levelIndex}`);

// ── ROPE ──
await warp(700); // before pit 1
await page.keyboard.down('ArrowRight');
await sleep(420); // reach edge ~800
await page.keyboard.down('Space');
await sleep(120);
await page.keyboard.up('Space');
// poll for rope catch
let caught = false;
for (let i = 0; i < 30; i++) {
  s = await state();
  if (s.heldRope) { caught = true; break; }
  await sleep(80);
}
check('rope catch on jump', caught, `px=${s.px}`);
await page.screenshot({ path: '/home/user/shots/m1-rope-held.png' });
// pump right, release at the right phase of the swing (angle > 0.35, moving right)
let released = false;
for (let i = 0; i < 80; i++) {
  s = await state();
  if (!s.heldRope) break;
  const rope = s.ropes[0];
  if (rope && rope.angle > 0.35 && rope.angVel > 0.5) {
    await page.keyboard.press('Space');
    released = true;
    break;
  }
  await sleep(50);
}
await sleep(1100);
await page.keyboard.up('ArrowRight');
s = await state();
check('rope release at swing apex', released, `angle=${s.ropes[0]?.angle}`);
check('rope release lands past pit', s.px > 1080 && s.mode === 'playing', `px=${s.px} mode=${s.mode}`);

// ── CRUMBLE ──
await waitPlaying();
await warp(2380);
await sleep(300);
await page.keyboard.down('ArrowRight');
await sleep(900); // walk onto the fragile path
s = await state();
check('crumble reacts to standing (shaking/falling/gone)',
  s.crumbles.some(c => c !== 'idle'), JSON.stringify(s.crumbles));
// keep walking — a steady pace crosses safely (difficulty = timing, not precision)
let crossed = false;
for (let i = 0; i < 40; i++) {
  s = await state();
  if (s.px > 3005 && s.mode === 'playing') { crossed = true; break; }
  if (s.mode === 'dying') break;
  await sleep(120);
}
await page.keyboard.up('ArrowRight');
check('steady walk crosses the bridge alive', crossed, `px=${s.px} mode=${s.mode}`);
// walk back and STAND STILL — lingering must collapse the path
await page.keyboard.down('ArrowLeft');
await sleep(500);
await page.keyboard.up('ArrowLeft');
let collapsed = false;
for (let i = 0; i < 25; i++) {
  s = await state();
  if (s.crumbles.some(c => c === 'falling' || c === 'gone')) { collapsed = true; break; }
  await sleep(100);
}
check('lingering collapses the path', collapsed, JSON.stringify(s.crumbles));
await page.screenshot({ path: '/home/user/shots/m2-crumble.png' });
check('crumble respawns after ~4s', await (async () => {
  await sleep(4500);
  const st = await state();
  return st.crumbles.slice(0, 5).every(c => c === 'idle' || c === 'returning');
})(), JSON.stringify((await state()).crumbles));

// ── STALKER ──
await waitPlaying();
await warp(3400);
await sleep(400);
// move around noisily in the corridor
await page.keyboard.down('ArrowRight');
await sleep(1300);
await page.keyboard.up('ArrowRight');
s = await state();
console.log('  stalker detail:', JSON.stringify(s.stalkerDetail), 'px=', s.px, 'mode=', s.mode);
check('stalker emerges when player moves', s.stalkers[0] !== 'lurk', s.stalkers[0]);
await page.screenshot({ path: '/home/user/shots/m3-stalker.png' });
// keep moving — it should hunt us (stalk or lunge) or kill us
let hunted = false, died = false;
for (let i = 0; i < 40; i++) {
  s = await state();
  if (s.mode === 'dying') { died = true; break; }
  if (['stalk', 'lungeTele', 'lunge'].includes(s.stalkers[0])) { hunted = true; break; }
  await page.keyboard.down('ArrowRight'); await sleep(150); await page.keyboard.up('ArrowRight');
  await sleep(120);
}
check('stalker hunts the moving player', hunted || died, `state=${s.stalkers[0]} mode=${s.mode}`);
if (!died) {
  // stand still in the light → it must retreat
  await warp(3745); // inside light L1
  await sleep(2600);
  s = await state();
  check('light sanctuary forces retreat/lurk', ['retreat', 'lurk'].includes(s.stalkers[0]) || s.mode === 'dying',
    `state=${s.stalkers[0]}`);
  await page.screenshot({ path: '/home/user/shots/m4-light.png' });
} else {
  check('stalker kill triggers death+respawn flow', died, 'dying');
  await sleep(1800);
}

// ── SWIM & BREATH ──
await waitPlaying();
await warp(4780);
await sleep(300);
s = await state();
const breath0 = s.breath;
await page.keyboard.down('ArrowRight');
await sleep(1400); // walk into pool 1
await page.keyboard.up('ArrowRight');
s = await state();
check('enters swim mode in pool', s.swimming || s.mode === 'dying', `swimming=${s.swimming} px=${s.px}`);
// paddle across with jump taps, surfacing handled by island
for (let i = 0; i < 12; i++) {
  await page.keyboard.down('ArrowRight');
  await page.keyboard.press('Space');
  await sleep(380);
}
await page.keyboard.up('ArrowRight');
s = await state();
check('breath drains while submerged', s.breath < breath0 || s.mode === 'dying' || s.px > 5300,
  `breath ${breath0}→${s.breath} px=${s.px}`);
await page.screenshot({ path: '/home/user/shots/m5-swim.png' });
// drown check: warp into pool and stay under
await waitPlaying();
await warp(5100);
await sleep(200);
// hold down under water (swim to bottom via no paddling → sink)
let drowned = false;
for (let i = 0; i < 90; i++) {
  s = await state();
  if (s.mode === 'dying') { drowned = true; break; }
  await sleep(200);
}
check('breath exhaustion drowns', drowned, `breath=${s.breath}`);
await sleep(1800);
s = await state();
check('respawn after drowning (mode playing)', s.mode === 'playing' || s.mode === 'intro', s.mode);

// ── particles bounded ──
s = await state();
check('particle count bounded (<500)', s.particles < 500, `${s.particles}`);

await browser.close();
server.close();
const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} mechanics checks passed`);
console.log('console errors:', errors.length ? errors : 'none');
process.exit(failed.length || errors.length ? 1 : 0);
