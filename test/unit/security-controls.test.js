'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '../..');
const read = (name) => fs.readFileSync(path.join(ROOT, name), 'utf8');

test('network/data inventory is complete enough to act as a release drift guard', () => {
  const inventory = JSON.parse(read('security/network-data-inventory.json'));
  assert.equal(inventory.schemaVersion, 1);
  assert.equal(
    inventory.principles.freshProfileNetworkChoices,
    'must-be-saved-before-first-send'
  );
  assert.equal(inventory.principles.blockerInputs, 'bundled-and-hash-verified');
  assert.ok(inventory.flows.length >= 12);
  const ids = new Set();
  for (const flow of inventory.flows) {
    assert.match(flow.id, /^[a-z0-9-]+$/);
    assert.equal(ids.has(flow.id), false, `duplicate flow ${flow.id}`);
    ids.add(flow.id);
    assert.ok(['desktop', 'website'].includes(flow.surface));
    assert.ok(typeof flow.trigger === 'string' && flow.trigger.length > 3);
    assert.ok(Array.isArray(flow.data) && flow.data.length > 0);
    assert.ok(Array.isArray(flow.code) && flow.code.length > 0);
    for (const source of flow.code) {
      assert.equal(fs.existsSync(path.join(ROOT, source)), true, `${flow.id}: missing ${source}`);
    }
  }
  for (const id of ['profile-sync', 'supporter-activation', 'newsletter']) {
    assert.equal(inventory.flows.find((flow) => flow.id === id)?.default, 'off', id);
  }
  assert.match(
    inventory.flows.find((flow) => flow.id === 'search-suggestions')?.default ?? '',
    /presented on/
  );
  assert.match(
    inventory.flows.find((flow) => flow.id === 'launch-usage-ping')?.default ?? '',
    /presented on/
  );
  assert.match(
    inventory.flows.find((flow) => flow.id === 'website-analytics')?.default ?? '',
    /restricted cookieless/
  );
});

test('public site ships baseline browser security headers and disclosure metadata', () => {
  const headers = read('site/public/_headers');
  for (const required of [
    "default-src 'self'", "object-src 'none'", "frame-ancestors 'none'",
    "base-uri 'self'", 'Strict-Transport-Security:',
    'X-Content-Type-Options: nosniff', 'Referrer-Policy:',
    'Permissions-Policy:', 'Cross-Origin-Opener-Policy: same-origin',
  ]) assert.match(headers, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

  const securityTxt = read('site/public/.well-known/security.txt');
  assert.match(securityTxt, /^Contact: mailto:support@blancbrowser\.com$/m);
  assert.match(securityTxt, /^Expires: 20\d\d-/m);
  assert.match(securityTxt, /^Policy: https:\/\/github\.com\/bnfy\/blanc\/security\/policy$/m);
});

test('privacy-facing defaults, hardened Electron fuses, and dependency surface do not regress', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.dependencies?.['@1password/sdk'], undefined);
  assert.equal(pkg.build?.protocols?.some((entry) => entry.schemes?.includes('file')), false);
  assert.deepEqual(pkg.build.electronFuses, {
    runAsNode: false,
    enableCookieEncryption: true,
    enableNodeOptionsEnvironmentVariable: false,
    enableNodeCliInspectArguments: false,
    enableEmbeddedAsarIntegrityValidation: true,
    onlyLoadAppFromAsar: true,
    loadBrowserProcessSpecificV8Snapshot: false,
    grantFileProtocolExtraPrivileges: false,
  });

  const schema = JSON.parse(read('settings-schema/schema.json'));
  assert.equal(schema.defaults.searchSuggestions, true);
  assert.equal(schema.defaults.usagePing, true);
  assert.equal(fs.existsSync(path.join(ROOT, 'src/main/onepassword.js')), false);
  assert.doesNotMatch(read('build/entitlements.mac.plist'), /disable-library-validation/);
  assert.doesNotMatch(read('build/entitlements.mac.inherit.plist'), /disable-library-validation/);

});

test('public claims describe shipped consent mode, bundled blocker inputs, private downloads, and double opt-in', () => {
  const privacy = read('site/src/pages/privacy.astro');
  const siteScript = read('site/src/scripts/site.js');
  assert.match(privacy, /<h3>Usage ping<\/h3>/);
  assert.match(privacy, /Search suggestions \(optional\)/);
  assert.match(privacy, /both choices are presented on/i);
  assert.match(privacy, /double opt-in/);
  assert.match(privacy, /private tab remains only in memory/i);
  assert.match(privacy, /hash-pinned EasyList and EasyPrivacy snapshots ship inside/);
  assert.match(privacy, /restricted state.*cookieless pings/is);
  assert.match(privacy, /30-day quarantine/);
  assert.match(siteScript, /GA4 Consent Mode/);
  assert.match(siteScript, /analytics_storage: 'denied'/);
});

test('every third-party GitHub Action is pinned to a full commit SHA', () => {
  const workflows = fs.readdirSync(path.join(ROOT, '.github/workflows'))
    .filter((name) => /\.ya?ml$/.test(name));
  for (const name of workflows) {
    for (const line of read(`.github/workflows/${name}`).split('\n')) {
      const match = line.match(/^\s*(?:-\s*)?uses:\s*([^\s#]+)/);
      if (!match || match[1].startsWith('./')) continue;
      assert.match(match[1], /^[^@]+@[a-f0-9]{40}$/, `${name}: ${match[1]}`);
    }
  }
});
