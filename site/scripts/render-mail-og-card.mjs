#!/usr/bin/env node
/*
 * Renders public/mail-og.png, the share card for every /mail page
 * (BaseLayout picks it for paths under /mail). It was a hand-made PNG; this
 * makes it reproducible, so a tagline change is one run:
 *
 *   node scripts/render-mail-og-card.mjs
 *
 * The layout matches the original card: a gold eyebrow, the tagline in the
 * site's heading face, the address, and the gold Sunrise from Blanc Browser's
 * app icon on the right. Fonts and the mark are embedded, so no network.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { blubirdFontFaces } from './blubird-card-fonts.mjs';
import { SITE_ORIGIN } from '../src/lib/site-origin.mjs';

const SITE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(SITE_ROOT, 'public', 'mail-og.png');
const TAGLINE = 'A little less inbox.';
const ADDRESS = `${new URL(SITE_ORIGIN).host}/mail`;

const dataUrl = (file, type) => `data:${type};base64,${fs.readFileSync(file).toString('base64')}`;
const blubird = blubirdFontFaces();
const mark = dataUrl(path.join(SITE_ROOT, '..', 'build/app-icons/Icon.icon/Assets/sunrise-mark.png'), 'image/png');

const html = `<!doctype html><html><head><style>
${blubird}
*{margin:0;box-sizing:border-box}
body{width:1200px;height:630px;background:#f7f1e6;position:relative;overflow:hidden}
.eyebrow{position:absolute;left:66px;top:84px;font:600 19px/1 'Blubird Text';letter-spacing:.06em;text-transform:uppercase;color:#805d28}
h1{position:absolute;left:62px;top:178px;width:640px;font:400 112px/1.02 'Blubird Display';letter-spacing:0;color:#12100b;text-wrap:balance}
.address{position:absolute;left:66px;bottom:98px;font:400 25px/1 'Blubird Text';color:#6b6257}
img{position:absolute;right:56px;top:118px;width:360px;height:360px}
</style></head><body>
<p class="eyebrow">Blanc Mail · Coming soon for macOS</p>
<h1>${TAGLINE}</h1>
<p class="address">${ADDRESS}</p>
<img src="${mark}" alt="">
</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await page.setContent(html);
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: OUT });
await browser.close();
console.log(`Wrote ${path.relative(SITE_ROOT, OUT)} (1200x630): ${TAGLINE}`);
