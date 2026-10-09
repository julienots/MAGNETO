// In-page autoplay bot. Exposed as window.__simLevel(cfgPatch, opts) → result summary.
window.__simLevel = function (cfgPatch, opts) {
  const app = window.__MW;
  const cfg = Object.assign(app.battleConfig(cfgPatch.mode || 'campaign', cfgPatch.levelId), cfgPatch);
  app.game.paused = true;
  const scr = app.ui.screens.get('battle');
  app.ui.home('battle');
  scr.start(cfg);
  const b = scr.battle;
  let result = null;
  const origEnd = b.onEnd; b.onEnd = (r) => { result = r; if (opts.keepEnd) origEnd(r); };
  b.begin();
  const inp = { moveX: 0, moveZ: 0 };
  b.input = inp;
  const dt = 1 / 30;
  const maxT = opts.maxT || 300;
  // danger map for ringout objectives
  const danger = [];
  for (let x = -6.5; x <= 6.5; x += 0.5) for (let z = -11.5; z <= 11.5; z += 0.5) if (b.hazards.some((h) => h.isDanger && h.isDanger(x, z, 0))) danger.push([x, z]);
  let t = 0, flipCd = 0, err = null, simT = 0;
  const go = (x, z) => { const p = b.player.body; const dx = x - p.x, dz = z - p.z, d = Math.hypot(dx, dz) || 1; inp.moveX = dx / d; inp.moveZ = dz / d; return d; };
  const stop = () => { inp.moveX = 0; inp.moveZ = 0; };
  try {
    while (!result && !b.ended && t < maxT + 5) {
      t += dt;
      if (opts.god) { b.player.hp = b.player.maxHp; b.player.dead = false; }
      const P = b.player, p = P.body;
      flipCd -= dt;
      if (b.state === 'play' && !P.dead) {
        if (b.effectivePolarity() < 0 && flipCd <= 0) { b.flip(); flipCd = 0.3; }
        const enemies = b.enemies.filter((e) => !e.dead && e.state !== 'spawn' && !e.body.held);
        const targets = enemies.map((e) => e.body).concat(b.generators.filter((g) => !g.dead).map((g) => g.body));
        if (b.boss && b.boss.alive) targets.push(b.boss.body);
        const held = P.held.length;
        const obj = b.objective.type;
        const nearest = (list) => { let best = null, bd = 1e9; for (const o of list) { const d = Math.hypot(o.x - p.x, o.z - p.z); if (d < bd) { bd = d; best = o; } } return best; };
        if (P.abilityCd <= 0 && (enemies.length > 2 || (b.boss && b.boss.alive))) b.useAbility();
        const close = enemies.find((e) => Math.hypot(e.body.x - p.x, e.body.z - p.z) < 1.4);
        if (close && P.dashCd <= 0 && Math.random() < 0.05) b.dash(-(close.body.x - p.x), -(close.body.z - p.z));
        if (obj === 'collect' && b.collector) {
          const heldCell = P.held.some((h) => h.owner && h.owner.kind === 'cell');
          if (heldCell) go(b.collector.x, b.collector.z + 1);
          else { const c = nearest(b.props.filter((q) => q.kind === 'cell' && !q.dead).map((q) => q.body)); if (c) go(c.x, c.z); else stop(); }
        } else if (obj === 'ringout' && held && P.held.some((h) => h.kind === 'enemy') && danger.length) {
          const dz = nearest(danger.map(([x, z]) => ({ x, z })));
          const d = Math.hypot(dz.x - p.x, dz.z - p.z);
          if (d > 3) go(dz.x, dz.z); else { stop(); P.facing = Math.atan2(dz.x - p.x, dz.z - p.z); if (flipCd <= 0) { b.flip(); flipCd = 0.4; } }
        } else if (held >= Math.min(2, P.stats.hold) || (held >= 1 && targets.length && Math.random() < 0.02) || (held >= 1 && !targets.length)) {
          const tg = nearest(targets);
          if (tg) {
            const d = Math.hypot(tg.x - p.x, tg.z - p.z);
            if (d > 7) go(tg.x, tg.z); else { stop(); P.facing = Math.atan2(tg.x - p.x, tg.z - p.z); if (flipCd <= 0) { b.flip(); flipCd = 0.35; } }
          } else { stop(); if (flipCd <= 0) { b.flip(); flipCd = 0.5; } }
        } else {
          const grab = nearest(b.props.filter((q) => !q.dead && !q.body.held && b.canHold(q.body) && q.kind !== 'cell').map((q) => q.body).concat(obj === 'ringout' ? enemies.filter((e) => b.canHold(e.body)).map((e) => e.body) : []));
          if (grab) { go(grab.x, grab.z); } else if (targets.length) { const tg = nearest(targets); go(tg.x, tg.z); } else stop();
        }
      } else stop();
      b.update(dt);
      simT += dt;
    }
  } catch (e) { err = String(e && e.stack || e); }
  for (let k = 0; k < 90 && b.ended && !result; k++) b.update(1 / 30);
  if (opts.keepEnd) { for (let k = 0; k < 30; k++) b.update(1 / 30); }
  const h = b.hud();
  const out = { level: cfg.levelId, mode: cfg.mode, victory: result ? result.victory : null, time: Math.round(b.time), score: b.score, stars: result ? result.stars : null, hp: Math.round(b.player.hp), wave: b.wave, obj: `${b.objective.type} ${b.objective.progress}/${b.objective.target}`, enemies: b.enemies.length, props: b.props.length, boss: h.boss ? `${h.boss.phase} ${Math.round(h.boss.hp * 100)}%` : null, kills: b.stats.kills, combo: b.combo.best, chain: b.maxChain, err, left: b.enemies.filter((e) => !e.dead).map((e) => ({ k: e.kind, s: e.state, x: +e.body.x.toFixed(1), z: +e.body.z.toFixed(1), y: +e.body.y.toFixed(2), hp: Math.round(e.hp), g: e.body.ghost, held: e.body.held, alive: e.body.alive, fall: e.falling, ph: e.phase })), pending: b.pending.length };
  return out;
};
