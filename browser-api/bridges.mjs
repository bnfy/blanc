// Contract checker for Blanc's two smaller page bridges (Phase 0 bridge contract):
//
//   window.bowserPages      src/main/tab-preload.js, exposed per blanc:// host
//   window.blancFillStatus  src/main/fill-status-preload.js, the 1Password capsule
//
// build.mjs calls into this file from `npm run browser-api:build` and
// `npm run browser-api:check`; bridges.json is the source of truth. As in
// build.mjs, each preload is executed in a vm sandbox against a recording
// ipcRenderer, so the check sees what each document would actually receive.
// On top of that, every bowserPages channel's host list is compared with the
// host allowlist pages.js declares for its handler, so neither side can grant
// a page a capability the other side doesn't know about.

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const BRIDGES_SPEC = path.join(ROOT, 'browser-api', 'bridges.json');
const MAIN_DIR = path.join(ROOT, 'src', 'main');
const PAGES_JS = path.join(MAIN_DIR, 'pages.js');
const PAGES_DIR = path.join(ROOT, 'src', 'renderer', 'pages');
const FILL_RENDERER = path.join(ROOT, 'src', 'renderer', 'fill-status.js');
const requireMain = createRequire(path.join(MAIN_DIR, 'main.js'));

const KINDS = new Set(['invoke', 'send', 'event']);
const FORWARDS = new Set(['payload', 'strictTrue']);
const TS_BUILTINS = new Set(['string', 'number', 'boolean', 'unknown', 'null', 'undefined', 'void', 'true', 'false']);

export function loadBridges(file = BRIDGES_SPEC) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

const bridgesOf = (contract) => [['bowserPages', contract.bowserPages], ['blancFillStatus', contract.blancFillStatus]];

// ---- contract validation ----
export function validateBridges(contract) {
  const problems = [];
  for (const [key, bridge] of bridgesOf(contract)) {
    if (!bridge) { problems.push(`${key}: missing`); continue; }
    const known = new Set(Object.keys(bridge.types ?? {}));
    const refs = (expr, where) => {
      const ids = (expr ?? '').replace(/'[^']*'/g, '').match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? [];
      for (const id of ids) if (!TS_BUILTINS.has(id) && !known.has(id)) problems.push(`${where}: unknown type "${id}"`);
    };
    for (const [name, t] of Object.entries(bridge.types ?? {})) {
      if (!t.doc) problems.push(`${key}.types.${name}: missing doc`);
      if (t.fields) for (const [field, spec] of Object.entries(t.fields)) refs(spec.type, `${key}.types.${name}.${field}`);
      else refs(t.ts, `${key}.types.${name}`);
    }
    const seen = new Set();
    for (const m of bridge.members ?? []) {
      const where = `${key}.${m.name}`;
      if (seen.has(m.name)) problems.push(`${where}: duplicate member`);
      seen.add(m.name);
      if (!KINDS.has(m.kind)) problems.push(`${where}: unknown kind "${m.kind}"`);
      if (!m.doc) problems.push(`${where}: missing doc`);
      if (typeof m.channel !== 'string' || !/^[a-z-]+(:[a-z-]+)+$/.test(m.channel)) problems.push(`${where}: bad channel`);
      if (key === 'bowserPages') {
        if (!Array.isArray(m.hosts) || m.hosts.length === 0) problems.push(`${where}: missing hosts`);
        else for (const h of m.hosts) if (!bridge.hosts.includes(h)) problems.push(`${where}: unknown host "${h}"`);
      }
      if (m.kind === 'event') {
        if (m.payload !== null) refs(m.payload, where);
        if (typeof m.unsubscribe !== 'boolean') problems.push(`${where}: unsubscribe must be true or false`);
        if (m.forward !== undefined && !FORWARDS.has(m.forward)) problems.push(`${where}: unknown forward "${m.forward}"`);
        continue;
      }
      let sawOptional = false;
      for (const p of m.params ?? []) {
        refs(p.type, `${where}(${p.name})`);
        if (p.optional) sawOptional = true;
        else if (sawOptional) problems.push(`${where}: required param "${p.name}" after an optional one`);
      }
      if (m.kind === 'invoke') refs(m.returns, `${where} returns`);
    }
  }
  return problems;
}

