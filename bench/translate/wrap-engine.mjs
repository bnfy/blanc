// bench/translate/wrap-engine.mjs
// Usage: node bench/translate/wrap-engine.mjs <upstream build-wasm dir> <out dir>
// Mirrors mozilla/translations inference/scripts/build-wasm.py prepare_js_artifact().
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const [src, out] = process.argv.slice(2);
if (!src || !out) throw new Error('usage: wrap-engine.mjs <build-wasm dir> <out dir>');
const here = path.dirname(fileURLToPath(import.meta.url));
const { engine } = JSON.parse(readFileSync(path.join(here, 'inputs.json'), 'utf8'));
const sha = (b) => createHash('sha256').update(b).digest('hex');

let js = readFileSync(path.join(src, 'bergamot-translator.js'), 'utf8');
const wasm = readFileSync(path.join(src, 'bergamot-translator.wasm'));
const alreadyWrapped = js.includes('function loadBergamot(');
if (!alreadyWrapped) {
  const header = [
    '/* AUTO-GENERATED. DO NOT MODIFY.',
    ' * Built from https://github.com/mozilla/translations at ' + engine.commit,
    ' * and wrapped by bench/translate/wrap-engine.mjs (mirrors upstream prepare_js_artifact).',
    ' *',
    ' * This Source Code Form is subject to the terms of the Mozilla Public',
    ' * License, v. 2.0. If a copy of the MPL was not distributed with this',
    ' * file, You can obtain one at http://mozilla.org/MPL/2.0/. */',
    '',
    'function loadBergamot(Module) {',
    '',
  ].join('\n');
  const body = js.split('\n').map((l) => '  ' + l).join('\n').replace(/console\.log\(/g, 'Module.print(');
  js = `${header}\n${body}\n  return Module;\n}\n`;
}

mkdirSync(out, { recursive: true });
writeFileSync(path.join(out, 'bergamot-translator.js'), js);
writeFileSync(path.join(out, 'bergamot-translator.wasm'), wasm);
const manifest = {
  upstreamCommit: engine.commit,
  wrap: alreadyWrapped ? 'upstream' : 'blanc',
  files: {
    'bergamot-translator.js': { bytes: Buffer.byteLength(js), sha256: sha(js) },
    'bergamot-translator.wasm': { bytes: wasm.length, gzBytes: gzipSync(wasm, { level: 9 }).length, sha256: sha(wasm) },
  },
};
writeFileSync(path.join(out, 'engine-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify(manifest, null, 2));
