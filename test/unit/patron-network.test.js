const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const model = require('../../src/main/patron-model');
const suiteIDs = require('../../src/main/patron-suite-benefits.json');

const suiteID = suiteIDs.sandbox[0];
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
      if (name === './patron-suite-benefits.json') return suiteIDs;
      throw new Error(`Unexpected dependency: ${name}`);
    },
  });
  return { api: module.exports, requests, record: () => record };
}

function subscription(benefitId = suiteID) {
  return { kind: 'subscription', key: 'sandbox-fixture', benefitId, activationId: null,
    activatedAt: Date.now() - 1000, lastValidatedAt: Date.now() - 1000,
    lastAttemptedAt: 0, lastStatus: 'granted' };
}

test('configured unlimited Suite activates through sandbox validation with no device identity', async () => {
  const subject = loadPatron({ responses: [response(403, {}), response(200, {
    benefit_id: suiteID, limit_activations: null, status: 'granted', expires_at: null,
  })] });
  assert.equal((await subject.api.activate(' suite-fixture ')).ok, true);
  assert.equal(subject.record().kind, 'subscription');
  assert.equal(subject.record().activationId, null);
  assert.equal(subject.record().benefitId, suiteID);
  assert.deepEqual(subject.requests.map(r => r.url), [
    'https://sandbox-api.polar.sh/v1/customer-portal/license-keys/activate',
    'https://sandbox-api.polar.sh/v1/customer-portal/license-keys/validate',
  ]);
  assert.deepEqual(subject.requests[1].body, {
    key: 'suite-fixture', organization_id: 'a6ffc65a-8ba3-4973-8a2a-e057aa811f9f',
  });
});

test('Mail, Patron and activation-limited Suite cannot use the direct Suite path', async () => {
  for (const [benefit_id, limit_activations] of [[mailID, null], [patronID, null], [suiteID, 1]]) {
    const subject = loadPatron({ responses: [response(403, {}), response(200, {
      benefit_id, limit_activations, status: 'granted', expires_at: null,
    })] });
    assert.equal((await subject.api.activate('fixture')).ok, false);
    assert.equal(subject.record(), null);
  }
});

test('production has no Suite fallback while its benefits remain unconfigured', async () => {
  assert.deepEqual(suiteIDs.production, []);
  const subject = loadPatron({ packaged: true, responses: [response(403, {})] });
  assert.equal((await subject.api.activate('fixture')).ok, false);
  assert.equal(subject.requests.length, 1);
  assert.match(subject.requests[0].url, /^https:\/\/api\.polar\.sh\//);
});

test('Polar HTTP 404 invalidates cached Suite and Patron instead of granting outage grace', async () => {
  for (const benefitId of [suiteID, patronID]) {
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
