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
  // A cleared selection retains the rank of its original target. Only when
  // the entire write identity ties does the clear marker win over its live
  // form; it must not reorder two different equal-clock targets.
  if (name === 'active' && a.v === b.v && (a.cleared === true || b.cleared === true)) {
    return copy(a.cleared === true ? a : b);
  }
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
const isMap = value => value !== null && typeof value === 'object' && !Array.isArray(value);
// Keep the winning write, including its target tie-breaker, when the target
// disappears. Deleting this field would allow older writes to win a later
// merge. The marker is monotonic for this write, not for a newer selection.
function clearInvalidActive(blob) {
  if (blob?.active && (!blob.tabs?.[blob.active.v] || blob.tabs[blob.active.v].deleted?.v === true)) blob.active.cleared = true;
  return blob;
}
function activeTabId(blob) {
  const active=blob?.active;
  return active && active.cleared !== true && isId(active.v) && blob.tabs?.[active.v]?.deleted?.v === false ? active.v : null;
}
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
// Index metadata. `rev` is a fetch hint that travels with the clock and writer
// of the write that set it (`revAt`, `revBy`), so a newer hint always replaces
// an older one whatever the hashes; `createdAt`/`createdBy` are immutable.
function copyIndexMeta(raw, out) {
  if (typeof raw.rev === 'string' && /^[0-9a-f]{16}$/.test(raw.rev)) {
    out.rev = raw.rev;
    if (Number.isSafeInteger(raw.revAt) && raw.revAt >= 0) out.revAt = raw.revAt;
    if (typeof raw.revBy === 'string' && raw.revBy.length > 0 && raw.revBy.length <= 128) out.revBy = raw.revBy;
  }
  if (Number.isSafeInteger(raw.createdAt) && raw.createdAt >= 0) out.createdAt = raw.createdAt;
  if (typeof raw.createdBy === 'string') out.createdBy = raw.createdBy.slice(0,128);
  return out;
}
// The later of two revision hints: higher `revAt`, then the smaller writer,
// then the smaller hash. A hint without a clock (written before clocks) ranks
// below every clocked one.
function newerRev(a, b) {
  if (a?.rev === undefined) return b?.rev === undefined ? null : b;
  if (b?.rev === undefined) return a;
  const at = x => Number.isSafeInteger(x.revAt) ? x.revAt : -1;
  if (at(a) !== at(b)) return at(a) > at(b) ? a : b;
  const by = x => x.revBy ?? '';
  if (by(a) !== by(b)) return by(a) < by(b) ? a : b;
  return a.rev <= b.rev ? a : b;
}
function mergeIndexMeta(l, r, out) {
  for (const key of ['rev','revAt','revBy']) delete out[key];
  const rev = newerRev(l, r);
  if (rev) for (const key of ['rev','revAt','revBy']) if (rev[key] !== undefined) out[key] = rev[key];
  for (const key of ['createdAt','createdBy']) {
    const values=[l?.[key],r?.[key]].filter(v=>v!==undefined).sort((x,y)=>canonical(x)<canonical(y)?-1:1);
    if (values.length) out[key]=values[0]; else delete out[key];
  }
  return out;
}
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
    copyIndexMeta(raw, out);
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
  if (!isMap(raw) || raw.v !== 1 || !isId(raw.spaceId) || !isMap(raw.groups) || !isMap(raw.tabs)) return null;
  const out = { v:1, spaceId:raw.spaceId, groups:sanitizeMap(raw.groups,'groups'), tabs:sanitizeMap(raw.tabs,'tabs') };
  if (isField(raw.active) && isId(raw.active.v)) {
    out.active = field(raw.active.v,raw.active.c,raw.active.by);
    if (raw.active.cleared === true) out.active.cleared = true;
  }
  return clearInvalidActive(out);
}
function sanitizeIndex(raw) {
  if (!isMap(raw) || raw.v !== 1 || !isMap(raw.spaces)) return null;
  return {v:1,spaces:sanitizeMap(raw.spaces,'spaces')};
}
function mergeBlob(a,b) {
  const left = sanitizeBlob(a), right = sanitizeBlob(b);
  if ((a != null && !left) || (b != null && !right)) throw new TypeError('Invalid or unsupported Space blob');
  if (!left) return copy(right);
  if (!right) return copy(left);
  if (left.spaceId !== right.spaceId) throw new TypeError('Space identity mismatch');
  const out = {v:1,spaceId:left.spaceId,groups:{},tabs:{}};
  for (const kind of ['groups','tabs']) {
    for(const id of [...new Set([...Object.keys(left[kind]),...Object.keys(right[kind])])].sort()) out[kind][id] = mergeRecord(left[kind][id],right[kind][id]);
  }
  const active=mergeField(left.active,right.active,'active'); if(active)out.active=active;
  return clearInvalidActive(out);
}
function mergeIndex(a,b) {
  const cleanLeft=sanitizeIndex(a),cleanRight=sanitizeIndex(b);
  if ((a != null && !cleanLeft) || (b != null && !cleanRight)) throw new TypeError('Invalid or unsupported Spaces index');
  const left=cleanLeft??{v:1,spaces:{}},right=cleanRight??{v:1,spaces:{}},out={v:1,spaces:{}};
  for(const id of [...new Set([...Object.keys(left.spaces),...Object.keys(right.spaces)])].sort()) {
    const l=left.spaces[id]??{},r=right.spaces[id]??{};
    out.spaces[id]=mergeIndexMeta(l,r,mergeRecord(l,r));
  }
  return out;
}
function expireTombstones(blob,now) {
  const out=copy(blob);
  for(const kind of ['tabs','groups','spaces'])if(out?.[kind])for(const [id,r] of Object.entries(out[kind])) {
    if(r.deleted?.v===true && now-r.deleted.c>=LIMITS.tombstoneMs)delete out[kind][id];
  }
  return clearInvalidActive(out);
}
const expiredRecord = (record,now) => record?.deleted?.v === true && now-record.deleted.c >= LIMITS.tombstoneMs;
const effectiveGroup = (blob,tab) => {
  const id=tab?.groupId?.v;
  return id && blob.groups?.[id] && blob.groups[id].deleted?.v!==true ? id : null;
};

