// Owner-side Play Developer API adapter. Credentials and tokens stay in memory;
// callers own approval and ledger state, which may advance only after commit.
import {createPrivateKey, sign} from 'node:crypto';
import {readFile} from 'node:fs/promises';

const OAUTH = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/androidpublisher';
const ORIGIN = 'https://androidpublisher.googleapis.com';
const check = (condition, message) => { if (!condition) throw new Error(message); };
const bearer = value => typeof value === 'string' && /^[A-Za-z0-9._~+\/-]+=*$/.test(value);

// Never propagate a fetch/JSON exception, status text or response body: those
// may contain the assertion, credential or bearer token. Redirects are refused
// so credentials cannot leave the fixed Google origins.
async function request(fetchImpl, url, options, operation, json = true) {
  try {
    const response = await fetchImpl(url, {...options, redirect: 'error'});
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error();
    }
    if (json) return await response.json();
    // Acknowledged writes (especially commit) succeeded already. Failure to
    // discard an unused response body must not turn them into retryable writes.
    try { await response.body?.cancel(); } catch { /* No response data is needed. */ }
  } catch {
    throw new Error(`Play ${operation} failed`);
  }
}

// `now` is Unix milliseconds (Date.now units). JWT NumericDate is seconds;
// Google accepts a maximum one-hour assertion lifetime. No disk key is needed.
export async function accessToken(serviceAccountJson, now = Date.now(), fetchImpl = globalThis.fetch) {
  let assertion;
  try {
    const account = JSON.parse(serviceAccountJson);
    check(account?.type === 'service_account' && typeof account.client_email === 'string' && /^[^\s@]+@[^\s@]+$/.test(account.client_email), 'invalid credential');
    check(account.token_uri === undefined || account.token_uri === OAUTH, 'invalid token endpoint');
    check(typeof account.private_key === 'string', 'invalid private key');
    check(typeof now === 'number' && Number.isFinite(now) && now >= 0, 'invalid clock');
    const iat = Math.floor(now / 1000);
    check(Number.isSafeInteger(iat + 3600), 'invalid clock');
    const key = createPrivateKey(account.private_key);
    check(key.asymmetricKeyType === 'rsa', 'RS256 requires RSA');
    const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
    const unsigned = `${encode({alg: 'RS256', typ: 'JWT'})}.${encode({iss: account.client_email, scope: SCOPE, aud: OAUTH, iat, exp: iat + 3600})}`;
    assertion = `${unsigned}.${sign('RSA-SHA256', Buffer.from(unsigned), key).toString('base64url')}`;
  } catch {
    throw new Error('Invalid Play service-account credential or clock');
  }
  const result = await request(fetchImpl, OAUTH, {
    method: 'POST', headers: {'content-type': 'application/x-www-form-urlencoded'},
    body: new URLSearchParams({grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion}).toString(),
  }, 'token exchange');
  check(bearer(result?.access_token), 'Play token exchange returned no valid access token');
  return result.access_token;
}

export async function uploadToInternal({packageName, aabPath, versionCode, releaseName, token}, fetchImpl = globalThis.fetch) {
  check(typeof packageName === 'string' && /^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+$/.test(packageName), 'Invalid Play package name');
  check(Number.isSafeInteger(versionCode) && versionCode > 0, 'Invalid Play version code');
  check(typeof releaseName === 'string' && releaseName.trim(), 'Missing Play release name');
  check(bearer(token), 'Invalid Play access token');
  // Buffer owns its bytes and readFile closes the descriptor before fetch,
  // including recording fakes that do not consume a streaming request body.
  let bytes;
  try { bytes = await readFile(aabPath); }
  catch { throw new Error('Cannot read Play upload bundle'); }
  const edits = `${ORIGIN}/androidpublisher/v3/applications/${packageName}/edits`;
  const headers = {'authorization': `Bearer ${token}`, 'content-type': 'application/json'};
  let editId;
  try {
    const edit = await request(fetchImpl, edits, {method: 'POST', headers, body: '{}'}, 'edit creation');
    check(typeof edit?.id === 'string' && edit.id.length > 0, 'Play returned no edit ID');
    editId = edit.id;
    const encoded = encodeURIComponent(editId), editURL = `${edits}/${encoded}`;
    const uploaded = await request(fetchImpl, `${ORIGIN}/upload/androidpublisher/v3/applications/${packageName}/edits/${encoded}/bundles?uploadType=media`, {
      method: 'POST', headers: {...headers, 'content-type': 'application/octet-stream'}, body: bytes,
    }, 'bundle upload');
    check(uploaded?.versionCode === versionCode, 'Uploaded Play bundle version code differs from requested version code');
    await request(fetchImpl, `${editURL}/tracks/internal`, {
      method: 'PUT', headers,
      body: JSON.stringify({track: 'internal', releases: [{name: releaseName, versionCodes: [String(versionCode)], status: 'completed'}]}),
    }, 'internal track update', false);
    await request(fetchImpl, `${editURL}:commit`, {method: 'POST', headers}, 'edit commit', false);
    return {editId, versionCode};
  } catch (error) {
    if (editId !== undefined) {
      try { await request(fetchImpl, `${edits}/${encodeURIComponent(editId)}`, {method: 'DELETE', headers}, 'edit deletion', false); }
      catch { /* Preserve the original sanitized error; retry always opens a new edit. */ }
    }
    throw error;
  }
}
