const assert = require('node:assert/strict');
const test = require('node:test');

const m = require('../../src/main/tabicons-model');

const NOW = 1_800_000_000_000;
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const PNG_A = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAGElEQVR42mNgGAWjYBSMglEwCkbBqAABBgAE/wABeV0FzgAAAABJRU5ErkJggg==';
const pngAtSize = (source, size) => {
  const bytes = Buffer.from(source.split(',')[1], 'base64');
  bytes.writeUInt32BE(size, 16);
  bytes.writeUInt32BE(size, 20);
  return `${m.PNG_DATA_PREFIX}${bytes.toString('base64')}`;
};
const PNG_2X = pngAtSize(PNG_A, m.ICON_SIZE);
const pngBBytes = Buffer.from(PNG_A.split(',')[1], 'base64');
pngBBytes[pngBBytes.length - 1] ^= 1;
const PNG_B = `data:image/png;base64,${pngBBytes.toString('base64')}`;
const ICO_BYTES = (() => {
  const dib = Buffer.alloc(40);
  dib.writeUInt32LE(40, 0); // BITMAPINFOHEADER
  dib.writeInt32LE(16, 4);
  dib.writeInt32LE(32, 8); // XOR + mask height
  dib.writeUInt16LE(1, 12);
  dib.writeUInt16LE(32, 14);
  const bytes = Buffer.alloc(22 + dib.length);
  bytes.writeUInt16LE(1, 2); // icon resource
  bytes.writeUInt16LE(1, 4); // one image
  bytes[6] = 16;
  bytes[7] = 16;
  bytes.writeUInt16LE(1, 10);
  bytes.writeUInt16LE(32, 12);
  bytes.writeUInt32LE(dib.length, 14);
  bytes.writeUInt32LE(22, 18);
  dib.copy(bytes, 22);
  return bytes;
})();
const icon = (over = {}) => ({ url: 'https://a.example/', data: PNG_A, ...over });
const entry = (over = {}) => ({ updatedAt: NOW - HOUR, icons: [icon()], ...over });

test('validIconData accepts Retina and legacy PNG records but rejects other dimensions', () => {
  const fakePng = `data:image/png;base64,${Buffer.from('<svg/>').toString('base64')}`;
  const oversized = `${PNG_A}${'A'.repeat(m.MAX_ICON_DATA)}`;
  assert.equal(m.validIconData(PNG_2X), PNG_2X, 'new captures retain 2x backing pixels');
  assert.equal(m.validIconData(PNG_A), PNG_A, 'deployed 16x16 records remain compatible');
  assert.equal(m.validIconData(pngAtSize(PNG_A, 24)), null);
  assert.equal(m.validIconData(pngAtSize(PNG_A, 64)), null);
  assert.equal(m.validIconData('https://a.example/icon.png'), null);
  assert.equal(m.validIconData('data:image/svg+xml,<svg/>'), null);
  assert.equal(m.validIconData(fakePng), null, 'MIME label alone cannot smuggle another format');
  assert.equal(m.validIconData('data:image/png;base64,AAAA'), null, 'truncated PNG rejected');
  assert.equal(m.validIconData(oversized), null);
});

test('source PNG guard rejects alternate formats and dimension bombs before decode', () => {
  const bytes = Buffer.from(PNG_A.slice(m.PNG_DATA_PREFIX.length), 'base64');
  assert.equal(m.validSourcePngBytes(bytes), bytes);
  assert.deepEqual(m.sourcePngFromDataUrl(PNG_A), bytes);

  const hugeWidth = Buffer.from(bytes);
  hugeWidth.writeUInt32BE(m.MAX_SOURCE_DIMENSION + 1, 16);
  const hugePixels = Buffer.from(bytes);
  hugePixels.writeUInt32BE(m.MAX_SOURCE_DIMENSION, 16);
  hugePixels.writeUInt32BE(m.MAX_SOURCE_DIMENSION, 20);
  assert.equal(m.validSourcePngBytes(Buffer.from('<svg/>')), null);
  assert.equal(m.validSourcePngBytes(hugeWidth), null);
  assert.equal(m.validSourcePngBytes(hugePixels), null);
  assert.equal(m.sourcePngFromDataUrl('data:image/svg+xml;base64,PHN2Zy8+'), null);
  assert.equal(
    m.sourcePngFromDataUrl(`data:image/png;base64,${hugeWidth.toString('base64')}`),
    null
  );
});