// ---- generators ----
const pascal = (host) => host.split('-').map((s) => s[0].toUpperCase() + s.slice(1)).join('');

function signature(m) {
  const params = (m.params ?? []).map((p) => `${p.name}${p.optional ? '?' : ''}: ${p.type}`).join(', ');
  if (m.kind === 'invoke') return `(${params}) => Promise<${m.returns}>`;
  if (m.kind === 'send') return `(${params}) => void`;
  const cb = m.payload === null ? '() => void' : `(payload: ${m.payload}) => void`;
  return `(callback: ${cb}) => ${m.unsubscribe ? '() => void' : 'void'}`;
}

function nested(members) {
  const tree = {};
  for (const m of members) {
    const parts = m.name.split('.');
    let node = tree;
    for (const part of parts.slice(0, -1)) node = node[part] ??= {};
    node[parts.at(-1)] = m;
  }
  return tree;
}

function emitTree(tree, indent) {
  let out = '';
  for (const [name, node] of Object.entries(tree)) {
    if (node.kind) {
      out += `${indent}/** ${node.doc} IPC: ${node.kind} \`${node.channel}\`. */\n`;
      out += `${indent}${name}: ${signature(node)};\n`;
    } else {
      out += `${indent}${name}: {\n${emitTree(node, indent + '  ')}${indent}};\n`;
    }
  }
  return out;
}

function emitTypes(types = {}) {
  let out = '';
  for (const [name, t] of Object.entries(types)) {
    if (!t.fields) { out += `/** ${t.doc} */\nexport type ${name} = ${t.ts};\n\n`; continue; }
    out += `/** ${t.doc} */\nexport interface ${name} {\n`;
    for (const [field, spec] of Object.entries(t.fields)) {
      if (spec.doc) out += `  /** ${spec.doc} */\n`;
      out += `  ${field}${spec.optional ? '?' : ''}: ${spec.type};\n`;
    }
    out += '}\n\n';
  }
  return out;
}

export function genBridgesDts(contract) {
  const pages = contract.bowserPages;
  const fill = contract.blancFillStatus;
  let out = '// GENERATED by browser-api/build.mjs from bridges.json — do not edit by hand.\n' +
    `// window.${pages.global} (${pages.preload}), one interface per blanc:// host, and\n` +
    `// window.${fill.global} (${fill.preload}) for ${fill.document}.\n\n`;
  out += emitTypes(pages.types);
  for (const host of pages.hosts) {
    out += `/** window.${pages.global} on blanc://${host}/ */\nexport interface ${pascal(host)}PagesAPI {\n`;
    out += emitTree(nested(pages.members.filter((m) => m.hosts.includes(host))), '  ');
    out += '}\n\n';
  }
  out += emitTypes(fill.types);
  out += `/** window.${fill.global} on ${fill.document} */\nexport interface BlancFillStatusAPI {\n`;
  out += emitTree(nested(fill.members), '  ');
  out += '}\n';
  return out;
}

export function genBridgesReference(contract) {
  const cell = (s) => String(s).replace(/\\/g, '\\\\').replace(/\|/g, '\\|');
  const pages = contract.bowserPages;
  const fill = contract.blancFillStatus;
  let out = '<!-- GENERATED by browser-api/build.mjs from bridges.json — do not edit by hand. -->\n\n' +
    `# window.${pages.global}\n\nExposed by \`${pages.preload}\` to the top-level \`blanc://\` page on each host below. ` +
    `pages.js binds every channel to the same hosts and to the live surface that owns the page.\n\n` +
    '| Member | Kind | Channel | Hosts | Description |\n| --- | --- | --- | --- | --- |\n';
  for (const m of pages.members) {
    out += `| \`${m.name}\` | ${m.kind} | \`${m.channel}\` | ${m.hosts.join(', ')} | ${cell(m.doc)} |\n`;
  }
  if (pages.signals?.length) {
    out += '\n## Signals\n\nIPC the preload sends without exposing an API to the page.\n\n| Channel | Documents | Description |\n| --- | --- | --- |\n';
    for (const s of pages.signals) out += `| \`${s.channel}\` | ${s.documents.join(', ')} | ${cell(s.doc)} |\n`;
  }
  out += `\n# window.${fill.global}\n\nExposed by \`${fill.preload}\` to ${fill.document} only.\n\n` +
    '| Member | Kind | Channel | Description |\n| --- | --- | --- | --- |\n';
  for (const m of fill.members) out += `| \`${m.name}\` | ${m.kind} | \`${m.channel}\` | ${cell(m.doc)} |\n`;
  return out;
}

