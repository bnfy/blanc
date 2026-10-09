// Blanc interface-string substrate (S3): catalog in copy/messages/.
//
//   node copy/build.mjs                    regenerate runtime catalogs, locale registry, mobile resources
//   node copy/build.mjs --check            fail on catalog, translation, scope or freshness problems
//   node copy/build.mjs --status <locale>  list missing/stale keys with English and note
//   node copy/build.mjs --ack <locale> <key…>  acknowledge exactly these translations as current
//
// Building never changes a translation's source hash. Only --ack does.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runBuild, runCheck, runStatus, runAck } from './lib/cli.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);

if (args[0] === '--check') {
  const { failures, warnings } = runCheck(ROOT);
  for (const w of warnings) console.warn(`warning: ${w}`);
  if (failures.length) {
    console.error(failures.map((f) => `  ${f}`).join('\n'));
    console.error('\ncopy:check failed.');
    process.exit(1);
  }
  console.log('copy:check OK');
} else if (args[0] === '--status') {
  console.log(runStatus(ROOT, args[1]));
} else if (args[0] === '--ack') {
  runAck(ROOT, args[1], args.slice(2));
  console.log(`acknowledged ${args.length - 2} ${args[1]} entr${args.length === 3 ? 'y' : 'ies'}`);
} else {
  for (const rel of runBuild(ROOT)) console.log(`wrote ${rel}`);
}
