#!/usr/bin/env node
// Build ad-hoc-signed variants of a packaged Blanc.app to test what a change
// does to memory (macOS only).
//
// A notarized app cannot be edited in place: app.asar is pinned by the
// ElectronAsarIntegrity hash in Info.plist and the bundle is signed. Each
// variant is a copy with one named change applied inside app.asar, the
// integrity hash updated and an ad-hoc signature. The `control` variant goes
// through exactly the same repack and signature with no change, so compare a
// variant against `control`, never against the original app.
//
//   node bench/memory/make-variant.js --app=/Applications/Blanc.app \
//     --out="$TMPDIR/blanc-variants" --variant=control --variant=noblur
//   node bench/memory/idle-attribution.js \
//     --app="$TMPDIR/blanc-variants/control/Blanc.app=control" \
//     --app="$TMPDIR/blanc-variants/noblur/Blanc.app=noblur" \
//     --url=https://example.com/ --extra-arg=--use-mock-keychain --reps=4
//
// The variants share Blanc's bundle id but not its signature, so pass
// --use-mock-keychain to both: otherwise macOS asks for access to the real
// "Blanc Safe Storage" keychain item on every launch.
//
// Needs the repository's dev dependencies for @electron/asar
// (`npm ci --ignore-scripts` is enough).

'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

// A 1×1 transparent PNG, for replacing images rather than deleting them.
const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64'
);

// Each change names whole source lines, which must each occur exactly once in
// the bundled file. A release that moved or reworded one fails loudly instead
// of producing a variant that silently changed nothing.
const VARIANTS = {
  control: { describe: 'Repacked and re-signed, otherwise unchanged', lines: [] },
  noblur: {
    describe: "No backdrop blur on the resting Island pill",
    lines: [
      { file: 'src/renderer/styles.css', line: '  -webkit-backdrop-filter: blur(16px);', replace: null },
      { file: 'src/renderer/styles.css', line: '  backdrop-filter: blur(16px);', replace: null },
    ],
  },
  nodock: {
    describe: 'No Dock icon applied at startup',
    lines: [
      {
        file: 'src/main/app-icon.js',
        line: "  if (platform !== 'darwin' || !app.dock) return null;",
        replace: '  return null;',
      },
    ],
  },
  nohelper: {
    describe: 'Display-capture helper window never loads',
    lines: [
      {
        file: 'src/main/display-capture-broker-playout.js',
        line: '  win.loadURL(CHROME_DISPLAY_CAPTURE_HELPER_URL);',
        replace: null,
      },
    ],
  },
  checkout: {
    describe: 'Files copied from this checkout (--checkout-file), to measure a source change',
    lines: [],
    fromCheckout: true,
  },
  nowallpaper: {
    describe: 'Start Page wallpapers replaced with 1×1 images',
    lines: [],
    images: /^start-page-.*\.png$/,
    imageDir: 'src/renderer/pages',
  },
};

/**
 * Replace (or, with `replacement === null`, remove) one whole line.
 * @param {string} text
 * @param {string} line
 * @param {string|null} replacement
 */
function replaceLineOnce(text, line, replacement) {
  const lines = text.split('\n');
  const hits = lines.reduce((n, current) => n + (current === line ? 1 : 0), 0);
  if (hits !== 1) throw new Error(`expected exactly one line ${JSON.stringify(line)}, found ${hits}`);
  const index = lines.indexOf(line);
  if (replacement === null) lines.splice(index, 1);
  else lines[index] = replacement;
  return lines.join('\n');
}

function parseArgs(argv) {
  const options = { app: '/Applications/Blanc.app', out: null, variants: [], checkoutFiles: [] };
  for (const arg of argv) {
    const [key, ...rest] = arg.replace(/^--/, '').split('=');
    const value = rest.join('=');
    if (key === 'app') options.app = value;
    else if (key === 'out') options.out = value;
    else if (key === 'variant') options.variants.push(value);
    else if (key === 'checkout-file') options.checkoutFiles.push(value);
    else if (key === 'help' || key === 'h') options.help = true;
    else throw new Error(`Unknown option: ${arg}`);
  }
  for (const name of options.variants) {
    if (!VARIANTS[name]) throw new Error(`Unknown variant "${name}". Known: ${Object.keys(VARIANTS).join(', ')}`);
  }
  if (options.variants.includes('checkout') !== options.checkoutFiles.length > 0) {
    throw new Error('--variant=checkout and --checkout-file=PATH go together');
  }
  return options;
}

