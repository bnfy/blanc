'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.join(__dirname, '../..');
const styles = fs.readFileSync(path.join(ROOT, 'src/renderer/styles.css'), 'utf8');
const html = fs.readFileSync(path.join(ROOT, 'src/renderer/permission.html'), 'utf8');
const main = fs.readFileSync(path.join(ROOT, 'src/main/main.js'), 'utf8');

test('the permission view clears both document roots and its native background', () => {
  assert.match(html, /<body\s+class="permission-surface">/);
  assert.match(
    styles,
    /html:has\(> body\.permission-surface\),\s*body\.permission-surface\s*\{\s*background:\s*transparent;/,
  );
  assert.match(
    main,
    /function ensurePermissionView\(\)[\s\S]*?view\.setBackgroundColor\('#00000000'\)/,
  );
});
