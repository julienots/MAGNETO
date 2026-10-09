// Character close-up sheet: every hero, idle front / run 3/4 / victory.
import { launch, sleep } from './shot.mjs';
const { page, errors, close } = await launch();
await page.waitForFunction(() => window.__MW?.ui?.current === 'title', null, { timeout: 60000 });
await page.evaluate(() => { document.getElementById('ui').style.display = 'none'; });
const ids = (process.env.H || 'mag,volt,pulse,orbit,crash,phase,zero').split(',');
const skin = process.env.SKIN || 'default';
for (const id of ids) {
  for (const [rot, anim, name] of [[0, 'idle', 'a'], [0.75, 'run', 'b'], [-0.35, 'victory', 'c']]) {
    await page.evaluate(([id, rot, anim, skin]) => {
      const app = window.__MW; app.menu.setHero(id, skin, 'select'); app.menu.setCam('closeup'); app.game.setView(app.menu);
      app.menu.spin = rot;
      const h = app.menu.hero; h.play(anim === 'run' ? 'idle' : anim);
      if (!h.__patched) { const up = h.update.bind(h); h.update = (dt) => { if (window.__forceRun) h.moveSpeed = 1; up(dt); }; h.__patched = true; }
      window.__forceRun = anim === 'run';
    }, [id, rot, anim, skin]);
    await sleep(anim === 'victory' ? 450 : (name === 'a' ? 3200 : 1700));
    await page.screenshot({ path: `qa-out/h-${id}-${name}.png`, clip: { x: 45, y: 150, width: 300, height: 450 } });
  }
}
console.log(errors.filter((e) => !e.includes('404')).join('\n'));
await close();
