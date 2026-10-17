#!/usr/bin/env node
// Renders graphic.html to the 1080x1350 PNG. The chosen iMac is pink; blue and
// silver remain in graphic.html as alternates and render with a suffix.
//   node marketing/social/blanc-got-bangs-2026-10-17/render.mjs [pink|blue|silver ...] [--scale=2]
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const scale = Number((args.find((a) => a.startsWith('--scale=')) || '--scale=1').split('=')[1]);
const colorways = args.filter((a) => !a.startsWith('--'));
const ways = colorways.length ? colorways : ['pink'];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: scale });
for (const way of ways) {
  await page.goto(`${pathToFileURL(path.join(DIR, 'graphic.html')).href}?c=${way}`);
  await page.waitForSelector('body[data-ready="1"]');
  const missing = await page.evaluate(() => ['Blubird Display', 'Blubird Text']
    .filter((family) => !document.fonts.check(`40px "${family}"`)));
  if (missing.length) throw new Error(`Font not loaded: ${missing.join(', ')}. Install Blubird first (npm run site:fonts).`);
  const variant = way === 'pink' ? '' : `-${way}`;
  const suffix = scale === 1 ? '' : `@${scale}x`;
  const out = path.join(DIR, `blanc-got-bangs${variant}-1080x1350${suffix}.png`);
  await page.screenshot({ path: out });
  console.log(out);
}
await browser.close();
