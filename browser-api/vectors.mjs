// browserAPI test vectors: engine-neutral examples of what the bridge does,
// recorded from the Electron preload (the reference implementation) and
// replayable against any other implementation of window.browserAPI.
//
// A vector says, for one member: called with these arguments, the bridge sends
// this message to the browser; given this reply, the call resolves to it; given
// this event payload, the subscriber receives it. Arguments, replies and
// payloads are deterministic samples of the contract's types, so every vector
// is also a valid value of its type.
//
// The Chromium build would replay the same file through its own adapter (a
// Mojo page-handler stub instead of an ipcRenderer stub). That is bridge step 5
// of the platform evaluation, "shared contract tests run against both builds".

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PRELOAD = path.join(ROOT, 'src', 'main', 'preload.js');
export const VECTORS_FILE = 'vectors.json';
export const VECTORS_FORMAT = 1;
const PLATFORMS = ['darwin', 'win32', 'linux'];
const UNTRUSTED = ['blanc-chrome://fill-status/', 'blanc://newtab/', 'https://example.com/', 'blanc-chrome://index/?x'];
const MAX_VARIANTS = 6;

// ---- JSON encoding ----
// JSON has no `undefined`; vectors spell it {"$undefined": true}.
const UNDEF = { $undefined: true };
export function encode(value) {
  if (value === undefined) return UNDEF;
  if (Array.isArray(value)) return value.map(encode);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, encode(v)]));
  return value;
}
export function decode(value) {
  if (value && typeof value === 'object' && !Array.isArray(value) && value.$undefined === true && Object.keys(value).length === 1) return undefined;
  if (Array.isArray(value)) return value.map(decode);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, decode(v)]));
  return value;
}

// ---- type samples ----
function alternatives(expr) {
  return expr.split('|').map((s) => s.trim()).filter(Boolean);
}

// Inline object types such as `{ private?: boolean }`.
function inlineFields(expr) {
  return expr.slice(1, -1).split(/[;,]/).map((s) => s.trim()).filter(Boolean).map((entry) => {
    const m = entry.match(/^([A-Za-z_$][\w$]*)(\?)?\s*:\s*(.+)$/);
    if (!m) throw new Error(`cannot read inline field "${entry}"`);
    return [m[1], { type: m[3], optional: !!m[2] }];
  });
}