// Relay. Strict sanitization is the view this version can display and apply;
// it drops fields it doesn't know, values it can't interpret and records left
// incomplete by that. An upload built only from that view would erase another
// device's content (a newer client's field, a longer URL), so every upload is
// finished by relaying the fetched blob's well-formed records and fields
// unchanged, merged by the ordinary field rules. A relayed value is never
// applied to a window: projection still reads the strict view.
const isFieldName = name => /^[a-z][A-Za-z0-9]{0,31}$/.test(name);
const RELAY_FIELDS = 32;
function relayRecord(raw, kind) {
  if (!isMap(raw)) return null;
  const out = {};
  for (const name of Object.keys(raw).sort()) {
    if (Object.keys(out).length >= RELAY_FIELDS) break;
    if (isFieldName(name) && isField(raw[name])) out[name] = field(raw[name].v, raw[name].c, raw[name].by);
  }
  if (kind === 'spaces') copyIndexMeta(raw, out);
  return Object.keys(out).length ? out : null;
}
function relayMap(raw, kind) {
  const out = {};
  if (!isMap(raw)) return out;
  for (const id of Object.keys(raw).sort()) {
    if (!isId(id)) continue;
    const record = relayRecord(raw[id], kind);
    if (record) out[id] = record;
  }
  return out;
}
function relayBlob(raw) {
  if (!isMap(raw) || raw.v !== 1 || !isId(raw.spaceId) || !isMap(raw.groups) || !isMap(raw.tabs)) return null;
  const out = { v:1, spaceId:raw.spaceId, groups:relayMap(raw.groups,'groups'), tabs:relayMap(raw.tabs,'tabs') };
  if (isField(raw.active) && isId(raw.active.v)) {
    out.active = field(raw.active.v, raw.active.c, raw.active.by);
    if (raw.active.cleared === true) out.active.cleared = true;
  }
  return out;
}
function relayIndex(raw) {
  if (!isMap(raw) || raw.v !== 1 || !isMap(raw.spaces)) return null;
  return { v:1, spaces:relayMap(raw.spaces,'spaces') };
}
// One field of the upload against the same field as fetched. The same write
// (clock and writer equal) is the fetched original, not our normalized copy.
function relayField(ours, theirs, name) {
  if (isField(ours) && isField(theirs) && ours.c === theirs.c && ours.by === theirs.by && name !== 'active') return copy(theirs);
  return mergeField(ours, theirs, name);
}
function relayRecordInto(ours = {}, theirs, kind) {
  const out = {};
  for (const name of [...new Set([...Object.keys(ours), ...Object.keys(theirs)])].sort()) {
    const winner = relayField(ours[name], theirs[name], name);
    if (winner) out[name] = winner;
  }
  return kind === 'spaces' ? mergeIndexMeta(ours, theirs, out) : out;
}
/** `upload` (strict) finished with everything `relay` holds that it lacks.
 * Expired tombstones are not relayed, nor any record in `retired` (ids this
 * pass expired: retention removes every copy of them). */
