// Headless playtest: loads the app, screenshots the lobby, joins a round, drives the player, samples state.
// node scripts/play.mjs <outdir> [mobile=0] [seconds=20] [faction] [archetype] [tier]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const [outDir = 'shots', mobile = '0', seconds = '20', faction = '', archetype = '', tier = ''] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const isMobile = mobile === '1';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: isMobile ? { width: 430, height: 932 } : { width: 1280, height: 720 }, hasTouch: isMobile, isMobile, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const logs = [];
page.on('console', (m) => { if (m.type() !== 'log' || m.text().includes('error')) logs.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack}`));
await page.addInitScript(({ faction, archetype, tier }) => {
  if (faction) localStorage.setItem('riotgear.v1', JSON.stringify({ faction, archetype, weaponTier: +tier || 0, balance: 1000 }));
}, { faction, archetype, tier });
await page.goto('http://localhost:4173/', { waitUntil: 'load' });
await page.waitForTimeout(4000);
await page.screenshot({ path: `${outDir}/lobby.png` });
await page.click('#btn-join');
await page.waitForTimeout(1500);
await page.screenshot({ path: `${outDir}/round-0.png` });
const sample = async () => page.evaluate(() => { const g = window.__game; if (!g) return null; const d = g.director; return { t: +g.time.toFixed(1), money: +g.money.toFixed(3), payout: g.outcome?.payout, mult: g.outcome?.multiplier?.toFixed(2), dur: d?.o.durationSec.toFixed(0), bias: d?.bias.toFixed(2), prog: d?.progress.toFixed(2), front: g.front.z.toFixed(1), ending: d?.ending?.kind, over: g.roundOver, reason: g.reason, pl: g.player ? { hp: g.player.hp.toFixed(0), ko: g.player.ko, x: g.player.pos.x.toFixed(1), z: g.player.pos.z.toFixed(1), inv: g.player.inventory } : null, alive: { r: g.characters.filter(c => c.faction === 'rioter' && c.alive).length, p: g.characters.filter(c => c.faction === 'peacekeeper' && c.alive).length }, frames: window.__frames, stats: g.stats, log: g.debugLog.slice(-3) }; });
const total = +seconds; let t = 0;
while (t < total) {
  // drive forward with W, strike with clicks, occasionally throw with a drag
  await page.keyboard.down('w');
  await page.waitForTimeout(1500);
  await page.keyboard.up('w');
  await page.mouse.click(640, 400); await page.waitForTimeout(300); await page.mouse.click(640, 400);
  if (t % 6 === 0) { await page.mouse.move(640, 500); await page.mouse.down(); await page.mouse.move(640, 300, { steps: 5 }); await page.mouse.up(); }
  if (t % 9 === 0) { await page.keyboard.press('z'); }
  await page.waitForTimeout(700);
  t += 2.5;
  const s = await sample(); logs.push(`[t=${t}] ` + JSON.stringify(s));
  if (t % 5 < 2.5) await page.screenshot({ path: `${outDir}/round-${Math.round(t)}.png` });
  if (s?.over) break;
}
await page.waitForTimeout(3000);
await page.screenshot({ path: `${outDir}/end.png` });
console.log(logs.join('\n'));
await browser.close();
