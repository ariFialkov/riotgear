// Rooftop traversal test for a player looter: climb, run across connected roofs, leap, climb down.
import { chromium } from 'playwright';
const out = process.argv[2] || 'roof';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message, (e.stack || '').split('\n')[1]));
await page.addInitScript(() => localStorage.setItem('riotgear.v1', JSON.stringify({ faction: 'rioter', archetype: 'looter', weaponTier: 0, balance: 1000 })));
await page.goto('http://localhost:4173/', { waitUntil: 'load' }); await page.waitForTimeout(2500);
await page.click('#btn-join'); await page.waitForTimeout(500);
const st = () => page.evaluate(() => { const g = window.__game, p = g.player; return { x: +p.pos.x.toFixed(1), z: +p.pos.z.toFixed(1), y: +p.y.toFixed(2), roof: p.onRoof ? (p.onRoof.id ?? 'statue') : null, climbing: !!p.climbing, air: !!p.airborne, hp: +p.hp.toFixed(0), ko: p.ko }; });
// park the director so the round doesn't end during the test, and put the player at a street-facing wall
const setup = await page.evaluate(() => {
  const g = window.__game, W = g.world, p = g.player;
  g.outcome.payout = 1e9; g.director.o.payout = 1e9; g.playerThreat = -100;
  for (const b of W.buildings) {
    if (!b.front || b.h > 18) continue;
    const mid = b.facing === '+x' ? [b.x1 + 1.0, (b.z0 + b.z1) / 2] : b.facing === '-x' ? [b.x0 - 1.0, (b.z0 + b.z1) / 2] : b.facing === '+z' ? [(b.x0 + b.x1) / 2, b.z1 + 1.0] : [(b.x0 + b.x1) / 2, b.z0 - 1.0];
    if (W.blockedAt(mid[0], mid[1])) continue;
    p.pos.x = mid[0]; p.pos.z = mid[1]; p.y = 0;
    const tx = Math.max(b.x0, Math.min(b.x1, p.pos.x)), tz = Math.max(b.z0, Math.min(b.z1, p.pos.z));
    p.yaw = Math.atan2(tx - p.pos.x, tz - p.pos.z); g.followCam.snapTo(p);
    return { building: b.id, h: +b.h.toFixed(1), pitched: b.pitched, facing: b.facing };
  }
});
console.log('setup', JSON.stringify(setup), JSON.stringify(await st()));
// hold Z (climb) and push forward until on the roof
await page.keyboard.down('z'); await page.evaluate(() => window.__step(0.4));
await page.keyboard.down('w');
for (let i = 0; i < 12; i++) { await page.evaluate(() => window.__step(0.5)); const s = await st(); if (!s.climbing && s.y > 1) break; }
await page.keyboard.up('w'); await page.keyboard.up('z'); await page.evaluate(() => window.__step(0.3));
const top = await st(); console.log('after climb', JSON.stringify(top));
await page.screenshot({ path: `${out}-1-top.png` });
// run across the roofs for a while, logging which surfaces we stand on
const seen = new Set();
await page.evaluate(() => { const g = window.__game; g.followCam.yaw = g.player.yaw + Math.PI; });
await page.keyboard.down('Shift'); await page.keyboard.down('w');
let leaped = false;
for (let i = 0; i < 16; i++) {
  await page.evaluate(() => window.__step(0.25)); const s = await st(); if (s.roof !== null) seen.add(s.roof);
  // leap when we hit the edge of the roof
  const edge = await page.evaluate(() => { const g = window.__game, p = g.player, f = p.forward(); const sAhead = g.world.surfaceAt(p.pos.x + f.x * 1.5, p.pos.z + f.y * 1.5); return p.onRoof && sAhead < p.y - 1; });
  if (edge && !leaped) { leaped = true; await page.keyboard.press(' '); await page.evaluate(() => window.__step(0.15)); console.log('leap from', JSON.stringify(await st())); await page.screenshot({ path: `${out}-2-leap.png` }); }
  if (!s.roof && !s.air && s.y < 0.1) break;
}
await page.keyboard.up('w'); await page.keyboard.up('Shift');
await page.evaluate(() => window.__step(1.5));
const after = await st(); console.log('roofs crossed', [...seen].join(','), 'after run/leap', JSON.stringify(after));
await page.screenshot({ path: `${out}-3-after.png` });
// if still on a roof, walk to an edge and climb down with a Z hold
if (after.roof !== null) {
  const ex = await page.evaluate(() => { const g = window.__game, p = g.player; const e = g.world.roofExitNear(p.pos.x, p.pos.z, 30); if (!e) return null; p.pos.x = e.edgeX - (e.x - e.edgeX) * 0.6; p.pos.z = e.edgeZ - (e.z - e.edgeZ) * 0.6; return e; });
  await page.evaluate(() => window.__step(0.2));
  await page.keyboard.down('z'); await page.evaluate(() => window.__step(0.4)); await page.keyboard.down('s');
  for (let i = 0; i < 16; i++) { await page.evaluate(() => window.__step(0.5)); const s = await st(); if (!s.climbing && s.y < 0.1) break; }
  await page.keyboard.up('s'); await page.keyboard.up('z');
  console.log('after climb down', JSON.stringify(await st()));
}
await browser.close();
