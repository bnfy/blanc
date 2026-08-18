const { app, net } = require('electron');
const settings = require('./settings');
const model = require('./patron-model');

const PRODUCTION_ORG_ID = '6f675077-6cb1-4965-8db8-15838e5fdb38';
const SANDBOX_ORG_ID = 'a6ffc65a-8ba3-4973-8a2a-e057aa811f9f';
const API_BASE = app.isPackaged ? 'https://api.polar.sh' : 'https://sandbox-api.polar.sh';
const ORG_ID = app.isPackaged ? PRODUCTION_ORG_ID : SANDBOX_ORG_ID;
const MAX_KEY_LENGTH = 200;
const DAY_MS = 24 * 60 * 60 * 1000;

const BENEFIT_ALLOWLIST = app.isPackaged
  ? {
      '2ffaf466-652d-4e45-b92f-560fc25d3c53': 'founding',      // Blanc Supporter License
      'df98506e-a88a-4364-b4c9-cc424dda01f0': 'subscription',  // Blanc Patron Monthly License
      'ed1cce8c-d87e-4d27-b9d7-d30bda2de402': 'subscription',  // Blanc Patron Annual License
    }
  : {
      'de6e9525-3cc4-4232-b96f-f459d56afb19': 'founding',      // sandbox Blanc Supporter License
      '2f5e210c-7d63-4ba6-8818-45f3b7fc9b93': 'subscription',  // sandbox Blanc Patron Monthly License
      '27ecc7d8-f31e-4951-8235-22dda51327c4': 'subscription',  // sandbox Blanc Patron Annual License
    };

async function readJson(res) { try { return await res.json(); } catch { return null; } }

async function activate(key) {
  const trimmed = String(key ?? '').trim();
  if (!trimmed) return { ok: false, message: 'Enter a license key.' };
  if (trimmed.length > MAX_KEY_LENGTH) return { ok: false, message: 'That key is too long.' };
  let res;
  try {
    res = await net.fetch(API_BASE + '/v1/customer-portal/license-keys/activate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: trimmed, organization_id: ORG_ID, label: 'Blanc' }),
    });
  } catch { return { ok: false, message: 'Could not reach Polar. Check your connection and try again.' }; }
  if (!res.ok) return { ok: false, message: 'That license key could not be activated.' };
  const payload = await readJson(res);
  const benefitId = model.readBenefitId(payload);
  const kind = model.resolveKind(benefitId, BENEFIT_ALLOWLIST);
  if (!payload || !kind) return { ok: false, message: 'That license key is not recognized.' };
  if (kind === 'subscription') {
    const lk = payload.license_key ?? payload.activation?.license_key ?? {};
    const lkStatus = lk.status;
    const lkExpiry = model.parseExpiresAt(lk.expires_at);
    if (lkStatus !== 'granted') return { ok: false, message: 'That subscription is not currently active.' };
    if (lkExpiry === false) return { ok: false, message: 'That subscription has an invalid expiry.' };
    if (typeof lkExpiry === 'number' && lkExpiry <= Date.now()) return { ok: false, message: 'That subscription has expired.' };
  }
  const now = Date.now();
  const activationId = payload.activation?.id ?? payload.id ?? null;
  const record = { kind, key: trimmed, activationId, benefitId, activatedAt: now,
    ...(kind === 'subscription' ? { lastValidatedAt: now, lastAttemptedAt: now, lastStatus: 'granted' } : {}) };
  settings.setPatron(record);
  return { ok: true, kind };
}

async function validateIfDue() {
  const p = settings.getPatronRecord();
  if (!p || p.kind !== 'subscription') return;
  if (Date.now() - (p.lastAttemptedAt ?? 0) < DAY_MS) return;
  let outcome;
  try {
    const res = await net.fetch(`${API_BASE}/v1/customer-portal/license-keys/validate`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ organization_id: ORG_ID, key: p.key, activation_id: p.activationId }),
    });
    const body = res.ok ? await readJson(res) : null;
    if (!body || typeof body.status !== 'string') {
      outcome = { kind: 'unreachable' };                 // non-ok OR malformed successful JSON → ambiguous
    } else {
      const benefitOk = model.resolveKind(model.readBenefitId(body), BENEFIT_ALLOWLIST) === 'subscription';
      outcome = { kind: 'ok', status: body.status, expiresAt: model.parseExpiresAt(body.expires_at), benefitOk };
    }
  } catch { outcome = { kind: 'unreachable' }; }
  const { record } = model.evaluateValidation({ outcome, record: p, now: Date.now() });
  settings.setPatron(record);
}

module.exports = { activate, validateIfDue };