test('source PNG guard accepts bounded oversized site artwork like NFL favicon', () => {
  const nfl = Buffer.from(PNG_A.slice(m.PNG_DATA_PREFIX.length), 'base64');
  nfl.writeUInt32BE(2000, 16);
  nfl.writeUInt32BE(2000, 20);
  assert.equal(m.validSourcePngBytes(nfl), nfl);

  const tooManyPixels = Buffer.from(nfl);
  tooManyPixels.writeUInt32BE(2049, 16);
  tooManyPixels.writeUInt32BE(2049, 20);
  assert.equal(m.validSourcePngBytes(tooManyPixels), null);
});

test('a bounded generic .ico response is sniffed only after its container validates', () => {
  const source = 'https://appstoreconnect.apple.com/favicon.ico';
  assert.equal(m.validSourceIcoBytes(ICO_BYTES), ICO_BYTES);
  assert.equal(m.canReadFaviconResponse('application/octet-stream', source), true);
  assert.equal(
    m.faviconResponseMediaType('application/octet-stream', source, ICO_BYTES),
    'image/x-icon',
  );

  const corrupt = Buffer.from(ICO_BYTES);
  corrupt.writeUInt32LE(corrupt.length + 1, 18);
  assert.equal(m.validSourceIcoBytes(corrupt), null);
  assert.equal(m.faviconResponseMediaType('application/octet-stream', source, corrupt), null);
  assert.equal(
    m.canReadFaviconResponse('application/octet-stream', 'https://example.com/icon.png'),
    true,
    'generic candidates are read under the byte ceiling, then signature-checked',
  );
  assert.equal(m.canReadFaviconResponse('text/html', source), false);
});

test('a generic response may prove itself to be PNG regardless of URL suffix', () => {
  const source = 'https://cdn.example/opaque-icon-id';
  const bytes = Buffer.from(PNG_A.slice(m.PNG_DATA_PREFIX.length), 'base64');
  assert.equal(m.canReadFaviconResponse('application/octet-stream', source), true);
  assert.equal(
    m.faviconResponseMediaType('application/octet-stream', source, bytes),
    'image/png',
  );
  assert.equal(
    m.faviconResponseMediaType('application/octet-stream', source, Buffer.from('not an image')),
    null,
  );
});

test('image media type detection accepts real favicon MIME types and rejects others', () => {
  for (const ok of [
    'image/png', 'image/svg+xml', 'image/x-icon', 'image/vnd.microsoft.icon',
    'image/webp', 'IMAGE/GIF', 'image/jpeg; charset=binary',
  ]) {
    assert.equal(m.isImageMediaType(ok), true, ok);
  }
  for (const bad of [
    'text/html', 'application/octet-stream', 'image', 'image/', '',
    null, undefined, 'text/html; image/png',
  ]) {
    assert.equal(m.isImageMediaType(bad), false, String(bad));
  }
});

test('dataUrlMediaType reads the image type from base64 and percent-encoded data URLs', () => {
  assert.equal(m.dataUrlMediaType('data:image/svg+xml;base64,PHN2Zy8+'), 'image/svg+xml');
  assert.equal(m.dataUrlMediaType('data:image/png,AAAA'), 'image/png');
  assert.equal(m.dataUrlMediaType('data:IMAGE/X-Icon;base64,AAAA'), 'image/x-icon');
  assert.equal(m.dataUrlMediaType('data:text/html;base64,AAAA'), null);
  assert.equal(m.dataUrlMediaType('https://a.example/icon.svg'), null);
  assert.equal(m.dataUrlMediaType('data:,AAAA'), null);
});

