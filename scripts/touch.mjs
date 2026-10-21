// Verifies the touch input path: joystick drag moves the player, tap strikes, swipe throws, Z button holds.
import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 430, height: 932 }, hasTouch: true, isMobile: true });
const page = await ctx.newPage(); page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.addInitScript(() => localStorage.setItem('riotgear.v1', JSON.stringify({ faction: 'rioter', archetype: 'brawler', weaponTier: 0, balance: 1000 })));
await page.goto('http://localhost:4173/', { waitUntil: 'load' }); await page.waitForTimeout(2500);
await page.tap('#btn-join'); await page.waitForTimeout(500);
const r = await page.evaluate(async () => {
  const c = document.getElementById('gl'), inp = window.__input, g = window.__game;
  const ev = (type, x, y, id = 1) => c.dispatchEvent(new PointerEvent(type, { pointerId: id, clientX: x, clientY: y, pointerType: 'touch', bubbles: true, isPrimary: true, button: 0 }));
  const out = { isTouch: inp.isTouch };
  const z0 = g.player.pos.z;
  ev('pointerdown', 80, 800); ev('pointermove', 80, 740); out.move = { ...inp.move };
  window.__step(2); out.movedZ = +(g.player.pos.z - z0).toFixed(2);
  ev('pointerup', 80, 740); out.moveAfter = { ...inp.move };
  ev('pointerdown', 300, 400, 2); ev('pointerup', 300, 400, 2); window.__step(0.1); out.tapEvents = inp.events.length; out.action = g.player.humanoid.action?.type;
  ev('pointerdown', 300, 600, 3); ev('pointermove', 300, 500, 3); ev('pointermove', 300, 380, 3); ev('pointerup', 300, 380, 3);
  const before = g.player.inventory.rock; window.__step(1); out.rocksBefore = before; out.rocksAfter = g.player.inventory.rock; out.projectiles = g.projectiles.list.length;
  const ab = document.getElementById('btn-ability');
  ab.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 9, bubbles: true })); window.__step(0.5); out.abilityDown = inp.abilityDown;
  ab.dispatchEvent(new PointerEvent('pointerup', { pointerId: 9, bubbles: true })); window.__step(0.2); out.abilityAfter = inp.abilityDown;
  return out;
});
console.log(JSON.stringify(r));
await page.screenshot({ path: process.argv[2] || 'touch.png' });
await browser.close();
