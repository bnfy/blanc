'use strict';

// Runs only in Electron's utility-process Plugin helper. This is the sole
// module allowed to import @1password/sdk, own its account-wide client handle,
// or see decrypted Item objects. Replies are bounded projections; SDK errors
// are reduced to fixed codes before crossing back to Blanc's main process.

const { rankMatches, parseWebUrl } = require('./onepassword-policy');
const { version } = require('../../package.json');

let cachedAccount = null;
let cachedClient = null;

function validAccount(value) {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= 200;
}

function validId(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 200;
}

function fixedErrorCode(error) {
  if (error?.code === 'selection-changed') return 'selection-changed';
  const names = new Set([
    String(error?.name || ''),
    String(error?.constructor?.name || ''),
  ]);
  const message = String(error?.message || error || '');
  if (names.has('DesktopSessionExpiredError') || names.has('AuthExpiredError')
      || /desktop session expired|auth(?:entication|orization)? expired|invalid client id/i.test(message)) {
    return 'session-expired';
  }
  if (/desktop application not found|native library is not available/i.test(message)) {
    return 'desktop-unavailable';
  }
  if (/account.*not found|unknown account|no account/i.test(message)) return 'account-not-found';
  if (/authoriz|denied|cancel|locked|biometric|permission/i.test(message)) return 'not-authorized';
  return 'sdk-error';
}

function isStaleClientError(error) {
  return fixedErrorCode(error) === 'session-expired';
}

async function clientFor(account) {
  if (!validAccount(account)) throw Object.assign(new Error('invalid account'), { code: 'invalid-request' });
  const normalized = account.trim();
  if (cachedClient && cachedAccount === normalized) return cachedClient;
  cachedClient = null;
  cachedAccount = normalized;
  const sdk = require('@1password/sdk');
  cachedClient = await sdk.createClient({
    auth: new sdk.DesktopAuth(normalized),
    integrationName: 'Blanc Browser',
    integrationVersion: `v${version}`,
  });
  return cachedClient;
}

async function findLoginsWith(client, pageUrl) {
  if (!parseWebUrl(pageUrl)) throw Object.assign(new Error('invalid page url'), { code: 'invalid-request' });
  const candidates = [];
  const vaults = await client.vaults.list();
  for (const vault of vaults) {
    if (!validId(vault?.id)) continue;
    let overviews;
    try {
      overviews = await client.items.list(vault.id);
    } catch (error) {
      if (isStaleClientError(error)) throw error;
      continue; // one inaccessible vault must not make all usable logins disappear
    }
    for (const overview of overviews) {
      if (overview?.category !== 'Login' || !validId(overview.id)) continue;
      if (overview.state && overview.state !== 'active') continue;
      candidates.push({
        vaultId: vault.id,
        vaultName: typeof vault.title === 'string' ? vault.title.slice(0, 200) : '',
        itemId: overview.id,
        title: typeof overview.title === 'string' ? overview.title.slice(0, 200) : '',
        websites: Array.isArray(overview.websites)
          ? overview.websites.slice(0, 50).map((website) => ({
            url: typeof website?.url === 'string' ? website.url.slice(0, 2048) : '',
            autofillBehavior: website?.autofillBehavior,
          }))
          : [],
        updatedAt: overview.updatedAt instanceof Date
          ? overview.updatedAt.toISOString()
          : String(overview.updatedAt || ''),
      });
    }
  }
  const ranked = rankMatches(candidates, pageUrl);
  return {
    candidates: await addPickerUsernames(client, ranked.kept),
    truncated: ranked.truncated,
  };
}

async function findLogins({ account, pageUrl }) {
  try {
    return await findLoginsWith(await clientFor(account), pageUrl);
  } catch (error) {
    if (!isStaleClientError(error)) throw error;
    cachedClient = null;
    return findLoginsWith(await clientFor(account), pageUrl);
  }
}

/** Settings → Verify: authorization plus the cheapest authenticated read.
 * The vault list is discarded — only ok/error-kind ever leaves the broker.
 * An addition beside the frozen methods, never a rename (plan Task 8). */
