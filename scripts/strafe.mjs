import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } }); page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.addInitScript(() => localStorage.setItem('riotgear.v1', JSON.stringify({ faction: 'rioter', archetype: 'instigator', weaponTier: 0, balance: 1000 })));
await page.goto('http://localhost:4173/', { waitUntil: 'load' }); await page.waitForTimeout(2500);
await page.click('#btn-join'); await page.waitForTimeout(500);
const probe = () => page.evaluate(() => { const g = window.__game, p = g.player, cam = g.followCam; return { x: +p.pos.x.toFixed(2), z: +p.pos.z.toFixed(2), camYaw: +cam.yaw.toFixed(2), camX: +cam.pos.x.toFixed(1), camZ: +cam.pos.z.toFixed(1) }; });
const a = await probe();
await page.keyboard.down('d'); await page.evaluate(() => window.__step(1)); await page.keyboard.up('d');
const b = await probe();
// camera-right vector in world: right = (-cos(yaw+PI), sin(yaw+PI)) where forward = (sin(yaw+PI), cos(yaw+PI))
const yaw = a.camYaw + Math.PI; const rx = -Math.cos(yaw), rz = Math.sin(yaw);
const dot = (b.x - a.x) * rx + (b.z - a.z) * rz;
// screen-space check: project movement using the camera's own right vector
const scr = await page.evaluate(() => { const g = window.__game, cam = g.camera; const v = new (g.player.pos.constructor)(); v.copy(g.player.pos); v.project(cam); return +v.x.toFixed(3); });
console.log(JSON.stringify({ before: a, after: b, rightDot: +dot.toFixed(2), camYawDelta: +(b.camYaw - a.camYaw).toFixed(3), playerScreenX: scr }));
await page.keyboard.down('w'); await page.evaluate(() => window.__step(3)); await page.keyboard.up('w');
const c = await probe(); console.log('after W 3s:', JSON.stringify(c), 'dist', Math.hypot(c.x - b.x, c.z - b.z).toFixed(1));
await page.keyboard.down('Shift'); await page.keyboard.down('w'); await page.evaluate(() => window.__step(3)); await page.keyboard.up('w'); await page.keyboard.up('Shift');
const d = await probe(); console.log('after Shift+W 3s:', JSON.stringify(d), 'dist', Math.hypot(d.x - c.x, d.z - c.z).toFixed(1));
await browser.close();
