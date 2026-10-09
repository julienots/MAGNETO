import { launch, shot, sleep } from './shot.mjs';
const { page, errors, close } = await launch();
await page.waitForFunction(() => window.__MW?.ui?.current === 'title', null, { timeout: 60000 });
// give the save some progress so menus have content
await page.evaluate(() => { const p = window.__MW.profile; p.recordLevel(1, [true, true, false], 5000, 30); p.data.coins = 4200; p.data.crystals = 900; p.data.chests.push('epic', 'steel'); p.addPassXp(1300); p.addTrophies(240); p.changed(true); window.__MW.ui.home(); });
await sleep(2500); await shot(page, 'm0-home');
for (const s of ['campaign', 'heroes', 'shop', 'pass', 'profile']) { await page.evaluate((s) => window.__MW.ui.go(s), s); await sleep(1500); await shot(page, 'm-' + s); }
await page.evaluate(() => window.__MW.ui.home()); await sleep(800);
await page.evaluate(() => window.__MW.openChest(1)); await sleep(1500); await shot(page, 'c0');
for (let i = 0; i < 3; i++) { await page.mouse.click(195, 400); await sleep(500); }
await sleep(800); await shot(page, 'c1');
await page.mouse.click(195, 400); await sleep(700); await shot(page, 'c2');
console.log(errors.join('\n'));
await close();