export function bridgeArtifacts(contract) {
  return { 'pages-api.d.ts': genBridgesDts(contract), 'pages-api.md': genBridgesReference(contract) };
}

// ---- preload probes ----
const INVOKE_RESULT = Symbol('invoke-result');
const sentinel = (i) => `__arg${i}__`;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function recordingIpc() {
  const calls = [];
  const ipcRenderer = {
    invoke: (channel, ...args) => { calls.push({ op: 'invoke', channel, args }); return INVOKE_RESULT; },
    send: (channel, ...args) => { calls.push({ op: 'send', channel, args }); },
    // Like Electron's, `on` returns the ipcRenderer itself, so a member that
    // forwards that return value shows up as returning something.
    on: (channel, listener) => { calls.push({ op: 'on', channel, listener }); return ipcRenderer; },
    removeListener: (channel, listener) => { calls.push({ op: 'off', channel, listener }); return ipcRenderer; },
  };
  return { calls, ipcRenderer };
}

/** Run tab-preload.js as the main frame of `href` would see it, with timers that
 * fire at once so the page-tint signal is observable. */
export function runPagesPreload({ href, source, file }) {
  const preload = file ?? path.join(ROOT, 'src', 'main', 'tab-preload.js');
  const text = source ?? fs.readFileSync(preload, 'utf8');
  const { calls, ipcRenderer } = recordingIpc();
  const exposed = {};
  const url = new URL(href);
  const noop = () => {};
  const element = { getBoundingClientRect: () => ({ top: 0, bottom: 0, width: 0 }) };
  const sandbox = {
    require: (id) => {
      if (id !== 'electron') throw new Error(`preload required "${id}"`);
      return { contextBridge: { exposeInMainWorld: (key, value) => { exposed[key] = value; } }, ipcRenderer };
    },
    process: { isMainFrame: true },
    window: { location: { href: url.href, protocol: url.protocol, host: url.host }, addEventListener: noop },
    document: { hidden: false, readyState: 'complete', documentElement: element, body: element, head: { contains: () => false }, addEventListener: noop },
    MutationObserver: class { observe() {} disconnect() {} },
    setTimeout: (fn) => { fn(); return 1; },
    clearTimeout: noop,
    performance: { now: () => 1000 },
  };
  vm.runInNewContext(text, sandbox, { filename: preload });
  return { exposed, calls };
}

function flatten(object, prefix = '') {
  const out = new Map();
  for (const [key, value] of Object.entries(object ?? {})) {
    const name = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'function') out.set(name, value);
    else if (value && typeof value === 'object') for (const [k, v] of flatten(value, name)) out.set(k, v);
    else out.set(name, value);
  }
  return out;
}

function expand(template) {
  if (typeof template === 'string') {
    let m = template.match(/^\$(\d+)$/);
    if (m) return sentinel(Number(m[1]));
    m = template.match(/^bool\(\$(\d+)\)$/);
    if (m) return Boolean(sentinel(Number(m[1])));
  }
  return template;
}

