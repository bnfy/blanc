'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('packaged Blanc registers a separate tab-import protocol', () => {
  const pkg = JSON.parse(read('package.json'));
  const registrations = pkg.build.protocols.filter((entry) => entry.schemes?.includes('blanc-import'));
  assert.equal(registrations.length, 1);
  assert.deepEqual(registrations[0].schemes, ['blanc-import']);
  assert.equal(pkg.build.appId, 'me.bnfy.bowser');
});

test('packaged platform validation invokes each installed tab-import handler', () => {
  const smoke = read('test/desktop/packaged-tab-handoff-protocol-smoke.mjs');
  assert.match(smoke, /process\.platform === 'darwin'/);
  assert.match(smoke, /HKEY_CURRENT_USER\\\\Software\\\\Classes\\\\blanc-import/);
  assert.match(smoke, /x-scheme-handler\/blanc-import/);
  assert.match(smoke, /xdg-open/);
  assert.match(smoke, /blanc:\/\/tab-handoff\//);
  assert.match(smoke, /startsWith\('blanc-import:'\)/);

  const workflow = read('.github/workflows/release-windows-linux.yml');
  assert.equal(
    workflow.match(/name: Verify installed blanc-import protocol/g)?.length,
    2,
    'both native jobs must run installed protocol acceptance',
  );
  assert.match(workflow, /Start-Process -FilePath \$installer -ArgumentList '\/S'/);
  assert.match(workflow, /dbus-run-session -- xvfb-run -a npm run test:packaged:tab-handoff-protocol/);
});

test('tab-handoff utility bridge exposes only inspection, accept, and cancel', () => {
  const preload = read('src/main/tab-preload.js');
  const branch = preload.slice(preload.indexOf("host === 'tab-handoff'"), preload.indexOf("host === 'tab-handoff'") + 580);
  assert.match(branch, /get:/);
  assert.match(branch, /accept:/);
  assert.match(branch, /cancel:/);
  assert.doesNotMatch(branch, /navigate|shell|fetch|write/);

  const renderer = read('src/renderer/pages/tab-handoff.js');
  assert.match(renderer, /\.textContent\s*=/);
  assert.doesNotMatch(renderer, /innerHTML|insertAdjacentHTML|\.url\b/);

  const utilityPages = read('src/main/utility-pages.js');
  assert.match(utilityPages, /'tab-handoff'/);
  assert.doesNotMatch(renderer, /tabImport/);
});

test('desktop handoff uses the shared quiet batch transaction and persists after activation', () => {
  const main = read('src/main/main.js');
  const start = main.indexOf('function openTabHandoffWindow(');
  const end = main.indexOf('function openNewWindow(options = {})', start);
  const source = main.slice(start, end);
  assert.match(source, /sessionPersistenceSuspended = true/);
  assert.match(source, /createQuietTabsBatch\(runtime, tabSpecs/);
  assert.match(source, /findIndex\(\(tab\) => tab\.active === true\)/);
  assert.match(source, /setActiveTab\(activeTabId/);
  assert.match(source, /tabStateBroadcastSuppressionDepth \+= 1/);
  assert.match(source, /sessionPersistenceSuspended = priorPersistenceSuspended/);
  assert.match(source, /broadcastTabs\(\)/);
  assert.match(source, /groupName:\s*null/);
  assert.match(source, /pinned:\s*false/);
});

test('late chrome readiness reattaches the active tab without dismissing handoff review', () => {
  const main = read('src/main/main.js');
  assert.match(
    main,
    /activateTab:\s*\(id\)\s*=>\s*setActiveTab\(id,\s*\{\s*dismissUtilitySheet:\s*false\s*\}\)/
  );
  assert.match(
    main,
    /if\s*\(dismissUtilitySheet\)\s*hideUtilitySheet\(/
  );
  assert.match(main, /dismissUtilitySheet\s*=\s*true/,
    'Bring Your Tabs can use dismissUtilitySheet:false during transactional activation');
});

test('landing page keeps metadata out of URLs and clears the fragment before launch', () => {
  const landing = read('site/src/pages/import-tabs.astro');
  assert.match(landing, /history\.replaceState/);
  assert.match(landing, /blanc-import:\/\/tabs\?v=1&id=/);
  assert.match(landing, /analytics=\{false\}/);
  assert.match(landing, /robots="noindex,nofollow"/);
  assert.doesNotMatch(landing, /sourceBrowser=.*blanc-import|tabs=.*blanc-import/);
  const headers = read('site/public/_headers');
  assert.match(headers, /\/import-tabs\*[\s\S]*Cache-Control: no-store[\s\S]*Referrer-Policy: no-referrer[\s\S]*X-Robots-Tag: noindex, nofollow/);
});
