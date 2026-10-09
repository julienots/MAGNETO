// Renders the original MAGNET WAR icon + SUPERESSENCE portrait splash into the web + Android projects.
import { chromium } from 'playwright';
import { mkdirSync, existsSync, readFileSync } from 'fs';
import { dirname } from 'path';

const font = readFileSync(new URL('../node_modules/@fontsource/lilita-one/files/lilita-one-latin-400-normal.woff2', import.meta.url)).toString('base64');
const FONT = `@font-face{font-family:L;src:url(data:font/woff2;base64,${font}) format('woff2');}`;

/** Original icon: chunky horseshoe magnet (red/blue poles) + spark, on a hot yellow badge. */
const iconSvg = (bg = true, pad = 0) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="100%" height="100%">
  <defs>
    <radialGradient id="g" cx="50%" cy="35%" r="75%"><stop offset="0" stop-color="#ffe680"/><stop offset="0.55" stop-color="#ffb627"/><stop offset="1" stop-color="#e07a00"/></radialGradient>
    <linearGradient id="r" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff8080"/><stop offset="1" stop-color="#d81f2a"/></linearGradient>
    <linearGradient id="b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8ab4ff"/><stop offset="1" stop-color="#1f4fd6"/></linearGradient>
  </defs>
  ${bg ? '<rect x="0" y="0" width="1024" height="1024" rx="0" fill="url(#g)"/>' : ''}
  <g transform="translate(512 540) scale(${1 - pad}) translate(-512 -540)">
    ${bg ? '<g opacity="0.25" stroke="#fff" stroke-width="18" fill="none"><circle cx="512" cy="540" r="330"/><circle cx="512" cy="540" r="420"/></g>' : ''}
    <!-- magnet body -->
    <path d="M300 300 L300 560 A212 212 0 0 0 724 560 L724 300 L594 300 L594 560 A82 82 0 0 1 430 560 L430 300 Z" fill="#14121c" transform="translate(0 22)"/>
    <path d="M300 300 L300 560 A212 212 0 0 0 724 560 L724 300 L594 300 L594 560 A82 82 0 0 1 430 560 L430 300 Z" fill="#9aa7b5" stroke="#14121c" stroke-width="26" stroke-linejoin="round"/>
    <path d="M300 560 A212 212 0 0 0 512 772 L512 642 A82 82 0 0 1 430 560 Z" fill="url(#r)"/>
    <path d="M724 560 A212 212 0 0 1 512 772 L512 642 A82 82 0 0 0 594 560 Z" fill="url(#b)"/>
    <rect x="300" y="250" width="130" height="120" rx="18" fill="url(#r)" stroke="#14121c" stroke-width="26"/>
    <rect x="594" y="250" width="130" height="120" rx="18" fill="url(#b)" stroke="#14121c" stroke-width="26"/>
    <path d="M300 560 A212 212 0 0 0 724 560" fill="none" stroke="#14121c" stroke-width="26"/>
    <path d="M430 560 A82 82 0 0 0 594 560" fill="none" stroke="#14121c" stroke-width="26"/>
    <path d="M512 642 L512 772" stroke="#14121c" stroke-width="20"/>
    <text x="365" y="345" font-family="L" font-size="110" fill="#fff" text-anchor="middle" stroke="#14121c" stroke-width="10" paint-order="stroke">+</text>
    <text x="659" y="345" font-family="L" font-size="110" fill="#fff" text-anchor="middle" stroke="#14121c" stroke-width="10" paint-order="stroke">−</text>
    <!-- spark -->
    <path d="M520 110 L450 250 L515 250 L470 380 L600 210 L530 210 L585 110 Z" fill="#fff" stroke="#14121c" stroke-width="22" stroke-linejoin="round"/>
    <path d="M300 300 L310 300" stroke="#fff" stroke-width="0"/>
    <path d="M330 470 L330 400" stroke="#fff" stroke-opacity="0.55" stroke-width="24" stroke-linecap="round"/>
  </g>
</svg>`;

const splashHtml = (w, h) => `<html><head><style>${FONT} html,body{margin:0;width:${w}px;height:${h}px;background:#000;display:flex;align-items:center;justify-content:center}
 .l{font-family:L;font-size:${Math.round(Math.min(w, h * 0.5625) * 0.095)}px;letter-spacing:0.035em;white-space:nowrap;text-shadow:${Math.max(1, Math.round(Math.min(w, h * 0.5625) * 0.007))}px ${Math.max(1, Math.round(Math.min(w, h * 0.5625) * 0.008))}px 0 #2b2b2b}
 .s{color:#fff}.e{color:#ffcd21}</style></head><body><div class="l"><span class="s">Super</span><span class="e">Essence.</span></div></body></html>`;

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage();
async function render(html, w, h, path, transparent = false) {
  mkdirSync(dirname(path), { recursive: true });
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(html);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path, omitBackground: transparent });
}
const iconHtml = (s, bg = true, pad = 0, round = false) => `<html><head><style>${FONT} html,body{margin:0;width:${s}px;height:${s}px;background:transparent;overflow:hidden}
  .w{width:${s}px;height:${s}px;${round ? 'border-radius:50%;overflow:hidden' : ''}}</style></head><body><div class="w">${iconSvg(bg, pad)}</div></body></html>`;

await render(iconHtml(512), 512, 512, 'public/icon.png');
await render(iconHtml(1024), 1024, 1024, 'resources/icon-1024.png');
await render(iconHtml(512), 512, 512, 'resources/play-store-icon-512.png');
await render(splashHtml(1080, 1920), 1080, 1920, 'resources/splash-portrait.png');

const RES = 'android/app/src/main/res';
if (existsSync('android')) {
  const dens = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
  for (const [d, k] of Object.entries(dens)) {
    await render(iconHtml(48 * k), 48 * k, 48 * k, `${RES}/mipmap-${d}/ic_launcher.png`, true);
    await render(iconHtml(48 * k, true, 0, true), 48 * k, 48 * k, `${RES}/mipmap-${d}/ic_launcher_round.png`, true);
    // adaptive icon foreground: 108dp canvas, safe zone 66dp → shrink artwork
    await render(iconHtml(108 * k, false, 0.36), 108 * k, 108 * k, `${RES}/mipmap-${d}/ic_launcher_foreground.png`, true);
    await render(splashHtml(Math.round(320 * k), Math.round(480 * k)), Math.round(320 * k), Math.round(480 * k), `${RES}/drawable-port-${d}/splash.png`);
    await render(splashHtml(Math.round(480 * k), Math.round(320 * k)), Math.round(480 * k), Math.round(320 * k), `${RES}/drawable-land-${d}/splash.png`);
  }
  await render(splashHtml(480, 800), 480, 800, `${RES}/drawable/splash.png`);
}
await browser.close();
console.log('assets generated');
