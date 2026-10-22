import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message, (e.stack || '').split('\n')[1]));
await page.addInitScript(() => localStorage.setItem('riotgear.v1', JSON.stringify({ faction: 'peacekeeper', archetype: 'grenadier', weaponTier: 0, balance: 1000 })));
await page.goto('http://localhost:4173/', { waitUntil: 'load' }); await page.waitForTimeout(2500);
await page.click('#btn-join'); await page.waitForTimeout(500);
await page.evaluate(() => { const g = window.__game; g.outcome.payout = 1e9; g.director.o.payout = 1e9; const orig = g.projectiles.launchAt.bind(g.projectiles); window.__roofThrows = 0; g.projectiles.launchAt = (type, owner, from, target, o) => { if (owner && owner.onRoof) window.__roofThrows++; return orig(type, owner, from, target, o); }; });
for (let t = 0; t <= 140; t += 20) {
  const s = await page.evaluate(() => {
    const g = window.__game; const up = g.characters.filter((c) => c.faction === 'rioter' && c.alive && c.onRoof);
    return { t: +g.time.toFixed(0), up: up.length, throws: window.__roofThrows, bots: up.map((c) => { const t = c.target; return { atEnd: c.roofPlan ? Math.hypot(c.roofPlan.end.x - c.pos.x, c.roofPlan.end.z - c.pos.z).toFixed(1) : 'none', want: c.roofPlan?.want, dT: t ? c.distTo(t).toFixed(0) : null, busy: !!c.humanoid.busy, rocks: c.inventory.rock, plan: c.roofPlan ? c.roofPlan.path.length : 0 }; }) };
  });
  console.log(JSON.stringify(s));
  await page.evaluate(() => window.__step(20));
}
await browser.close();
