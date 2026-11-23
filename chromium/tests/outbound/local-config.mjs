// The outbound check's runtime config, pointing at copies the check owns.
// The Prototype is copied too (beta.8, November 20, 2026): the check's
// controls relaunch it for minutes, and a rebuild of the shared output by
// another session in that time changed the files under the running check and
// failed it. With its own copy, a rebuild can't reach the check.
//
//   node local-config.mjs <runtime-config.json> <dir>
// prints {"app": "<the .app to copy>", "config": {...}}; setup.sh copies the
// app to <dir>/prototype and writes the config.
//   node local-config.mjs --check <runtime-config.json>
// checks the files a config names still have its hashes.
// Both refuse a config whose hashes no longer match its files: a rebuild
// after the config was written (2026-11-23) left the controls failing with
// "Candidate identity mismatch" ten minutes into the run.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {candidateIdentityFiles} from '../lib/platform.mjs';

/** Throws unless every file the config pins still has its SHA-256. */
export function checkIdentity(c, digest = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')) {
  for (const [file, sha256] of candidateIdentityFiles(c)) {
    if (digest(file) !== sha256) throw Error(`The runtime config doesn't match ${file}; it changed since the config was written (a rebuild?). Write the config again from the current build.`);
  }
}

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
  const args = process.argv.slice(2);
  if (args[0] === '--check' && args.length === 2) checkIdentity(JSON.parse(fs.readFileSync(args[1], 'utf8')));
  else {
    const [config, dir] = args;
    if (!config || !dir) throw Error('Usage: local-config.mjs <runtime-config.json> <dir> | --check <runtime-config.json>');
    const c = JSON.parse(fs.readFileSync(config, 'utf8'));
    checkIdentity(c);
    console.log(JSON.stringify(outboundConfig(c, dir)));
  }
}
