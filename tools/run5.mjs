import { launch, shot, sleep } from './shot.mjs';
import { readFileSync } from 'fs';
const { page, errors, close } = await launch();
await page.waitForFunction(() => window.__MW?.ui?.current === 'title', null, { timeout: 60000 });
await page.addScriptTag({ content: readFileSync(new URL('./bot.js', import.meta.url), 'utf8') });
await page.evaluate(() => { window.__MW.ui.home(); });
await sleep(2000); await shot(page, 'r-home');
await page.evaluate(() => window.__MW.ui.go('heroes', 'pulse')); await sleep(1800); await shot(page, 'r-heroes');
// real battle: simulate to the end then render results
await page.evaluate(() => window.__simLevel({ mode: 'campaign', levelId: 2 }, { god: true, maxT: 200, keepEnd: true }));
await page.evaluate(() => { window.__MW.game.paused = false; });
await sleep(3500); await shot(page, 'r-results');
await page.evaluate(() => { const a = window.__MW; a.startBattle(a.battleConfig('campaign', 3)); });
await sleep(4500);
await page.evaluate(() => window.__MW.ui.screens.get('battle').pause()); await sleep(800); await shot(page, 'r-pause');
console.log(errors.filter((e) => !e.includes('404')).join('\n'));
await close();
