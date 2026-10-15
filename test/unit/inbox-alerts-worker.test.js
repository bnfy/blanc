'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createHmac, randomBytes } = require('node:crypto');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const WORKER_PATH = path.resolve(__dirname, '../../cloudflare/inbox-alerts-worker/src/index.js');
const BLANC_INBOX = '0edd9b69-e594-4bd4-a648-307e9902c5b9';
const OTHER_INBOX = '11111111-2222-3333-4444-555555555555';
const SECRET_KEY = randomBytes(24);
const SECRET = `whsec_${SECRET_KEY.toString('base64')}`;

let worker;
let buildAlert;
test.before(async () => {
  const module = await import(pathToFileURL(WORKER_PATH));
  worker = module.default;
  buildAlert = module.buildAlert;
});

function env(overrides = {}) {
  return {
    RESEND_WEBHOOK_SECRET: SECRET,
    RESEND_API_KEY: 're_test',
    ALERT_FROM: 'Blanc Inbox Alerts <alerts@blanc.day>',
    ALERT_TO: 'owner@example.com',
    INBOXES: { [BLANC_INBOX]: 'support@blanc.day' },
    ...overrides,
  };
}

function receivedEvent({ inbox = BLANC_INBOX, direction = 'inbound', folder = 'inbox', from = 'Ada <ada@example.com>', subject = 'Sync stopped' } = {}) {
  return {
    type: 'inbox.email.received',
    created_at: '2026-10-15T17:00:00.000Z',
    data: {
      source: 'system',
      inbox_id: inbox,
      thread_id: 't1',
      email_id: 'e1',
      thread: { object: 'inbox_thread', id: 't1', subject, folder, labels: [], read: false },
      email: {
        id: 'e1', direction, from, to: ['support@blanc.day'], cc: [], bcc: [], reply_to: [], subject,
        message_id: '<m1@example.com>', attachments: [{ id: 'a1', filename: 'log.txt', size: 10 }],
        read: false, received_at: '2026-10-15T17:00:00.000Z',
      },
    },
  };
}

function sign(id, timestamp, body, key = SECRET_KEY) {
  return createHmac('sha256', key).update(`${id}.${timestamp}.${body}`).digest('base64');
}

function webhook(event, { id = 'msg_1', timestamp = Math.floor(Date.now() / 1000), signature, method = 'POST' } = {}) {
  const body = typeof event === 'string' ? event : JSON.stringify(event);
  const headers = {
    'content-type': 'application/json',
    'svix-id': id,
    'svix-timestamp': String(timestamp),
    'svix-signature': signature ?? `v1,${sign(id, timestamp, body)}`,
  };
  return new Request('https://blanc-inbox-alerts.example.workers.dev/', method === 'POST' ? { method, headers, body } : { method, headers });
}

async function withFetch(handler, run) {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return handler(url, init);
  };
  try {
    return await run(calls);
  } finally {
    globalThis.fetch = original;
  }
}

const ok = () => new Response(JSON.stringify({ id: 'sent' }), { status: 200 });

test('a signed new-mail event sends one alert with sender and subject only', async () => {
  await withFetch(ok, async (calls) => {
    const response = await worker.fetch(webhook(receivedEvent(), { id: 'msg_42' }), env());
    assert.equal(response.status, 202);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://api.resend.com/emails');
    assert.equal(calls[0].init.headers.Authorization, 'Bearer re_test');
    assert.equal(calls[0].init.headers['Idempotency-Key'], 'inbox-alert-msg_42');
    const sent = JSON.parse(calls[0].init.body);
    assert.deepEqual(sent.to, ['owner@example.com']);
    assert.equal(sent.from, 'Blanc Inbox Alerts <alerts@blanc.day>');
    assert.equal(sent.subject, '[support@blanc.day] Sync stopped');
    assert.match(sent.text, /^New message in support@blanc\.day\n/);
    assert.match(sent.text, /From: Ada <ada@example\.com>\n/);
    assert.match(sent.text, /Attachments: 1\n/);
    assert.match(sent.text, /https:\/\/resend\.com\/inboxes\n$/);
    assert.equal(sent.html, undefined);
  });
});

test('any one valid signature among several is accepted', async () => {
  await withFetch(ok, async (calls) => {
    const event = receivedEvent();
    const timestamp = Math.floor(Date.now() / 1000);
    const good = sign('msg_2', timestamp, JSON.stringify(event));
    const response = await worker.fetch(webhook(event, { id: 'msg_2', timestamp, signature: `v1,${Buffer.from('nope').toString('base64')} v1,${good}` }), env());
    assert.equal(response.status, 202);
    assert.equal(calls.length, 1);
  });
});

