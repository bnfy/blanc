// Stable releases are MAJOR.MINOR.PATCH; a beta is named after the stable it leads to (1.1.0-beta.3).
const BODY = '[1-9]\\d*\\.(?:0|[1-9]\\d*)\\.(?:0|[1-9]\\d*)(?:-beta\\.[1-9]\\d*)?';
export const NAME = new RegExp(`^${BODY}$`);
export const TAG = new RegExp(`^android-v(${BODY})-([1-9]\\d*)$`);

function check(condition, message) {
  if (!condition) throw new Error(message);
}

function validateName(versionName) {
  check(typeof versionName === 'string' && versionName === versionName.trim() && NAME.test(versionName),
    'versionName must be a stable MAJOR.MINOR.PATCH or a beta MAJOR.MINOR.PATCH-beta.N');
}

function validateCode(versionCode) {
  check(Number.isSafeInteger(versionCode) && versionCode > 0, 'versionCode must be a positive safe integer');
}

export function channelOf(versionName) {
  validateName(versionName);
  return versionName.includes('-beta.') ? 'beta' : 'stable';
}

export function stableOf(versionName) {
  validateName(versionName);
  return versionName.split('-')[0];
}

export function tagFor(versionName, versionCode) {
  validateName(versionName);
  validateCode(versionCode);
  return `android-v${versionName}-${versionCode}`;
}

export function validateLedger(ledger) {
  check(ledger?.schema === 1 && Array.isArray(ledger.builds), 'Android release ledger must have schema 1 and a builds array');
  const tags = new Set();
  const names = new Map();
  for (const [index, entry] of ledger.builds.entries()) {
    check(entry !== null && typeof entry === 'object' && !Array.isArray(entry), 'ledger entry must be an object');
    validateCode(entry.versionCode);
    check(entry.versionCode === index + 1, 'ledger versionCode must start at 1 and increase by exactly 1');
    validateName(entry.versionName);
    check(!tags.has(entry.tag), 'duplicate tag in Android release ledger');
    check(entry.tag === tagFor(entry.versionName, entry.versionCode), 'ledger tag must match versionName and versionCode');
    check(typeof entry.commit === 'string' && entry.commit.length === 40 && /^[a-f0-9]{40}$/.test(entry.commit),
      'ledger commit must be a full lowercase 40-hex Git commit');
    check(['built', 'uploaded', 'abandoned'].includes(entry.state), 'ledger state must be built, uploaded or abandoned');
    const parsedDate = typeof entry.date === 'string' ? Date.parse(entry.date) : NaN;
    const isoDate = Number.isNaN(parsedDate) ? null : new Date(parsedDate).toISOString();
    check(isoDate !== null && (entry.date === isoDate || entry.date === isoDate.slice(0, 10)),
      'ledger date must be a real ISO calendar date (YYYY-MM-DD) or canonical ISO timestamp');
    check(typeof entry.note === 'string', 'ledger note must be a string');
    check(!names.has(entry.versionName) || names.get(entry.versionName) === 'abandoned',
      'versionName can be reused only when every earlier use is abandoned');
    validatePublished(entry);
    tags.add(entry.tag);
    names.set(entry.versionName, entry.state);
  }
}

const TRACKS = ['internal', 'alpha', 'beta', 'production'];
const STATUSES = ['draft', 'completed', 'inProgress', 'halted'];

// Where an uploaded build went, in order: each upload, promotion and rollout change Play committed.
function validatePublished(entry) {
  if (entry.published === undefined) return;
  check(Array.isArray(entry.published), 'ledger published must be an array');
  check(entry.published.length === 0 || entry.state === 'uploaded', 'ledger published entries need an uploaded build');
  for (const item of entry.published) {
    check(item !== null && typeof item === 'object' && TRACKS.includes(item.track) && STATUSES.includes(item.status), 'ledger published entry needs a known track and status');
    const staged = item.status === 'inProgress' || item.status === 'halted';
    check(staged ? typeof item.fraction === 'number' && item.fraction > 0 && item.fraction < 1 : item.fraction === undefined,
      'ledger published fraction belongs only to a staged rollout (0 < fraction < 1)');
    check(typeof item.date === 'string' && !Number.isNaN(Date.parse(item.date)) && new Date(Date.parse(item.date)).toISOString() === item.date, 'ledger published date must be a canonical ISO timestamp');
    check(typeof item.editId === 'string' && item.editId.length > 0, 'ledger published entry needs its Play edit ID');
  }
}

// The newest build whose latest production change isn't a halt: what production users are getting.
export function currentProduction(ledger) {
  validateLedger(ledger);
  for (const entry of [...ledger.builds].reverse()) {
    const last = (entry.published ?? []).filter(item => item.track === 'production').at(-1);
    if (last && last.status !== 'halted') return { versionCode: entry.versionCode, status: last.status, ...(last.fraction === undefined ? {} : { fraction: last.fraction }) };
  }
  return null;
}

export function nextRelease(ledger, versionName) {
  validateLedger(ledger);
  validateName(versionName);
  check(!ledger.builds.some(entry => entry.versionName === versionName && entry.state !== 'abandoned'),
    'versionName can be reused only when every earlier use is abandoned');
  // Every attempt consumes a code, including an abandoned build.
  const versionCode = ledger.builds.length + 1;
  return { versionCode, versionName, tag: tagFor(versionName, versionCode) };
}
