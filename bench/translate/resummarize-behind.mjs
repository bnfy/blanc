// bench/translate/resummarize-behind.mjs
// Recomputes summary.json from raw.json with the current behind-report.js, so
// a corrected check applies to runs that already finished.
// Usage: node bench/translate/resummarize-behind.mjs <raw.json> [<raw.json> ...]
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { summarizeBehind } = require('./lib/behind-report.js');

for (const file of process.argv.slice(2)) {
  const { events, ...raw } = JSON.parse(readFileSync(file, 'utf8'));
  const out = path.join(path.dirname(file), 'summary.json');
  writeFileSync(out, JSON.stringify(summarizeBehind(raw), null, 2) + '\n');
  console.log(`rewrote ${out}`);
}
