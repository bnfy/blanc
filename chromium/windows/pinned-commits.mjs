// The shipping commits the fork's acceptance harness reads from Git: its
// reference commit and each corrected step's commit (tests/lib/shipping-core.cjs).
// A shallow checkout has none of them, so the hosted runner fetches exactly
// these (.github/workflows/chromium-windows-candidate.yml).
//
//   node chromium/windows/pinned-commits.mjs     # one commit per line
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

export function pinnedCommits(tracker, corrections) {
  const commits = [tracker.shippingCommit, ...corrections.map(correction => correction.commit)];
  for (const commit of commits) if (!/^[0-9a-f]{40}$/.test(commit ?? '')) throw new Error(`Not a full commit: ${commit}`);
  return [...new Set(commits)];
}
if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) {
  const tracker = JSON.parse(fs.readFileSync(new URL('../tracker.json', import.meta.url), 'utf8'));
  const { corrections } = createRequire(import.meta.url)('../tests/lib/shipping-core.cjs');
  console.log(pinnedCommits(tracker, corrections).join('\n'));
}
