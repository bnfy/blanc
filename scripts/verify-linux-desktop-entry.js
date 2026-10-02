'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Chromium accepts both '-' and '--'. Match complete names (with optional
// values), so benign names such as --no-sandbox-helper do not match.
const { UNSAFE_EXEC_SWITCH } = require('../src/main/linux-sandbox-launch');

function listValue(source, key) {
  const line = source.split(/\r?\n/).find((candidate) => candidate.startsWith(`${key}=`));
  assert.ok(line, `${key} is missing from the desktop entry`);
  return line.slice(key.length + 1).split(';').filter(Boolean);
}

function verifyLinuxDesktopEntry(file) {
  if (!file) throw new Error('desktop entry path is required');
  const source = fs.readFileSync(file, 'utf8');
  const desktopEntry = source.split(/(?=^\[)/m)
    .find((section) => section.startsWith('[Desktop Entry]\n')
      || section.startsWith('[Desktop Entry]\r\n'));
  assert.ok(desktopEntry, 'desktop entry is missing [Desktop Entry]');
  assert.match(desktopEntry, /^Exec=\S.*$/m, 'Exec is missing or empty in the desktop entry');
  // Check action commands too: menu integration can expose those separately.
  // sandbox:true in webPreferences cannot undo Chromium's --no-sandbox flag.
  for (const line of source.split(/\r?\n/).filter((candidate) => candidate.startsWith('Exec='))) {
    assert.doesNotMatch(line, UNSAFE_EXEC_SWITCH,
      'desktop entry Exec must not disable Chromium sandboxing');
  }
  const categories = listValue(desktopEntry, 'Categories');
  const mimeTypes = listValue(desktopEntry, 'MimeType');

  for (const category of ['Network', 'WebBrowser']) {
    assert.ok(categories.includes(category), `desktop entry is missing ${category} category`);
  }
  for (const handler of ['x-scheme-handler/http', 'x-scheme-handler/https']) {
    assert.ok(mimeTypes.includes(handler), `desktop entry is missing ${handler}`);
  }
  for (const unsupported of ['text/html', 'application/xhtml+xml']) {
    assert.ok(!mimeTypes.includes(unsupported),
      `desktop entry claims unsupported local-file MIME type ${unsupported}`);
  }
}

if (require.main === module) {
  try {
    verifyLinuxDesktopEntry(path.resolve(process.argv[2] || ''));
    console.log('verify-linux-desktop-entry: ok');
  } catch (error) {
    console.error(`verify-linux-desktop-entry: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { verifyLinuxDesktopEntry };
