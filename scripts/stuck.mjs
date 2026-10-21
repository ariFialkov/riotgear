import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.addInitScript(() => localStorage.setItem('riotgear.v1', JSON.stringify({ faction: 'rioter', archetype: 'looter', weaponTier: 0, balance: 1000 })));
await page.goto('http://localhost:4173/', { waitUntil: 'load' }); await page.waitForTimeout(2000);
await page.click('#btn-join'); await page.waitForTimeout(500);
for (let i = 0; i < 8; i++) {
  await page.keyboard.down('w'); await page.evaluate(() => window.__step(2)); await page.keyboard.up('w');
  const s = await page.evaluate(() => { const g = window.__game, p = g.player, w = g.world; const cells = []; for (let dz = -2; dz <= 2; dz++) { let row = ''; for (let dx = -3; dx <= 3; dx++) row += w.blockedAt(p.pos.x + dx, p.pos.z + dz) ? '#' : '.'; cells.push(row); } const np = w.nearestProp(p.pos.x, p.pos.z, 3); return { x: +p.pos.x.toFixed(2), z: +p.pos.z.toFixed(2), yaw: +p.yaw.toFixed(2), camYaw: +g.followCam.yaw.toFixed(2), moving: p.moving, sp: p.moveSpeed, stun: p.stun, ko: p.ko, climbing: !!p.climbing, roof: !!p.onRoof, cells, near: np && [np.type, +np.x.toFixed(1), +np.z.toFixed(1)], avenue: w.avenueCenterAt(p.pos.z) }; });
  console.log(JSON.stringify(s));
}
await browser.close();
