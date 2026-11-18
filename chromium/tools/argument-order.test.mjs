// C++ leaves the order a call's arguments are evaluated in unspecified: the
// Mac's toolchain goes left to right, Windows' (the Microsoft ABI) right to
// left. A call that moves a variable inside one argument (a BindOnce taking
// std::move(v)) and reads it in another (v.Clone()) works on the Mac and reads
// a moved-from value on Windows. W2 found it in the Arc import, which saved no
// Spaces on Windows. This guard fails on that shape anywhere in the fork.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'blanc');
const CLOSE = {'(': ')', '{': '}', '[': ']'};

// Comments and string contents blanked, positions kept.
export function blank(source) {
  // One pass, so a "//" inside a string is not a comment: raw strings, string
  // and character literals, then comments.
  return source.replace(/R"([^(\s]*)\([\s\S]*?\)\1"|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|\/\/[^\n]*|\/\*[\s\S]*?\*\//g,
    m => m.replace(/[^\n]/g, ' '));
}
// The top-level arguments of the call whose '(' is at `open`.
function argumentsAt(s, open) {
  const out = [], stack = [];
  let start = open + 1;
  for (let i = open + 1; i < s.length; i++) {
    const c = s[i];
    if (CLOSE[c]) stack.push(CLOSE[c]);
    else if (stack.length && c === stack.at(-1)) stack.pop();
    else if (!stack.length && c === ')') { out.push(s.slice(start, i)); return out; }
    else if (!stack.length && c === ',') { out.push(s.slice(start, i)); start = i + 1; }
  }
  return out;
}
// std::move(v) inside a nested call of this argument, not inside a lambda body.
function consumedInNestedCall(argument) {
  const names = new Set();
  let paren = 0, brace = 0;
  for (let i = 0; i < argument.length; i++) {
    const c = argument[i];
    if (c === '(') paren++; else if (c === ')') paren--;
    else if (c === '{') brace++; else if (c === '}') brace--;
    else if (paren > 0 && brace === 0 && argument.startsWith('std::move(', i)) {
      const m = /^std::move\((\w+)\)/.exec(argument.slice(i));
      if (m) names.add(m[1]);
    }
  }
  return names;
}
const reads = (argument, name) =>
  new RegExp(`(?<![\\w.>:&])${name}\\s*(\\.|->|\\[)`).test(argument) ||
  new RegExp(`(^|[(,])\\s*${name}\\s*($|[,)])`).test(argument);

export function argumentOrderHazards(source) {
  const s = blank(source), hazards = [];
  for (const m of s.matchAll(/[\w>]\s*\(/g)) {
    const open = m.index + m[0].length - 1;
    const args = argumentsAt(s, open);
    if (args.length < 2) continue;
    args.forEach((argument, i) => {
      for (const name of consumedInNestedCall(argument))
        if (args.some((other, j) => j !== i && reads(other, name)))
          hazards.push({line: s.slice(0, open).split('\n').length, name});
    });
  }
  return hazards;
}

test('the guard finds a variable moved in one argument and read in another', () => {
  const bad = 'Post(FROM_HERE, base::BindOnce(&Write, records.Clone()), base::BindOnce(&Done, std::move(records)));';
  assert.deepEqual(argumentOrderHazards(bad), [{line: 1, name: 'records'}]);
  const copied = 'auto copy = records.Clone();\nPost(FROM_HERE, base::BindOnce(&Write, std::move(copy)), base::BindOnce(&Done, std::move(records)));';
  assert.deepEqual(argumentOrderHazards(copied), []);
  const lambdaBody = 'Call(url, base::BindOnce([](std::string url) { Use(std::move(url)); }, url));';
  const urlInString = 'const GURL url("https://" + host);\nPost(FROM_HERE, Read(id, result), base::BindOnce(&Done, id));';
  assert.deepEqual(argumentOrderHazards(urlInString), []);
  assert.deepEqual(argumentOrderHazards(lambdaBody), []);
});
test('no fork source moves a variable in one argument and reads it in another', () => {
  const found = [];
  const walk = folder => {
    for (const entry of fs.readdirSync(folder, {withFileTypes: true})) {
      const file = path.join(folder, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (/\.(cc|inc|mm|h)$/.test(entry.name))
        for (const hazard of argumentOrderHazards(fs.readFileSync(file, 'utf8')))
          found.push(`${path.relative(root, file)}:${hazard.line} ${hazard.name}`);
    }
  };
  walk(root);
  assert.deepEqual(found, []);
});