// Probe one exposed function against its contract entry; `calls` is the
// recording from the same preload run.
function probeMember(m, value, calls, where) {
  const problems = [];
  if (typeof value !== 'function') return [`${where}: expected a function`];
  if (m.kind === 'event') {
    calls.length = 0;
    const received = [];
    const returned = value((...args) => received.push(args));
    const on = calls.find((c) => c.op === 'on');
    if (!on || on.channel !== m.channel) return [`${where}: expected ipcRenderer.on('${m.channel}'), got ${on ? `'${on.channel}'` : 'none'}`];
    let expected;
    if (m.payload === null) { on.listener({}, 'PAYLOAD'); expected = [[]]; }
    else if (m.forward === 'strictTrue') { on.listener({}, true); on.listener({}, 'PAYLOAD'); expected = [[true], [false]]; }
    else { on.listener({}, 'PAYLOAD', 'EXTRA'); expected = [['PAYLOAD']]; }
    if (!same(received, expected)) problems.push(`${where}: callback received ${JSON.stringify(received)}, expected ${JSON.stringify(expected)}`);
    if (m.unsubscribe) {
      if (typeof returned !== 'function') problems.push(`${where}: does not return an unsubscribe function`);
      else {
        returned();
        const off = calls.find((c) => c.op === 'off');
        if (!off || off.channel !== m.channel || off.listener !== on.listener) problems.push(`${where}: unsubscribe does not remove the listener it added`);
      }
    } else if (returned !== undefined) {
      problems.push(`${where}: returns a value, but the contract says it returns nothing (is it forwarding ipcRenderer.on's return value?)`);
    }
    return problems;
  }
  const params = m.params ?? [];
  const template = m.ipcArgs ?? params.map((_p, i) => `$${i}`);
  const probe = (args, expectedArgs, label) => {
    calls.length = 0;
    const result = value(...args);
    const call = calls.find((c) => c.op === 'invoke' || c.op === 'send');
    if (!call) { problems.push(`${where}${label}: made no IPC call`); return; }
    if (call.op !== m.kind) problems.push(`${where}${label}: uses ipcRenderer.${call.op}, contract says ${m.kind}`);
    if (call.channel !== m.channel) problems.push(`${where}${label}: channel '${call.channel}', contract says '${m.channel}'`);
    if (!same(call.args, expectedArgs)) problems.push(`${where}${label}: sends ${JSON.stringify(call.args)}, contract expects ${JSON.stringify(expectedArgs)}`);
    if (m.kind === 'invoke' && result !== INVOKE_RESULT) problems.push(`${where}${label}: does not return the ipcRenderer.invoke promise`);
    if (m.kind === 'send' && result !== undefined) problems.push(`${where}${label}: returns a value, but a send member returns nothing`);
  };
  probe(params.map((_p, i) => sentinel(i)), template.map(expand), '');
  const firstDefault = params.findIndex((p) => p.default !== undefined);
  if (firstDefault >= 0) {
    const expectedArgs = template.map((t) => {
      const idx = Number((String(t).match(/\$(\d+)/) ?? [])[1]);
      if (idx >= firstDefault) return typeof t === 'string' && t.startsWith('bool(') ? Boolean(params[idx].default) : params[idx].default;
      return expand(t);
    });
    probe(params.slice(0, firstDefault).map((_p, i) => sentinel(i)), expectedArgs, ' (defaults)');
  }
  return problems;
}

export function checkPagesPreload(contract, source) {
  const bridge = contract.bowserPages;
  const problems = [];
  const read = (href) => runPagesPreload({ href, ...(source !== undefined ? { source } : {}) });
  const signalDocs = new Map((bridge.signals ?? []).map((s) => [s.channel, new Set(s.documents)]));

  // Documents that must get no bridge: other internal hosts, web pages, a
  // query-string variant is still the same host (the bridge is per host).
  for (const href of [...(bridge.unexposedHosts ?? []).map((h) => `blanc://${h}/`), 'https://example.com/', 'http://example.com/', 'blanc-chrome://index/']) {
    const { exposed } = read(href);
    if (bridge.global in exposed) problems.push(`untrusted document ${href}: ${bridge.global} exposed`);
  }

  const docs = [...bridge.hosts.map((h) => `blanc://${h}/`), ...(bridge.unexposedHosts ?? []).map((h) => `blanc://${h}/`), 'https://example.com/', 'http://example.com/'];
  for (const href of docs) {
    const { exposed, calls } = read(href);
    // Load-time IPC: only the declared signals, with no arguments.
    for (const c of calls) {
      if (c.op !== 'send' || !signalDocs.has(c.channel)) problems.push(`${href}: preload makes an undeclared ${c.op} on '${c.channel}' at load`);
      else if (c.args.length) problems.push(`${href}: signal '${c.channel}' carries arguments`);
    }
    for (const [channel, allowed] of signalDocs) {
      const sent = calls.some((c) => c.op === 'send' && c.channel === channel);
      if (sent && !allowed.has(href)) problems.push(`${href}: sends signal '${channel}', which the contract does not list for this document`);
      if (!sent && allowed.has(href)) problems.push(`${href}: no longer sends signal '${channel}'`);
    }

    const host = new URL(href).protocol === 'blanc:' ? new URL(href).host : null;
    if (!bridge.hosts.includes(host)) continue;
    const api = exposed[bridge.global];
    if (!api) { problems.push(`blanc://${host}/: ${bridge.global} not exposed`); continue; }
    const members = flatten(api);
    const expected = bridge.members.filter((m) => m.hosts.includes(host));
    const expectedNames = new Set(expected.map((m) => m.name));
    for (const name of members.keys()) {
      if (expectedNames.has(name)) continue;
      const elsewhere = bridge.members.find((m) => m.name === name);
      problems.push(elsewhere
        ? `blanc://${host}/: exposes "${name}", which the contract limits to ${elsewhere.hosts.join(', ')}`
        : `blanc://${host}/: exposes "${name}", which is not in the contract`);
    }
    for (const m of expected) {
      const where = `blanc://${host}/ ${m.name}`;
      if (!members.has(m.name)) { problems.push(`${where}: in the contract but not exposed`); continue; }
      problems.push(...probeMember(m, members.get(m.name), calls, where));
    }
  }
  return problems;
}

