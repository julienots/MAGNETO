// Enemy line-up close-up
import { launch, sleep } from './shot.mjs';
const { page, errors, close } = await launch();
await page.waitForFunction(() => window.__MW?.ui?.current === 'title', null, { timeout: 60000 });
await page.evaluate(() => {
  const app = window.__MW; app.startBattle(app.battleConfig('campaign', 1));
  document.getElementById('ui').style.display = 'none';
  const b = app.ui.screens.get('battle').battle;
  b.state = 'end';
  const kinds = ['drone', 'tank', 'puller', 'pusher', 'bomber', 'shield', 'swarm', 'phaser', 'chaos'];
  kinds.forEach((k, i) => { const e = b.spawnEnemy(k, -2.3 + (i % 3) * 2.3, -3 + Math.floor(i / 3) * 2.6); e.body.y = 0; e.state = 'move'; e.body.ghost = false; e.facing = 0; });
  for (const p of b.props) b.removeProp(p);
  b.player.rig.root.visible = false;
  const cam = b.rig.cam;
  b.rig.update = () => { cam.position.set(0, 9, 12.5); cam.lookAt(0, 0.4, -0.6); };
});
await sleep(2500);
await page.screenshot({ path: 'qa-out/enemies.png' });
console.log(errors.filter((e) => !e.includes('404')).join('\n'));
await close();