function relayInto(upload, relay, now, retired = {}) {
  const out = copy(upload);
  if (!relay) return out;
  for (const kind of ['groups','tabs','spaces']) if (relay[kind] && out[kind]) {
    for (const [id, theirs] of Object.entries(relay[kind])) {
      if (expiredRecord(theirs, now) || retired[kind]?.includes(id)) continue;
      out[kind][id] = relayRecordInto(out[kind][id], theirs, kind);
    }
    out[kind] = Object.fromEntries(Object.keys(out[kind]).sort().map(id => [id, out[kind][id]]));
  }
  if (relay.active || out.active) {
    const active = mergeField(out.active, relay.active, 'active');
    if (active) out.active = active;
  }
  return out.tabs ? clearInvalidActive(out) : out;
}
module.exports = { LIMITS, field, mergeField, mergeRecord, mergeBlob, mergeIndex, mid, tagOf, keyFor, validKey, orderOf,
  acknowledged, revisionOf, blobFits, liveTabCount, sanitizeBlob, sanitizeIndex, expireTombstones, effectiveGroup, activeTabId,
  relayBlob, relayIndex, relayInto, newerRev };

// Pending writes are namespaced by record kind/id/field; index publication is a
// separate caller-owned entry. A fetched value, never a PUT response, settles a
// field write. These functions never mutate a caller's retained state.
function sanitizePending(pending = {}) {
  const out = {};
  if(isField(pending.active)&&isId(pending.active.v)) {
    out.active=field(pending.active.v,pending.active.c,pending.active.by);
    if(pending.active.cleared===true)out.active.cleared=true;
  }
  for (const kind of ['tabs','groups']) for (const [id, record] of Object.entries(pending[kind] ?? {})) {
    if (!isId(id) || !record || typeof record !== 'object') continue;
    for (const [name, normalize] of Object.entries(schemas[kind])) {
      const raw=record[name];
      if (!isField(raw)) continue;
      const v=normalize(raw.v);
      if (v===undefined || (v===null && !['name','color','groupId'].includes(name))) continue;
      if (name==='pos' && !validKey(v,id)) continue;
      out[kind] ??= {}; out[kind][id] ??= {};
      out[kind][id][name]=field(v,raw.c,raw.by);
    }
  }
  if (isId(pending.index?.id) && typeof pending.index.rev==='string' && /^[0-9a-f]{16}$/.test(pending.index.rev)) {
    out.index={id:pending.index.id,rev:pending.index.rev};
    if (Number.isSafeInteger(pending.index.at) && pending.index.at >= 0) out.index.at=pending.index.at;
    if (typeof pending.index.by==='string' && pending.index.by.length>0 && pending.index.by.length<=128) out.index.by=pending.index.by;
  }
  return out;
}
function applyLocalEdits(pending = {}, edits = {}) {
  const out = sanitizePending(pending);
  const active=mergeField(out.active,sanitizePending(edits).active,'active');if(active)out.active=active;
  for (const kind of ['tabs','groups']) for (const [id, record] of Object.entries(sanitizePending(edits)[kind] ?? {})) {
    if (!isId(id)) continue;
    out[kind] ??= {};
    out[kind][id] = mergeRecord(out[kind][id], record);
  }
  return out;
}
function settlePending(pending = {}, fetched = {}) {
  const out = sanitizePending(pending);
  if(out.active&&acknowledged(fetched.active,out.active,'active'))delete out.active;
  for (const kind of ['tabs','groups']) {
    for (const [id, record] of Object.entries(out[kind] ?? {})) {
      for (const [name, value] of Object.entries(record)) {
        if (acknowledged(fetched[kind]?.[id]?.[name], value, name)) delete record[name];
      }
      if (!Object.keys(record).length) delete out[kind][id];
    }
    if (out[kind] && !Object.keys(out[kind]).length) delete out[kind];
  }
  return out;
}
function recoveryDecision({localBlob, fetchedBlob, lastMergeAt, now}) {
  const keep = new Set(), recover = new Set();
  const hasRemote = Object.keys(fetchedBlob?.tabs ?? {}).length + Object.keys(fetchedBlob?.groups ?? {}).length > 0;
  const stale = Number.isFinite(lastMergeAt) ? now-lastMergeAt > LIMITS.tombstoneMs : hasRemote;
  for(const kind of ['tabs','groups']) for(const id of Object.keys(localBlob?.[kind] ?? {})) {
    if (expiredRecord(localBlob[kind][id],now)) continue;
    (stale && !fetchedBlob?.[kind]?.[id] ? recover : keep).add(id);
  }
  return {keep,recover};
}
function withoutRecords(blob, ids) {
  const out=copy(blob);
  for(const kind of ['tabs','groups'])if(out?.[kind])for(const id of ids)delete out[kind][id];
  return out;
}
function replayPending(blob,pending) {
  const out=copy(blob);
  const active=mergeField(out.active,pending.active,'active');if(active)out.active=active;
  for(const kind of ['tabs','groups'])for(const [id,record] of Object.entries(pending[kind]??{})) {
    out[kind][id]=mergeRecord(out[kind][id],record);
  }
  return out;
}
// Historical values fill only missing fetched fields and only when the
// candidate supersedes them. Fetched fields always remain authoritative in
// the rollback base, even when the historical snapshot has a higher clock.
function admissionUnits(candidate,fetched,deviceId,lastPublishable) {
  const units=[];
  for(const kind of ['groups','tabs'])for(const [id,after] of Object.entries(candidate[kind])) {
    const before=copy(fetched[kind]?.[id]??{});
    for (const [name,value] of Object.entries(lastPublishable?.[kind]?.[id]??{})) {
      if (!Object.hasOwn(before,name) && acknowledged(after[name],value,name)) before[name]=copy(value);
    }
    for(const [name,value] of Object.entries(after)) {
      if(value.by!==deviceId)before[name]=copy(value);
    }
    const sameAsBase=canonical(before)===canonical(after);
    const hasLocalContribution=Object.entries(after).some(([name,value])=>value.by===deviceId && canonical(value)!==canonical(fetched[kind]?.[id]?.[name]));
    if(sameAsBase && !hasLocalContribution)continue;
    const base=Object.keys(before).length ? before : null;
    // If removing local fields would leave somebody else's incomplete record,
    // its dependency closure is mandatory rather than partially serializable.
    // Restoring an unchanged published record may itself be unsynced, but it
    // is not an admission candidate to drop in order to fit a newer change.
    const required=sameAsBase || (!!base && !sanitizeRecord(base,kind));
    units.push({kind,id,key:kind+':'+id,before:base,after:copy(after),required,
      clock:Math.max(0,...Object.entries(after).filter(([name,v])=>isField(v) && v.by===deviceId && canonical(v)!==canonical(before[name])).map(([,v])=>v.c)),dependencies:[]});
  }
  const newGroups=new Set(units.filter(u=>u.kind==='groups'&&!u.before).map(u=>u.id));
  for(const unit of units)if(unit.kind==='tabs' && newGroups.has(unit.after.groupId?.v)) {
    unit.dependencies.push('groups:'+unit.after.groupId.v);
  }
  return units;
}
function admit({candidate,changes=[],encryptFn,finish=blob=>blob}) {
  const out=clearInvalidActive(copy(candidate)), held=new Set(), unsynced=new Set();
  // Limits apply to what is actually PUT: the strict candidate finished with
  // the relayed remote content.
  const fitsBlob=blob=>liveTabCount(blob)<=LIMITS.tabsPerSpace && blobFits(blob,encryptFn);
  const fits=()=>fitsBlob(finish(out));
  const complete=()=> {
    if (canonical(sanitizeBlob(out))!==canonical(out)) return false;
    return changes.every(unit=> {
      const record=out[unit.kind]?.[unit.id];
      if (!record || record.deleted?.v===true) return true;
      if (canonical(record.pos)!==canonical(unit.before?.pos) && !validKey(record.pos?.v,unit.id)) return false;
      const group=record.groupId?.v;
      return unit.kind!=='tabs' || !group || !!out.groups[group] || unit.before?.groupId?.v===group;
    });
  };
  // "Closed tabs free their room after 30 days" is true only when their
  // expiry alone would let this change fit.
  const withoutTombstones=blob=>{
    const t=copy(blob);
    for(const k of ['tabs','groups'])for(const [id,r] of Object.entries(t[k]))if(r.deleted?.v===true)delete t[k][id];
    return clearInvalidActive(t);
  };
  const finished=finish(out);
  const hasTombstones=['tabs','groups'].some(k=>Object.values(finished[k]).some(r=>r.deleted?.v===true));
  const initialReason=liveTabCount(finished)>LIMITS.tabsPerSpace ? 'tabs'
    : hasTombstones && fitsBlob(withoutTombstones(finished)) ? 'tombstones' : 'full';
  if(fits()&&complete())return {blob:finish(out),unsynced,reason:null};
  const byKey=new Map(changes.map(u=>[u.key??u.kind+':'+u.id,u]));
  function hold(unit) {
    const key=unit.key??unit.kind+':'+unit.id;
    if(held.has(key)||unit.required)return false;
    // A required dependent prevents withholding its dependency as well.
    const dependents=changes.filter(u=>(u.dependencies??[]).includes(key)&&!held.has(u.key??u.kind+':'+u.id));
    if(dependents.some(u=>u.required))return false;
    for(const dependent of dependents)if(!hold(dependent))return false;
    if(unit.before)out[unit.kind][unit.id]=copy(unit.before);else delete out[unit.kind][unit.id];
    clearInvalidActive(out);
    held.add(key);unsynced.add(unit.id);return true;
  }
  for(const unit of [...byKey.values()].sort((a,b)=>(b.admissionRank??b.clock)-(a.admissionRank??a.clock) || (a.key<b.key?-1:1))) {
    hold(unit);
    if(fits()&&complete())return {blob:finish(out),unsynced,reason:initialReason};
  }
  for (const unit of changes) unsynced.add(unit.id);
  return {blob:null,unsynced,reason:changes.some(u=>u.required)?'required-state-over-budget':'remote-over-budget'};
}
function pushPlan({fetchedBlob, fetchedVersion=null, localBlob, pending={}, lastMergeAt, now, deviceId, encryptFn, lastPublishable, admissionOrder=[]}) {
  const local=sanitizeBlob(localBlob), remote=sanitizeBlob(fetchedBlob), relay=relayBlob(fetchedBlob);
  // Only an actual missing blob may start an empty remote. An unreadable
  // response must not be overwritten with a locally understood older schema.
  if ((fetchedBlob != null && !remote) || (fetchedBlob == null && fetchedVersion != null)) throw new TypeError('Invalid or unsupported remote Space blob');
  if(!local&&!remote)throw new TypeError('No valid Space');
  if(local&&remote&&local.spaceId!==remote.spaceId)throw new TypeError('Space identity mismatch');
  const empty={v:1,spaceId:(local??remote).spaceId,tabs:{},groups:{}};
  const fetched=remote??empty;
  const published=sanitizeBlob(lastPublishable);
  if (lastPublishable != null && !published) throw new TypeError('Invalid or unsupported published Space blob');
  if (published && published.spaceId !== fetched.spaceId) throw new TypeError('Published Space identity mismatch');
  // What the Worker holds, including records this version can't display:
  // presence and acknowledgement are judged against it, never the strict view.
  const held=relay??empty;
  const {recover}=recoveryDecision({localBlob:local??empty,fetchedBlob:relay,lastMergeAt,now});
  const retained=withoutRecords(local??empty,recover);
  const eligiblePending=withoutRecords(sanitizePending(pending),recover);
  if (eligiblePending.index?.id!==fetched.spaceId) delete eligiblePending.index;
  const baseMerged=mergeBlob(fetched,retained);
  const retainedOwn={};
  if(retained.active?.by===deviceId&&!acknowledged(held.active,retained.active,'active'))retainedOwn.active=retained.active;
  for(const kind of ['tabs','groups'])for(const [id,record] of Object.entries(retained[kind])) {
    for(const [name,value] of Object.entries(record))if(value.by===deviceId && !acknowledged(held[kind]?.[id]?.[name],value,name)) {
      retainedOwn[kind] ??= {}; retainedOwn[kind][id] ??= {}; retainedOwn[kind][id][name]=value;
    }
  }
  const pendingAfter=settlePending(applyLocalEdits(eligiblePending,retainedOwn),held);
  const replayed=replayPending(baseMerged,pendingAfter);
  const expiredRecords={tabs:[],groups:[]};
  // Expiry is a retention decision for persisted state too, not merely a
  // smaller upload. Remove every field of retired records from pending so a
  // later pass cannot recreate the tombstone or wait forever for its receipt.
  for (const kind of ['tabs','groups']) {
    for (const [id,record] of Object.entries(replayed[kind])) {
      if (expiredRecord(record,now)) {
        expiredRecords[kind].push(id);
        if (pendingAfter[kind]) delete pendingAfter[kind][id];
      }
    }
    if (pendingAfter[kind] && !Object.keys(pendingAfter[kind]).length) delete pendingAfter[kind];
  }
  const mergedBlob=expireTombstones(replayed,now);
  if(pendingAfter.active)clearInvalidActive({tabs:mergedBlob.tabs,active:pendingAfter.active});
  const changes=admissionUnits(mergedBlob,fetched,deviceId,expireTombstones(published,now));
  if(Array.isArray(admissionOrder)&&admissionOrder.length) {
    const ranks=new Map(admissionOrder.map((key,n)=>[key,n]));let next=ranks.size;
    for(const unit of [...changes].sort((a,b)=>a.clock-b.clock || (a.key<b.key?-1:1)))unit.admissionRank=ranks.get(unit.key)??next++;
  }
  const admission=admit({candidate:mergedBlob,changes,encryptFn,finish:blob=>relayInto(blob,relay,now,expiredRecords)});
  const changed=admission.blob && canonical(admission.blob)!==canonical(relay??fetched);
  const upload=changed?{blob:admission.blob,rev:revisionOf(admission.blob),ifVersion:fetchedVersion}:null;
  // Proposal only: caller may publish this revision after the blob PUT succeeds.
  // Identity fields remain in the separately merged index, never guessed here.
  // The revision is of what the Worker holds afterwards, relayed content included.
  const indexEntry=upload?{id:upload.blob.spaceId,rev:upload.rev,at:now,by:deviceId}
    : !admission.reason && pendingAfter.index ? {id:fetched.spaceId,rev:revisionOf(relay??fetched),at:now,by:deviceId} : null;
  return {upload,pendingAfter,expiredRecords,recover,unsynced:admission.unsynced,mergedBlob,nextLastMergeAt:now,indexEntry,reason:admission.reason};
}
Object.assign(module.exports,{applyLocalEdits,settlePending,recoveryDecision,admit,pushPlan});

