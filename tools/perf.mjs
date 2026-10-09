import { launch, sleep } from './shot.mjs';
const { page, close } = await launch();
await page.waitForFunction(() => window.__MW?.ui?.current === 'title', null, { timeout: 60000 });
for (const lv of (process.env.LV || "5,35,65,104").split(",").map(Number)) {
  const r = await page.evaluate(async (lv) => {
    const app = window.__MW; app.game.paused = false;
    app.startBattle(app.battleConfig('campaign', lv));
    const b = app.ui.screens.get('battle').battle; b.begin();
    for (let i = 0; i < 600; i++) { b.player.hp = b.player.maxHp; b.update(1 / 30); }
    const t0 = performance.now(); for (let i = 0; i < 120; i++) { b.player.hp = b.player.maxHp; b.update(1 / 60); } const sim = (performance.now() - t0) / 120;
    app.game.renderer.info.autoReset = true;
    app.game.renderer.render(b.scene, b.rig.cam);
    const info = app.game.renderer.info;
    return { lv, enemies: b.enemies.length, props: b.props.length, bodies: b.phys.bodies.length, particles: b.fx.glow.count + b.fx.dust.count, calls: info.render.calls, tris: info.render.triangles, simMsPerFrame: +sim.toFixed(2), geos: info.memory.geometries, tex: info.memory.textures };
  }, lv);
  console.log(JSON.stringify(r));
}
await close();
