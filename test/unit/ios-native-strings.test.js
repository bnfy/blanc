'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

// Blanc for iPhone draws every word from copy/messages in six languages
// (M18 design §4, F44/D27): Swift reads the catalog through SyncCopy, never a
// string literal. This guard fails on a literal handed to a SwiftUI text or
// accessibility API, and on the bare tab titles that used to be hard-coded.
const root = path.join(__dirname, '../..');
const SOURCE_DIRS = ['ios/Blanc/Blanc', 'ios/BlancShare'];
// Test data, never drawn for a person.
const ALLOWED_FILES = ['UITestSeed.swift'];
// A line marked this way carries a developer message no one sees.
const EXEMPT_MARKER = '// not user-visible';

const STRING = '"((?:[^"\\\\]|\\\\.)*)"';
const PATTERNS = [
  new RegExp(String.raw`(?:^|[^\w.])(?:Text|Button|Label|Toggle|TextField|SecureField|Section|Menu|Link|pageShortcut|groupHeading)\(\s*` + STRING, 'g'),
  new RegExp(String.raw`\.(?:navigationTitle|accessibilityLabel|accessibilityHint|accessibilityValue|alert|confirmationDialog|help)\(\s*` + STRING, 'g'),
  new RegExp(String.raw`\.accessibilityAction\(\s*named:\s*` + STRING, 'g'),
  new RegExp(String.raw`\.accessibility(?:Label|Hint|Value)\s*=\s*` + STRING, 'g'),
  new RegExp(String.raw`"((?:Start Page|New Tab|Tab))"`, 'g'),
];

// What a person would read: the literal without its \( … ) interpolations
// (an unclosed one, cut short by a nested quote, runs to the end).
function readable(literal) {
  let out = '';
  for (let i = 0; i < literal.length; i += 1) {
    if (literal[i] === '\\' && literal[i + 1] === '(') {
      let depth = 1;
      i += 2;
      while (i < literal.length && depth > 0) {
        if (literal[i] === '(') depth += 1;
        else if (literal[i] === ')') depth -= 1;
        i += 1;
      }
      i -= 1;
    } else {
      out += literal[i];
    }
  }
  return out;
}

function scan(source) {
  const found = [];
  source.split('\n').forEach((raw, index) => {
    if (raw.includes(EXEMPT_MARKER)) return;
    const line = raw.replace(/^\s*\/\/.*$/, '');
    for (const pattern of PATTERNS) {
      for (const match of line.matchAll(pattern)) {
        if ((readable(match[1]).match(/[A-Za-z]/g) || []).length >= 2) found.push({ line: index + 1, text: match[1] });
      }
    }
  });
  return found;
}

function swiftFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return swiftFiles(full);
    return entry.name.endsWith('.swift') && !ALLOWED_FILES.includes(entry.name) ? [full] : [];
  });
}

function offenders() {
  return SOURCE_DIRS.flatMap((dir) => swiftFiles(path.join(root, dir)).flatMap((file) =>
    scan(fs.readFileSync(file, 'utf8')).map(({ line, text }) =>
      `${path.relative(root, file)}:${line}: move "${text}" to copy/messages (M18 design §4)`)));
}

test('Swift draws no hard-coded English', () => {
  assert.deepEqual(offenders(), []);
});

test('the guard catches each form it claims to', () => {
  for (const line of ['Text("Open tabs")', '.accessibilityLabel("Show all tabs")', 'button.accessibilityLabel = "Page actions"',
    'Button("Done") { dismiss() }', 'pageShortcut("Favorites", icon: "bookmark", page: "bookmarks")', '.accessibilityAction(named: "Show all tabs") {}', 'return "Start Page"',
    '.accessibilityLabel("Close \\(tab.pageTitle.isEmpty ? "tab" : tab.pageTitle)")', 'TextField("Search, enter address", text: $x)']) {
    assert.equal(scan(line).length, 1, line);
  }
  for (const line of ['Text("\\(count)")', 'Image(systemName: "plus")', 'Label(SyncCopy.text("ios.island.newTab"), systemImage: "plus")',
    '/// Turning "Keep Spaces in sync" on', '.reject("Unknown layout") // not user-visible', 'SyncCopy.text("ios.tabs.startPage")']) {
    assert.equal(scan(line).length, 0, line);
  }
});

test('the app declares the six languages, so iOS offers a per-app language', () => {
  const six = ['en', 'de', 'es', 'fr', 'it', 'pt-BR'];
  const pbx = fs.readFileSync(path.join(root, 'ios/Blanc/Blanc.xcodeproj/project.pbxproj'), 'utf8');
  const regions = pbx.match(/knownRegions = \(([^)]*)\);/)[1].split(',').map((r) => r.trim().replace(/"/g, '')).filter(Boolean);
  assert.deepEqual(regions.filter((r) => r !== 'Base').sort(), [...six].sort());
  const plist = fs.readFileSync(path.join(root, 'ios/Blanc/Info.plist'), 'utf8');
  const declared = plist.match(/<key>CFBundleLocalizations<\/key>\s*<array>([\s\S]*?)<\/array>/)[1].match(/<string>([^<]+)<\/string>/g).map((s) => s.slice(8, -9));
  assert.deepEqual(declared, six);
  const catalog = JSON.parse(fs.readFileSync(path.join(root, 'ios/Blanc/Blanc/InfoPlist.xcstrings'), 'utf8'));
  assert.deepEqual(Object.keys(catalog.strings.NSCameraUsageDescription.localizations).sort(), [...six].sort());
});

module.exports = { scan };