test('unsigned, mis-signed, tampered and stale requests send nothing', async () => {
  await withFetch(ok, async (calls) => {
    const event = receivedEvent();
    const body = JSON.stringify(event);
    const timestamp = Math.floor(Date.now() / 1000);
    const cases = [
      webhook(event, { signature: '' }),
      webhook(event, { signature: `v1,${sign('msg_1', timestamp, body, randomBytes(24))}` }),
      webhook(event, { signature: `v2,${sign('msg_1', timestamp, body)}` }),
      webhook(body.replace('Sync stopped', 'Sync started'), { timestamp, signature: `v1,${sign('msg_1', timestamp, body)}` }),
      webhook(event, { timestamp: timestamp - 6 * 60 }),
      webhook(event, { timestamp: timestamp + 6 * 60 }),
      webhook(event, { timestamp: 'soon' }),
    ];
    for (const request of cases) {
      assert.equal((await worker.fetch(request, env())).status, 401);
    }
    assert.equal(calls.length, 0);
  });
});

test('missing configuration refuses every request', async () => {
  await withFetch(ok, async (calls) => {
    for (const name of ['RESEND_WEBHOOK_SECRET', 'RESEND_API_KEY', 'ALERT_FROM', 'ALERT_TO', 'INBOXES']) {
      const response = await worker.fetch(webhook(receivedEvent()), env({ [name]: '' }));
      assert.equal(response.status, 503, name);
    }
    assert.equal(calls.length, 0);
  });
});

test('only POST is accepted', async () => {
  const response = await worker.fetch(webhook(receivedEvent(), { method: 'GET' }), env());
  assert.equal(response.status, 405);
  assert.equal(response.headers.get('Allow'), 'POST');
});

test('other inboxes, outbound mail, spam, trash and other events need no alert', async () => {
  await withFetch(ok, async (calls) => {
    const quiet = [
      receivedEvent({ inbox: OTHER_INBOX }),
      receivedEvent({ direction: 'outbound' }),
      receivedEvent({ folder: 'spam' }),
      receivedEvent({ folder: 'trash' }),
      { ...receivedEvent(), type: 'inbox.thread.created' },
      { ...receivedEvent(), data: { ...receivedEvent().data, inbox_id: 'toString' } },
    ];
    for (const event of quiet) {
      assert.equal((await worker.fetch(webhook(event), env())).status, 204);
    }
    assert.equal(calls.length, 0);
  });
});

test('a failed send asks Resend to retry', async () => {
  await withFetch(() => new Response('{"name":"validation_error"}', { status: 422 }), async () => {
    const response = await worker.fetch(webhook(receivedEvent()), env());
    assert.equal(response.status, 502);
  });
});

test('sender and subject are flattened to one bounded line', () => {
  const alert = buildAlert(receivedEvent({
    from: 'Mallory <m@example.com>\r\nBcc: victim@example.com',
    subject: `Hello\nX-Injected: yes ${'a'.repeat(400)}`,
  }), { [BLANC_INBOX]: 'support@blanc.day' });
  assert.doesNotMatch(alert.subject, /[\r\n]/);
  assert.ok(alert.subject.length <= 180);
  assert.match(alert.text, /From: Mallory <m@example\.com> Bcc: victim@example\.com\n/);
  const subjectLine = alert.text.split('\n').find((line) => line.startsWith('Subject: '));
  assert.ok(subjectLine.length <= 'Subject: '.length + 200);
});

test('a missing subject and sender still produce a readable alert', () => {
  const event = receivedEvent();
  delete event.data.email.subject;
  delete event.data.thread.subject;
  event.data.email.from = '';
  const alert = buildAlert(event, { [BLANC_INBOX]: 'support@blanc.day' });
  assert.equal(alert.subject, '[support@blanc.day] (no subject)');
  assert.match(alert.text, /From: Unknown sender\n/);
});

test('INBOXES may be a JSON string, as when set with wrangler secret or --var', async () => {
  await withFetch(ok, async (calls) => {
    const response = await worker.fetch(webhook(receivedEvent()), env({ INBOXES: JSON.stringify({ [BLANC_INBOX]: 'support@blanc.day' }) }));
    assert.equal(response.status, 202);
    assert.equal(calls.length, 1);
  });
});

test('oversized bodies are refused before any signature work', async () => {
  const body = JSON.stringify({ padding: 'x'.repeat(300 * 1024) });
  const response = await worker.fetch(webhook(body), env());
  assert.equal(response.status, 413);
});