async function verifyAccountWith(client) {
  await client.vaults.list();
  return { ok: true };
}

async function verifyAccount({ account }) {
  try {
    return await verifyAccountWith(await clientFor(account));
  } catch (error) {
    if (!isStaleClientError(error)) throw error;
    cachedClient = null;
    return verifyAccountWith(await clientFor(account));
  }
}

function readBuiltIn(item, id) {
  // @1password/sdk defines Login's built-ins by these stable IDs. Keep this
  // exact instead of guessing from localized titles or broad field types.
  const field = (Array.isArray(item?.fields) ? item.fields : [])
    .find((candidate) => candidate?.id === id);
  return typeof field?.value === 'string' ? field.value : null;
}

async function addPickerUsernames(client, candidates) {
  if (!Array.isArray(candidates) || candidates.length < 2) return candidates;
  return Promise.all(candidates.map(async (candidate) => {
    let item = null;
    try {
      item = await client.items.get(candidate.vaultId, candidate.itemId);
      const username = readBuiltIn(item, 'username');
      const itemVersion = Number.isSafeInteger(item?.version) && item.version >= 0
        ? item.version
        : null;
      return {
        ...candidate,
        // Candidate selection is bounded to PICKER_MAX before these reads.
        // Project only the Login built-in needed to distinguish accounts;
        // passwords, notes, and custom fields never leave this helper.
        // Never show an identity that cannot be bound to the later reveal.
        username: itemVersion !== null && typeof username === 'string'
          ? username.slice(0, 320)
          : '',
        itemVersion,
      };
    } finally {
      item = null;
    }
  }));
}

async function revealCredential({
  account, vaultId, itemId, expectedItemVersion, includeUsername, includePassword,
}) {
  if (!validId(vaultId) || !validId(itemId)) {
    throw Object.assign(new Error('invalid ref'), { code: 'invalid-request' });
  }
  if (typeof includeUsername !== 'boolean' || typeof includePassword !== 'boolean'
      || (!includeUsername && !includePassword)) {
    throw Object.assign(new Error('invalid field request'), { code: 'invalid-request' });
  }
  if (expectedItemVersion !== null && expectedItemVersion !== undefined
      && (!Number.isSafeInteger(expectedItemVersion) || expectedItemVersion < 0)) {
    throw Object.assign(new Error('invalid item version'), { code: 'invalid-request' });
  }
  const client = await clientFor(account);
  let item = null;
  try {
    item = await client.items.get(vaultId, itemId);
    if (expectedItemVersion !== null && expectedItemVersion !== undefined
        && item?.version !== expectedItemVersion) {
      throw Object.assign(new Error('selected item changed'), { code: 'selection-changed' });
    }
    return {
      username: includeUsername ? readBuiltIn(item, 'username') : null,
      password: includePassword ? readBuiltIn(item, 'password') : null,
    };
  } finally {
    item = null;
  }
}

async function dispatch(method, payload) {
  if (method === 'find-logins') return findLogins(payload ?? {});
  if (method === 'reveal-credential') return revealCredential(payload ?? {});
  if (method === 'verify-account') return verifyAccount(payload ?? {});
  if (method === 'probe-package') {
    require('@1password/sdk');
    return { loaded: true };
  }
  throw Object.assign(new Error('unknown method'), { code: 'invalid-request' });
}

async function handleMessage(message, send) {
  const id = message?.id;
  if (!Number.isSafeInteger(id) || id < 1) return;
  try {
    const value = await dispatch(message.method, message.payload);
    send({ id, ok: true, value });
  } catch (error) {
    send({ id, ok: false, error: error?.code === 'invalid-request'
      ? 'invalid-request'
      : fixedErrorCode(error) });
  }
}

if (process.parentPort) {
  process.parentPort.on('message', (event) => {
    handleMessage(event.data, (reply) => process.parentPort.postMessage(reply));
  });
}

module.exports = {
  validAccount,
  validId,
  fixedErrorCode,
  isStaleClientError,
  findLoginsWith,
  verifyAccountWith,
  readBuiltIn,
  dispatch,
  handleMessage,
};
