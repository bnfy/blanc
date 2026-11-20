'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  externalUrlActivationPlan,
  localHtmlPathsFromArgv,
  webUrlsFromArgv,
} = require('../../src/main/startup-urls');

test('startup handoff accepts only explicit HTTP(S) URLs', () => {
  assert.deepEqual(webUrlsFromArgv([
    '/Applications/Blanc.app',
    'https://example.com/a',
    'HTTP://EXAMPLE.COM/b',
    'http://localhost:8080/',
    'notes.html',
    '/tmp/notes.html',
    'file:///etc/passwd',
    'data:text/html,hello',
    'javascript:alert(1)',
    'blanc://settings/',
  ]), [
    'https://example.com/a',
    'HTTP://EXAMPLE.COM/b',
    'http://localhost:8080/',
  ]);
});

test('several URLs after the -- separator all reach the handoff', () => {
  // Windows Electron exits with -1 if anything follows a URL before a `--`
  // (its CVE-2018-1000006 guard), and Chromium moves switches ahead of plain
  // arguments first. So several URLs arrive as `-- URL1 URL2`.
  assert.deepEqual(webUrlsFromArgv([
    '--user-data-dir=C:\\Users\\me\\scratch',
    '--',
    'https://a.test/',
    'https://b.test/',
  ]), ['https://a.test/', 'https://b.test/']);
});

test('startup handoff rejects malformed input without throwing', () => {
  assert.deepEqual(webUrlsFromArgv(null), []);
  assert.deepEqual(webUrlsFromArgv([null, 4, {}, '']), []);
});

test('multi-URL handoff loads every tab but activates only the final one', () => {
  assert.deepEqual(externalUrlActivationPlan(['https://a.test/', 'https://b.test/']), [
    { url: 'https://a.test/', activate: false },
    { url: 'https://b.test/', activate: true },
  ]);
  assert.deepEqual(externalUrlActivationPlan(['https://only.test/']), [
    { url: 'https://only.test/', activate: true },
  ]);
  assert.deepEqual(externalUrlActivationPlan(null), []);
});

// #1630: a file Windows hands Blanc arrives as a path on the command line.
const win = (argv) => localHtmlPathsFromArgv(argv, { platform: 'win32' });

test('Windows command line yields absolute HTML paths only', () => {
  assert.deepEqual(win([
    'C:\\Program Files\\Blanc\\Blanc.exe',
    '--user-data-dir=C:\\x.html',
    'C:\\Users\\k\\Report.html',
    'D:\\a.XHTML',
    'C:\\Users\\KEVIN~1\\REPORT~1.HTM',
    '\\\\server\\share\\page.htm',
    'relative.html',
    'C:\\Users\\k\\notes.pdf',
    'C:\\bad\0.html',
  ]), [
    'C:\\Users\\k\\Report.html',
    'D:\\a.XHTML',
    'C:\\Users\\KEVIN~1\\REPORT~1.HTM',
    '\\\\server\\share\\page.htm',
  ]);
});

test('Windows paths after the -- separator count', () => {
  assert.deepEqual(win(['Blanc.exe', '--', 'C:\\a.html']), ['C:\\a.html']);
});

test('local HTML paths are read from the command line on Windows only', () => {
  assert.deepEqual(localHtmlPathsFromArgv(['/Users/k/a.html'], { platform: 'darwin' }), []);
  assert.deepEqual(localHtmlPathsFromArgv(['/home/k/a.html'], { platform: 'linux' }), []);
  assert.deepEqual(win(null), []);
  assert.deepEqual(win([42, {}]), []);
});

// Review of #1630: a launcher that passes a URL unescaped could append
// `-- \\host\share\a.html`; Explorer never sends a URL and a file together.
test('a command line that carries a URL yields no file paths', () => {
  assert.deepEqual(win(['Blanc.exe', 'https://example.com/', '--', '\\\\evil\\share\\a.html']), []);
  assert.deepEqual(win(['Blanc.exe', 'blanc-import:x', 'C:\\a.html']), []);
});

test('only drive-letter and UNC paths count, not drive-relative ones', () => {
  assert.deepEqual(win(['\\a.html', '/a.html', 'C:a.html', 'C:/Users/k/a.html']), ['C:/Users/k/a.html']);
});