export function runFillPreload({ source, file } = {}) {
  const preload = file ?? path.join(ROOT, 'src', 'main', 'fill-status-preload.js');
  const text = source ?? fs.readFileSync(preload, 'utf8');
  const { calls, ipcRenderer } = recordingIpc();
  const exposed = {};
  vm.runInNewContext(text, {
    require: (id) => {
      if (id !== 'electron') throw new Error(`preload required "${id}"`);
      return { contextBridge: { exposeInMainWorld: (key, value) => { exposed[key] = value; } }, ipcRenderer };
    },
  }, { filename: preload });
  return { exposed, calls };
}

export function checkFillPreload(contract, source) {
  const bridge = contract.blancFillStatus;
  const { exposed, calls } = runFillPreload(source !== undefined ? { source } : {});
  const problems = [];
  for (const key of Object.keys(exposed)) if (key !== bridge.global) problems.push(`fill-status preload exposes window.${key}`);
  if (calls.length) problems.push(`fill-status preload makes IPC calls at load: ${calls.map((c) => c.channel).join(', ')}`);
  const api = exposed[bridge.global];
  if (!api) return [...problems, `${bridge.global} not exposed`];
  const members = flatten(api);
  const names = new Set(bridge.members.map((m) => m.name));
  for (const name of members.keys()) if (!names.has(name)) problems.push(`${bridge.global} exposes "${name}", which is not in the contract`);
  for (const m of bridge.members) {
    if (!members.has(m.name)) { problems.push(`${bridge.global}.${m.name}: in the contract but not exposed`); continue; }
    problems.push(...probeMember(m, members.get(m.name), calls, `${bridge.global}.${m.name}`));
  }
  return problems;
}

// ---- main-side host authority ----
function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
}

/** Every `handle(`/`handleEvent(` registration in pages.js: channel → hosts. */
export function pagesHandlers(source = fs.readFileSync(PAGES_JS, 'utf8')) {
  const { UTILITY_PAGES, KNOWN_PAGES } = requireMain('./utility-pages');
  const sets = { UTILITY_PAGES, KNOWN_PAGES };
  const text = stripComments(source);
  const handlers = new Map();
  const problems = [];
  for (const match of text.matchAll(/(?<![.\w])(handle|handleEvent)\(\s*'([^']+)'\s*,\s*/g)) {
    const channel = match[2];
    const rest = text.slice(match.index + match[0].length);
    let hosts = null;
    let m;
    if ((m = rest.match(/^'([a-z-]+)'\s*,/))) hosts = [m[1]];
    else if ((m = rest.match(/^\[\.\.\.([A-Z_]+)\]\s*,/)) && sets[m[1]]) hosts = [...sets[m[1]]];
    else if ((m = rest.match(/^\[((?:\s*'[a-z-]+'\s*,?)+)\]\s*,/))) hosts = [...m[1].matchAll(/'([a-z-]+)'/g)].map((x) => x[1]);
    if (!hosts) { problems.push(`pages.js: cannot read the host list for '${channel}'`); continue; }
    if (handlers.has(channel)) problems.push(`pages.js: '${channel}' is registered twice`);
    handlers.set(channel, new Set(hosts));
  }
  return { handlers, problems };
}

