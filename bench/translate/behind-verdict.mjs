// bench/translate/behind-verdict.mjs
// Usage: node bench/translate/behind-verdict.mjs <summary.json> [<summary.json> ...]
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { behindVerdict, renderBehindTable } = require('./lib/behind-report.js');

const files = process.argv.slice(2);
if (!files.length) throw new Error('usage: behind-verdict.mjs <summary.json> ...');
const summaries = files.map((f) => JSON.parse(readFileSync(f, 'utf8')));
process.stdout.write(renderBehindTable(summaries));
const v = behindVerdict(summaries);
console.log(`\nBehind-page gate: ${v.status.toUpperCase()}`);
for (const r of v.reasons) console.log(`- ${r}`);
for (const u of v.unmeasured) console.log(`- not measured: ${u}`);
process.exitCode = v.status === 'pass' ? 0 : 2;
