// Crowd health diagnostics: stuck bots, stragglers, mob progress towards the core, per-group spread.
import { chromium } from 'playwright';
const [out = 'diag2', faction = 'peacekeeper', archetype = 'commander'] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } }); page.on('pageerror', (e) => console.log('[pageerror]', e.message, e.stack?.split('\n')[1]));
await page.addInitScript(({ faction, archetype }) => localStorage.setItem('riotgear.v1', JSON.stringify({ faction, archetype, weaponTier: 0, balance: 1000 })), { faction, archetype });
await page.goto('http://localhost:4173/', { waitUntil: 'load' }); await page.waitForTimeout(2500);
await page.click('#btn-join'); await page.waitForTimeout(500);
await page.evaluate(() => { window.__hist = new Map(); window.__game.outcome.payout = 1e9; window.__game.director.o.payout = 1e9; });
for (let t = 0; t <= 120; t += 10) {
  const s = await page.evaluate(() => {
    const g = window.__game, W = g.world; const H = window.__hist;
    let stuck = 0, stragglers = 0, moving = 0;
    for (const c of g.characters) {
      if (c.isPlayer || !c.alive) continue;
      const prev = H.get(c.id); H.set(c.id, { x: c.pos.x, z: c.pos.z });
      const wants = Math.hypot(c.desired.x - c.pos.x, c.desired.y - c.pos.z) > 2.5;
      if (prev && wants && Math.hypot(prev.x - c.pos.x, prev.z - c.pos.z) < 1.5 && !c.engage && !c.holdStill) stuck++;
      if (c.group && Math.hypot(c.group.centroid.x - c.pos.x, c.group.centroid.z - c.pos.z) > 25) stragglers++;
      if (c.moving) moving++;
    }
    const groups = g.groups.map((gr) => { const m = gr.conscious(); const spread = m.length ? Math.sqrt(m.reduce((a, c) => a + (c.pos.x - gr.centroid.x) ** 2 + (c.pos.z - gr.centroid.z) ** 2, 0) / m.length) : 0; return `${gr.name.replace(/\D/g, '') || gr.name.slice(-1)}:${gr.phase[0]}:${m.length}:r${W.distToCenter(gr.centroid.x, gr.centroid.z).toFixed(0)}:sp${spread.toFixed(0)}:lag${Math.hypot(gr.goal.x - gr.centroid.x, gr.goal.z - gr.centroid.z).toFixed(0)}`; });
    return { t: +g.time.toFixed(0), over: g.roundOver, stuck, stragglers, moving, alive: g.characters.filter((c) => c.alive).length, perim: +g.meanFront().toFixed(0), groups };
  });
  console.log(JSON.stringify(s));
  if (s.over) break;
  if (t === 60) await page.screenshot({ path: `${out}-60.png` });
  await page.evaluate(() => window.__step(10));
}
await page.screenshot({ path: `${out}-end.png` });
await browser.close();
