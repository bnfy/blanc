// The outbound check's runtime config, pointing at copies the check owns.
// The Prototype is copied too (beta.8, November 20, 2026): the check's
// controls relaunch it for minutes, and a rebuild of the shared output by
// another session in that time changed the files under the running check and
// failed it. With its own copy, a rebuild can't reach the check.
//
//   node local-config.mjs <runtime-config.json> <dir>
// prints {"app": "<the .app to copy>", "config": {...}}; setup.sh copies the
// app to <dir>/prototype and writes the config.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

/** The .app bundle a path inside it belongs to. */
export function appBundleOf(file) {
  const at = file.indexOf('.app/');
  if (at < 0) throw Error('Not inside an .app bundle: ' + file);
  return file.slice(0, at + 4);
}

/** The config for the check in `dir`, and the app setup.sh must copy there. */
export function outboundConfig(c, dir) {
  const app = appBundleOf(c.executable);
  if (appBundleOf(c.framework) !== app) throw Error('The executable and framework are in different apps: ' + app + ', ' + c.framework);
  const copy = path.join(dir, 'prototype', path.basename(app));
  const moved = file => copy + file.slice(app.length);
  return {app, config: {...c, evidence: path.join(dir, 'results'), blockerAssets: path.join(dir, 'blocker-assets'),
    executable: moved(c.executable), framework: moved(c.framework)}};
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const [config, dir] = process.argv.slice(2);
  if (!config || !dir) throw Error('Usage: local-config.mjs <runtime-config.json> <dir>');
  console.log(JSON.stringify(outboundConfig(JSON.parse(fs.readFileSync(config, 'utf8')), dir)));
}
