// Headless screenshot helper: node scripts/shot.mjs <url> <out.png> [width] [height] [waitMs] [script]
import { chromium } from 'playwright';
const [url, out, w = '1280', h = '720', waitMs = '2500', script = ''] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: +w, height: +h }, hasTouch: url.includes('touch=1') });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
await page.goto(url, { waitUntil: 'load' });
await page.waitForTimeout(+waitMs);
if (script) { const r = await page.evaluate(script); logs.push('[eval] ' + JSON.stringify(r)); }
await page.screenshot({ path: out });
console.log(logs.join('\n'));
await browser.close();
