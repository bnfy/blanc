// Compile the shipping Mac colorways under the names used by the Chromium beta.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import icons from '../../../../scripts/after-pack-app-icons.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const work = await fs.mkdtemp(path.join(os.tmpdir(), 'blanc-beta-icons-'));
const hash = async file => crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex');
try {
  const packages = await icons.writeMacIconPackages(work, { SunriseGold: 'BlancDK' });
  const out = path.join(work, 'compiled');
  await fs.mkdir(out);
  execFileSync('xcrun', ['actool', ...packages, '--compile', out, '--output-partial-info-plist',
    path.join(out, 'info.plist'), '--app-icon', 'BlancDK', '--include-all-app-icons',
    '--target-device', 'mac', '--minimum-deployment-target', '13.0', '--platform', 'macosx'], { stdio: 'inherit' });
  const manifestFile = path.join(here, 'icon-manifest.json');
  const manifest = JSON.parse(await fs.readFile(manifestFile));
  delete manifest.shipping;
  delete manifest.shippingRef;
  manifest.note = 'Compiled from this checkout’s Mac Icon Composer packages. BlancDK is the beta’s Sunrise Gold default.';
  manifest.actool = execFileSync('xcrun', ['actool', '--version', '--output-format', 'human-readable-text'], { encoding: 'utf8' }).match(/short-bundle-version: (.+)/)[1].trim();
  for (const pkg of packages) manifest.iconJson[path.basename(pkg, '.icon')] = await hash(path.join(pkg, 'icon.json'));
  for (const [file, source] of [['Assets.car', 'Assets.car'], ['app.icns', 'BlancDK.icns']]) {
    await fs.copyFile(path.join(out, source), path.join(here, file));
    manifest.outputs[file] = await hash(path.join(here, file));
  }
  await fs.writeFile(manifestFile, JSON.stringify(manifest, null, 2) + '\n');
  execFileSync(process.execPath, [path.join(here, 'render-dock-icons.mjs'), work], { stdio: 'inherit' });
} finally {
  await fs.rm(work, { recursive: true, force: true });
}
