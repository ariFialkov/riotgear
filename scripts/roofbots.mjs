import { chromium } from 'playwright';
const out = process.argv[2];
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message, (e.stack || '').split('\n')[1]));
await page.addInitScript(() => localStorage.setItem('riotgear.v1', JSON.stringify({ faction: 'peacekeeper', archetype: 'grenadier', weaponTier: 0, balance: 1000 })));
await page.goto('http://localhost:4173/', { waitUntil: 'load' }); await page.waitForTimeout(2500);
await page.click('#btn-join'); await page.waitForTimeout(500);
await page.evaluate(() => { const g = window.__game; g.outcome.payout = 1e9; g.director.o.payout = 1e9; });
let shot = false;
for (let t = 0; t <= 150; t += 10) {
  const s = await page.evaluate(() => {
    const g = window.__game; const R = g.characters.filter((c) => c.faction === 'rioter' && !c.removed);
    const looters = R.filter((c) => c.arch.id === 'looter');
    const up = R.filter((c) => c.alive && c.onRoof); const climbing = R.filter((c) => c.climbing);
    const fell = R.filter((c) => c.y > 0.5 && c.ko).length;
    return { t: +g.time.toFixed(0), looters: looters.length, onRoofs: up.length, climbing: climbing.length, banners: g.world.banners, koUp: fell, rocksUp: up.reduce((a, c) => a + (c.inventory.rock || 0), 0), first: up[0] ? { x: up[0].pos.x, y: up[0].y, z: up[0].pos.z, yaw: up[0].yaw } : null };
  });
  console.log(JSON.stringify({ ...s, first: s.first ? 'yes' : null }));
  if (s.first && !shot && s.t >= 40) {
    shot = true;
    await page.evaluate((f) => { const g = window.__game, cam = g.camera; g.followCam.update = () => {}; cam.position.set(f.x - Math.sin(f.yaw) * 7 + 3, f.y + 5, f.z - Math.cos(f.yaw) * 7); cam.lookAt(f.x, f.y + 1, f.z); }, s.first);
    await page.screenshot({ path: `${out}-bot.png` });
    await page.evaluate(() => { const g = window.__game; delete g.followCam.update; });
  }
  await page.evaluate(() => window.__step(10));
}
await browser.close();