test('imageSourceToDataUrl wraps only bounded image bytes', () => {
  const bytes = Buffer.from('<svg viewBox="0 0 16 16"/>');
  assert.equal(
    m.imageSourceToDataUrl('image/svg+xml; charset=utf-8', bytes),
    `data:image/svg+xml;base64,${bytes.toString('base64')}`
  );
  assert.equal(m.imageSourceToDataUrl('text/html', bytes), null);
  assert.equal(m.imageSourceToDataUrl('image/png', Buffer.alloc(0)), null, 'empty rejected');
  assert.equal(
    m.imageSourceToDataUrl('image/png', Buffer.alloc(m.MAX_SOURCE_BYTES + 1)),
    null,
    'oversized rejected'
  );
  assert.equal(m.imageSourceToDataUrl('image/png', 'not-bytes'), null);
});

test('boundedImageDataUrl passes inert image data URLs and bounds their size', () => {
  const svg = 'data:image/svg+xml;base64,PHN2ZyB2aWV3Qm94PSIwIDAgMTYgMTYiLz4=';
  const percent = 'data:image/svg+xml,%3Csvg%2F%3E';
  assert.equal(m.boundedImageDataUrl(svg), svg);
  assert.equal(m.boundedImageDataUrl(percent), percent, 'percent-encoded inline SVG is preserved');
  assert.equal(m.boundedImageDataUrl('data:text/html;base64,AAAA'), null);
  assert.equal(
    m.boundedImageDataUrl(`data:image/png;base64,${'A'.repeat(m.MAX_SOURCE_BYTES * 2)}`),
    null,
    'oversized length rejected'
  );
  assert.equal(m.boundedImageDataUrl('https://a.example/i.svg'), null);
  assert.equal(m.boundedImageDataUrl(null), null);
});

test('network icon sources reject obvious local and private-network targets', () => {
  assert.equal(m.isPublicHttpSource('https://cdn.example/icon.png'), true);
  assert.equal(m.isPublicHttpSource('http://8.8.8.8/icon.png'), true);
  for (const source of [
    'http://localhost/icon.png',
    'http://sub.localhost/icon.png',
    'http://printer.local./icon.png',
    'http://127.1/icon.png',
    'http://10.0.0.1/icon.png',
    'http://100.64.0.1/icon.png',
    'http://169.254.169.254/latest/meta-data/',
    'http://172.31.255.255/icon.png',
    'http://192.168.1.1/icon.png',
    'http://[::1]/icon.png',
    'http://[fd00::1]/icon.png',
    'http://[fe80::1]/icon.png',
    'http://[fec0::1]/icon.png',
    'http://[ff02::1]/icon.png',
    'http://[::ffff:127.0.0.1]/icon.png',
  ]) {
    assert.equal(m.isPublicHttpSource(source), false, source);
  }
});

test('sanitizeEntry validates, deduplicates, caps, and preserves retractions', () => {
  assert.equal(m.sanitizeEntry(null), null);
  assert.equal(m.sanitizeEntry({ icons: [] }), null);
  assert.deepEqual(
    m.sanitizeEntry({ retracted: true, updatedAt: NOW, junk: true }),
    { retracted: true, updatedAt: NOW }
  );
  const clean = m.sanitizeEntry({
    updatedAt: NOW,
    icons: [
      icon(),
      icon({ data: PNG_B }),
      icon({ url: 'file:///tmp/icon', data: PNG_A }),
      icon({ url: 'https://b.example/', data: 'https://b.example/icon.png' }),
    ],
  });
  assert.deepEqual(clean.icons, [icon()]);
});

