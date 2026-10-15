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

test('either spelling, or any shortening of it, is stripped before the space name is read', () => {
  // Every argument-taking command reads its argument through one helper: the
  // list runs a command for any prefix of its name or alias ("/spa", "/work"),
  // so the argument is whatever follows the word actually typed.
  const helper = overlay.match(/function commandArgument\(input\) \{[\s\S]*?\n  \}/)?.[0];
  assert.ok(helper, 'commandArgument not found in overlay.js');
  const commandArgument = new Function(`${helper}; return commandArgument;`)();
  for (const typed of ['/space Work', '/workspace Work', '/spa Work', '/work  Work ']) {
    assert.equal(commandArgument(typed), 'Work', typed);
  }
  assert.equal(commandArgument('/space'), '');
  assert.equal(commandArgument('/spa'), '');
  assert.match(overlay, /function runWorkspaceCommand\(input\) \{\n    const name = commandArgument\(input\);/);
});
