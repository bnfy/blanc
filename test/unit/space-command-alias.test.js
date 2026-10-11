const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

// Blanc Spaces was called Named Workspaces, and its command was /workspace.
// /space is the documented command; /workspace must keep working for
// everyone who learned it.
const overlay = fs.readFileSync(path.join(__dirname, '../../src/renderer/overlay.js'), 'utf8');

test('/space is the command and /workspace stays an alias', () => {
  assert.match(overlay, /\{ cmd: '\/space', hint: blancI18n\.t\('slash\.space\.hint'\), aliases: \['\/workspace'\]/);
  assert.doesNotMatch(overlay, /cmd: '\/workspace'/);
});

test('the palette matches a command by its aliases too', () => {
  assert.match(overlay, /\[c\.cmd, \.\.\.\(c\.aliases \?\? \[\]\)\]\.some\(\(name\) => name\.startsWith\(slashWord\)\)/);
});

test('either spelling is stripped before the space name is read', () => {
  const strip = overlay.match(/replace\((\/\^\\\/\(\?:space\|workspace\)\\s\*\/), ''\)/);
  assert.ok(strip, 'runWorkspaceCommand strips /space and /workspace');
  const re = new RegExp(strip[1].slice(1, -1));
  assert.equal('/space Work'.replace(re, '').trim(), 'Work');
  assert.equal('/workspace Work'.replace(re, '').trim(), 'Work');
  assert.equal('/space'.replace(re, '').trim(), '');
});
