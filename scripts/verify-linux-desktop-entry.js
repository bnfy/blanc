'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function listValue(source, key) {
  const line = source.split(/\r?\n/).find((candidate) => candidate.startsWith(`${key}=`));
  assert.ok(line, `${key} is missing from the desktop entry`);
  return line.slice(key.length + 1).split(';').filter(Boolean);
}

function verifyLinuxDesktopEntry(file) {
  if (!file) throw new Error('desktop entry path is required');
  const source = fs.readFileSync(file, 'utf8');
  const categories = listValue(source, 'Categories');
  const mimeTypes = listValue(source, 'MimeType');

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
