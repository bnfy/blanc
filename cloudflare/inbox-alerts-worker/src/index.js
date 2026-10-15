// Blanc inbox alerts: when Resend reports a new inbound message in one of
// Blanc's Resend inboxes, email a short notice (sender, subject, a link to
// Resend) to the owner. Resend Inboxes has no notifications of its own.
//
// The message body never passes through here: Resend's webhook omits it, and
// the notice carries only the sender and subject. Every request must carry a
// valid Resend (Svix) signature; without the secret the Worker refuses all.

const SIGNATURE_TOLERANCE_SECONDS = 5 * 60;
const MAX_BODY_BYTES = 256 * 1024;
const SKIPPED_FOLDERS = new Set(['spam', 'trash']);
const RESEND_INBOXES_URL = 'https://resend.com/inboxes';
const REQUIRED_CONFIG = ['RESEND_WEBHOOK_SECRET', 'RESEND_API_KEY', 'ALERT_FROM', 'ALERT_TO', 'INBOXES'];

const encoder = new TextEncoder();

function base64ToBytes(value) {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

// Svix signing: HMAC-SHA256 over "<svix-id>.<svix-timestamp>.<raw body>" with
// the base64 key after "whsec_"; the header lists one or more "v1,<base64>".
export async function verifySignature(secret, headers, body, nowSeconds) {
  const id = headers.get('svix-id');
  const timestamp = headers.get('svix-timestamp');
  const signatures = headers.get('svix-signature');
  if (!secret || !id || !timestamp || !signatures) return false;
  if (!/^\d{1,12}$/.test(timestamp)) return false;
  if (Math.abs(nowSeconds - Number(timestamp)) > SIGNATURE_TOLERANCE_SECONDS) return false;

  let key;
  try {
    key = await crypto.subtle.importKey(
      'raw',
      base64ToBytes(secret.replace(/^whsec_/, '')),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify'],
    );
  } catch {
    return false;
  }
  const signed = encoder.encode(`${id}.${timestamp}.${body}`);
  for (const entry of signatures.split(' ')) {
    const [version, value] = entry.split(',');
    if (version !== 'v1' || !value) continue;
    let bytes;
    try {
      bytes = base64ToBytes(value);
    } catch {
      continue;
    }
    if (await crypto.subtle.verify('HMAC', key, bytes, signed)) return true;
  }
  return false;
}

// Sender and subject come from whoever wrote the email: keep them to one
// short line of printable text.
function oneLine(value, limit = 200) {
  if (typeof value !== 'string') return '';
  const printable = Array.from(value, (char) => {
    const code = char.codePointAt(0);
    return code < 0x20 || code === 0x7f || code === 0x2028 || code === 0x2029 ? ' ' : char;
  }).join('');
  const flat = printable.replace(/\s+/g, ' ').trim();
  return flat.length > limit ? `${flat.slice(0, limit - 1)}…` : flat;
}

export function parseInboxes(value) {
  const map = typeof value === 'string' ? JSON.parse(value) : value;
  if (!map || typeof map !== 'object' || Array.isArray(map)) throw new Error('INBOXES must map inbox ids to labels');
  return map;
}

// Returns the notice for an event, or null when the event needs none.
export function buildAlert(event, inboxes) {
  if (event?.type !== 'inbox.email.received') return null;
  const data = event.data ?? {};
  const label = Object.hasOwn(inboxes, data.inbox_id) ? oneLine(inboxes[data.inbox_id], 80) : '';
  if (!label) return null;
  const email = data.email;
  if (!email || email.direction !== 'inbound') return null;
  if (SKIPPED_FOLDERS.has(data.thread?.folder)) return null;

  const from = oneLine(email.from) || 'Unknown sender';
  const subject = oneLine(email.subject ?? data.thread?.subject) || '(no subject)';
  const attachments = Array.isArray(email.attachments) ? email.attachments.length : 0;
  const lines = [
    `New message in ${label}`,
    '',
    `From: ${from}`,
    `Subject: ${subject}`,
  ];
  if (attachments) lines.push(`Attachments: ${attachments}`);
  if (typeof email.received_at === 'string') lines.push(`Received: ${oneLine(email.received_at, 40)}`);
  lines.push('', `Read and reply in Resend: ${RESEND_INBOXES_URL}`);
  return { subject: oneLine(`[${label}] ${subject}`, 180), text: `${lines.join('\n')}\n` };
}

function respond(status, message) {
  return new Response(message, { status, headers: { 'content-type': 'text/plain; charset=utf-8' } });
}

export default {
  async fetch(request, env) {
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405, headers: { Allow: 'POST' } });
    }
    const missing = REQUIRED_CONFIG.filter((name) => !env[name]);
    if (missing.length) {
      console.error(JSON.stringify({ event: 'not-configured', missing }));
      return respond(503, 'Not configured');
    }
    if (Number(request.headers.get('content-length') || 0) > MAX_BODY_BYTES) return respond(413, 'Too large');
    const body = await request.text();
    if (encoder.encode(body).length > MAX_BODY_BYTES) return respond(413, 'Too large');

    const nowSeconds = Math.floor(Date.now() / 1000);
    if (!(await verifySignature(env.RESEND_WEBHOOK_SECRET, request.headers, body, nowSeconds))) {
      return respond(401, 'Invalid signature');
    }

    let event;
    let inboxes;
    try {
      event = JSON.parse(body);
      inboxes = parseInboxes(env.INBOXES);
    } catch {
      return respond(400, 'Unreadable event');
    }
    const alert = buildAlert(event, inboxes);
    if (!alert) return new Response(null, { status: 204 });

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
        // Resend retries a webhook with the same svix-id; this keeps a retry
        // from sending a second notice.
        'Idempotency-Key': `inbox-alert-${request.headers.get('svix-id')}`,
      },
      body: JSON.stringify({ from: env.ALERT_FROM, to: [env.ALERT_TO], subject: alert.subject, text: alert.text }),
    });
    if (!response.ok) {
      console.error(JSON.stringify({ event: 'alert-not-sent', status: response.status }));
      // A non-2xx answer makes Resend retry the webhook later.
      return respond(502, 'Alert not sent');
    }
    return respond(202, 'Alert sent');
  },
};
