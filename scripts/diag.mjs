import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } }); page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.addInitScript(() => localStorage.setItem('riotgear.v1', JSON.stringify({ faction: 'peacekeeper', archetype: 'commander', weaponTier: 0, balance: 1000 })));
await page.goto('http://localhost:4173/', { waitUntil: 'load' }); await page.waitForTimeout(2500);
await page.click('#btn-join'); await page.waitForTimeout(500);
for (let t = 0; t <= 90; t += 15) {
  const s = await page.evaluate(() => { const g = window.__game, W = g.world; const per = g.fronts.map((f, k) => `${W.sectorName(k).slice(0, 2)}:${f.r.toFixed(0)}`); return { t: +g.time.toFixed(0), over: g.roundOver, per, groups: g.groups.map((gr) => { const m = gr.conscious(); const cx = m.reduce((a, c) => a + c.pos.x, 0) / (m.length || 1), cz = m.reduce((a, c) => a + c.pos.z, 0) / (m.length || 1); return `${gr.name}:${gr.phase}:s${gr.sector}:${gr.strategy.id}:${m.length}@(${cx.toFixed(0)},${cz.toFixed(0)})->(${gr.goal.x.toFixed(0)},${gr.goal.z.toFixed(0)})`; }), pl: [+g.player.pos.x.toFixed(0), +g.player.pos.z.toFixed(0)] }; });
  console.log(JSON.stringify(s));
  await page.evaluate(() => window.__step(15));
}
// big minimap render for layout inspection
await page.evaluate(() => { const mm = window.__game.hud.minimap; const c = document.createElement('canvas'); c.width = 480; c.height = 660; c.id = 'bigmap'; c.style.cssText = 'position:fixed;left:0;top:0;z-index:99'; document.body.appendChild(c); const { Minimap } = { Minimap: mm.constructor }; const big = new Minimap(c); big.update(window.__game, 1); });
await page.screenshot({ path: process.argv[2], clip: { x: 0, y: 0, width: 480, height: 660 } });
await browser.close();
