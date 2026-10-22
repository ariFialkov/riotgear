import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } }); page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.addInitScript(() => localStorage.setItem('riotgear.v1', JSON.stringify({ faction: 'peacekeeper', archetype: 'commander', weaponTier: 0, balance: 1000 })));
await page.goto('http://localhost:4173/', { waitUntil: 'load' }); await page.waitForTimeout(2500);
await page.click('#btn-join'); await page.waitForTimeout(500);
for (let t = 0; t <= 60; t += 15) {
  const s = await page.evaluate(() => { const g = window.__game, W = g.world; const per = W.corridors.map((c, i) => ({ n: c.name, front: +g.fronts[i].z.toFixed(1), r: g.characters.filter((ch) => ch.alive && ch.faction === 'rioter' && W.corridorAt(ch.pos.x, ch.pos.z) === i).length, p: g.characters.filter((ch) => ch.alive && ch.faction === 'peacekeeper' && W.corridorAt(ch.pos.x, ch.pos.z) === i).length })); return { t: +g.time.toFixed(0), per, groups: g.groups.map((gr) => `${gr.name}:${gr.corridor}:${gr.strategy.id}:${gr.conscious().length}`), side: W.sideStreets.map((s) => +s.x.toFixed(0)) }; });
  console.log(JSON.stringify(s));
  await page.evaluate(() => window.__step(15));
}
// big minimap render for layout inspection
await page.evaluate(() => { const mm = window.__game.hud.minimap; const c = document.createElement('canvas'); c.width = 480; c.height = 660; c.id = 'bigmap'; c.style.cssText = 'position:fixed;left:0;top:0;z-index:99'; document.body.appendChild(c); const { Minimap } = { Minimap: mm.constructor }; const big = new Minimap(c); big.update(window.__game, 1); });
await page.screenshot({ path: process.argv[2], clip: { x: 0, y: 0, width: 480, height: 660 } });
await browser.close();
