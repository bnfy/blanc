const assert = require('node:assert/strict');
const test = require('node:test');
const { validFavicon, validFolder, folderKey } = require('../../src/main/bookmark-validate');

test('validFavicon accepts only bounded, fixed-size PNG pixels', () => {
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAGElEQVR42mNgGAWjYBSMglEwCkbBqAABBgAE/wABeV0FzgAAAABJRU5ErkJggg==';
  assert.equal(validFavicon(png), png);
  assert.equal(validFavicon('https://x.com/f.ico'), null);
  assert.equal(validFavicon('data:image/png;base64,AAAA'), null);
  assert.equal(validFavicon('javascript:alert(1)'), null);
  assert.equal(validFavicon('data:text/html,x'), null);
  assert.equal(validFavicon('data:image/png;base64,' + 'A'.repeat(3000)), null);
  assert.equal(validFavicon(42), null);
});

test('validFolder trims, caps at 100 chars, else null', () => {
  assert.equal(validFolder('  Work  '), 'Work');
  assert.equal(validFolder(''), null);
  assert.equal(validFolder('   '), null);
  assert.equal(validFolder('x'.repeat(100)), 'x'.repeat(100));
  assert.equal(validFolder('x'.repeat(101)), null);
  assert.equal(validFolder(null), null);
});

test('folderKey lowercases and trims; non-string is empty', () => {
  assert.equal(folderKey('  Work '), 'work');
  assert.equal(folderKey('WORK'), 'work');
  assert.equal(folderKey(null), '');
});
