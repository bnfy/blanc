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
const linux = (argv) => localHtmlPathsFromArgv(argv, { platform: 'linux' });

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

test('local HTML paths are read from the command line on Windows and Linux, not macOS', () => {
  assert.deepEqual(localHtmlPathsFromArgv(['/Users/k/a.html'], { platform: 'darwin' }), []);
  assert.deepEqual(localHtmlPathsFromArgv(['/home/k/a.html'], { platform: 'linux' }), ['/home/k/a.html']);
  assert.deepEqual(win(null), []);
  assert.deepEqual(win([42, {}]), []);
  assert.deepEqual(linux(null), []);
  assert.deepEqual(linux([42, {}]), []);
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

// #1630 on Linux (v1.52.0 read Windows only): a file manager's Open With runs
// the desktop entry's `Exec=… %U`, which GLib and KDE fill with an absolute
// path; launchers that pass URIs through send a file: URI. Both reach the
// preview as a path.
test('Linux command line yields absolute HTML paths and local file: URIs', () => {
  assert.deepEqual(linux([
    '/tmp/.mount_BlancX/blanc',
    '--user-data-dir=/home/k/x.html',
    '--no-zygote',
    '/home/k/Report.html',
    '/home/k/a.XHTML',
    'file:///home/k/My%20Page.htm',
    'FILE://localhost/home/k/b.xhtm',
    'relative.html',
    './relative.html',
    '~/home.html',
    '/home/k/notes.pdf',
    'file:///home/k/notes.pdf',
    '/home/k/bad\0.html',
  ]), [
    '/home/k/Report.html',
    '/home/k/a.XHTML',
    '/home/k/My Page.htm',
    '/home/k/b.xhtm',
  ]);
});

test('Linux refuses file: URIs that are not plain local paths', () => {
  assert.deepEqual(linux([
    'file://server/share/a.html',
    'file:///home/k/a%2Fb.html',
    'file:///home/k/a%00.html',
    'file:///home/k/a.html?x=1',
    'file:///home/k/a.html#top',
    'file:relative.html',
    'file:',
  ]), []);
});

test('a Linux command line that carries a web URL yields no file paths', () => {
  assert.deepEqual(linux(['blanc', 'https://example.com/', '/home/k/a.html']), []);
  assert.deepEqual(linux(['blanc', 'blanc-import:x', 'file:///home/k/a.html']), []);
  // A Windows-style path is not an absolute path on Linux.
  assert.deepEqual(linux(['C:\\Users\\k\\a.html', '\\\\server\\share\\a.html']), []);
});
