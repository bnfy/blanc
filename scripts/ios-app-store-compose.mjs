#!/usr/bin/env node
// Renders the App Store screenshots from their design: the artboards of the
// "Blanc for iPhone App Store Screenshots" Claude Design canvas, kept here in
// docs/ios/app-store/design/project/ exactly as the canvas holds them (see
// docs/ios/app-store/design/README.md). Each artboard names its pictures and
// fonts by the canvas's /_blob/<id> urls; design/assets.json maps
// every id to a file in this repository, and Blubird to the licensed fonts
// that `npm run site:fonts` installs (never committed). Writes Apple's 6.9"
// set (1320 x 2868), 6.3" set (1206 x 2622) and the iPhone Duo's folded
// (1398 x 2034) and unfolded (2853 x 2007) sets as opaque PNGs.
//
// A custom product page (docs/ios/app-store/custom-pages/<page>/) is a
// project of its own, laid out the same way: its design/ holds a canvas.json
// and its artboards, sharing design/assets.json, and its sets land beside it.
//
//   node scripts/ios-app-store-compose.mjs                # the default page
//   node scripts/ios-app-store-compose.mjs --custom-pages # every custom page
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const store = path.join(root, 'docs/ios/app-store');
const sizes = { '6.9': [1320, 2868], '6.3': [1206, 2622] };
const customRoot = path.join(store, 'custom-pages');
const projects = process.argv.includes('--custom-pages')
  ? fs.readdirSync(customRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory())
    .map((entry) => ({ design: path.join(customRoot, entry.name, 'design'), out: path.join(customRoot, entry.name) }))
  : [{ design: path.join(store, 'design/project'), out: store }];

const assets = JSON.parse(fs.readFileSync(path.join(store, 'design/assets.json'), 'utf8'));
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

// Each artboard's size says which set it belongs to; artboards of other
// sizes (sketches, notes) and ones with no file here are skipped.
const sets = {
  '1320x2868': ['6.9', '6.3'],
  '1398x2034': ['duo-closed'],
  '2853x2007': ['duo-open'],
};
const browser = await chromium.launch();
const scratch = fs.mkdtempSync(path.join(fs.realpathSync(process.env.TMPDIR || '/tmp'), 'blanc-store-'));
for (const { design, out } of projects) {
  const canvas = JSON.parse(fs.readFileSync(path.join(design, 'canvas.json'), 'utf8'));
  const setsOf = (board) => sets[`${canvas.boards[board].w}x${canvas.boards[board].h}`];
  const boards = canvas.order.filter((board) => setsOf(board) && fs.existsSync(path.join(design, board)));
  // Only the sets this project has are cleared, so a custom page never leaves
  // empty folders for sizes it doesn't draw.
  for (const dir of new Set(boards.flatMap(setsOf))) {
    fs.rmSync(path.join(out, dir), { recursive: true, force: true });
    fs.mkdirSync(path.join(out, dir), { recursive: true });
  }
  const counts = {};
  for (const board of boards) {
    const { w, h, title } = canvas.boards[board];
    const dirs = setsOf(board);
    const index = (counts[dirs[0]] = (counts[dirs[0]] || 0) + 1);
    const tab = await browser.newPage({ viewport: { width: w, height: h } });
    const html = path.join(scratch, path.basename(board, '.dc.html') + '.html');
    fs.writeFileSync(html, page(fs.readFileSync(path.join(design, board), 'utf8')));
    await tab.goto(pathToFileURL(html).href);
    await tab.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all([...document.images].map((img) => img.decode()));
    });
    const slug = (title || path.basename(board, '.dc.html')).replace(/^Duo (un)?folded · /, '')
      .toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const name = `${index}-${slug}.png`;
    const big = path.join(out, dirs[0], name);
    await tab.screenshot({ path: big });
    await tab.close();
    // Apple refuses alpha; the 6.3" set is the 6.9" design, resized.
    execFileSync('magick', [big, '-background', '#F8F2E8', '-alpha', 'remove', '-alpha', 'off', big]);
    if (dirs[1]) execFileSync('magick', [big, '-resize', `${sizes['6.3'].join('x')}!`, '-alpha', 'off', path.join(out, dirs[1], name)]);
    console.log(`${path.relative(store, out) || 'default'} ${dirs.join(', ')}: ${name}`);
  }
}
await browser.close();
fs.rmSync(scratch, { recursive: true, force: true });
