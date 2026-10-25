'use strict';

// M16 wire protocol. Pure decisions only: no Electron, persistence or networking.
// See docs/superpowers/specs/2026-10-25-shared-spaces-sync-design.md.
const crypto = require('node:crypto');
const { canonical } = require('./tabsync-model');
const Identity = require('../renderer/space-identity');
const { normalizeTabName } = require('./tab-name');
const LIMITS = Object.freeze({ tabsPerSpace: 500, spaces: 25, plaintextGuide: 320 * 1024,
  blobBytes: 524288 - 4096, tombstoneMs: 30 * 24 * 60 * 60 * 1000 });
const alphabet = '0123456789abcdefghijklmnopqrstuvwxyz';
const isId = value => typeof value === 'string' && /^[0-9a-f]{32}$/.test(value);
const isKey = value => typeof value === 'string' && /^[0-9a-z]*[1-9a-z]$/.test(value);
const copy = value => value === undefined ? undefined : structuredClone(value);
const field = (v, c, by) => ({ v: copy(v), c, by });
const isField = value => value && Object.hasOwn(value, 'v') && Number.isSafeInteger(value.c) && value.c >= 0 && typeof value.by === 'string' && value.by.length > 0 && value.by.length <= 128;

function mergeField(a, b, name) {
  if (!isField(a)) return isField(b) ? copy(b) : undefined;
  if (!isField(b)) return copy(a);
  if (name === 'deleted' && a.v !== b.v) return copy(a.v === true ? a : b);
  if (a.c !== b.c) return copy(a.c > b.c ? a : b);
  if (a.by !== b.by) return copy(a.by < b.by ? a : b);
  return copy(canonical(a.v) <= canonical(b.v) ? a : b);
}
function mergeRecord(a = {}, b = {}) {
  const out = {};
  for (const name of [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()) {
    const winner = mergeField(a[name], b[name], name);
    if (winner) out[name] = winner;
  }
  return out;
}
function mid(a = '', b = '') {
  if ((a && !isKey(a)) || (b && !isKey(b)) || (a && b && a >= b)) throw new RangeError('Invalid position bounds');
  let out = '', n = 0;
  for (;;) {
    const da = n < a.length ? alphabet.indexOf(a[n]) : 0;
    const db = !b || n >= b.length ? 36 : alphabet.indexOf(b[n]);
    if (da === db) { out += alphabet[da]; n++; continue; }
    if (db - da >= 2) return out + alphabet[Math.floor((da + db) / 2)];
    out += alphabet[da]; a = a.slice(n + 1); b = ''; n = 0;
  }
}
function tagOf(id) {
  if (!isId(id)) throw new TypeError('Invalid record id');
  return [...id].map(h => alphabet[parseInt(h, 16) + 1]).join('');
}
const keyFor = (a, b, id) => mid(a, b) + tagOf(id);
const validKey = (key, id) => isId(id) && typeof key === 'string' && key.length > 32 && key.endsWith(tagOf(id)) && isKey(key.slice(0, -32));
function orderOf(records) {
  return Object.keys(records).filter(id => isId(id) && records[id]?.deleted?.v !== true).sort((a,b) => {
    const ak = records[a]?.pos?.v, bk = records[b]?.pos?.v;
    const av = validKey(ak,a), bv = validKey(bk,b);
    if (av !== bv) return av ? -1 : 1;
    return av && ak !== bk ? (ak < bk ? -1 : 1) : (a < b ? -1 : a > b ? 1 : 0);
  });
}
const acknowledged = (fetched, pending, name) => isField(fetched) && canonical(mergeField(fetched,pending,name)) === canonical(fetched);
const revisionOf = blob => crypto.createHash('sha256').update(canonical(blob), 'utf8').digest('hex').slice(0,16);
const blobFits = (blob, encryptFn) => Buffer.byteLength(JSON.stringify(encryptFn(JSON.stringify(blob))), 'utf8') <= LIMITS.blobBytes;
const liveTabCount = blob => Object.values(blob?.tabs ?? {}).filter(t => t?.deleted?.v !== true).length;
const text = (v,n) => typeof v === 'string' ? v.slice(0,n) : null;
function nav(v) {
  if (!v || typeof v.url !== 'string' || v.url.length > 2048) return undefined;
  try { const u = new URL(v.url); if (u.protocol !== 'http:' && u.protocol !== 'https:') return undefined; } catch { return undefined; }
  return { url: v.url, title: text(v.title,200) ?? '' };
}
const schemas = {
  tabs: { nav, name: normalizeTabName, pinned: v => typeof v === 'boolean' ? v : undefined,
    groupId: v => v === null || isId(v) ? v : undefined, pos: v => typeof v === 'string' ? v : undefined,
    deleted: v => typeof v === 'boolean' ? v : undefined },
  groups: { name: v => text(v,60), color: v => v === null ? null : Identity.normalizeHex(v),
    collapsed: v => typeof v === 'boolean' ? v : undefined, pos: v => typeof v === 'string' ? v : undefined,
    deleted: v => typeof v === 'boolean' ? v : undefined },
  spaces: { name: v => (text(v,60) ?? '').trim() || 'Space', color: v => Identity.normalizeHex(v) || '#426c4c',
    symbol: v => Identity.isSymbol(v) ? v : 'briefcase', pos: v => typeof v === 'string' ? v : undefined,
    deleted: v => typeof v === 'boolean' ? v : undefined },
};
function sanitizeRecord(raw, kind) {
  if (!raw || typeof raw !== 'object') return null;
  const out = {};
  for (const [name, normalize] of Object.entries(schemas[kind])) {
    if (!isField(raw[name])) continue;
    const v = normalize(raw[name].v);
    if (v !== undefined && (v !== null || ['name','color','groupId'].includes(name))) out[name] = field(v,raw[name].c,raw[name].by);
  }
  if (!out.deleted) return null;
  if (!out.deleted.v && Object.keys(schemas[kind]).some(k => !Object.hasOwn(out,k))) return null;
  if (kind === 'spaces') {
    if (typeof raw.rev === 'string' && /^[0-9a-f]{16}$/.test(raw.rev)) out.rev = raw.rev;
    if (Number.isSafeInteger(raw.createdAt) && raw.createdAt >= 0) out.createdAt = raw.createdAt;
    if (typeof raw.createdBy === 'string') out.createdBy = raw.createdBy.slice(0,128);
  }
  return out;
}
function sanitizeMap(raw,kind) {
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const id of Object.keys(raw).sort()) {
    if (!isId(id)) continue;
    const record = sanitizeRecord(raw[id],kind);
    if (record) out[id] = record;
  }
  return out;
}
function sanitizeBlob(raw) {
  if (!raw || raw.v !== 1 || !isId(raw.spaceId)) return null;
  const out = { v:1, spaceId:raw.spaceId, groups:sanitizeMap(raw.groups,'groups'), tabs:sanitizeMap(raw.tabs,'tabs') };
  if (isField(raw.active) && isId(raw.active.v)) out.active = copy(raw.active);
  return out;
}
function sanitizeIndex(raw) { return {v:1,spaces:sanitizeMap(raw?.spaces,'spaces')}; }
function mergeBlob(a,b) {
  const left = sanitizeBlob(a), right = sanitizeBlob(b);
  if (!left) return copy(right);
  if (!right) return copy(left);
  if (left.spaceId !== right.spaceId) throw new TypeError('Space identity mismatch');
  const out = {v:1,spaceId:left.spaceId,groups:{},tabs:{}};
  for (const kind of ['groups','tabs']) {
    for(const id of [...new Set([...Object.keys(left[kind]),...Object.keys(right[kind])])].sort()) out[kind][id] = mergeRecord(left[kind][id],right[kind][id]);
  }
  const active=mergeField(left.active,right.active,'active'); if(active)out.active=active;
  return out;
}
function mergeIndex(a,b) {
  const left=sanitizeIndex(a),right=sanitizeIndex(b),out={v:1,spaces:{}};
  for(const id of [...new Set([...Object.keys(left.spaces),...Object.keys(right.spaces)])].sort()) {
    const l=left.spaces[id]??{},r=right.spaces[id]??{};
    const record=mergeRecord(l,r);
    // These are deterministic hints/immutable metadata, not independently edited fields.
    for(const key of ['rev','createdAt','createdBy']) {
      const values=[l[key],r[key]].filter(v=>v!==undefined).sort((x,y)=>canonical(x)<canonical(y)?-1:1);
      if(values.length)record[key]=values[0];
    }
    out.spaces[id]=record;
  }
  return out;
}
function expireTombstones(blob,now) {
  const out=copy(blob);
  for(const kind of ['tabs','groups','spaces'])if(out?.[kind])for(const [id,r] of Object.entries(out[kind])) {
    if(r.deleted?.v===true && now-r.deleted.c>=LIMITS.tombstoneMs)delete out[kind][id];
  }
  return out;
}
const effectiveGroup = (blob,tab) => {
  const id=tab?.groupId?.v;
  return id && blob.groups?.[id] && blob.groups[id].deleted?.v!==true ? id : null;
};
module.exports = { LIMITS, field, mergeField, mergeRecord, mergeBlob, mergeIndex, mid, tagOf, keyFor, validKey, orderOf,
  acknowledged, revisionOf, blobFits, liveTabCount, sanitizeBlob, sanitizeIndex, expireTombstones, effectiveGroup };
