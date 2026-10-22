import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.addInitScript(() => localStorage.setItem('riotgear.v1', JSON.stringify({ faction: 'rioter', archetype: 'looter', weaponTier: 0, balance: 1000 })));
await page.goto('http://localhost:4173/', { waitUntil: 'load' }); await page.waitForTimeout(2500);
await page.click('#btn-join'); await page.waitForTimeout(500);
const r = await page.evaluate(() => {
  const g = window.__game, W = g.world, p = g.player; g.outcome.payout = 1e9; g.director.o.payout = 1e9;
  const b = W.buildings[4];
  p.pos.x = (b.x0 + b.x1) / 2; p.pos.z = (b.z0 + b.z1) / 2; p.y = 30; p.vy = 0; p.yaw = 0.6;
  window.__step(2); g.followCam.snapTo(p); window.__step(0.5);
  return { b: { id: b.id, h: b.h, pitched: b.pitched, rise: b.rise, x0: b.x0, x1: b.x1, z0: b.z0, z1: b.z1, front: b.front }, y: p.y, ground: W.groundUnder(p.pos.x, p.pos.z), roof: p.onRoof?.id };
});
console.log(JSON.stringify(r));
await page.screenshot({ path: process.argv[2] });
await browser.close();
