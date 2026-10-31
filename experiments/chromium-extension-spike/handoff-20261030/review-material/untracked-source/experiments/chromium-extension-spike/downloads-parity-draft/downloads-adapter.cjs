'use strict';
// Isolated draft: presentation-side projection only. Native code must bind
// every command to a trusted document, profile and current DownloadItem and
// recheck Chromium's own safety/command policy at execution time.
const shipping = require('./shipping/downloads-row-model.js');
const METHODS = Object.freeze({ cancel: 'downloads.cancel', resume: 'downloads.resume', retry: 'downloads.retry', open: 'downloads.open', show: 'downloads.show' });
const STATES = new Set(['progressing', 'interrupted', 'completed', 'cancelled']);
const CAPABILITIES = new Set(Object.keys(METHODS));
const SECURITY = new Set(['safe', 'needs-review', 'unknown']);

function validateRow(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      typeof value.id !== 'string' || !value.id ||
      typeof value.filename !== 'string' || /[\\/\x00-\x1f\x7f]/.test(value.filename) || /^[a-z]:/i.test(value.filename) || value.filename === '.' || value.filename === '..' ||
      typeof value.url !== 'string' ||
      !STATES.has(value.state) || typeof value.private !== 'boolean' ||
      typeof value.inFlight !== 'boolean' || typeof value.canResume !== 'boolean' ||
      !SECURITY.has(value.security) ||
      !Number.isSafeInteger(value.receivedBytes) || value.receivedBytes < 0 ||
      !Number.isSafeInteger(value.totalBytes) || value.totalBytes < 0 ||
      !Array.isArray(value.capabilities) || value.capabilities.some(x => !CAPABILITIES.has(x))) {
    throw new TypeError('Invalid native download record');
  }
  let displayUrl = '';
  try {
    const parsed = new URL(value.url);
    if (/^https?:\/\//i.test(value.url) && (parsed.protocol === 'http:' || parsed.protocol === 'https:')) displayUrl = parsed.origin;
  } catch { /* Never expose a malformed or local source to the page. */ }
  return Object.freeze({ id: value.id, filename: value.filename, url: displayUrl,
    state: value.state, private: value.private, inFlight: value.inFlight,
    canResume: value.canResume, receivedBytes: value.receivedBytes,
    totalBytes: value.totalBytes, security: value.security, capabilities: Object.freeze([...new Set(value.capabilities)]) });
}
function safeActions(row) {
  const validated = validateRow(row);
  // Intersect the shipping UI's ordered actions with the native backend's
  // current permissions. This does not replace native enforcement.
  return shipping.rowActions(validated).filter(action =>
    validated.capabilities.includes(action) && (validated.security === 'safe' || (action === 'cancel' && validated.inFlight)));
}
function createDownloadsAdapter(request, { timeoutMs = 10000 } = {}) {
  if (typeof request !== 'function') throw new TypeError('Native request function required');
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) throw new TypeError('Invalid request timeout');
  async function bounded(method, args) {
    let timer;
    try {
      return await Promise.race([
        Promise.resolve(request(method, args)),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Native download outcome not confirmed')), timeoutMs); }),
      ]);
    } finally { clearTimeout(timer); }
  }
  async function confirmed(method, args) {
    if (await bounded(method, args) !== true) throw new Error('Native download outcome not confirmed');
    return true;
  }
  async function action(name, id) {
    if (!Object.hasOwn(METHODS, name) || typeof id !== 'string' || !id) throw new TypeError('Invalid download action');
    return confirmed(METHODS[name], [id]);
  }
  return Object.freeze({
    list: async () => {
      const values = await bounded('downloads.list', []);
      if (!Array.isArray(values)) throw new TypeError('Invalid native download list');
      const rows = values.map(validateRow), ids = new Set();
      for (const row of rows) { if (ids.has(row.id)) throw new TypeError('Duplicate download identifier'); ids.add(row.id); }
      return rows;
    },
    cancel: id => action('cancel', id), resume: id => action('resume', id),
    retry: id => action('retry', id), open: id => action('open', id), show: id => action('show', id),
    clearFinished: () => confirmed('downloads.clearFinished', []),
    safeActions,
  });
}
module.exports = { createDownloadsAdapter, safeActions, validateRow };
