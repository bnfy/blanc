// bench/translate/verdict.mjs
// Usage: node bench/translate/verdict.mjs <summary.json> [<summary.json> ...]
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { gateVerdict, renderMarkdownTable } = require('./lib/report.js');

const files = process.argv.slice(2);
if (!files.length) throw new Error('usage: verdict.mjs <summary.json> ...');
const summaries = files.map((f) => JSON.parse(readFileSync(f, 'utf8')));
process.stdout.write(renderMarkdownTable(summaries));
const verdict = gateVerdict(summaries);
console.log(`\nSpeed and output gate: ${verdict.pass ? 'PASS' : 'FAIL'}`);
for (const r of verdict.reasons) console.log(`- ${r}`);
console.log('Markup fidelity: owner judgement (see quality.html and the markup counts).');
process.exitCode = verdict.pass ? 0 : 2;
