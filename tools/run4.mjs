import { launch, shot, sleep } from './shot.mjs';
import { readFileSync } from 'fs';
const { page, errors, close } = await launch();
await page.waitForFunction(() => window.__MW?.ui?.current === 'title', null, { timeout: 60000 });
await page.addScriptTag({ content: readFileSync(new URL('./bot.js', import.meta.url), 'utf8') });
const levels = (process.env.LV || '17,33,47,62,78,93,15,60').split(',').map(Number);
for (const lv of levels) {
  await page.evaluate((lv) => {
    const app = window.__MW; app.game.paused = false;
    app.startBattle(app.battleConfig('campaign', lv));
    const b = app.ui.screens.get('battle').battle;
    b.begin();
    window.__bb = b;
  }, lv);
  // fast-forward simulation with bot-ish play
  await page.evaluate(([lv, T]) => {
    const b = window.__bb; const inp = { moveX: 0, moveZ: 0 }; b.input = inp;
    for (let i = 0; i < T * 30; i++) {
      b.player.hp = b.player.maxHp;
      const p = b.player.body; const pr = b.props.find((q) => !q.dead && !q.body.held && b.canHold(q.body));
      if (b.player.held.length >= 2) { const e = b.enemies.find((x) => !x.dead); if (e) { b.player.facing = Math.atan2(e.body.x - p.x, e.body.z - p.z); inp.moveX = inp.moveZ = 0; if (i % 20 === 0) b.flip(); } }
      else if (pr) { const dx = pr.body.x - p.x, dz = pr.body.z - p.z, d = Math.hypot(dx, dz) || 1; inp.moveX = dx / d; inp.moveZ = dz / d; }
      if (b.effectivePolarity() < 0 && i % 20 === 10) b.flip();
      b.update(1 / 30);
    }
  }, [lv, lv % 15 === 0 ? 40 : 12]);
  await sleep(1200);
  await shot(page, 'w-' + lv);
}
console.log(errors.filter((e) => !e.includes('404')).join('\n'));
await close();
