// Pure logic for the blancbrowser.com/dl/* counted download redirect.
// No Workers APIs here — unit-tested by test/unit/ping-worker-dl.test.js.

// The four site download targets. Mirrors site/src/scripts/site.js pickAsset:
// a Mac UA can't reveal arm64 vs x64, so there is deliberately no '/dl/mac' —
// generic Mac CTAs go to /download where both artifacts are explicit.
export const DL_TARGETS = new Set(['mac-arm64', 'mac-x64', 'win', 'linux']);

// Pick the artifact for a target from a release's assets
// ([{name, browser_download_url}]). Returns null when the release has no such
// artifact (e.g. releases that intentionally omit mac-x64) — callers must then
// fall back to the releases page rather than promising a file that isn't there.
export function pickAsset(assets, target) {
  if (!Array.isArray(assets)) return null;
  const named = assets.filter((a) => typeof a?.name === 'string');
  if (target === 'mac-arm64' || target === 'mac-x64') {
    const dmgs = named.filter((a) => a.name.endsWith('.dmg'));
    if (target === 'mac-x64') return dmgs.find((a) => !a.name.includes('arm64')) || null;
    return dmgs.find((a) => a.name.includes('arm64')) || null;
  }
  if (target === 'win') return named.find((a) => a.name.endsWith('.exe')) || null;
  if (target === 'linux') return named.find((a) => a.name.endsWith('.AppImage')) || null;
  return null;
}

// KV counter key for one day's clicks on one target: dl:2026-08-28:win
// Never expires — dl:* counters are growth history (active:* convention).
export function dlCountKey(dayBucket, target) {
  return `dl:${dayBucket}:${target}`;
}

// Reshape readMap('dl:') output ({'2026-08-28:win': 3, ...}) into
// {'2026-08-28': {win: 3, ...}, ...} for /stats.
export function groupDlCounts(flat) {
  const out = {};
  for (const [key, count] of Object.entries(flat)) {
    const sep = key.indexOf(':');
    if (sep === -1) continue;
    (out[key.slice(0, sep)] ??= {})[key.slice(sep + 1)] = count;
  }
  return out;
}
