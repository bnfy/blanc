import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const require = createRequire(import.meta.url);
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
// Read first and treat a missing file as changed, rather than checking
// existence and then reading (CodeQL js/file-system-race).
function writeIfChanged(file, bytes) {
  let current = null;
  try {
    current = fs.readFileSync(file);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (!current || !current.equals(Buffer.from(bytes))) fs.writeFileSync(file, bytes);
}
function run(args) {
  const result = spawnSync('/usr/bin/xcrun', args, { encoding: 'utf8' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Icon compilation failed: ${result.stderr || result.stdout}`);
  return `${result.stdout || ''}${result.stderr || ''}`;
}

// Reuse the shipping Icon Composer layers and Sunrise Dark colorway. Give the
// icon a Blanc-specific catalog name, distinct from Chromium's cached AppIcon.
// The prototype's icon is dark even when macOS uses the default appearance;
// macOS can still render its native Clear/Tinted treatments.
export function prepareMacIcon(chromium) {
  if (process.platform !== 'darwin') throw new Error('Prototype icon preparation requires macOS/Xcode.');
  const iconName = 'BlancDK';
  const definition = require('../../src/main/app-icon-assets.js')['sunrise-dark'];
  if (definition.preserveColor !== true || definition.background !== definition.darkBackground ||
      !/^#[0-9a-f]{6}$/i.test(definition.background)) {
    throw new Error('Sunrise Dark definition changed; review the prototype icon derivation.');
  }
  const source = path.join(repo, 'build/app-icons/Icon.icon');
  const document = JSON.parse(fs.readFileSync(path.join(source, 'icon.json'), 'utf8'));
  const rgb = definition.background.slice(1);
  const channels = [0, 2, 4].map(i => (parseInt(rgb.slice(i, i + 2), 16) / 255).toFixed(5));
  document.fill = { 'automatic-gradient': `extended-srgb:${channels.join(',')},1.00000` };
  delete document['fill-specializations'];
  const json = JSON.stringify(document, null, 2) + '\n';
  const mark = fs.readFileSync(path.join(source, 'Assets', definition.imageName));
  const toolVersion = run(['actool', '--version']).trim();
  const fingerprint = digest(JSON.stringify({ version: 2, iconName, json, image: digest(mark), toolVersion }));
  const cache = path.join(here, 'generated/mac-icon');
  const manifest = path.join(cache, 'manifest.json');
  let saved = {};
  try { saved = JSON.parse(fs.readFileSync(manifest, 'utf8')); } catch { /* First preparation. */ }
  const files = { [`${iconName}.icns`]: 'app.icns', 'Assets.car': 'Assets.car' };
  // Same read-first rule as writeIfChanged: a missing output is simply stale.
  const cachedDigest = (name) => {
    try { return digest(fs.readFileSync(path.join(cache, name))); } catch (error) {
      if (error.code === 'ENOENT') return null;
      throw error;
    }
  };
  const fresh = saved.fingerprint === fingerprint && Object.keys(files).every(name =>
    cachedDigest(name) !== null && cachedDigest(name) === saved.outputs?.[name]);
  if (!fresh) {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-prototype-icon-'));
    try {
      const icon = path.join(temp, `${iconName}.icon`);
      const output = path.join(temp, 'compiled');
      fs.mkdirSync(path.join(icon, 'Assets'), { recursive: true });
      fs.mkdirSync(output);
      fs.writeFileSync(path.join(icon, 'icon.json'), json);
      fs.writeFileSync(path.join(icon, 'Assets', definition.imageName), mark);
      run(['actool', icon, '--compile', output, '--output-format', 'human-readable-text',
        '--notices', '--warnings', '--output-partial-info-plist', path.join(output, 'info.plist'),
        '--app-icon', iconName, '--include-all-app-icons', '--enable-on-demand-resources', 'NO',
        '--development-region', 'en', '--target-device', 'mac', '--minimum-deployment-target', '26.0',
        '--platform', 'macosx']);
      const outputs = Object.fromEntries(Object.keys(files).map(name => [name, fs.readFileSync(path.join(output, name))]));
      fs.mkdirSync(cache, { recursive: true });
      for (const [name, bytes] of Object.entries(outputs)) writeIfChanged(path.join(cache, name), bytes);
      fs.writeFileSync(manifest, JSON.stringify({ fingerprint, colorway: 'sunrise-dark', toolVersion,
        outputs: Object.fromEntries(Object.entries(outputs).map(([name, bytes]) => [name, digest(bytes)])) }, null, 2) + '\n');
    } finally {
      fs.rmSync(temp, { recursive: true, force: true });
    }
  }
  const target = path.join(chromium, 'chrome/app/theme/chromium/mac');
  for (const [name, destination] of Object.entries(files)) {
    writeIfChanged(path.join(target, destination), fs.readFileSync(path.join(cache, name)));
  }
  console.log(`Sunrise Dark icon ${fresh ? 'reused' : 'compiled'}; bundle resources prepared.`);
}
