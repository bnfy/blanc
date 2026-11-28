// Chromium's tips for its own vertical tab strip teach a tab strip Blanc never
// draws; "Move your tabs to the side" showed over a window with more than 20
// tabs on the owner's Blanc Beta (2026-11-28). blanc/common/background_services.h
// turns them off with the background services, before anything reads them.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const header = fs.readFileSync(new URL('../blanc/common/background_services.h', import.meta.url), 'utf8');
const list = name => [...header.match(new RegExp(`${name} =\\s*\\{([^}]*)\\}`))[1].matchAll(/"([^"]+)"/g)].map(m => m[1]);

test("Chromium's vertical-tabs tips are off", () => {
  const promos = list('kDisabledChromiumPromos');
  assert.ok(promos.includes('IPH_VerticalTabstripTutorialFeature'));
  assert.ok(promos.includes('IPH_VerticalTabsExpandOnHoverFeature'));
  assert.equal(new Set(promos).size, promos.length);
  const size = Number(header.match(/std::array<std::string_view, (\d+)> kDisabledChromiumPromos/)[1]);
  assert.equal(size, promos.length);
});

test('they go on the same --disable-features as the background services', () => {
  const body = header.match(/inline void DisableBackgroundServices[\s\S]*?\n}\n/)[0];
  assert.match(body, /for_each\(kDisabledBackgroundFeatures, add\)/);
  assert.match(body, /for_each\(kDisabledChromiumPromos, add\)/);
  assert.match(body, /AppendSwitchASCII\("disable-features"/);
});
