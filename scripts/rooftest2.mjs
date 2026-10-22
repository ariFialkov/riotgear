// Steered rooftop run along a planned route + a targeted street-gap leap.
import { chromium } from 'playwright';
const out = process.argv[2] || 'roof2';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message, (e.stack || '').split('\n')[1]));
await page.addInitScript(() => localStorage.setItem('riotgear.v1', JSON.stringify({ faction: 'rioter', archetype: 'looter', weaponTier: 0, balance: 1000 })));
await page.goto('http://localhost:4173/', { waitUntil: 'load' }); await page.waitForTimeout(2500);
await page.click('#btn-join'); await page.waitForTimeout(500);
await page.evaluate(() => { const g = window.__game; g.outcome.payout = 1e9; g.director.o.payout = 1e9; g.playerThreat = -100; });
const st = () => page.evaluate(() => { const p = window.__game.player; return { x: +p.pos.x.toFixed(1), z: +p.pos.z.toFixed(1), y: +p.y.toFixed(2), roof: p.onRoof ? (p.onRoof.id ?? 'statue') : null, air: !!p.airborne, hp: +p.hp.toFixed(0) }; });

// 1) steered run across connected roofs of a block
const plan = await page.evaluate(() => {
  const g = window.__game, W = g.world, p = g.player;
  const b = W.buildings.find((q) => q.front && !q.pitched && q.h < 18);
  p.pos.x = (b.x0 + b.x1) / 2; p.pos.z = (b.z0 + b.z1) / 2; p.y = b.h; p.vy = 0;
  const far = W.roofPlan(p.pos.x, p.pos.z, p.pos.x + 200, p.pos.z + 200, 6000);
  window.__path = far.path; window.__pi = 0;
  return { start: b.id, cells: far.path.length, buildingsOnRoute: [...new Set(far.path.map((c) => W.surfaceObjAt(c.x, c.z)?.id))].length };
});
console.log('route', JSON.stringify(plan));
await page.keyboard.down('Shift'); await page.keyboard.down('w');
const seen = new Set();
for (let i = 0; i < 60; i++) {
  await page.evaluate(() => {
    const g = window.__game, p = g.player, path = window.__path;
    while (window.__pi < path.length - 1 && Math.hypot(path[window.__pi].x - p.pos.x, path[window.__pi].z - p.pos.z) < 1.5) window.__pi++;
    const t = path[Math.min(path.length - 1, window.__pi + 1)];
    const yaw = Math.atan2(t.x - p.pos.x, t.z - p.pos.z); g.followCam.yaw = yaw + Math.PI; p.yaw = yaw;
    window.__step(0.2);
  });
  const s = await st(); if (s.roof !== null) seen.add(s.roof);
  if (i === 25) await page.screenshot({ path: `${out}-run.png` });
  if (await page.evaluate(() => window.__pi >= window.__path.length - 2)) break;
}
await page.keyboard.up('w'); await page.keyboard.up('Shift');
console.log('run: buildings crossed', seen.size, 'progress', await page.evaluate(() => `${window.__pi}/${window.__path.length}`), JSON.stringify(await st()));

// 2) leap across a street gap of 4-6.5m onto a roof no higher than ours
const gap = await page.evaluate(() => {
  const W = window.__game.world;
  for (const b of W.buildings) {
    if (b.pitched || !b.alive) continue;
    for (const [ax, az] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ex = ax > 0 ? b.x1 : ax < 0 ? b.x0 : (b.x0 + b.x1) / 2, ez = az > 0 ? b.z1 : az < 0 ? b.z0 : (b.z0 + b.z1) / 2;
      if (W.surfaceAt(ex + ax * 0.5, ez + az * 0.5) > 0.05) continue;
      for (let d = 4; d <= 6.5; d += 0.5) {
        const lx = ex + ax * (d + 1), lz = ez + az * (d + 1); const sh = W.surfaceAt(lx, lz);
        if (sh > 1 && sh !== Infinity && sh <= b.h - 0.5 && W.surfaceAt(ex + ax * d * 0.5, ez + az * d * 0.5) < 0.05) return { b: b.id, h: b.h, ex, ez, ax, az, gap: d, far: sh };
      }
    }
  }
  return null;
});
console.log('gap', JSON.stringify(gap));
if (gap) {
  await page.evaluate((G) => { const g = window.__game, p = g.player; p.pos.x = G.ex - G.ax * 5; p.pos.z = G.ez - G.az * 5; p.y = G.h; p.vy = 0; const yaw = Math.atan2(G.ax, G.az); p.yaw = yaw; g.followCam.yaw = yaw + Math.PI; g.followCam.snapTo(p); window.__step(0.1); }, gap);
  await page.keyboard.down('Shift'); await page.keyboard.down('w');
  for (let i = 0; i < 40; i++) {
    const near = await page.evaluate((G) => { const p = window.__game.player; return (G.ex - p.pos.x) * G.ax + (G.ez - p.pos.z) * G.az; }, gap);
    if (near < 0.6) { await page.keyboard.press(' '); break; }
    await page.evaluate((G) => { const g = window.__game; g.followCam.yaw = Math.atan2(G.ax, G.az) + Math.PI; window.__step(0.05); }, gap);
  }
  await page.evaluate(() => window.__step(0.25)); await page.screenshot({ path: `${out}-leap.png` });
  await page.evaluate(() => window.__step(1.0));
  await page.keyboard.up('w'); await page.keyboard.up('Shift');
  console.log('after leap', JSON.stringify(await st()));
  await page.evaluate(() => window.__step(0.6)); await page.screenshot({ path: `${out}-landed.png` });
}
await browser.close();
