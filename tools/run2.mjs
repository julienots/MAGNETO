import { launch, shot, sleep } from './shot.mjs';
const { page, errors, close } = await launch();
await page.waitForFunction(() => window.__MW?.ui?.current === 'title', null, { timeout: 60000 });
await sleep(1500); await shot(page, 't0-title');
await page.mouse.click(195, 600);
await page.waitForFunction(() => window.__MW?.ui?.current === 'battle', null, { timeout: 20000 });
await sleep(1500); await shot(page, 'b0-intro');
await sleep(2500); await shot(page, 'b1-go');
// move up with joystick drag
const drag = async (x0, y0, dx, dy, ms) => {
  await page.mouse.move(x0, y0); await page.mouse.down();
  const steps = 10; for (let i = 1; i <= steps; i++) { await page.mouse.move(x0 + dx * i / steps, y0 + dy * i / steps); await sleep(ms / steps); }
};
await drag(195, 650, 0, -60, 300); await sleep(1500); await shot(page, 'b2-move');
await page.mouse.up(); await sleep(400);
await shot(page, 'b3-hold');
await page.mouse.click(150, 500); await sleep(150); await shot(page, 'b4-launch'); await sleep(600); await shot(page, 'b5-after');
const st = await page.evaluate(() => { const b = window.__MW.ui.screens.get('battle').battle; return { hud: b.hud(), enemies: b.enemies.length, props: b.props.length, calls: window.__MW.game.renderer.info.render.calls, fps: window.__MW.game.fps }; });
console.log(JSON.stringify(st));
console.log(errors.join('\n'));
await close();