function run(file, args) {
  execFileSync(file, args, { stdio: ['ignore', 'inherit', 'inherit'] });
}

async function buildVariant(asar, source, outDir, name, checkoutFiles = []) {
  const variant = VARIANTS[name];
  const app = path.join(outDir, name, 'Blanc.app');
  const work = path.join(outDir, name, 'app');
  fs.rmSync(path.join(outDir, name), { recursive: true, force: true });
  fs.mkdirSync(path.join(outDir, name), { recursive: true });
  run('/usr/bin/ditto', [source, app]);

  const archive = path.join(app, 'Contents', 'Resources', 'app.asar');
  if (fs.existsSync(`${archive}.unpacked`)) {
    throw new Error('app.asar.unpacked is not supported: repacking would move those files into the archive');
  }
  asar.extractAll(archive, work);
  for (const { file, line, replace } of variant.lines) {
    const target = path.join(work, file);
    fs.writeFileSync(target, replaceLineOnce(fs.readFileSync(target, 'utf8'), line, replace));
  }
  // Only meaningful for a file whose one change since the measured release is
  // the change under test; anything else that differs is measured with it.
  if (variant.fromCheckout) {
    const repo = path.join(__dirname, '..', '..');
    for (const file of checkoutFiles) {
      const target = path.join(work, file);
      if (!fs.existsSync(target)) throw new Error(`${file} is not in this app's archive`);
      fs.copyFileSync(path.join(repo, file), target);
    }
  }
  if (variant.images) {
    const dir = path.join(work, variant.imageDir);
    const images = fs.readdirSync(dir).filter((f) => variant.images.test(f));
    if (!images.length) throw new Error(`${name}: no images matched ${variant.images}`);
    for (const image of images) fs.writeFileSync(path.join(dir, image), ONE_PIXEL_PNG);
  }

  fs.rmSync(archive);
  await asar.createPackage(work, archive);
  fs.rmSync(work, { recursive: true, force: true });
  const hash = crypto.createHash('sha256').update(asar.getRawHeader(archive).headerString).digest('hex');
  run('/usr/libexec/PlistBuddy', [
    '-c', `Set :ElectronAsarIntegrity:Resources/app.asar:hash ${hash}`,
    path.join(app, 'Contents', 'Info.plist'),
  ]);
  try { run('/usr/bin/xattr', ['-dr', 'com.apple.quarantine', app]); } catch { /* not quarantined */ }
  run('/usr/bin/codesign', ['--force', '--deep', '--sign', '-', app]);
  run('/usr/bin/codesign', ['--verify', '--deep', '--strict', app]);
  return app;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help || !options.out || !options.variants.length) {
    process.stdout.write(
      'Usage: node bench/memory/make-variant.js [--app=/Applications/Blanc.app] --out=DIR --variant=NAME ...\n'
      + '       [--checkout-file=src/main/file.js ...]  (with --variant=checkout)\n\n'
      + Object.entries(VARIANTS).map(([name, v]) => `  ${name.padEnd(12)} ${v.describe}`).join('\n') + '\n'
    );
    return;
  }
  if (process.platform !== 'darwin') throw new Error('make-variant.js builds macOS app bundles');
  const asar = await import('@electron/asar');
  const built = [];
  for (const name of options.variants) {
    process.stdout.write(`building ${name}…\n`);
    built.push([name, await buildVariant(asar, path.resolve(options.app), path.resolve(options.out), name, options.checkoutFiles)]);
  }
  process.stdout.write(`\nMeasure with:\n  node bench/memory/idle-attribution.js ${
    built.map(([name, app]) => `"--app=${app}=${name}"`).join(' ')
  } --extra-arg=--use-mock-keychain --reps=4\n`);
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${error && error.stack ? error.stack : error}\n`);
    process.exit(1);
  });
}

module.exports = { VARIANTS, replaceLineOnce, parseArgs };
