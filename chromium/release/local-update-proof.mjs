#!/usr/bin/env node
// Local qualification of Blanc Beta's in-app updater (no production contact,
// no Developer ID, no Apple service). A build compiled with
// blanc_beta_local_qualification=true reads its feed from the fixed loopback
// address http://127.0.0.1:49262/arm64.xml and accepts only
// http://127.0.0.1:49262/Blanc-Beta-<version>-mac-arm64.dmg (beta_update_policy.h).
//
//   stage  --n APP --next APP --key DIR --work DIR
//     Copies build N to WORK/install, ad-hoc signs both apps (the local proof
//     is unsigned/ad-hoc only), packs N+1 into its DMG and writes three feeds:
//     good (signed with the throwaway key), wrong-key (another key) and
//     tampered (one byte changed after signing).
//   serve  --feed DIR --log FILE          the loopback feed, logging requests
//   run    --work DIR --expect BUILD [--timeout S]
//     Arms Sparkle's scheduled check and silent install for the beta's
//     defaults domain, launches WORK/install's app on a throwaway profile,
//     waits for the update to download, quits the app and reports the build
//     the installed app has afterwards.
//
// The private key never leaves KEY; nothing here prints key bytes.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {spawn, execFileSync} from 'node:child_process';
import {createPrivateKey, createPublicKey, generateKeyPairSync, sign} from 'node:crypto';

const ID = 'me.bnfy.blanc.beta';
const PORT = 49262;
const arg = name => { const i = process.argv.indexOf('--' + name); return i > 0 ? process.argv[i + 1] : undefined; };
const need = name => { const v = arg(name); if (!v) throw Error(`--${name} is required`); return v; };
const plist = (app, key) => execFileSync('/usr/libexec/PlistBuddy', ['-c', `Print :${key}`, path.join(app, 'Contents/Info.plist')], {encoding: 'utf8'}).trim();
const seedKey = seed => createPrivateKey({format: 'der', type: 'pkcs8',
  key: Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), seed])});
const publicOf = key => createPublicKey(key).export({format: 'der', type: 'spki'}).subarray(-32).toString('base64');

function feedXML(version, build, length, signature) {
  const url = `http://127.0.0.1:${PORT}/Blanc-Beta-${version}-mac-arm64.dmg`;
  return `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0" xmlns:sparkle="http://www.andymatuschak.org/xml-namespaces/sparkle">
  <channel>
    <title>Blanc Beta for macOS (arm64), local qualification</title>
    <item>
      <title>Blanc Beta ${version}</title>
      <sparkle:version>${build}</sparkle:version>
      <sparkle:shortVersionString>${version}</sparkle:shortVersionString>
      <sparkle:minimumSystemVersion>13.0</sparkle:minimumSystemVersion>
      <enclosure url="${url}" length="${length}" type="application/octet-stream" sparkle:edSignature="${signature}" />
    </item>
  </channel>
</rss>
`;
}

function stage() {
  const n = need('n'), next = need('next'), keyDir = need('key'), work = need('work');
  fs.mkdirSync(work, {recursive: true, mode: 0o700});
  const install = path.join(work, 'install'), nextCopy = path.join(work, 'next');
  for (const [from, dir] of [[n, install], [next, nextCopy]]) {
    fs.rmSync(dir, {recursive: true, force: true}); fs.mkdirSync(dir, {recursive: true});
    execFileSync('/usr/bin/ditto', [from, path.join(dir, 'Blanc Beta.app')]);
    execFileSync('/usr/bin/codesign', ['--force', '--deep', '--sign', '-', path.join(dir, 'Blanc Beta.app')], {stdio: 'ignore'});
  }
  const app = path.join(nextCopy, 'Blanc Beta.app');
  const version = plist(app, 'CFBundleShortVersionString'), build = plist(app, 'CFBundleVersion');
  const nVersion = plist(path.join(install, 'Blanc Beta.app'), 'CFBundleShortVersionString');
  const name = `Blanc-Beta-${version}-mac-arm64.dmg`;
  const dmg = path.join(work, name);
  fs.rmSync(dmg, {force: true});
  execFileSync('/usr/bin/hdiutil', ['create', '-quiet', '-volname', 'Blanc Beta', '-srcfolder', nextCopy, '-format', 'UDZO', '-ov', dmg]);
  const bytes = fs.readFileSync(dmg);
  const key = seedKey(Buffer.from(fs.readFileSync(path.join(keyDir, 'seed.b64'), 'utf8').trim(), 'base64'));
  const appKey = plist(path.join(install, 'Blanc Beta.app'), 'SUPublicEDKey');
  if (publicOf(key) !== appKey) throw Error('the throwaway key is not the one build N trusts');
  const other = generateKeyPairSync('ed25519').privateKey;
  const tampered = Buffer.from(bytes); tampered[Math.floor(tampered.length / 2)] ^= 0xff;
  const feeds = {
    good: [bytes, sign(null, bytes, key)],
    'wrong-key': [bytes, sign(null, bytes, other)],
    tampered: [tampered, sign(null, bytes, key)],
  };
  for (const [feed, [data, signature]] of Object.entries(feeds)) {
    const dir = path.join(work, 'feed-' + feed);
    fs.rmSync(dir, {recursive: true, force: true}); fs.mkdirSync(dir, {recursive: true});
    fs.writeFileSync(path.join(dir, name), data);
    fs.writeFileSync(path.join(dir, 'arm64.xml'), feedXML(version, build, data.length, signature.toString('base64')));
  }
  console.log(JSON.stringify({from: nVersion, to: version, build, dmg: name, bytes: bytes.length, feeds: Object.keys(feeds)}));
}

