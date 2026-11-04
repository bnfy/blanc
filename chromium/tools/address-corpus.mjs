// The typed-address corpus: hand-picked inputs plus deterministic random ones
// built from address-like fragments. tools/address-input.test.mjs checks the
// Island's port against shipping over it, and tools/android-address-fixtures.mjs
// writes the Android port's fixtures from it, so both cover the same inputs.
export const HAND_PICKED = [
  'example.com', ' example.com ', 'example.com/path?q=1#x', 'https://example.com', 'HTTP://Example.com',
  'blanc://settings', 'javascript:alert(1)', 'javascript://x', 'file:///etc/hosts', 'ftp://host/file',
  'chrome://settings', 'localhost', 'localhost:3000/a', 'localhostx', '127.0.0.1', '10.0.0.1:8080/x',
  '999.1.1.1', 'site:example.com', 'site:example.com foo', 'user:pass@example.com', 'a:1', 'host:8080',
  'how tall is everest', 'example', 'mailto:a@b.com', 'MAILTO:a@b.com', 'tel:+15550100', 'sms:+1',
  'facetime:a@b.c', 'claude://login', 'claude:login', 'zoommtg://zoom.us/join', 'ssh://host', 'smb://x',
  'x-apple.systempreferences:com.apple', 'search:foo', 'c:\\windows', 'mailto:a@b.com"', 'mailto:a b',
  '', '   ', 'a.b', 'a.bc', 'xn--bcher-kva.example', 'example.com:abc', 'https://exa mple.com',
  'data:text/html,hi', 'about:blank', 'view-source:https://a.b', 'vscode://file/x', 'obsidian://open',
  // Ports longer than any number (final review, A1): never a crash.
  'https://example.com:99999999999999999999', 'example.com:00000000000000000000080', 'a.b:65536',
];

export function* generated(count) {
  const parts = ['a', 'b.c', '.com', '/', ':', '//', '8080', '@', '?', '#', ' ', 'mailto:', 'tel:', 'http', 's', 'x-y+z', '1.2.3.4', 'localhost', 'site:', '"', '\\', '\t', 'é'];
  let seed = 7;
  const next = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let i = 0; i < count; i++) {
    let s = '';
    for (let n = 1 + Math.floor(next() * 6); n > 0; n--) s += parts[Math.floor(next() * parts.length)];
    yield s;
  }
}

// Every input: the hand-picked ones, three forms of each listed protocol, and 2,000 generated.
export function corpus(protocols) {
  return [...HAND_PICKED, ...protocols.flatMap(p => [p + 'x', p + '//x', p + '/x']), ...generated(2000)];
}
