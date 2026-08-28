// Pure logic for the blancbrowser.com/dl/* counted download redirect.
// No Workers APIs here — unit-tested by test/unit/ping-worker-dl.test.js.

// The four site download targets. Mirrors site/src/scripts/site.js pickAsset:
// a Mac UA can't reveal arm64 vs x64, so there is deliberately no '/dl/mac' —
// generic Mac CTAs go to /download where both artifacts are explicit.
export const DL_TARGETS = new Set(['mac-arm64', 'mac-x64', 'win', 'linux']);

// Public Ads Manager data-source identifier. The API credential stays in the
// OPENAI_CONVERSIONS_API_KEY Worker secret and never enters source or the site.
export const OPENAI_PIXEL_ID = 'KgcfQzLTx8Dr91nDiQLFAk';
export const OPENAI_CONVERSION_EVENT = 'blanc_download';

export function validOppref(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 2048;
}

// Deliberately contains no user object, IP, user agent, email, or persistent
// Blanc identifier. opt_out also asks OpenAI not to use this event for future
// user-level personalization.
export function buildDownloadConversionEvent({ target, oppref, timestampMs, eventId }) {
  if (!DL_TARGETS.has(target) || !validOppref(oppref)) return null;
  if (!Number.isSafeInteger(timestampMs) || typeof eventId !== 'string' || !eventId) return null;
  return {
    id: eventId,
    type: 'custom',
    custom_event_name: OPENAI_CONVERSION_EVENT,
    timestamp_ms: timestampMs,
    oppref,
    source_url: `https://blancbrowser.com/dl/${target}`,
    action_source: 'web',
    opt_out: true,
    data: { type: 'custom', platform: target },
  };
}

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
