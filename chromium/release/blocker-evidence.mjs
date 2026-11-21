#!/usr/bin/env node
// Evidence for the blocker-payload gate: the packaged beta carries the pinned
// blocker and uses it with no development switch, in ordinary and private
// windows, and a changed or missing engine stops pages instead of letting
// them through unfiltered.
//
//   node chromium/release/blocker-evidence.mjs RELEASE.json APP EVIDENCE
//
// Static: the embedded engine is the pinned bundle, its committed provenance
// matches the pinned filter lists, the probe hosts are on those lists, and
// the app is this release's build. Runtime: the app (and two copies of it,
// one with a changed engine, one with none) opens a page from a loopback
// server on a throwaway profile, with every host but the loopback ones
// resolving to nothing, so nothing leaves the machine. The page loads one
// allowed image and two requests EasyList blocks; the server's log says what
// got through. Copies are made only of an ad-hoc signed candidate (a changed
// resource can't be tested on a sealed, signed app); the evidence records
// which. It writes the evidence whatever the result and exits 1 on a failure.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {spawn, spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {check, reason, sha256, validateRelease} from './policy.mjs';
import {BLOCKER_ENGINE, pinnedBlockerBundle} from './verify.mjs';
import {blockerBundle} from './fork-notice.mjs';
import {plist, readRegular} from './sbom.mjs';

export const ROOT = path.resolve(import.meta.dirname, '../..');
export const PRODUCT = 'Blanc Beta';
// Each probe host with the EasyList rule that lists it.
export const PROBES = [
  {host: 'ad.doubleclick.net', path: '/ddm/ad.js', tag: 'script', rule: '||ad.doubleclick.net^'},
  {host: 'pagead2.googlesyndication.com', path: '/pagead/show_ads.gif', tag: 'img', rule: '||googlesyndication.com/pagead/'},
];
export const ALLOWED = '/ok.gif';
export const COOKIE = 'blanc_blocker_evidence';
export const COOKIE_COMMIT_MS = 35000;

export function staticChecks(r, app, {root = ROOT} = {}) {
  const failures = [], fail = m => failures.push(m);
  const engine = readRegular(path.join(app, BLOCKER_ENGINE));
  const pinned = pinnedBlockerBundle(root);
  if (!engine) fail('the app embeds no blocker engine');
  else if (sha256(engine) !== pinned) fail('the embedded blocker engine is not the pinned bundle');
  let bundle = null;
  try { bundle = blockerBundle(root); } catch (error) { fail(`blocker provenance: ${reason(error)}`); }
  const lists = fs.readFileSync(path.join(root, 'adblock/sources/easylist.txt'), 'utf8').split('\n');
  for (const probe of PROBES) if (!lists.includes(probe.rule)) fail(`probe host is not on the pinned EasyList: ${probe.host}`);
  const info = plist(path.join(app, 'Contents/Info.plist'));
  if (!info) fail('the app has no readable Info.plist');
  else if (String(info.CFBundleVersion) !== String(r.build)) fail('the app is not this release\'s build');
  const executable = readRegular(path.join(app, 'Contents/MacOS', PRODUCT));
  if (!executable) fail('the app has no executable');
  return {failures, engineSHA256: engine ? sha256(engine) : null, pinnedSHA256: pinned,
    engineVersion: bundle?.engineVersion ?? null, filtersSHA256: bundle?.filters.combinedSha256 ?? null,
    bundleVersion: info?.CFBundleVersion ?? null, executableSHA256: executable ? sha256(executable) : null};
}

export function page(port) {
  return `<!doctype html><title>blocker evidence</title>
<img src="http://localhost:${port}${ALLOWED}">
${PROBES.map(p => p.tag === 'script' ? `<script src="http://${p.host}:${port}${p.path}"></script>` : `<img src="http://${p.host}:${port}${p.path}">`).join('\n')}`;
}

// What a scenario's request log means. "filters": the page and the allowed
// image load, no listed request arrives. "stops": the blocker can't decide,
// so nothing past the page itself arrives (the allowed image is held too).
export function judge(expect, {requests, cookieSaved}, {window} = {}) {
  const leaked = requests.filter(r => PROBES.some(p => r.startsWith(`${p.host}:`)));
  const page = requests.some(r => / \/$/.test(r)), allowed = requests.some(r => r.endsWith(ALLOWED));
  // An ordinary window must have saved the page's cookie and a private one
  // must not, or the scenario didn't run in the window it names.
  const windowOK = window === undefined || (window === 'private' ? !cookieSaved : cookieSaved);
  const pass = (expect === 'filters' ? page && allowed && leaked.length === 0 : !allowed && leaked.length === 0) && windowOK;
  return {expect, pass, pageLoaded: page, allowedLoaded: allowed, leaked, ...(window ? {window, cookieSaved} : {})};
}

