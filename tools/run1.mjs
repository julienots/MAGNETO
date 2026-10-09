import { launch, shot, sleep } from './shot.mjs';
const { page, errors, close } = await launch();
for (let i = 0; i < 8; i++) { await sleep(1500); await shot(page, 'i' + i); }
console.log(errors.join('\n'));
await close();
