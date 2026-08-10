const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const mainSource = fs.readFileSync(path.join(__dirname, '../../src/main/main.js'), 'utf8');
const probeSource = mainSource.match(/const DIRTY_PROBE_SOURCE = `([\s\S]*?)`;/)?.[1];

function runProbe({ inputs = [], sessionStorageLength = 0 } = {}) {
  assert.ok(probeSource, 'DIRTY_PROBE_SOURCE not found — update this test with it');
  const document = {
    designMode: 'off',
    body: { textContent: '' },
    pictureInPictureElement: null,
    querySelectorAll(selector) {
      if (selector === 'input, textarea') return inputs;
      return [];
    },
  };
  const window = {
    innerHeight: 800,
    scrollY: 0,
    sessionStorage: { length: sessionStorageLength },
  };
  return vm.runInNewContext(probeSource, { document, window });
}

test('ordinary site sessionStorage is not mistaken for unsaved user work', () => {
  const result = runProbe({ sessionStorageLength: 3 });
  assert.equal(result.dirty, false);
  assert.equal(result.deepScrolled, false);
});

test('an edited text control still protects the tab', () => {
  const result = runProbe({
    sessionStorageLength: 3,
    inputs: [{ type: 'text', value: 'unsaved', defaultValue: '' }],
  });
  assert.equal(result.dirty, true);
});