test('buildOwnEntry clocks icon changes and heartbeat, not identical rebuilds', () => {
  const first = m.buildOwnEntry({ prev: null, snapshot: { icons: [icon()] }, now: NOW });
  assert.equal(first.updatedAt, NOW);
  const same = m.buildOwnEntry({ prev: first, snapshot: { icons: [icon()] }, now: NOW + HOUR });
  assert.equal(same.updatedAt, NOW);
  const changed = m.buildOwnEntry({
    prev: first,
    snapshot: { icons: [icon({ data: PNG_B })] },
    now: NOW + HOUR,
  });
  assert.equal(changed.updatedAt, NOW + HOUR);
  const heartbeat = m.buildOwnEntry({ prev: first, snapshot: { icons: [icon()] }, now: NOW + DAY });
  assert.equal(heartbeat.updatedAt, NOW + DAY);
});

test('merge is LWW, retractions win stale data, and old devices prune', () => {
  const retracted = { retracted: true, updatedAt: NOW };
  const out = m.mergeDevices(
    {
      live: entry({ updatedAt: NOW - 2 * HOUR }),
      gone: entry({ updatedAt: NOW - HOUR }),
      old: entry({ updatedAt: NOW - 31 * DAY }),
    },
    {
      live: entry({ updatedAt: NOW - HOUR, icons: [icon({ data: PNG_B })] }),
      gone: retracted,
    },
    { now: NOW, ownId: 'me' }
  );
  assert.equal(out.live.icons[0].data, PNG_B);
  assert.deepEqual(out.gone, retracted);
  assert.equal(out.old, undefined);
});

test('icon budget trims only the sidecar while the session keeps every tab', () => {
  // The model's format cap keeps each record small. Repeating valid icons
  // under distinct, bounded page URLs still exercises the account-level budget.
  const icons = Array.from({ length: 500 }, (_, i) =>
    icon({ url: `https://a.example/${'p'.repeat(600)}/${i}`, data: PNG_A }));
  const iconDevices = { own: entry({ updatedAt: NOW, icons }) };
  const sessionDevices = [{
    deviceId: 'own',
    tabs: icons.map(({ url }) => ({ url, title: url, groupId: null, pinned: false })),
    groups: [],
  }];

  const bounded = m.applyBudget(iconDevices, 'own');
  assert.ok(Buffer.byteLength(m.canonical(bounded), 'utf8') <= m.BUDGET_BYTES);
  assert.ok(bounded.own.icons.length < icons.length);
  assert.equal(iconDevices.own.icons.length, 500, 'input keeps the full icon cache');
  assert.equal(sessionDevices[0].tabs.length, 500, 'primary tab snapshot is structurally isolated');
});

test('budget trimming does not advance the icon clock or cause repeat repairs', () => {
  const icons = Array.from({ length: 100 }, (_, i) =>
    icon({ url: `https://a.example/${'p'.repeat(600)}/${i}` }));
  const args = {
    deviceId: 'me',
    syncTabs: true,
    snapshot: { icons },
    maxBytes: 24 * 1024,
  };
  const first = m.exportDevices({ devices: {}, ...args, now: NOW });
  assert.equal(first.store.me.icons.length, 100);
  assert.ok(first.upload.me.icons.length < 100);
  const second = m.exportDevices({ devices: first.store, ...args, now: NOW + HOUR });
  assert.equal(second.store.me.updatedAt, NOW);
  assert.deepEqual(second.store, first.store);
  assert.equal(m.devicesEqual(second.upload, first.upload), true);
});

test('attachIcons exposes safe data only in the renderer projection', () => {
  const remote = [{
    deviceId: 'other',
    name: 'Other Mac',
    tabs: [
      { url: 'https://a.example/', title: 'A', groupId: null, pinned: false },
      { url: 'https://missing.example/', title: 'Missing', groupId: null, pinned: false },
    ],
    groups: [],
  }];
  const projected = m.attachIcons(remote, {
    other: [
      icon(),
      { url: 'https://missing.example/', data: 'https://tracker.example/icon.png' },
    ],
  });
  assert.equal(projected[0].tabs[0].favicon, PNG_A);
  assert.equal(projected[0].tabs[1].favicon, null);
  assert.equal(projected[0].tabs.every((tab) => !/^https?:/.test(tab.favicon ?? '')), true);
  assert.equal('favicon' in remote[0].tabs[0], false, 'wire/session object is not mutated');
});