function serve() {
  const feed = need('feed'), log = need('log');
  http.createServer((request, response) => {
    const file = path.join(feed, path.basename(decodeURIComponent(new URL(request.url, 'http://x').pathname)));
    const ok = fs.existsSync(file) && fs.statSync(file).isFile();
    fs.appendFileSync(log, `${new Date().toISOString()} ${request.method} ${request.url} ${ok ? 200 : 404} ${request.headers['user-agent'] ?? ''}\n`);
    if (!ok) { response.writeHead(404); response.end(); return; }
    response.writeHead(200, {'content-type': file.endsWith('.xml') ? 'application/rss+xml' : 'application/octet-stream',
      'content-length': fs.statSync(file).size});
    fs.createReadStream(file).pipe(response);
  }).listen(PORT, '127.0.0.1', () => console.log(`serving ${feed} on 127.0.0.1:${PORT}`));
}

async function run() {
  const work = need('work'), expect = need('expect'), timeout = Number(arg('timeout') ?? 300) * 1000;
  const app = path.join(work, 'install', 'Blanc Beta.app');
  const defaults = (...a) => execFileSync('/usr/bin/defaults', ['write', ID, ...a]);
  defaults('SUEnableAutomaticChecks', '-bool', 'YES');
  defaults('SUAutomaticallyUpdate', '-bool', 'YES');
  defaults('SULastCheckTime', '-date', '2020-01-01 00:00:00 +0000');
  const before = plist(app, 'CFBundleVersion');
  const profile = path.join(work, 'profile'); fs.mkdirSync(profile, {recursive: true});
  const browser = spawn(path.join(app, 'Contents/MacOS/Blanc Beta'),
    [`--user-data-dir=${profile}`, '--no-first-run', 'about:blank'], {stdio: 'ignore', detached: true});
  const log = path.join(work, 'server.log');
  const end = Date.now() + timeout;
  const fetched = () => fs.existsSync(log) && /GET \/Blanc-Beta-[^ ]+\.dmg 200/.test(fs.readFileSync(log, 'utf8'));
  while (Date.now() < end && !fetched()) await new Promise(r => setTimeout(r, 1000));
  const downloaded = fetched();
  // Sparkle verifies and prepares the update after the download, then installs it at quit.
  await new Promise(r => setTimeout(r, downloaded ? 20000 : 0));
  try { process.kill(browser.pid, 'SIGTERM'); } catch {}
  let after = before;
  const installEnd = Date.now() + 120000;
  while (Date.now() < installEnd) {
    await new Promise(r => setTimeout(r, 2000));
    try { after = plist(app, 'CFBundleVersion'); } catch { continue; }
    if (after !== before) break;
  }
  console.log(JSON.stringify({before, after, expected: expect, downloaded, installed: after === expect}));
}

const command = process.argv[2];
if (command === 'stage') stage();
else if (command === 'serve') serve();
else if (command === 'run') await run();
else { console.error('usage: local-update-proof.mjs stage|serve|run …'); process.exitCode = 2; }
