const { englishT: t } = require('../support/english-t');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const model = require('../../src/main/patron-model');
const patronID = '2f5e210c-7d63-4ba6-8818-45f3b7fc9b93';
const mailID = '819e65da-12b8-4cb4-a32d-329446b40811';

function response(status, payload) {
  return { status, ok: status >= 200 && status < 300, json: async () => payload };
}

function loadPatron({ responses, initial = null, packaged = false }) {
  let record = initial;
  const requests = [];
  const settings = { getPatronRecord: () => record, setPatron: value => { record = value; } };
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../src/main/patron.js'), 'utf8'), {
    module, Set, Date,
    require(name) {
      if (name === 'electron') return {
        app: { isPackaged: packaged },
        net: { fetch: async (url, options) => {
          requests.push({ url, body: JSON.parse(options.body) });
          const result = responses.shift();
          if (result instanceof Error) throw result;
          assert.ok(result, 'Unexpected extra request');
          return result;
        } },
      };
      if (name === './settings') return settings;
      if (name === './patron-model') return model;
      throw new Error(`Unexpected dependency: ${name}`);
    },
  });
  return { api: module.exports, requests, record: () => record };
}

function subscription(benefitId = patronID) {
  return { kind: 'subscription', key: 'sandbox-fixture', benefitId, activationId: null,
    activatedAt: Date.now() - 1000, lastValidatedAt: Date.now() - 1000,
    lastAttemptedAt: 0, lastStatus: 'granted' };
}

test('Polar HTTP 404 invalidates a cached Patron key instead of granting outage grace', async () => {
  for (const benefitId of [patronID]) {
    const subject = loadPatron({ initial: subscription(benefitId), responses: [response(404, {
      error: 'ResourceNotFound', detail: 'License key is no longer active.',
    })] });
    await subject.api.validateIfDue();
    assert.equal(model.isRecordActive(subject.record(), Date.now()), false);
    assert.equal(subject.record().lastStatus, 'invalid');
  }
});

test('network, rate-limit and server failures preserve existing Browser grace', async () => {
  for (const result of [new Error('offline'), response(429, {}), response(503, {})]) {
    const initial = subscription();
    const subject = loadPatron({ initial, responses: [result] });
    await subject.api.validateIfDue();
    assert.equal(model.isRecordActive(subject.record(), Date.now()), true);
    assert.equal(subject.record().lastValidatedAt, initial.lastValidatedAt);
  }
});

test('a 404 that is not Polar\'s ResourceNotFound keeps the outage grace', async () => {
  for (const payload of [null, { message: 'Not Found' }, '<html>404</html>']) {
    const subject = loadPatron({ initial: subscription(patronID), responses: [response(404, payload)] });
    await subject.api.validateIfDue();
    assert.equal(subject.record().lastStatus, 'granted', JSON.stringify(payload));
    assert.equal(model.isRecordActive(subject.record(), Date.now()), true);
  }
});

test('Polar rate limits and outages during activation report a retry, not a bad key', async () => {
  for (const status of [429, 500, 503]) {
    const subject = loadPatron({ responses: [response(status, {})] });
    const result = await subject.api.activate('fixture', t);
    assert.equal(result.ok, false);
    assert.match(result.message, /not responding right now/);
    assert.equal(subject.requests.length, 1);
  }
});

test('activation accepts only Browser benefits: a Mail key is not recognized', async () => {
  const mail = loadPatron({ responses: [response(200, { id: 'act_1', license_key: { benefit_id: mailID, status: 'granted' } })] });
  assert.equal((await mail.api.activate('mail-key', t)).ok, false);
  assert.equal(mail.record(), null);
  const rejected = loadPatron({ responses: [response(403, {})] });
  assert.match((await rejected.api.activate('fixture', t)).message, /could not be activated/);
  assert.equal(rejected.requests.length, 1, 'a rejected activation makes no second request');
});

test('a Patron key keeps validating after its subscription moves to Suite', async () => {
  // Suite carries the same Patron benefit, so Polar keeps the grant and key.
  const subject = loadPatron({ initial: subscription(patronID), responses: [response(200, {
    benefit_id: patronID, status: 'granted', expires_at: null,
  })] });
  await subject.api.validateIfDue();
  assert.equal(subject.record().lastStatus, 'granted');
  assert.equal(subject.record().key, 'sandbox-fixture');
});
