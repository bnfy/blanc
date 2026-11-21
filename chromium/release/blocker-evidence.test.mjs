// The blocker-payload evidence passes only when the packaged engine is the
// pinned one, ordinary and private windows (each proved by its cookie) load
// the page with every listed request blocked, and a changed or missing
// engine lets nothing through. A fake launcher stands in for the browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {ROOT, PROBES, ALLOWED, judge, collect, staticChecks, page} from './blocker-evidence.mjs';
import {BLOCKER_ENGINE} from './verify.mjs';
import {sha256} from './policy.mjs';

const release = JSON.parse(fs.readFileSync(new URL('./fixtures/release.json', import.meta.url)));
const PAGE = 'localhost:1 /', OK = `localhost:1 ${ALLOWED}`, ADS = PROBES.map(p => `${p.host}:1 ${p.path}`);

// A repository and app pinned to a stand-in engine.
function world() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-blocker-ev-'));
  const root = path.join(base, 'repo'), app = path.join(base, 'Blanc Beta.app');
  const copy = rel => { fs.mkdirSync(path.dirname(path.join(root, rel)), {recursive: true}); fs.copyFileSync(path.join(ROOT, rel), path.join(root, rel)); };
  ['adblock/sources/pinned.json', 'adblock/sources/easylist.txt', 'chromium/blanc/third_party/blocker/bundle.json',
    ...fs.readdirSync(path.join(ROOT, 'chromium/blanc/third_party/blocker/licenses')).map(f => `chromium/blanc/third_party/blocker/licenses/${f}`)].forEach(copy);
  const engine = 'stand-in engine\n';
  fs.mkdirSync(path.join(root, 'chromium/blanc/services/blocker'), {recursive: true});
  fs.writeFileSync(path.join(root, 'chromium/blanc/services/blocker/bundle_hash.h'), `inline constexpr char kBlancBlockerBundleSha256[] = "${sha256(engine)}";\n`);
  const bundleFile = path.join(root, 'chromium/blanc/third_party/blocker/bundle.json');
  fs.writeFileSync(bundleFile, JSON.stringify({...JSON.parse(fs.readFileSync(bundleFile)), bundleSha256: sha256(engine)}));
  fs.mkdirSync(path.dirname(path.join(app, BLOCKER_ENGINE)), {recursive: true}); fs.writeFileSync(path.join(app, BLOCKER_ENGINE), engine);
  fs.mkdirSync(path.join(app, 'Contents/MacOS')); fs.writeFileSync(path.join(app, 'Contents/MacOS/Blanc Beta'), 'binary');
  fs.writeFileSync(path.join(app, 'Contents/Info.plist'), `<?xml version="1.0" encoding="UTF-8"?>\n<plist version="1.0"><dict><key>CFBundleVersion</key><string>${release.build}</string></dict></plist>\n`);
  return {base, root, app, done: () => fs.rmSync(base, {recursive: true, force: true})};
}
// A fake browser: answers per scenario with a request log and cookie state.
function runner(overrides = {}) {
  const calls = [];
  const run = async (app, args = []) => {
    calls.push({app, args});
    const name = args.includes('--incognito') ? 'private' : /changed\.app$/.test(app) ? 'changed' : /missing\.app$/.test(app) ? 'missing' : 'ordinary';
    const defaults = {ordinary: {requests: [PAGE, OK], cookieSaved: true}, private: {requests: [PAGE, OK], cookieSaved: false},
      changed: {requests: [], cookieSaved: false}, missing: {requests: [], cookieSaved: false}};
    return overrides[name] ?? defaults[name];
  };
  return {calls, run, makeVariant: (app, dir, change) => path.join(dir, `${change}.app`)};
}

test('a scenario passes only on the outcome it expects, in the window it names', () => {
  assert.equal(judge('filters', {requests: [PAGE, OK], cookieSaved: true}, {window: 'ordinary'}).pass, true);
  assert.equal(judge('filters', {requests: [PAGE, OK, ADS[0]], cookieSaved: true}).pass, false, 'a listed request got through');
  assert.equal(judge('filters', {requests: [PAGE], cookieSaved: true}).pass, false, 'the allowed image never loaded');
  assert.equal(judge('filters', {requests: [PAGE, OK], cookieSaved: true}, {window: 'private'}).pass, false, 'a private window saved the cookie');
  assert.equal(judge('filters', {requests: [PAGE, OK], cookieSaved: false}, {window: 'ordinary'}).pass, false, 'no proof it was an ordinary window');
  assert.equal(judge('stops', {requests: [], cookieSaved: false}).pass, true);
  assert.equal(judge('stops', {requests: [PAGE], cookieSaved: false}).pass, true, 'the page may arrive while nothing it loads does');
  assert.equal(judge('stops', {requests: [PAGE, OK]}).pass, false, 'pages ran without a working blocker');
  for (const probe of PROBES) assert.ok(page(1).includes(`${probe.host}:1${probe.path}`));
});

test('the evidence passes a beta that blocks everywhere and stops without its engine', async () => {
  const w = world(), fake = runner();
  const result = await collect(release, w.app, {root: w.root, run: fake.run, makeVariant: fake.makeVariant});
  assert.equal(result.status, 'pass', result.failures.join('; '));
  assert.deepEqual(Object.keys(result.scenarios), ['ordinary', 'private', 'changedEngine', 'missingEngine']);
  assert.ok(fake.calls.every(c => !c.args.some(a => a.startsWith('--blanc-blocker-assets'))), 'no development switch');
  assert.equal(result.blocker.engineSHA256, result.blocker.pinnedSHA256);
  w.done();
});

test('the evidence fails a leak, a wrong window, a fail-open engine or a wrong payload', async () => {
  for (const [override, pattern] of [
    [{ordinary: {requests: [PAGE, OK, ADS[1]], cookieSaved: true}}, /ordinary: listed requests got through/],
    [{private: {requests: [PAGE, OK], cookieSaved: true}}, /private: it did not run in a private window/],
    [{changed: {requests: [PAGE, OK], cookieSaved: false}}, /changedEngine: requests went through/],
    [{missing: {requests: [PAGE, OK, ADS[0]], cookieSaved: false}}, /missingEngine: listed requests got through/],
  ]) {
    const w = world(), fake = runner(override);
    const result = await collect(release, w.app, {root: w.root, run: fake.run, makeVariant: fake.makeVariant});
    assert.equal(result.status, 'fail'); assert.match(result.failures.join('\n'), pattern);
    w.done();
  }
  const w = world();
  fs.appendFileSync(path.join(w.app, BLOCKER_ENGINE), 'x');
  assert.match(staticChecks(release, w.app, {root: w.root}).failures.join('\n'), /not the pinned bundle/);
  fs.rmSync(path.join(w.app, BLOCKER_ENGINE));
  assert.match(staticChecks(release, w.app, {root: w.root}).failures.join('\n'), /embeds no blocker engine/);
  fs.writeFileSync(path.join(w.root, 'adblock/sources/easylist.txt'), '! empty\n');
  assert.match(staticChecks(release, w.app, {root: w.root}).failures.join('\n'), /not on the pinned EasyList/);
  w.done();
});
