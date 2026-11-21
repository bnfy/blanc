// Which acceptance cases a same-day rerun needs for the files changed since the
// last passing night (scenario-areas.json; owner, 2026-11-14: nightly plus
// targeted rerun). Fail closed: any change it can't place needs the full suite.
import fs from 'node:fs';
import { check } from '../policy.mjs';
import { globMatch } from '../standing.mjs';

export const AREAS_FILE = new URL('./scenario-areas.json', import.meta.url);
export const loadAreas = () => JSON.parse(fs.readFileSync(AREAS_FILE, 'utf8'));

// Files that never reach the desktop build or its test: the Android lane, docs, the release tooling.
const OUTSIDE = ['chromium/blanc/android/**', 'chromium/patches/android/**', 'chromium/upstream-android/**', 'chromium/lanes/android.json',
  'chromium/source-map-android.json', 'chromium/android/**', 'chromium/release/**', 'chromium/tools/**', 'chromium/reports/**', 'chromium/*.md', 'docs/**', 'site/**'];
// Files that change everything, or the test itself.
const FULL = ['chromium/lanes/desktop.json', 'chromium/upstream/**', 'chromium/source-map.json', 'chromium/tests/**', 'chromium/scenarios/**',
  'chromium/blanc/**/BUILD.gn', 'chromium/blanc/**/*.gni', 'chromium/blanc/*.gni', 'chromium/blanc/BUILD.gn', 'chromium/patches/baseline/**'];
const DESKTOP = ['chromium/blanc/**', 'chromium/patches/**'];

export function planTargeted(changed, areas, inventory) {
  check(Array.isArray(changed), 'changed files');
  const features = new Set(areas.smoke), ignored = [];
  for (const file of changed) {
    const full = FULL.find(g => globMatch(g, file));
    if (full) return { full: true, why: `${file} changes the whole build or its test` };
    if (!file.startsWith('chromium/') || OUTSIDE.some(g => globMatch(g, file))) { ignored.push(file); continue; }
    if (!DESKTOP.some(g => globMatch(g, file))) return { full: true, why: `${file} is a fork file no rule places` };
    const area = areas.areas.find(a => a.paths.some(g => globMatch(g, file)));
    if (!area) return { full: true, why: `no scenario area covers ${file}` };
    for (const f of area.features) features.add(f);
  }
  const cases = inventory.scenarios
    .filter(s => s.desktopApplicability === 'applicable' && features.has(s.file.split('/').pop()))
    .flatMap(s => s.cases.map(c => c.id));
  return { full: false, features: [...features].sort(), cases, ignored };
}