// The orchestration layer calls this only after observing the real PUT result.
// Index retry receipts are created by successful blob writes, never by planning.
function settleUpload(plan, originalPending, {blobStored = false, indexStored = false} = {}) {
  if (plan.upload && !blobStored) {
    // Retention does not depend on an upload acknowledgement. Apply only the
    // plan's expiry/recovery decision to the caller's pending snapshot; preserve other
    // writes and any previous index receipt, including edits added in flight.
    const pending=copy(originalPending);
    for (const kind of ['tabs','groups']) {
      for (const id of [...(plan.expiredRecords?.[kind]??[]),...(plan.recover??[])]) if (pending[kind]) delete pending[kind][id];
      if (pending[kind] && !Object.keys(pending[kind]).length) delete pending[kind];
    }
    if(pending.active&&[...(plan.expiredRecords?.tabs??[]),...(plan.recover??[])].includes(pending.active.v))pending.active.cleared=true;
    return {pending,indexEntry:null};
  }
  const pending=copy(plan.pendingAfter);
  if (plan.indexEntry && !indexStored) pending.index=copy(plan.indexEntry);
  else if (plan.indexEntry && indexStored) delete pending.index;
  return {pending,indexEntry:copy(plan.indexEntry)};
}
module.exports.settleUpload=settleUpload;
