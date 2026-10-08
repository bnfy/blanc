const test = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');

async function fixture({ reduced = true } = {}) {
  const { createImagePreview } = await import(pathToFileURL(path.resolve(__dirname, '../../site/src/scripts/image-preview.js')));
  const pending = new Map();
  const copies = [];
  const fades = [];
  const target = {
    src: '/ledger.png', alt: 'Ledger', complete: true, naturalWidth: 1440, hidden: false,
    getAttribute(name) { return this[name]; },
    cloneNode() {
      const copy = { removed: false, removeAttribute() {}, setAttribute() {}, classList: { add() {} }, remove() { this.removed = true; } };
      copies.push(copy);
      return copy;
    },
    before() {},
    animate() {
      let finish;
      const fade = { finished: new Promise(resolve => { finish = resolve; }), cancelled: false, cancel() { this.cancelled = true; finish(); }, finish() { finish(); } };
      fades.push(fade);
      return fade;
    },
  };
  const view = {
    matchMedia: () => ({ matches: reduced }),
    Image: class {
      decode() { return new Promise((resolve, reject) => pending.set(this.src, { resolve, reject })); }
    },
  };
  const preview = createImagePreview(target, { view });
  let selection = 'Ledger';
  const show = name => preview.show(`/${name.toLowerCase()}.png`, name, () => { selection = name; });
  return { target, preview, pending, copies, fades, show, selection: () => selection };
}

test('failed screenshot decode preserves the displayed layout and selection', async () => {
  const p = await fixture();
  const loading = p.show('Shelf');
  assert.equal(p.selection(), 'Ledger', 'selection waits for the image');
  p.pending.get('/shelf.png').reject(new Error('Network unavailable'));
  assert.equal(await loading, false);
  assert.equal(p.target.src, '/ledger.png');
  assert.equal(p.target.alt, 'Ledger');
  assert.equal(p.selection(), 'Ledger');
  const retry = p.show('Shelf');
  p.pending.get('/shelf.png').resolve();
  assert.equal(await retry, true);
  assert.equal(p.target.src, '/shelf.png');
  assert.equal(p.target.alt, p.selection());
});

test('a slow earlier selection cannot replace the latest screenshot or label', async () => {
  const p = await fixture();
  const shelf = p.show('Shelf');
  const tally = p.show('Tally');
  p.pending.get('/tally.png').resolve();
  assert.equal(await tally, true);
  p.pending.get('/shelf.png').resolve();
  assert.equal(await shelf, false);
  assert.equal(p.target.src, '/tally.png');
  assert.equal(p.target.alt, 'Tally');
  assert.equal(p.selection(), 'Tally');
});

test('opening Mahjong cancels pending layout changes; returning reuses the valid capture', async () => {
  const p = await fixture();
  const loading = p.show('Shelf');
  p.preview.cancel();
  p.target.hidden = true;
  p.pending.get('/shelf.png').resolve();
  assert.equal(await loading, false);
  assert.equal(p.selection(), 'Ledger');
  assert.equal(await p.show('Ledger'), true);
  assert.equal(p.pending.has('/ledger.png'), false, 'returning to a loaded image needs no new request');
});

test('selecting the already displayed layout invalidates a pending different layout', async () => {
  const p = await fixture();
  const loading = p.show('Shelf');
  assert.equal(await p.show('Ledger'), true);
  p.pending.get('/shelf.png').resolve();
  assert.equal(await loading, false);
  assert.equal(p.target.src, '/ledger.png');
  assert.equal(p.selection(), 'Ledger');
});

test('interrupting a crossfade removes the previous image without disturbing the current one', async () => {
  const p = await fixture({ reduced: false });
  const loading = p.show('Shelf');
  p.pending.get('/shelf.png').resolve();
  await loading;
  assert.equal(p.copies[0].removed, false);
  p.preview.cancel();
  assert.equal(p.fades[0].cancelled, true);
  assert.equal(p.copies[0].removed, true);
  assert.equal(p.target.src, '/shelf.png');
  assert.equal(p.selection(), 'Shelf');
});