// Launches APP on a throwaway profile at the probe page and returns the
// server's request log. Loopback only; the browser is always killed.
export async function launch(app, extraArgs = [], {settle = 5000, timeout = 45000} = {}) {
  const requests = [];
  const server = http.createServer((req, res) => {
    requests.push(`${req.headers.host} ${req.url}`);
    // The cookie shows which kind of window loaded the page: an ordinary one
    // saves it to the profile, a private one never does.
    if (req.url === '/') { res.writeHead(200, {'content-type': 'text/html', 'set-cookie': `${COOKIE}=1; Max-Age=3600; Path=/`}); res.end(page(server.address().port)); }
    else { res.writeHead(200, {'content-type': 'image/gif'}); res.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-blocker-evidence-'));
  const rules = [...PROBES.map(p => `MAP ${p.host} 127.0.0.1`), 'MAP * ~NOTFOUND', 'EXCLUDE localhost', 'EXCLUDE 127.0.0.1'].join(', ');
  const browser = spawn(path.join(app, 'Contents/MacOS', PRODUCT), [`--user-data-dir=${profile}`, '--no-first-run',
    '--no-default-browser-check', `--host-resolver-rules=${rules}`, ...extraArgs, `http://localhost:${port}/`], {stdio: 'ignore'});
  try {
    const until = Date.now() + timeout;
    while (Date.now() < until && !requests.some(r => r.endsWith(ALLOWED))) await new Promise(r => setTimeout(r, 500));
    await new Promise(r => setTimeout(r, settle));
  } finally {
    browser.kill('SIGTERM');
    const exited = new Promise(r => browser.once('exit', r));
    await Promise.race([exited, new Promise(r => setTimeout(r, 10000))]);
    if (browser.exitCode === null && browser.signalCode === null) browser.kill('SIGKILL');
    server.close();
  }
  // Chromium keeps the cookie store in Default/Network/Cookies (older: Default/Cookies).
  const cookieSaved = ['Network/Cookies', 'Cookies'].some(file => readRegular(path.join(profile, 'Default', file))?.includes(COOKIE));
  fs.rmSync(profile, {recursive: true, force: true});
  return {requests, cookieSaved};
}

// A clone of APP (APFS copy-on-write) with its engine changed or removed.
export function variant(app, dir, change) {
  check(spawnSync('/usr/bin/codesign', ['-dv', app], {encoding: 'utf8'}).stderr.includes('Signature=adhoc'),
    'failure copies need an ad-hoc signed candidate');
  const copy = path.join(dir, `${change}.app`);
  check(spawnSync('/bin/cp', ['-Rc', app, copy]).status === 0, 'could not copy the app');
  const engine = path.join(copy, BLOCKER_ENGINE);
  if (change === 'missing') fs.rmSync(engine);
  else { const bytes = fs.readFileSync(engine); bytes[bytes.length - 1] ^= 1; fs.writeFileSync(engine, bytes); }
  return copy;
}

export async function collect(r, app, {root = ROOT, run = launch, makeVariant = variant} = {}) {
  validateRelease(r, {allowLocalQualification: true});
  const statics = staticChecks(r, app, {root});
  const scenarios = {};
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-blocker-variants-'));
  try {
    // Chromium writes cookies to disk about every 30 seconds, so the window
    // checks wait past that before quitting.
    scenarios.ordinary = judge('filters', await run(app, [], {settle: COOKIE_COMMIT_MS}), {window: 'ordinary'});
    scenarios.private = judge('filters', await run(app, ['--incognito'], {settle: COOKIE_COMMIT_MS}), {window: 'private'});
    for (const change of ['changed', 'missing']) scenarios[`${change}Engine`] = judge('stops', await run(makeVariant(app, work, change)));
  } finally { fs.rmSync(work, {recursive: true, force: true}); }
  const failures = [...statics.failures, ...Object.entries(scenarios).filter(([, s]) => !s.pass).map(([name, s]) =>
    s.leaked.length ? `${name}: listed requests got through` : s.expect === 'stops' ? `${name}: requests went through without a working blocker`
      : !(s.pageLoaded && s.allowedLoaded) ? `${name}: the page or its allowed image did not load` : `${name}: it did not run in a ${s.window} window`)];
  return {schema: 1, gate: 'blocker-payload', status: failures.length ? 'fail' : 'pass', failures,
    release: {version: r.version, build: r.build, sourceCommit: r.sourceCommit, inputDigest: r.inputDigest},
    app: {name: path.basename(app), bundleVersion: statics.bundleVersion, executableSHA256: statics.executableSHA256},
    blocker: {engineSHA256: statics.engineSHA256, pinnedSHA256: statics.pinnedSHA256, engineVersion: statics.engineVersion, filtersSHA256: statics.filtersSHA256},
    method: {switches: 'none (no --blanc-blocker-assets, no disk assets)', network: 'loopback only; every other host resolves to nothing',
      probes: PROBES.map(p => ({host: p.host, rule: p.rule})), failureCopies: 'APFS clones of the ad-hoc signed candidate'},
    scenarios};
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const [releaseFile, app, evidence] = process.argv.slice(2);
    check(releaseFile && app && evidence && process.argv.length === 5, 'usage: blocker-evidence.mjs RELEASE.json APP EVIDENCE');
    const result = await collect(JSON.parse(fs.readFileSync(releaseFile)), path.resolve(app));
    fs.writeFileSync(evidence, JSON.stringify(result, null, 2) + '\n', {flag: 'wx'});
    console.log(JSON.stringify({status: result.status, failures: result.failures, evidenceSHA256: sha256(fs.readFileSync(evidence))}));
    if (result.status !== 'pass') process.exitCode = 1;
  } catch (error) { console.error(`Blocker evidence failed: ${reason(error)}`); process.exitCode = 1; }
}
