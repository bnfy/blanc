#!/usr/bin/env node
// Renders the App Store screenshots from their design: the artboards of the
// "Blanc for iPhone App Store Screenshots" Claude Design canvas, kept here in
// docs/ios/app-store/design/project/ exactly as the canvas holds them (see
// docs/ios/app-store/design/README.md). Each artboard names its pictures and
// fonts by the canvas's /_blob/<id> urls; design/assets.json maps
// every id to a file in this repository, and Blubird to the licensed fonts
// that `npm run site:fonts` installs (never committed). Writes Apple's 6.9"
// set (1320 x 2868) and 6.3" set (1206 x 2622) as opaque PNGs.
//
//   node scripts/ios-app-store-compose.mjs
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const design = path.join(root, 'docs/ios/app-store/design/project');
const out = path.join(root, 'docs/ios/app-store');
const sizes = { '6.9': [1320, 2868], '6.3': [1206, 2622] };

const canvas = JSON.parse(fs.readFileSync(path.join(design, 'canvas.json'), 'utf8'));
const assets = JSON.parse(fs.readFileSync(path.join(design, '../assets.json'), 'utf8'));
const files = {};
for (const [id, rel] of Object.entries(assets)) {
  const file = path.join(root, rel);
  if (!fs.existsSync(file)) {
    const hint = rel.includes('fonts/blubird') ? ' (install the licensed fonts: npm run site:fonts -- /path/to/Blubird.zip)' : '';
    throw new Error(`${rel} is missing${hint}`);
  }
  files[id] = pathToFileURL(file).href;
}

// An artboard is plain markup: its <helmet> styles and root apply as they are,
// and the canvas runtime (support.js) and logic block are not needed to draw it.
function page(source) {
  const html = source
    .replace(/<script src="\.\/support\.js"><\/script>/, '<style>x-dc{display:block}</style>')
    .replace(/<script type="text\/x-dc"[\s\S]*?<\/script>/, '')
    .replace(/\/_blob\/([0-9a-f]{32})/g, (match, id) => {
      if (!files[id]) throw new Error(`no file in assets.json for ${match}`);
      return files[id];
    });
  if (/\{\{/.test(html)) throw new Error('an artboard uses a {{hole}}; keep the artboards literal markup');
  return html;
}

const browser = await chromium.launch();
const tab = await browser.newPage({ viewport: { width: 1320, height: 2868 } });
const scratch = fs.mkdtempSync(path.join(fs.realpathSync(process.env.TMPDIR || '/tmp'), 'blanc-store-'));
for (const dir of Object.keys(sizes)) fs.mkdirSync(path.join(out, dir), { recursive: true });
for (const [index, board] of canvas.order.entries()) {
  const html = path.join(scratch, path.basename(board, '.dc.html') + '.html');
  fs.writeFileSync(html, page(fs.readFileSync(path.join(design, board), 'utf8')));
  await tab.goto(pathToFileURL(html).href);
  await tab.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map((img) => img.decode()));
  });
  const slug = (canvas.boards[board].title || path.basename(board, '.dc.html'))
    .toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const name = `${index + 1}-${slug}.png`;
  const big = path.join(out, '6.9', name);
  await tab.screenshot({ path: big, omitBackground: false });
  // Apple refuses alpha; the 6.3" set is the same design, resized.
  execFileSync('magick', [big, '-background', '#F8F2E8', '-alpha', 'remove', '-alpha', 'off', big]);
  execFileSync('magick', [big, '-resize', `${sizes['6.3'].join('x')}!`, '-alpha', 'off', path.join(out, '6.3', name)]);
  console.log(`${name}: 6.9" and 6.3"`);
}
await browser.close();
fs.rmSync(scratch, { recursive: true, force: true });