function mainSources(exclude) {
  return fs.readdirSync(MAIN_DIR).filter((f) => f.endsWith('.js') && !exclude.has(f))
    .map((f) => stripComments(fs.readFileSync(path.join(MAIN_DIR, f), 'utf8'))).join('\n');
}

export function checkPagesMain(contract, { pagesSource, mainText } = {}) {
  const bridge = contract.bowserPages;
  const { handlers, problems } = pagesHandlers(pagesSource);
  const wanted = new Map();
  for (const m of bridge.members.filter((x) => x.kind === 'invoke')) {
    if (!wanted.has(m.channel)) wanted.set(m.channel, new Set());
    for (const h of m.hosts) wanted.get(m.channel).add(h);
  }
  for (const [channel, hosts] of wanted) {
    const allowed = handlers.get(channel);
    if (!allowed) { problems.push(`'${channel}': no handle()/handleEvent() registration in pages.js`); continue; }
    const denied = [...hosts].filter((h) => !allowed.has(h));
    const extra = [...allowed].filter((h) => !hosts.has(h));
    if (denied.length) problems.push(`'${channel}': exposed to ${denied.join(', ')}, but pages.js denies ${denied.length > 1 ? 'those hosts' : 'that host'}`);
    if (extra.length) problems.push(`'${channel}': pages.js also allows ${extra.join(', ')}, where the preload exposes no member for it`);
  }
  for (const channel of handlers.keys()) {
    if (!wanted.has(channel)) problems.push(`'${channel}': pages.js registers a handler with no bowserPages member`);
  }
  const text = mainText ?? mainSources(new Set(['tab-preload.js', 'test-hook.js']));
  for (const m of bridge.members.filter((x) => x.kind === 'event')) {
    if (!new RegExp(`\\.send\\(\\s*'${m.channel}'`).test(text)) problems.push(`${m.name}: nothing in src/main sends '${m.channel}'`);
  }
  for (const s of bridge.signals ?? []) {
    if (!text.includes(`'${s.channel}'`)) problems.push(`signal '${s.channel}': no longer handled in src/main`);
  }
  return problems;
}