function kebab(name) {
  return name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

// One value of a single (non-union) type. `full` fills optional fields and
// array elements; minimal leaves them out. `hint` names the nearest named type,
// so strings read as `tab-id-1` rather than `example`.
function sampleOne(alt, contract, { full, depth, hint }) {
  if (alt === 'string' || alt === 'key') return hint ? `${kebab(hint)}-1` : 'example';
  if (alt === 'number') return 1;
  if (alt === 'boolean' || alt === 'true') return true;
  if (alt === 'false') return false;
  if (alt === 'null') return null;
  if (alt === 'undefined' || alt === 'void') return undefined;
  if (alt === 'unknown') return 'example';
  if (/^'[^']*'$/.test(alt)) return alt.slice(1, -1);
  if (alt.endsWith('[]')) return full && depth < 6 ? [sample(alt.slice(0, -2), contract, { full, depth: depth + 1, hint })] : [];
  if (alt.startsWith('{')) return objectSample(inlineFields(alt), contract, { full, depth, hint });
  const type = contract.types[alt];
  if (!type) throw new Error(`unknown type ${alt}`);
  if (type.fields) return objectSample(Object.entries(type.fields), contract, { full, depth, hint: alt });
  return sample(type.ts, contract, { full, depth: depth + 1, hint: alt });
}

function objectSample(fields, contract, { full, depth, hint }) {
  const out = {};
  for (const [name, spec] of fields) {
    if (spec.optional && (!full || depth >= 6)) continue;
    out[name] = sample(spec.type, contract, { full: full && depth < 6, depth: depth + 1, hint: fieldHint(spec.type) ?? hint });
  }
  return out;
}

function fieldHint(expr) {
  const named = alternatives(expr).map((a) => a.replace(/\[\]$/, '')).find((a) => /^[A-Z]/.test(a));
  return named ?? null;
}

// The first alternative that carries a value (a union's null/undefined arms
// get their own variants).
export function sample(expr, contract, { full = false, depth = 0, hint = null } = {}) {
  const alts = alternatives(expr);
  const chosen = alts.find((a) => !['null', 'undefined', 'void'].includes(a)) ?? alts[0];
  return sampleOne(chosen, contract, { full, depth, hint: /^[A-Z]/.test(chosen) ? chosen : hint });
}

// Distinct examples of a type expression: each union arm, each literal of a
// literal union, both booleans, and the minimal and full forms of objects.
export function examples(expr, contract) {
  const out = [];
  const seen = new Set();
  const add = (v) => { const k = JSON.stringify(encode(v)); if (!seen.has(k)) { seen.add(k); out.push(v); } };
  for (const alt of alternatives(expr)) {
    const named = contract.types[alt];
    if (named && named.ts && !named.ts.startsWith('{') && alternatives(named.ts).length > 1) {
      for (const v of examples(named.ts, contract)) add(v);
      continue;
    }
    if (alt === 'boolean') { add(true); add(false); continue; }
    add(sampleOne(alt, contract, { full: false, depth: 0, hint: /^[A-Z]/.test(alt) ? alt : null }));
    add(sampleOne(alt, contract, { full: true, depth: 0, hint: /^[A-Z]/.test(alt) ? alt : null }));
  }
  return out;
}

// ---- the Electron adapter ----
// Runs src/main/preload.js in a sandbox whose ipcRenderer records what is sent,
// answers invokes with a chosen reply, and lets the test deliver events.
export function electronAdapter(source = fs.readFileSync(PRELOAD, 'utf8')) {
  return {
    name: 'electron-preload',
    load({ platform, href }) {
      let api = null;
      const sent = [];
      const listeners = new Map();
      let reply;
      const ipcRenderer = {
        invoke: (channel, ...args) => { sent.push({ kind: 'invoke', channel, args }); return reply; },
        send: (channel, ...args) => { sent.push({ kind: 'send', channel, args }); },
        on: (channel, listener) => { listeners.set(channel, [...(listeners.get(channel) ?? []), listener]); },
        removeListener: (channel, listener) => { listeners.set(channel, (listeners.get(channel) ?? []).filter((l) => l !== listener)); },
      };
      const sandbox = {
        require: (id) => {
          if (id === 'electron') return { contextBridge: { exposeInMainWorld: (key, value) => { if (key === 'browserAPI') api = value; } }, ipcRenderer };
          throw new Error(`preload required "${id}"`);
        },
        process: { platform },
        window: { location: { href } },
      };
      vm.runInNewContext(source, sandbox, { filename: PRELOAD });
      return {
        api,
        takeSent: () => sent.splice(0),
        setReply: (value) => { reply = value; },
        emit: (channel, payload) => { for (const l of listeners.get(channel) ?? []) l({}, ...payload); },
        listenerCount: (channel) => (listeners.get(channel) ?? []).length,
      };
    },
  };
}

// ---- generation ----
// A plain string parameter named like a URL gets a URL, so vectors read as
// real calls. Other strings take their type's name (`tab-id-1`).
function paramSample(p, contract) {
  if (/url/i.test(p.name) && alternatives(p.type).includes('string')) return 'https://example.com/';
  return sample(p.type, contract, { hint: fieldHint(p.type) });
}

function argumentCases(m, contract) {
  const params = m.params ?? [];
  const base = params.map((p) => paramSample(p, contract));
  const cases = [{ label: 'typical', args: base }];
  params.forEach((p, i) => {
    let added = 0;
    for (const value of examples(p.type, contract)) {
      if (added >= MAX_VARIANTS) break;
      if (JSON.stringify(encode(value)) === JSON.stringify(encode(base[i]))) continue;
      const args = [...base];
      args[i] = value;
      cases.push({ label: `${p.name} = ${JSON.stringify(encode(value)).slice(0, 40)}`, args });
      added++;
    }
  });
  const firstOmittable = params.findIndex((p) => p.optional || p.default !== undefined);
  if (firstOmittable >= 0) cases.push({ label: 'trailing optional arguments omitted', args: base.slice(0, firstOmittable) });
  return cases;
}

export function generateVectors(contract, { adapter = electronAdapter() } = {}) {
  const trusted = contract.surfaces;
  const surfaces = {
    trusted,
    untrusted: UNTRUSTED.filter((href) => !adapter.load({ platform: 'linux', href }).api),
  };
  const members = {};
  for (const m of contract.members) {
    const platforms = m.platforms ?? PLATFORMS;
    const host = adapter.load({ platform: platforms[0], href: trusted[0] });
    const fn = host.api?.[m.name];
    const entry = { kind: m.kind, platforms };
    if (m.kind === 'value') {
      entry.values = Object.fromEntries(platforms.map((p) => [p, encode(adapter.load({ platform: p, href: trusted[0] }).api[m.name])]));
      members[m.name] = entry;
      continue;
    }
    entry.channel = m.channel;
    if (m.kind === 'event') {
      entry.deliveries = [];
      const payloads = m.payload === null ? [[]] : examples(m.payload, contract).map((v) => [v]);
      for (const payload of payloads) {
        const received = [];
        const unsubscribe = fn((...args) => received.push(args));
        host.emit(m.channel, payload);
        unsubscribe();
        entry.deliveries.push({ emit: encode(payload), callbacks: encode(received) });
      }
      members[m.name] = entry;
      continue;
    }
    entry.calls = argumentCases(m, contract).map(({ label, args }) => {
      host.takeSent();
      fn(...args);
      const sent = host.takeSent();
      return { label, args: encode(args), sends: encode(sent) };
    });
    if (m.kind === 'invoke') entry.replies = m.returns === 'void' ? [] : examples(m.returns, contract).map(encode);
    members[m.name] = entry;
  }
  return {
    format: VECTORS_FORMAT,
    note: 'Generated by `npm run browser-api:build` from browser-api/contract.json and src/main/preload.js. Do not edit. Replay with replayVectors() in browser-api/vectors.mjs.',
    surfaces,
    members,
  };
}

export function vectorsText(contract, options) {
  return JSON.stringify(generateVectors(contract, options), null, 2) + '\n';
}

// ---- replay ----
// Replays vectors against any adapter that can load a document and report what
// its browserAPI sends. Resolves to a list of problems; empty means the
// implementation behaves as the reference did. Replies may come back as
// promises (a real IPC or Mojo bridge) or plain values (a recording stub).
function replayCore(vectors, adapter) {
  const problems = [];
  const deferred = [];
  if (vectors.format !== VECTORS_FORMAT) return { problems: [`vectors format ${vectors.format}, replay expects ${VECTORS_FORMAT}`], deferred };
  for (const href of vectors.surfaces.trusted) {
    if (!adapter.load({ platform: 'linux', href }).api) problems.push(`surface ${href}: browserAPI not exposed`);
  }
  for (const href of vectors.surfaces.untrusted) {
    if (adapter.load({ platform: 'linux', href }).api) problems.push(`untrusted document ${href}: browserAPI exposed`);
  }
  for (const platform of PLATFORMS) {
    const host = adapter.load({ platform, href: vectors.surfaces.trusted[0] });
    if (!host.api) { problems.push(`${platform}: browserAPI not exposed`); continue; }
    for (const name of Object.keys(host.api)) {
      if (!(name in vectors.members)) problems.push(`${platform}: exposes "${name}", which has no vectors`);
    }
    for (const [name, v] of Object.entries(vectors.members)) {
      const where = `${platform} ${name}`;
      if (!v.platforms.includes(platform)) {
        if (name in host.api) problems.push(`${where}: exposed, but only on ${v.platforms.join(', ')}`);
        continue;
      }
      if (!(name in host.api)) { problems.push(`${where}: not exposed`); continue; }
      const fn = host.api[name];
      if (v.kind === 'value') {
        if (!same(fn, decode(v.values[platform]))) problems.push(`${where}: value ${JSON.stringify(fn)}, expected ${JSON.stringify(decode(v.values[platform]))}`);
        continue;
      }
      if (v.kind === 'event') {
        for (const [i, d] of v.deliveries.entries()) {
          const received = [];
          const unsubscribe = fn((...args) => received.push(args));
          host.emit(v.channel, decode(d.emit));
          if (!same(received, decode(d.callbacks))) problems.push(`${where} delivery ${i}: callback received ${JSON.stringify(encode(received))}, expected ${JSON.stringify(d.callbacks)}`);
          if (typeof unsubscribe !== 'function') { problems.push(`${where}: subscribing returns no unsubscribe function`); break; }
          unsubscribe();
          if (host.listenerCount(v.channel) !== 0) problems.push(`${where}: unsubscribe leaves a listener on '${v.channel}'`);
        }
        continue;
      }
      host.takeSent();
      for (const c of v.calls) {
        const replies = v.kind === 'invoke' && v.replies.length ? v.replies : [UNDEF];
        for (const reply of replies) {
          host.setReply(decode(reply));
          const returned = fn(...decode(c.args));
          const sent = host.takeSent();
          if (!same(sent, decode(c.sends))) {
            problems.push(`${where} (${c.label}): sends ${JSON.stringify(encode(sent))}, expected ${JSON.stringify(c.sends)}`);
            break;
          }
          if (v.kind === 'send') {
            if (returned !== undefined) problems.push(`${where} (${c.label}): returns a value for a send`);
            break;
          }
          const check = (result) => (same(result, decode(reply)) ? null : `${where} (${c.label}): resolves to ${JSON.stringify(encode(result))} for reply ${JSON.stringify(reply)}`);
          if (returned && typeof returned.then === 'function') deferred.push({ promise: returned, check });
          else { const p = check(returned); if (p) { problems.push(p); break; } }
        }
      }
    }
  }
  return { problems, deferred };
}

const same = (a, b) => JSON.stringify(encode(a)) === JSON.stringify(encode(b));

// Replays vectors against any adapter that can load a document and report what
// its browserAPI sends. Resolves to a list of problems; empty means the
// implementation behaves as the reference did. Replies may come back as
// promises (a real IPC or Mojo bridge) or plain values (a recording stub).
export async function replayVectors(vectors, adapter) {
  const { problems, deferred } = replayCore(vectors, adapter);
  for (const { promise, check } of deferred) {
    const p = check(await promise);
    if (p) problems.push(p);
  }
  return [...new Set(problems)];
}

// The same replay for adapters that answer synchronously (the Electron
// preload stub), so it can run inside the synchronous drift check.
export function replayVectorsSync(vectors, adapter) {
  const { problems, deferred } = replayCore(vectors, adapter);
  if (deferred.length) problems.push(`${adapter.name}: ${deferred.length} replies came back as promises; use replayVectors()`);
  return [...new Set(problems)];
}

// Every argument, reply and event payload in the vectors must be a valid value
// of its contract type. `validateValue` comes from build.mjs.
export function checkVectorTypes(vectors, contract, validateValue) {
  const problems = [];
  const byName = new Map(contract.members.map((m) => [m.name, m]));
  for (const [name, v] of Object.entries(vectors.members)) {
    const m = byName.get(name);
    if (!m) { problems.push(`vectors: "${name}" is not a contract member`); continue; }
    for (const c of v.calls ?? []) {
      decode(c.args).forEach((value, i) => {
        const p = m.params?.[i];
        if (!p) { problems.push(`vectors ${name} (${c.label}): argument ${i} has no parameter`); return; }
        if (value === undefined && (p.optional || p.default !== undefined)) return;
        problems.push(...validateValue(value, p.type, contract, `vectors ${name}(${p.name}) (${c.label})`));
      });
    }
    for (const r of v.replies ?? []) problems.push(...validateValue(decode(r), m.returns, contract, `vectors ${name} reply`));
    for (const d of v.deliveries ?? []) {
      if (m.payload !== null) problems.push(...validateValue(decode(d.emit)[0], m.payload, contract, `vectors ${name} payload`));
    }
  }
  return problems;
}
