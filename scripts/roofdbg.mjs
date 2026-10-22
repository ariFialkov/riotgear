import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message, (e.stack || '').split('\n')[1]));
await page.addInitScript(() => localStorage.setItem('riotgear.v1', JSON.stringify({ faction: 'peacekeeper', archetype: 'grenadier', weaponTier: 0, balance: 1000 })));
await page.goto('http://localhost:4173/', { waitUntil: 'load' }); await page.waitForTimeout(2500);
await page.click('#btn-join'); await page.waitForTimeout(500);
// put a rioter looter on a roof and tell it to leave, then watch
const r = await page.evaluate(() => {
  const g = window.__game, W = g.world; g.outcome.payout = 1e9; g.director.o.payout = 1e9;
  const c = g.characters.find((q) => q.faction === 'rioter' && q.arch.id === 'looter');
  const b = W.buildings.find((q) => q.front && !q.pitched && q.h < 18 && q.x1 - q.x0 > 8 && q.z1 - q.z0 > 8);
  c.pos.x = (b.x0 + b.x1) / 2; c.pos.z = (b.z0 + b.z1) / 2; c.y = b.h; c.vy = 0; c.hp = c.maxHp * 0.2; // hurt => wants to leave
  window.__dbg = c; return { b: b.id, x: c.pos.x, z: c.pos.z };
});
console.log(JSON.stringify(r));
for (let i = 0; i < 14; i++) {
  await page.evaluate(() => window.__step(0.5));
  console.log(JSON.stringify(await page.evaluate(() => {
    const c = window.__dbg, W = window.__game.world, p = c.roofPlan;
    const cell = (x, z) => { const i = W.gi(x, z); return `${W.grid[i]}/${W.surf[i].toFixed(1)}`; };
    return { x: +c.pos.x.toFixed(2), z: +c.pos.z.toFixed(2), y: +c.y.toFixed(1), climbing: !!c.climbing, roof: !!c.onRoof, want: p?.want, i: p?.i, n: p?.path.length, end: p && [p.end.x, p.end.z], desired: [+c.desired.x.toFixed(1), +c.desired.y.toFixed(1)], vel: [+c.vel.x.toFixed(2), +c.vel.y.toFixed(2)], here: cell(c.pos.x, c.pos.z), stuck: +c.stuckT.toFixed(2), hold: c.holdStill, engage: c.engage };
  })));
}
await browser.close();
