import { launch, sleep } from './shot.mjs';
import { readFileSync } from 'fs';
const god = process.argv.includes('--god');
const from = Number(process.argv.find((a) => a.startsWith('--from='))?.slice(7) ?? 1);
const to = Number(process.argv.find((a) => a.startsWith('--to='))?.slice(5) ?? 105);
const modes = process.argv.includes('--modes');
const { page, errors, close } = await launch();
await page.waitForFunction(() => window.__MW?.ui?.current === 'title', null, { timeout: 60000 });
await page.addScriptTag({ content: readFileSync(new URL('./bot.js', import.meta.url), 'utf8') });
const rows = [];
const list = modes ? ['rush', 'survival', 'bossrush', 'chaos'].map((m) => ({ mode: m })) : Array.from({ length: to - from + 1 }, (_, i) => ({ mode: 'campaign', levelId: from + i }));
for (const c of list) {
  const r = await page.evaluate(([c, god]) => window.__simLevel(c, { god, maxT: c.mode === 'survival' ? 240 : c.mode === 'bossrush' ? 900 : 300 }), [c, god]);
  rows.push(r);
  console.log(JSON.stringify(r));
}
console.log('PAGE ERRORS:\n' + errors.filter((e) => !e.includes('404')).slice(0, 20).join('\n'));
const fails = rows.filter((r) => !r.victory);
console.log(`\n${rows.length - fails.length}/${rows.length} victories`);
await close();
