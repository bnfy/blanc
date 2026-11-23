const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

const ROOT = path.join(__dirname, '../..');
const SCRIPT_PATH = path.join(ROOT, 'scripts/ios-changelog.mjs');
const LISTING = fs.readFileSync(path.join(ROOT, 'docs/ios/app-store-listing.md'), 'utf8');
const FIXTURE = JSON.parse(fs.readFileSync(path.join(ROOT, 'test/fixtures/ios-app-store-versions.json'), 'utf8'));
let ios;

test.before(async () => { ios = await import(pathToFileURL(SCRIPT_PATH)); });

const text = (spans) => spans.map((span) => span.value).join('');
const build = (overrides = {}) => ios.buildIosEntries({
  versions: FIXTURE.versions,
  localizations: FIXTURE.localizations,
  existing: [],
  today: '2026-11-24',
  ...overrides,
});

test('• bullets become one list with wrapped lines joined', () => {
  const sections = ios.parseAppStoreNotes(ios.notesFromListing(LISTING, '1.1'));
  assert.equal(sections.length, 1);
  assert.equal(sections[0].blocks.length, 1);
  const [list] = sections[0].blocks;
  assert.equal(list.type, 'list');
  assert.equal(list.items.length, 3);
  assert.match(text(list.items[0].spans), /^A new Island: smaller, shaped like Blanc's Island on the Mac, and only as wide as what's in it/);
  assert.ok(list.items.every((item) => !text(item.spans).includes('•')));
});

test('plain text becomes a paragraph', () => {
  const sections = ios.parseAppStoreNotes(ios.notesFromListing(LISTING, '1.0'));
  assert.equal(sections.length, 1);
  assert.deepEqual(sections[0].blocks.map((block) => block.type), ['paragraph']);
  assert.match(text(sections[0].blocks[0].spans), /^The first release of Blanc for iPhone: pair with Blanc on your computer, see its tabs/);
});

test('devices follow the 1.0.3 rule', () => {
  assert.deepEqual(ios.iosDevices('1.0'), ['iphone']);
  assert.deepEqual(ios.iosDevices('1.0.2'), ['iphone']);
  assert.deepEqual(ios.iosDevices('1.0.3'), ['iphone', 'ipad']);
  assert.deepEqual(ios.iosDevices('1.0.4'), ['iphone', 'ipad']);
  assert.deepEqual(ios.iosDevices('1.1'), ['iphone', 'ipad']);
  assert.deepEqual(ios.iosDevices('2.0'), ['iphone', 'ipad']);
});

test('only versions on sale become entries, from en-US', () => {
  const entries = build({ dates: { '1.0.3': '2026-11-12' } });
  assert.deepEqual(entries.map((entry) => entry.version), ['1.0.4', '1.0.3']);
  const [newest] = entries;
  assert.equal(newest.product, 'ios');
  assert.equal(newest.tag, 'ios-1.0.4');
  assert.equal(newest.anchor, 'ios-1-0-4');
  assert.equal(newest.url, 'https://apps.apple.com/app/id6828027794');
  assert.deepEqual(newest.devices, ['iphone', 'ipad']);
  assert.deepEqual(newest.sections[0].blocks[0].items.map((item) => text(item.spans)), ['A new Start Page.', 'Hold a shortcut to pin it.']);
});

test('an existing entry keeps its date and refuses changed text', () => {
  const [first] = build({ dates: { '1.0.4': '2026-11-22', '1.0.3': '2026-11-12' } });
  assert.equal(first.machineDate, '2026-11-22');
  const again = build({ existing: [first], today: '2026-12-01', dates: { '1.0.3': '2026-11-12' } });
  assert.equal(again[0].publishedAt, first.publishedAt);

  const edited = structuredClone(FIXTURE.localizations);
  edited['v-on-sale'][1].attributes.whatsNew = '• Something else.';
  assert.throws(() => build({ localizations: edited, existing: [first], dates: { '1.0.3': '2026-11-12' } }), /--force/);
  const forced = build({ localizations: edited, existing: [first], force: true, dates: { '1.0.3': '2026-11-12' } });
  assert.equal(text(forced[0].sections[0].blocks[0].items[0].spans), 'Something else.');
  assert.equal(forced[0].publishedAt, first.publishedAt);
});

test("a new version on sale takes today's date", () => {
  const [entry] = build({ dates: { '1.0.3': '2026-11-12' } });
  assert.equal(entry.machineDate, '2026-11-24');
  assert.equal(entry.humanDate, 'November 24, 2026');
});

test('the JWT is ES256 with the App Store audience', () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const p8 = privateKey.export({ type: 'pkcs8', format: 'pem' });
  const token = ios.appStoreJwt({ keyId: 'KEY123', issuerId: 'issuer-1', p8, now: 1_800_000_000 });
  const [header, payload, signature] = token.split('.');
  const decode = (part) => JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
  assert.deepEqual(decode(header), { alg: 'ES256', kid: 'KEY123', typ: 'JWT' });
  const claims = decode(payload);
  assert.equal(claims.iss, 'issuer-1');
  assert.equal(claims.aud, 'appstoreconnect-v1');
  assert.equal(claims.iat, 1_800_000_000);
  assert.ok(claims.exp - claims.iat <= 1200 && claims.exp > claims.iat);
  assert.ok(crypto.verify('sha256', Buffer.from(`${header}.${payload}`), { key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(signature, 'base64url')));
});

test('release text is typed spans, never markup', () => {
  const sections = ios.parseAppStoreNotes('• Safe <script>alert(1)</script> text.');
  const [item] = sections[0].blocks[0].items;
  assert.deepEqual(item.spans, [{ type: 'text', value: 'Safe <script>alert(1)</script> text.' }]);
});

test('a version on sale with no text and no listing fallback is refused', () => {
  const empty = structuredClone(FIXTURE.localizations);
  empty['v-on-sale'] = [];
  assert.throws(() => build({ localizations: empty, dates: { '1.0.3': '2026-11-12' } }), /1\.0\.4/);
});
