#!/usr/bin/env node
// Evidence for the official-hooks-absent gate: no test hook is reachable in
// a packaged Blanc Beta.
//
//   node chromium/release/hooks-evidence.mjs RELEASE.json APP EVIDENCE
//
// Static: no Mach-O file in the app carries the name of a test switch (the
// code that reads one is compiled out with ENABLE_BLANC_TEST_HOOKS and the
// research hooks, and its strings go with it). Runtime: the beta, launched
// with every test switch pointed at a loopback collector, a disk-assets
// folder whose pages would call that collector and an empty test data home,
// must open its page normally while the collector hears nothing but the page
// and the data home stays empty. The hash-pinned bundle overrides
// (--blanc-blocker-assets, --blanc-sync-assets) are not hooks: they can only
// supply the bytes the app already carries.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {check, reason, sha256, validateRelease} from './policy.mjs';
import {plist} from './sbom.mjs';
import {launchBeta} from './launch-beta.mjs';

// Every test or research switch the fork's code reads, plus the test-only
// first-run, version, telemetry and data-home companions of --blanc-test.
export const TEST_SWITCHES = ['blanc-test', 'blanc-test-first-run', 'blanc-test-version', 'blanc-test-browser-home',
  'blanc-test-telemetry-host', 'blanc-test-platform', 'blanc-prototype-assets', 'blanc-sync-endpoint',
  'blanc-sync-test-bad-bundle', 'blanc-blocker-test-bad-bundle', 'blanc-blocker-log',
  'blanc-ubo-document-start', 'blanc-ubo-component-probe', 'blanc-ubo-reload-probe'];

// Where NAME appears in BYTES as a whole C string (NUL on both sides).
export function hasCString(bytes, name) {
  const needle = Buffer.from(`\0${name}\0`);
  return bytes.indexOf(needle) !== -1;
}

export function machOFiles(app) {
  const out = [];
  const walk = dir => {
    for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
      const full = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) { walk(full); continue; }
      const fd = fs.openSync(full, 'r'), head = Buffer.alloc(4);
      fs.readSync(fd, head, 0, 4, 0); fs.closeSync(fd);
      if ([0xfeedfacf, 0xcffaedfe, 0xcafebabe, 0xbebafeca].includes(head.readUInt32BE(0))) out.push(full);
    }
  };
  walk(app);
  return out;
}

export function staticScan(app) {
  const found = [];
  const files = machOFiles(app);
  for (const file of files) {
    const bytes = fs.readFileSync(file);
    for (const name of TEST_SWITCHES) if (hasCString(bytes, name)) found.push({file: path.relative(app, file), name});
  }
  return {binaries: files.length, found};
}

// A disk-assets folder whose every Island page reports to the collector.
export function diskAssets(dir, port) {
  for (const page of ['host.html', 'overlay.html', 'index.html', 'pages/newtab.html']) {
    fs.mkdirSync(path.dirname(path.join(dir, page)), {recursive: true});
    fs.writeFileSync(path.join(dir, page), `<!doctype html><img src="http://127.0.0.1:${port}/disk-assets-served">`);
  }
}

export async function collect(r, app, {run = launchBeta, scan = staticScan} = {}) {
  validateRelease(r, {allowLocalQualification: true});
  const failures = [];
  const info = plist(path.join(app, 'Contents/Info.plist'));
  check(info, 'the app has no readable Info.plist');
  if (String(info.CFBundleVersion) !== String(r.build)) failures.push('the app is not this release\'s build');
  const statics = scan(app);
  for (const f of statics.found) failures.push(`${f.file} names the test switch --${f.name}`);
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-hooks-ev-'));
  const testHome = path.join(home, 'test-browser-home'), assets = path.join(home, 'disk-assets');
  fs.mkdirSync(testHome);
  let runtime;
  try {
    const result = await run({app, home, args: port => {
      diskAssets(assets, port);
      const collector = `http://127.0.0.1:${port}`;
      return ['--blanc-test', '--blanc-test-first-run', '--blanc-test-version=9.9.9', `--blanc-test-browser-home=${testHome}`,
        `--blanc-test-telemetry-host=${collector}/telemetry`, '--blanc-test-platform=linux', `--blanc-prototype-assets=${assets}`,
        `--blanc-sync-endpoint=${collector}/sync`, '--blanc-ubo-document-start', '--blanc-ubo-component-probe', '--blanc-ubo-reload-probe',
        `--blanc-blocker-log=${path.join(home, 'blocker.log')}`];
    }});
    const heard = result.requests.filter(q => !/ \/(favicon\.ico)?$/.test(q));
    const pageLoaded = result.requests.some(q => / \/$/.test(q));
    const homeEntries = fs.readdirSync(testHome);
    const blockerLog = fs.existsSync(path.join(home, 'blocker.log'));
    runtime = {pageLoaded, quitOnItsOwn: result.quitOnItsOwn, collectorHeard: heard, testHomeEntries: homeEntries, blockerLogWritten: blockerLog};
    if (!pageLoaded) failures.push('with the test switches the beta did not open its page');
    for (const q of heard) failures.push(`a test switch took effect: the collector heard ${q.split(' ').slice(1).join(' ')}`);
    if (homeEntries.length) failures.push('a test switch took effect: the test data home was written');
    if (blockerLog) failures.push('a test switch took effect: the blocker log was written');
  } finally { fs.rmSync(home, {recursive: true, force: true}); }
  return {schema: 1, gate: 'official-hooks-absent', status: failures.length ? 'fail' : 'pass', failures,
    release: {version: r.version, build: r.build, sourceCommit: r.sourceCommit, inputDigest: r.inputDigest},
    app: {name: path.basename(app), bundleVersion: info.CFBundleVersion},
    static: {binaries: statics.binaries, switches: TEST_SWITCHES, found: statics.found}, runtime,
    notHooks: ['--blanc-blocker-assets and --blanc-sync-assets supply only the hash-pinned bundles the app embeds']};
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const [releaseFile, app, evidence] = process.argv.slice(2);
    check(releaseFile && app && evidence && process.argv.length === 5, 'usage: hooks-evidence.mjs RELEASE.json APP EVIDENCE');
    const result = await collect(JSON.parse(fs.readFileSync(releaseFile)), path.resolve(app));
    fs.writeFileSync(evidence, JSON.stringify(result, null, 2) + '\n', {flag: 'wx'});
    console.log(JSON.stringify({status: result.status, failures: result.failures, evidenceSHA256: sha256(fs.readFileSync(evidence))}));
    if (result.status !== 'pass') process.exitCode = 1;
  } catch (error) { console.error(`Hooks evidence failed: ${reason(error)}`); process.exitCode = 1; }
}
