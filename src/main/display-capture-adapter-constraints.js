'use strict';

const STRIP_KEYS = new Set(['deviceId', 'groupId']);

function stripIdentifiers(record) {
  if (!record || typeof record !== 'object') return {};
  const out = {};
  for (const [key, value] of Object.entries(record)) {
    if (STRIP_KEYS.has(key)) continue;
    out[key] = value;
  }
  return out;
}

function sanitizeAdapterSnapshot(snapshot) {
  const raw = snapshot && typeof snapshot === 'object' ? snapshot : {};
  return {
    settings: stripIdentifiers(raw.settings),
    capabilities: stripIdentifiers(raw.capabilities),
  };
}

function buildAdapterCapabilities(settings) {
  const width = Math.max(1, Number(settings?.width) || 1);
  const height = Math.max(1, Number(settings?.height) || 1);
  const frameRate = Math.max(1, Number(settings?.frameRate) || 30);
  return {
    width: { min: 1, max: width },
    height: { min: 1, max: height },
    frameRate: { min: 0, max: frameRate },
  };
}

function asConstraintObject(value) {
  if (value == null) return null;
  if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') {
    return { ideal: value };
  }
  if (typeof value === 'object') return value;
  return null;
}

function resolveNumericProperty(name, capability, currentValue, constraintValue) {
  const constraint = asConstraintObject(constraintValue);
  if (!constraint) return { ok: true, value: currentValue };

  const capMin = Number(capability?.min);
  const capMax = Number(capability?.max);
  const minBound = Number.isFinite(capMin) ? capMin : 0;
  const maxBound = Number.isFinite(capMax) ? capMax : Number.POSITIVE_INFINITY;

  if ('min' in constraint && 'max' in constraint && Number(constraint.min) > Number(constraint.max)) {
    return { ok: false, constraint: name };
  }

  if ('exact' in constraint) {
    const exact = Number(constraint.exact);
    if (!Number.isFinite(exact)) return { ok: false, constraint: name };
    if (exact < minBound || exact > maxBound) return { ok: false, constraint: name };
    if ('min' in constraint && exact < Number(constraint.min)) return { ok: false, constraint: name };
    if ('max' in constraint && exact > Number(constraint.max)) return { ok: false, constraint: name };
    return { ok: true, value: exact };
  }

  let low = minBound;
  let high = maxBound;
  if ('min' in constraint) {
    const min = Number(constraint.min);
    if (!Number.isFinite(min) || min > maxBound) return { ok: false, constraint: name };
    low = Math.max(low, min);
  }
  if ('max' in constraint) {
    const max = Number(constraint.max);
    if (!Number.isFinite(max) || max < minBound) return { ok: false, constraint: name };
    high = Math.min(high, max);
  }
  if (low > high) return { ok: false, constraint: name };

  let value = Number(currentValue);
  if (!Number.isFinite(value)) value = low;
  if ('ideal' in constraint) {
    const ideal = Number(constraint.ideal);
    if (Number.isFinite(ideal)) value = ideal;
  }
  value = Math.min(high, Math.max(low, value));
  return { ok: true, value };
}

function resolveAdapterConstraints(capabilities, currentSettings, requested) {
  const caps = capabilities && typeof capabilities === 'object' ? capabilities : {};
  const current = currentSettings && typeof currentSettings === 'object' ? currentSettings : {};
  const request = requested && typeof requested === 'object' ? requested : {};
  const next = {
    width: Number(current.width) || 0,
    height: Number(current.height) || 0,
    frameRate: Number(current.frameRate) || 0,
  };
  const accepted = {};

  for (const name of ['width', 'height', 'frameRate']) {
    if (!(name in request)) continue;
    const resolved = resolveNumericProperty(name, caps[name], next[name], request[name]);
    if (!resolved.ok) return { ok: false, constraint: resolved.constraint };
    next[name] = resolved.value;
    accepted[name] = request[name];
  }

  return {
    ok: true,
    settings: next,
    constraints: accepted,
  };
}

module.exports = {
  sanitizeAdapterSnapshot,
  buildAdapterCapabilities,
  resolveAdapterConstraints,
  ADAPTER_SOURCE: [
    "const STRIP_KEYS = new Set(['deviceId', 'groupId']);",
    stripIdentifiers,
    sanitizeAdapterSnapshot,
    buildAdapterCapabilities,
    asConstraintObject,
    resolveNumericProperty,
    resolveAdapterConstraints,
  ].map((item) => (typeof item === 'string' ? item : Function.prototype.toString.call(item))).join('\n'),
};
