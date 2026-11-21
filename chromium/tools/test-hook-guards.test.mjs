// A release build must never read a Blanc test switch: every C++ read of a `blanc-…test…` switch
// sits inside a test-hook guard (ENABLE_BLANC_TEST_HOOKS, or the sync runner's BLANC_SYNC_TEST_HOOKS,
// which only preview targets define). check-hook-gates.py covers the desktop prototype UI only.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = fileURLToPath(new URL('../blanc/', import.meta.url));
const GUARD = /^#\s*if(?:def)?\b.*(ENABLE_BLANC_TEST_HOOKS|BLANC_SYNC_TEST_HOOKS)/;
const READ = /HasSwitch\(\s*"(blanc-[^"]*test[^"]*)"/;

// Each `blanc-…test…` switch read that no enclosing #if guards, as "file:line switch".
export function unguardedReads(source, file) {
  const stack = [], found = [];
  source.split('\n').forEach((line, i) => {
    const t = line.trim();
    if (/^#\s*if/.test(t)) stack.push({guard: GUARD.test(t), inElse: false});
    else if (/^#\s*(else|elif)/.test(t)) { if (stack.length) stack[stack.length - 1].inElse = true; }
    else if (/^#\s*endif/.test(t)) stack.pop();
    const m = READ.exec(line);
    if (m && !stack.some(s => s.guard && !s.inElse)) found.push(`${file}:${i + 1} ${m[1]}`);
  });
  return found;
}

function sources(dir) {
  return fs.readdirSync(dir, {withFileTypes: true}).flatMap(e => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? sources(p) : /\.(cc|h|mm)$/.test(e.name) ? [p] : [];
  });
}

test('the finder catches an unguarded read, and one in the #else of a guard', () => {
  assert.deepEqual(unguardedReads('x;\nHasSwitch("blanc-foo-test-x");\n', 'a.cc'), ['a.cc:2 blanc-foo-test-x']);
  assert.deepEqual(unguardedReads('#if BUILDFLAG(ENABLE_BLANC_TEST_HOOKS)\nok;\n#else\nHasSwitch("blanc-test-y");\n#endif\n', 'b.cc'),
    ['b.cc:4 blanc-test-y']);
  assert.deepEqual(unguardedReads('#if BUILDFLAG(ENABLE_BLANC_TEST_HOOKS)\nHasSwitch("blanc-test-z");\n#endif\n', 'c.cc'), []);
  assert.deepEqual(unguardedReads('#if defined(BLANC_SYNC_TEST_HOOKS)\n#if X\nHasSwitch("blanc-sync-test");\n#endif\n#endif\n', 'd.cc'), []);
});

test('every Blanc C++ read of a test switch is behind a test-hook guard', () => {
  const found = sources(ROOT).flatMap(p => unguardedReads(fs.readFileSync(p, 'utf8'), path.relative(ROOT, p)));
  assert.deepEqual(found, []);
});
