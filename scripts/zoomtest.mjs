import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 430, height: 932 }, hasTouch: true, isMobile: true });
const page = await ctx.newPage(); page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.addInitScript(() => localStorage.setItem('riotgear.v1', JSON.stringify({ faction: 'rioter', archetype: 'brawler', weaponTier: 0, balance: 1000 })));
await page.goto('http://localhost:4173/', { waitUntil: 'load' }); await page.waitForTimeout(2500);
await page.tap('#btn-join'); await page.waitForTimeout(500);
const r = await page.evaluate(() => {
  const c = document.getElementById('gl'), g = window.__game, inp = window.__input;
  const ev = (type, x, y, id) => c.dispatchEvent(new PointerEvent(type, { pointerId: id, clientX: x, clientY: y, pointerType: 'touch', bubbles: true, button: 0 }));
  const out = { z0: +g.followCam.zoom.toFixed(2), dist0: +g.followCam.dist.toFixed(2) };
  ev('pointerdown', 250, 400, 5); ev('pointerdown', 300, 450, 6); // pinch
  ev('pointermove', 220, 370, 5); ev('pointermove', 330, 480, 6); // fingers apart => zoom in
  window.__step(0.2); out.zIn = +g.followCam.zoom.toFixed(2);
  ev('pointerup', 220, 370, 5); ev('pointerup', 330, 480, 6);
  out.eventsAfterPinch = inp.events.length;
  c.dispatchEvent(new WheelEvent('wheel', { deltaY: 300, bubbles: true, cancelable: true })); window.__step(0.2); out.zWheelOut = +g.followCam.zoom.toFixed(2);
  return out;
});
console.log(JSON.stringify(r));
await browser.close();
