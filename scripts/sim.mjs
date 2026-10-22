// Fast headless round: joins, then steps the simulation quickly via window.__step and reports the outcome.
// node scripts/sim.mjs <outdir> <faction> <archetype> <tier> [maxSeconds] [mobile]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const [outDir, faction = 'rioter', archetype = 'instigator', tier = '0', maxS = '400', mobile = '0'] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const isMobile = mobile === '1';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: isMobile ? { width: 430, height: 932 } : { width: 1280, height: 720 }, hasTouch: isMobile, isMobile });
const page = await ctx.newPage(); const logs = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack}`));
await page.addInitScript(({ faction, archetype, tier }) => localStorage.setItem('riotgear.v1', JSON.stringify({ faction, archetype, weaponTier: +tier, balance: 1000 })), { faction, archetype, tier });
await page.goto('http://localhost:4173/', { waitUntil: 'load' });
await page.waitForTimeout(2500);
await page.screenshot({ path: `${outDir}/lobby.png` });
await page.click('#btn-join'); await page.waitForTimeout(800);
const sample = () => page.evaluate(() => { const g = window.__game; const d = g.director; return { t: +g.time.toFixed(1), money: +g.money.toFixed(3), payout: g.outcome.payout, mult: +g.outcome.multiplier.toFixed(2), dur: +d.o.durationSec.toFixed(0), bias: +d.bias.toFixed(2), prog: +d.progress.toFixed(2), front: +g.meanFront().toFixed(1), ending: d.ending?.kind, over: g.roundOver, reason: g.reason, hp: +g.player.hp.toFixed(0), ko: g.player.ko, z: +g.player.pos.z.toFixed(1), alive: { r: g.characters.filter((c) => c.faction === 'rioter' && c.alive).length, p: g.characters.filter((c) => c.faction === 'peacekeeper' && c.alive).length }, chars: g.characters.length, stats: g.stats, log: g.debugLog.slice(-2) }; });
let elapsed = 0;
while (elapsed < +maxS) {
  // hold W for 2s of sim, attack a few times, throw once in a while
  await page.keyboard.down('w'); await page.evaluate(() => window.__step(2)); await page.keyboard.up('w');
  await page.mouse.click(640, 400); await page.evaluate(() => window.__step(0.5)); await page.mouse.click(640, 400);
  if (elapsed % 10 === 0) { await page.mouse.move(640, 500); await page.mouse.down(); await page.mouse.move(640, 300, { steps: 4 }); await page.mouse.up(); }
  await page.evaluate(() => window.__step(2.5));
  elapsed += 5;
  const s = await sample(); logs.push(`[${elapsed}] ${JSON.stringify(s)}`);
  if (elapsed % 20 === 0) await page.screenshot({ path: `${outDir}/sim-${elapsed}.png` });
  if (s.over) break;
}
await page.waitForTimeout(3000);
await page.screenshot({ path: `${outDir}/result.png` });
console.log(logs.join('\n'));
await browser.close();