// ---- renderer usage ----
function pageScripts() {
  const out = new Map();
  for (const file of fs.readdirSync(PAGES_DIR).filter((f) => f.endsWith('.html'))) {
    const html = fs.readFileSync(path.join(PAGES_DIR, file), 'utf8');
    out.set(file.replace(/\.html$/, ''), [...html.matchAll(/<script[^>]*\bsrc="([^"]+\.js)"/g)].map((m) => m[1]));
  }
  return out;
}

/** References to bowserPages in one script: `[path, ...]`, where a path is a
 * namespace (`surface`) or a member (`surface.close`). Covers direct
 * `bowserPages?.ns.member` chains and `const x = window.bowserPages?.ns` aliases. */
export function pagesReferences(text) {
  const refs = [];
  const seg = '\\??\\.([A-Za-z_$][\\w$]*)';
  for (const m of text.matchAll(new RegExp(`\\bbowserPages${seg}(?:${seg})?`, 'g'))) refs.push(m[2] ? `${m[1]}.${m[2]}` : m[1]);
  for (const alias of text.matchAll(/\b(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*window\.bowserPages\??\.([A-Za-z_$][\w$]*)\s*;/g)) {
    for (const m of text.matchAll(new RegExp(`(?<![\\w$.])${alias[1].replace(/\$/g, '\\$')}${seg}`, 'g'))) refs.push(`${alias[2]}.${m[1]}`);
  }
  return refs;
}

export function checkPagesRenderers(contract, { scripts = pageScripts(), read = (f) => fs.readFileSync(path.join(PAGES_DIR, f), 'utf8') } = {}) {
  const bridge = contract.bowserPages;
  const problems = [];
  for (const [host, files] of scripts) {
    const available = bridge.hosts.includes(host) ? bridge.members.filter((m) => m.hosts.includes(host)).map((m) => m.name) : [];
    const ok = (ref) => available.some((name) => name === ref || name.startsWith(`${ref}.`));
    for (const file of files) {
      if (!fs.existsSync(path.join(PAGES_DIR, file))) continue;
      for (const ref of new Set(pagesReferences(read(file)))) {
        if (!ok(ref)) problems.push(`${file} (loaded by blanc://${host}/) uses bowserPages.${ref}, which the contract does not expose on that host`);
      }
    }
  }
  return problems;
}

// ---- fill-status payloads ----
const unionOf = (ts) => new Set([...ts.matchAll(/'([^']+)'/g)].map((m) => m[1]));
const sortedJoin = (set) => [...set].sort().join(', ');

function literalKeys(body) {
  return body.split(',').map((part) => part.trim()).filter(Boolean)
    .map((part) => part.match(/^([A-Za-z_$][\w$]*)/)?.[1]).filter(Boolean);
}

export function checkFillPayloads(contract, { surfaceSource, rendererSource, mainText } = {}) {
  const bridge = contract.blancFillStatus;
  const types = bridge.types;
  const problems = [];
  const { FILL_KINDS, MODES } = requireMain('./fill-status-kinds');
  const compare = (label, actual, typeName) => {
    const declared = unionOf(types[typeName].ts);
    if (sortedJoin(actual) !== sortedJoin(declared)) problems.push(`${typeName} (${sortedJoin(declared)}) does not match ${label} (${sortedJoin(actual)})`);
  };
  compare('FILL_KINDS', new Set(Object.keys(FILL_KINDS)), 'FillKind');
  compare('MODES', new Set(Object.values(MODES)), 'FillMode');
  compare('the FILL_KINDS verbs', new Set(Object.values(FILL_KINDS).flatMap((k) => k.verbs)), 'FillVerb');

  const fieldsOf = (typeName) => sortedJoin(new Set(Object.keys(types[typeName].fields)));
  const surface = stripComments(surfaceSource ?? fs.readFileSync(path.join(MAIN_DIR, 'fill-status-surface.js'), 'utf8'));
  for (const m of bridge.members.filter((x) => x.kind === 'event')) {
    const sites = [...surface.matchAll(new RegExp(`send\\(\\s*'${m.channel}'\\s*,\\s*\\{([^}]*)\\}`, 'g'))];
    if (!sites.length) problems.push(`${m.name}: no send('${m.channel}', { ... }) in fill-status-surface.js`);
    for (const site of sites) {
      const keys = sortedJoin(new Set(literalKeys(site[1])));
      if (keys !== fieldsOf(m.payload)) problems.push(`${m.name}: fill-status-surface.js sends { ${keys} }, ${m.payload} has { ${fieldsOf(m.payload)} }`);
    }
  }
  const reply = bridge.members.find((x) => x.kind === 'send');
  const replyType = reply.params[0].type;
  const renderer = stripComments(rendererSource ?? fs.readFileSync(FILL_RENDERER, 'utf8'));
  const replies = [...renderer.matchAll(new RegExp(`${bridge.global}\\.${reply.name}\\(\\s*\\{([^}]*)\\}\\s*\\)`, 'g'))];
  if (!replies.length) problems.push(`${reply.name}: fill-status.js never calls ${bridge.global}.${reply.name}({ ... })`);
  for (const site of replies) {
    const keys = sortedJoin(new Set(literalKeys(site[1])));
    if (keys !== fieldsOf(replyType)) problems.push(`${reply.name}: fill-status.js sends { ${keys} }, ${replyType} has { ${fieldsOf(replyType)} }`);
  }
  const read = new Set([...surface.matchAll(/\bpayload\?\.([A-Za-z_$][\w$]*)/g)].map((m) => m[1]));
  for (const field of read) if (!(field in types[replyType].fields)) problems.push(`${reply.name}: fill-status-surface.js reads payload.${field}, which ${replyType} does not declare`);
  const text = mainText ?? mainSources(new Set(['fill-status-preload.js', 'test-hook.js']));
  if (!text.includes(`'${reply.channel}'`)) problems.push(`${reply.name}: channel '${reply.channel}' no longer appears in src/main`);
  return problems;
}

export function checkBridges(contract = loadBridges()) {
  return [
    ['bridges contract', validateBridges(contract)],
    ['bowserPages preload', checkPagesPreload(contract)],
    ['bowserPages main', checkPagesMain(contract)],
    ['bowserPages renderers', checkPagesRenderers(contract)],
    ['blancFillStatus preload', checkFillPreload(contract)],
    ['blancFillStatus payloads', checkFillPayloads(contract)],
  ];
}
