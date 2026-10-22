import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.addInitScript(() => localStorage.setItem('riotgear.v1', JSON.stringify({ faction: 'peacekeeper', archetype: 'commander', weaponTier: 0, balance: 1000 })));
await page.goto('http://localhost:4173/', { waitUntil: 'load' }); await page.waitForTimeout(2500);
await page.click('#btn-join'); await page.waitForTimeout(500);
// walk forward 3s; the arrow must point the way the player moved
const r = await page.evaluate(async () => {
  const g = window.__game, p = g.player, mm = g.hud.minimap; const a0 = { x: p.pos.x, z: p.pos.z };
  return { a0 };
});
await page.keyboard.down('w'); await page.evaluate(() => window.__step(3)); await page.keyboard.up('w');
const out = await page.evaluate((r) => {
  const g = window.__game, p = g.player, mm = g.hud.minimap;
  const a = g.followCam.yaw + Math.PI;
  const [x, y] = mm.toPx(p.pos.x, p.pos.z); const [x0, y0] = mm.toPx(r.a0.x, r.a0.z);
  const move = [x - x0, y - y0], arrow = [Math.sin(a), Math.cos(a)];
  const dot = (move[0] * arrow[0] + move[1] * arrow[1]) / (Math.hypot(...move) || 1);
  return { movePx: move.map((v) => +v.toFixed(1)), arrow: arrow.map((v) => +v.toFixed(2)), alignment: +dot.toFixed(2) };
}, r);
console.log(JSON.stringify(out));
await browser.close();
