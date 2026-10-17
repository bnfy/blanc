// Keeps the confirmed newsletter list in KV and the Resend segment that
// release notes and the win-back automation send to in step.
//
// Resend → Worker: Resend posts contact.updated and contact.deleted webhooks
// to /resend-webhook. A contact that is unsubscribed (Resend's flag is global
// to the account) or deleted loses its newsletter record here, so an
// unsubscribe from any Resend email also leaves the Worker list.
//
// Worker → Resend: when RESEND_CONTACTS_API_KEY is set, confirming adds the
// address to the segment and the Worker's own unsubscribe link or an admin
// removal takes it out of the segment. Only segment membership changes;
// Resend's global unsubscribed flag is never set or cleared from here because
// the Resend account is shared with other brands. Contact calls need a
// full-access key, so the send-only RESEND_API_KEY is not used for them.
//
// The Blanc Mail waitlist is not synced.

const RESEND_API = 'https://api.resend.com';
// Svix, which signs Resend's webhooks, rejects timestamps more than five
// minutes from now, which stops a captured request being replayed later.
const WEBHOOK_TOLERANCE_SECONDS = 5 * 60;

function logSync(event, details = {}) {
  console.error(JSON.stringify({ event, ...details }));
}

const syncConfigured = (env) => Boolean(env.RESEND_CONTACTS_API_KEY && env.RESEND_SEGMENT_ID);

function contactsRequest(env, method, path, body) {
  return fetch(`${RESEND_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${env.RESEND_CONTACTS_API_KEY}`,
      'Content-Type': 'application/json',
      // Resend refuses requests without a User-Agent.
      'User-Agent': 'blanc-newsletter-worker',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

// A failed sync never undoes the confirmation or unsubscribe the person just
// made; the step is logged by name, without the address.
export async function addToSegment(env, email) {
  if (!syncConfigured(env)) return false;
  try {
    const created = await contactsRequest(env, 'POST', '/contacts', {
      email,
      segments: [{ id: env.RESEND_SEGMENT_ID }],
    });
    if (created.ok) return true;
    // The contact already exists, perhaps from another brand: add it to the
    // segment and leave its subscription status as Resend has it.
    const added = await contactsRequest(
      env, 'POST',
      `/contacts/${encodeURIComponent(email)}/segments/${encodeURIComponent(env.RESEND_SEGMENT_ID)}`
    );
    if (!added.ok) logSync('resend-sync-add-failed', { status: added.status });
    return added.ok;
  } catch (error) {
    logSync('resend-sync-add-failed', { error: String(error?.name ?? 'Error') });
    return false;
  }
}

export async function removeFromSegment(env, email) {
  if (!syncConfigured(env)) return false;
  try {
    const removed = await contactsRequest(
      env, 'DELETE',
      `/contacts/${encodeURIComponent(email)}/segments/${encodeURIComponent(env.RESEND_SEGMENT_ID)}`
    );
    // 404: the address was never in Resend, which is already the goal.
    if (!removed.ok && removed.status !== 404) logSync('resend-sync-remove-failed', { status: removed.status });
    return removed.ok || removed.status === 404;
  } catch (error) {
    logSync('resend-sync-remove-failed', { error: String(error?.name ?? 'Error') });
    return false;
  }
}

function base64ToBytes(value) {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function bytesToBase64(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function constantTimeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Svix's scheme: base64 HMAC-SHA256 over "<svix-id>.<svix-timestamp>.<raw
// body>", keyed with the base64 part of the whsec_ secret. The signature
// header lists one or more space-separated "v1,<signature>" values.
export async function verifyWebhook(secret, headers, body, nowSeconds = Math.floor(Date.now() / 1000)) {
  const id = headers.get('svix-id');
  const timestamp = headers.get('svix-timestamp');
  const signatures = headers.get('svix-signature');
  if (!secret || !id || !timestamp || !signatures || !/^\d+$/.test(timestamp)) return false;
  if (Math.abs(nowSeconds - Number(timestamp)) > WEBHOOK_TOLERANCE_SECONDS) return false;
  let keyBytes;
  try { keyBytes = base64ToBytes(secret.startsWith('whsec_') ? secret.slice('whsec_'.length) : secret); }
  catch { return false; }
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${id}.${timestamp}.${body}`));
  const expected = bytesToBase64(new Uint8Array(mac));
  return signatures.split(' ').some((entry) => {
    const [version, signature] = entry.split(',', 2);
    return version === 'v1' && typeof signature === 'string' && constantTimeEqual(signature, expected);
  });
}

// Returns the address whose newsletter record should be removed, or null.
export function addressToRemove(event) {
  const email = typeof event?.data?.email === 'string' ? event.data.email.trim().toLowerCase() : '';
  if (!email) return null;
  if (event.type === 'contact.deleted') return email;
  if (event.type === 'contact.updated' && event.data.unsubscribed === true) return email;
  return null;
}
