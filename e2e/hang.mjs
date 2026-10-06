// Reproduce the "browser freezes when starting a chapter" report.
// Emulates a phone, clicks chapter 1 chip, watchdogs the main thread,
// and if it blocks, captures a V8 CPU profile to find the hot function.
import { chromium } from 'playwright-core';

const URL = process.argv[2] ?? 'https://moth-game-five.vercel.app';
const browser = await chromium.launch({
  executablePath: '/home/user/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome',
  args: ['--use-gl=swiftshader', '--no-sandbox'],
});
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
});
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
await cdp.send('Profiler.enable');
await cdp.send('Profiler.start');

const sleep = ms => new Promise(r => setTimeout(r, ms));
let blocked = false;
const watchdog = (async () => {
  for (let i = 0; i < 24; i++) {           // 24 × 500ms = 12s of watchdogging
    try {
      await Promise.race([
        page.evaluate(() => performance.now()),
        sleep(2000).then(() => { throw new Error('MAIN_THREAD_BLOCKED'); }),
      ]);
    } catch (e) {
      if (String(e.message).includes('BLOCKED')) {
        blocked = true;
        console.log(`⚠ main thread blocked at watchdog tick ${i} (~${i * 0.5}s after click)`);
        return;
      }
    }
    await sleep(500);
  }
})();

await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForSelector('.chapter-chip', { timeout: 15000 });
console.log('menu loaded, clicking chapter 1 chip…');
const t0 = Date.now();
await page.tap('.chapter-chip');
// wait for either the watchdog to declare blockage, or 12s of healthy frames
await watchdog;
const { profile } = await cdp.send('Profiler.stop');

if (!blocked) {
  const st = await page.evaluate(() => window.__moth ? window.__moth.getDebugState() : 'no-debug').catch(() => 'eval-failed');
  console.log('✓ no freeze detected after 12s; state:', JSON.stringify(st));
} else {
  // analyze profile: aggregate self-time per function
  const nodes = new Map(profile.nodes.map(n => [n.id, n]));
  const hits = new Map();
  for (const s of profile.samples ?? []) {
    const n = nodes.get(s);
    if (!n) continue;
    const key = `${n.callFrame.functionName || '(anon)'} @ ${(n.callFrame.url || '').split('/').pop()}:${n.callFrame.lineNumber}`;
    hits.set(key, (hits.get(key) ?? 0) + 1);
  }
  const top = [...hits.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
  console.log('\n── hottest functions during the freeze ──');
  for (const [k, v] of top) console.log(String(v).padStart(5), k);
}
console.log(`elapsed: ${((Date.now() - t0) / 1000).toFixed(1)}s`);
await browser.close();
process.exit(blocked ? 2 : 0);
