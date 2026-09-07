'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

test('ping-worker dl pure logic', async (t) => {
  const {
    DL_TARGETS,
    OPENAI_CONVERSION_EVENT,
    buildDownloadConversionEvent,
    validOppref,
    pickAsset,
    dlCountKey,
    groupDlCounts,
  } =
    await import('../../cloudflare/ping-worker/src/dl.js');

  const v191 = [
    { name: 'Blanc-1.9.1-arm64-mac.zip', browser_download_url: 'u1' },
    { name: 'Blanc-1.9.1-arm64.dmg', browser_download_url: 'u2' },
    { name: 'Blanc-1.9.1-arm64.dmg.blockmap', browser_download_url: 'u3' },
    { name: 'Blanc-1.9.1.AppImage', browser_download_url: 'u4' },
    { name: 'Blanc-Setup-1.9.1.exe', browser_download_url: 'u5' },
    { name: 'SHA256SUMS', browser_download_url: 'u6' },
  ];

  await t.test('targets are exactly the four site cards (no ambiguous mac)', () => {
    assert.deepEqual([...DL_TARGETS].sort(), ['linux', 'mac-arm64', 'mac-x64', 'win']);
  });

  await t.test('pickAsset mirrors site.js per-platform selection', () => {
    assert.equal(pickAsset(v191, 'mac-arm64').browser_download_url, 'u2');
    assert.equal(pickAsset(v191, 'win').browser_download_url, 'u5');
    assert.equal(pickAsset(v191, 'linux').browser_download_url, 'u4');
  });

  await t.test('pickAsset returns null for an artifact the release lacks', () => {
    assert.equal(pickAsset(v191, 'mac-x64'), null); // v1.9.1 ships no x64 dmg
    assert.equal(pickAsset(v191, 'mac'), null);
    assert.equal(pickAsset(null, 'win'), null);
  });

  await t.test('dlCountKey shape', () => {
    assert.equal(dlCountKey('2026-08-28', 'win'), 'dl:2026-08-28:win');
  });

  await t.test('groupDlCounts reshapes readMap output by day', () => {
    assert.deepEqual(
      groupDlCounts({ '2026-08-28:win': 3, '2026-08-28:linux': 1, '2026-08-29:win': 2 }),
      { '2026-08-28': { win: 3, linux: 1 }, '2026-08-29': { win: 2 } }
    );
  });

  await t.test('conversion event contains only bounded download attribution', () => {
    assert.equal(validOppref('opaque-click-reference'), true);
    assert.equal(validOppref(''), false);
    assert.equal(validOppref('x'.repeat(2049)), false);

    const event = buildDownloadConversionEvent({
      target: 'win',
      oppref: 'opaque-click-reference',
      timestampMs: 1787875200000,
      eventId: 'event-id',
    });
    assert.deepEqual(event, {
      id: 'event-id',
      type: 'custom',
      custom_event_name: OPENAI_CONVERSION_EVENT,
      timestamp_ms: 1787875200000,
      oppref: 'opaque-click-reference',
      source_url: 'https://blancbrowser.com/dl/win',
      action_source: 'web',
      opt_out: true,
      data: { type: 'custom', platform: 'win' },
    });
    assert.equal('user' in event, false);
    assert.equal(buildDownloadConversionEvent({
      target: 'mac', oppref: 'x', timestampMs: 1, eventId: 'id',
    }), null);
  });
});
