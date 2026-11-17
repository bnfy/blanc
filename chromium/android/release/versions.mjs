export const NAME = /^1\.0\.0-beta\.[1-9]\d*$/;

function check(condition, message) {
  if (!condition) throw new Error(message);
}

function validateName(versionName) {
  check(typeof versionName === 'string' && versionName === versionName.trim() && NAME.test(versionName),
    'versionName must match 1.0.0-beta.N with a positive beta number');
}

function validateCode(versionCode) {
  check(Number.isSafeInteger(versionCode) && versionCode > 0, 'versionCode must be a positive safe integer');
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
    tags.add(entry.tag);
    names.set(entry.versionName, entry.state);
  }
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
