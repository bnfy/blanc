// Blanc browserAPI contract generator + drift guard (Phase 0 bridge contract).
//
//   node browser-api/build.mjs           emit generated/{browser-api,pages-api}.{d.ts,md}
//   node browser-api/build.mjs --check   verify src/main/preload.js exposes exactly the
//                                        contract (members, IPC kind, channel, argument
//                                        shaping, platform availability, trusted documents),
//                                        every channel still exists in main, every
//                                        browserAPI call in the renderers is a contract
//                                        member, and the generated files are current.
//                                        Exit 1 on drift. The same run checks the
//                                        bowserPages and blancFillStatus bridges
//                                        against bridges.json (see bridges.mjs).
//
// Same shape as tokens/, settings-schema/ and copy/: one source (contract.json),
// desktop guarded rather than generated. Unlike those checkers, the preload is not
// parsed with regexes: it is executed in a vm sandbox against a recording
// ipcRenderer stub, so the check sees exactly what a chrome document would get.

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { Module, createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { bridgeArtifacts, checkBridges, loadBridges, validateBridges } from './bridges.mjs';
import { VECTORS_FILE, checkVectorTypes, electronAdapter, replayVectorsSync, vectorsText } from './vectors.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SPEC = path.join(ROOT, 'browser-api', 'contract.json');
const OUT = path.join(ROOT, 'browser-api', 'generated');
const PRELOAD = path.join(ROOT, 'src', 'main', 'preload.js');
const MAIN_DIR = path.join(ROOT, 'src', 'main');
const RENDERER_DIR = path.join(ROOT, 'src', 'renderer');
const SETTINGS_SCHEMA = path.join(ROOT, 'settings-schema', 'schema.json');

export const PLATFORMS = ['darwin', 'win32', 'linux'];
const KINDS = new Set(['value', 'invoke', 'send', 'event']);
const TS_BUILTINS = new Set(['string', 'number', 'boolean', 'unknown', 'null', 'undefined', 'void', 'key', 'true', 'false']);

export function loadContract(file = SPEC) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

// ---- contract validation ----
// Every identifier in a type expression must be a TS builtin or a declared type,
// so a typo in contract.json fails here rather than as an `any` downstream.
function typeRefs(expr) {
  return (expr.replace(/'[^']*'/g, '').match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? [])
    .filter((id) => !TS_BUILTINS.has(id));
}

export function validateContract(contract) {
  const problems = [];
  const known = new Set(Object.keys(contract.types ?? {}));
  const knownOrField = (expr, where) => {
    // Object-literal field names (`private?:`, `x:`) are not type references.
    const stripped = expr.replace(/[A-Za-z_][A-Za-z0-9_]*\??\s*:/g, ':');
    for (const id of typeRefs(stripped)) if (!known.has(id)) problems.push(`${where}: unknown type "${id}"`);
  };
  for (const [name, t] of Object.entries(contract.types ?? {})) {
    if (!t.doc) problems.push(`types.${name}: missing doc`);
    if (t.fields && t.ts !== undefined) problems.push(`types.${name}: has both ts and fields`);
    if (t.fields) {
      for (const [field, spec] of Object.entries(t.fields)) {
        if (typeof spec.type !== 'string') problems.push(`types.${name}.${field}: missing type`);
        else knownOrField(spec.type, `types.${name}.${field}`);
      }
    } else if (typeof t.ts !== 'string') problems.push(`types.${name}: missing ts or fields`);
    else knownOrField(t.ts, `types.${name}`);
  }
  const seen = new Set();
  for (const m of contract.members ?? []) {
    const where = `members.${m.name}`;
    if (seen.has(m.name)) problems.push(`${where}: duplicate member`);
    seen.add(m.name);
    if (!KINDS.has(m.kind)) problems.push(`${where}: unknown kind "${m.kind}"`);
    if (!m.doc) problems.push(`${where}: missing doc`);
    if (m.platforms) for (const p of m.platforms) if (!PLATFORMS.includes(p)) problems.push(`${where}: unknown platform "${p}"`);
    if (m.kind === 'value') { knownOrField(m.type ?? '', where); continue; }
    if (typeof m.channel !== 'string' || !/^[a-z-]+:[a-z-]+$/.test(m.channel)) problems.push(`${where}: bad channel`);
    if (m.kind === 'event') {
      if (m.payload !== null) knownOrField(m.payload ?? '', where);
      if (m.payloadCheck !== undefined && !['fixtures', 'custom'].includes(m.payloadCheck)) problems.push(`${where}: unknown payloadCheck "${m.payloadCheck}"`);
      continue;
    }
    let sawOptional = false;
    for (const p of m.params ?? []) {
      knownOrField(p.type ?? '', `${where}(${p.name})`);
      if (p.optional) sawOptional = true;
      else if (sawOptional) problems.push(`${where}: required param "${p.name}" after an optional one`);
    }
    if (m.kind === 'invoke') {
      knownOrField(m.returns ?? '', `${where} returns`);
      if (m.resultCheck !== undefined && m.resultCheck !== 'none') problems.push(`${where}: unknown resultCheck "${m.resultCheck}"`);
    }
  }
  return problems;
}

// ---- generators ----
const paramList = (m) => (m.params ?? [])
  .map((p) => `${p.name}${p.optional ? '?' : ''}: ${p.type}`).join(', ');

function jsdoc(lines, indent = '  ') {
  return `${indent}/**\n${lines.map((l) => `${indent} * ${l}`).join('\n')}\n${indent} */\n`;
}

export function genDts(contract) {
  let out = '// GENERATED by browser-api/build.mjs from contract.json — do not edit by hand.\n' +
    '// The window.browserAPI surface exposed by src/main/preload.js to Blanc\'s trusted\n' +
    `// chrome documents: ${contract.surfaces.join(', ')}.\n\n`;
  for (const [name, t] of Object.entries(contract.types)) {
    if (!t.fields) { out += `/** ${t.doc} */\nexport type ${name} = ${t.ts};\n\n`; continue; }
    out += `/** ${t.doc} */\nexport interface ${name} {\n`;
    for (const [field, spec] of Object.entries(t.fields)) {
      if (spec.doc) out += `  /** ${spec.doc} */\n`;
      out += `  ${field}${spec.optional ? '?' : ''}: ${spec.type};\n`;
    }
    out += '}\n\n';
  }
  out += 'export interface BlancBrowserAPI {\n';
  for (const m of contract.members) {
    const lines = [m.doc];
    for (const p of m.params ?? []) if (p.doc || p.default !== undefined) {
      lines.push(`@param ${p.name} ${p.doc ?? ''}${p.default !== undefined ? ` Defaults to ${JSON.stringify(p.default)}.` : ''}`.trimEnd());
    }
    if (m.channel) lines.push(`IPC: ${m.kind} \`${m.channel}\`.`);
    if (m.platforms) lines.push(`Present only on ${m.platforms.join(', ')}.`);
    out += jsdoc(lines);
    const optional = m.platforms ? '?' : '';
    if (m.kind === 'value') out += `  readonly ${m.name}${optional}: ${m.type};\n`;
    else if (m.kind === 'invoke') out += `  ${m.name}${optional}(${paramList(m)}): Promise<${m.returns}>;\n`;
    else if (m.kind === 'send') out += `  ${m.name}${optional}(${paramList(m)}): void;\n`;
    else {
      const cb = m.payload === null ? '() => void' : `(payload: ${m.payload}) => void`;
      out += `  ${m.name}${optional}(callback: ${cb}): () => void;\n`;
    }
  }
  out += '}\n\ndeclare global {\n  interface Window {\n    browserAPI: BlancBrowserAPI;\n  }\n}\n';
  return out;
}

export function genReference(contract) {
  // Escape backslashes before pipes so an existing backslash can't un-escape a
  // pipe and split a table cell.
  const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/\|/g, '\\|');
  let out = '<!-- GENERATED by browser-api/build.mjs from contract.json — do not edit by hand. -->\n\n' +
    '# browserAPI reference\n\n' +
    `${contract.members.length} members, exposed only to ${contract.surfaces.map((s) => `\`${s}\``).join(', ')}.\n\n` +
    '| Member | Group | Kind | Channel | Signature | Platforms |\n| --- | --- | --- | --- | --- | --- |\n';
  for (const m of contract.members) {
    let sig;
    if (m.kind === 'value') sig = m.type;
    else if (m.kind === 'event') sig = m.payload === null ? '() => void' : `(payload: ${m.payload}) => void`;
    else sig = `(${paramList(m)})${m.kind === 'invoke' ? ` => Promise<${m.returns}>` : ''}`;
    out += `| \`${m.name}\` | ${m.group} | ${m.kind} | ${m.channel ? `\`${m.channel}\`` : '—'} | \`${esc(sig)}\` | ${m.platforms ? m.platforms.join(', ') : 'all'} |\n`;
  }
  out += '\n## Types\n';
  for (const [name, t] of Object.entries(contract.types)) {
    out += `\n### \`${name}\`\n\n${t.doc}\n\n`;
    if (!t.fields) { out += `\`${esc(t.ts)}\`\n`; continue; }
    out += '| Field | Type | Notes |\n| --- | --- | --- |\n';
    for (const [field, spec] of Object.entries(t.fields)) {
      out += `| \`${field}${spec.optional ? '?' : ''}\` | \`${esc(spec.type)}\` | ${esc(spec.doc ?? '')} |\n`;
    }
  }
  return out;
}

export function artifacts(contract) {
  return { 'browser-api.d.ts': genDts(contract), 'browser-api.md': genReference(contract) };
}

// ---- preload probe ----
// Execute the real preload in a sandbox with a recording ipcRenderer, as a
// chrome document at `href` on `platform` would see it.
export function runPreload({ platform, href, source = fs.readFileSync(PRELOAD, 'utf8') }) {
  let exposed = null;
  const calls = [];
  const ipcRenderer = {
    invoke: (channel, ...args) => { calls.push({ op: 'invoke', channel, args }); return INVOKE_RESULT; },
    send: (channel, ...args) => { calls.push({ op: 'send', channel, args }); },
    on: (channel, listener) => { calls.push({ op: 'on', channel, listener }); },
    removeListener: (channel, listener) => { calls.push({ op: 'off', channel, listener }); },
  };
  const electron = {
    contextBridge: { exposeInMainWorld: (key, value) => { if (key === 'browserAPI') exposed = value; } },
    ipcRenderer,
  };
  const sandbox = {
    require: (id) => { if (id === 'electron') return electron; throw new Error(`preload required "${id}"`); },
    process: { platform },
    window: { location: { href } },
  };
  vm.runInNewContext(source, sandbox, { filename: PRELOAD });
  return { exposed, calls };
}

const INVOKE_RESULT = Symbol('invoke-result');
const sentinel = (i) => `__arg${i}__`;

function expand(template) {
  if (typeof template === 'string') {
    let m = template.match(/^\$(\d+)$/);
    if (m) return sentinel(Number(m[1]));
    m = template.match(/^bool\(\$(\d+)\)$/);
    if (m) return Boolean(sentinel(Number(m[1])));
    return template;
  }
  if (template && typeof template === 'object') {
    return Object.fromEntries(Object.entries(template).map(([k, v]) => [k, expand(v)]));
  }
  return template;
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export function checkPreload(contract, source) {
  const problems = [];
  const read = (platform, href) => runPreload({ platform, href, ...(source ? { source } : {}) });

  // Trusted documents: each listed surface gets the bridge; nothing else does.
  for (const href of contract.surfaces) {
    if (!read('linux', href).exposed) problems.push(`surface ${href}: browserAPI not exposed`);
  }
  for (const href of ['blanc-chrome://fill-status/', 'blanc://newtab/', 'https://example.com/', 'blanc-chrome://index/?x']) {
    if (read('linux', href).exposed) problems.push(`untrusted document ${href}: browserAPI exposed`);
  }

  const byName = new Map(contract.members.map((m) => [m.name, m]));
  for (const platform of PLATFORMS) {
    const { exposed, calls } = read(platform, contract.surfaces[0]);
    if (!exposed) { problems.push(`${platform}: browserAPI not exposed`); continue; }
    const expectedHere = contract.members.filter((m) => !m.platforms || m.platforms.includes(platform));
    for (const name of Object.keys(exposed)) {
      if (!byName.has(name)) problems.push(`${platform}: preload exposes "${name}", which is not in the contract`);
      else if (!expectedHere.includes(byName.get(name))) problems.push(`${platform}: "${name}" is exposed but the contract limits it to ${byName.get(name).platforms.join(', ')}`);
    }
    for (const m of expectedHere) {
      const where = `${platform} ${m.name}`;
      if (!(m.name in exposed)) { problems.push(`${where}: in the contract but not exposed`); continue; }
      const value = exposed[m.name];
      if (m.kind === 'value') {
        if (typeof value === 'function') problems.push(`${where}: expected a value, got a function`);
        else if (m.source === 'process.platform' && value !== platform) problems.push(`${where}: expected "${platform}", got ${JSON.stringify(value)}`);
        continue;
      }
      if (typeof value !== 'function') { problems.push(`${where}: expected a function`); continue; }

      if (m.kind === 'event') {
        calls.length = 0;
        const received = [];
        const unsubscribe = value((...args) => received.push(args));
        const on = calls.find((c) => c.op === 'on');
        if (!on || on.channel !== m.channel) { problems.push(`${where}: expected ipcRenderer.on('${m.channel}'), got ${on ? `'${on.channel}'` : 'none'}`); continue; }
        if (m.payload === null) on.listener({});
        else on.listener({}, 'PAYLOAD', 'EXTRA');
        const expected = m.payload === null ? [[]] : [['PAYLOAD']];
        if (!same(received, expected)) problems.push(`${where}: callback received ${JSON.stringify(received)}, expected ${JSON.stringify(expected)}`);
        if (typeof unsubscribe !== 'function') { problems.push(`${where}: does not return an unsubscribe function`); continue; }
        unsubscribe();
        const off = calls.find((c) => c.op === 'off');
        if (!off || off.channel !== m.channel || off.listener !== on.listener) problems.push(`${where}: unsubscribe does not remove the listener it added`);
        continue;
      }

      const params = m.params ?? [];
      const defaultTemplate = params.map((_p, i) => `$${i}`);
      const template = m.ipcArgs ?? defaultTemplate;
      const probe = (args, expectedArgs, label) => {
        calls.length = 0;
        const result = value(...args);
        const call = calls.find((c) => c.op === 'invoke' || c.op === 'send');
        if (!call) { problems.push(`${where}${label}: made no IPC call`); return; }
        if (call.op !== m.kind) problems.push(`${where}${label}: uses ipcRenderer.${call.op}, contract says ${m.kind}`);
        if (call.channel !== m.channel) problems.push(`${where}${label}: channel '${call.channel}', contract says '${m.channel}'`);
        if (!same(call.args, expectedArgs)) problems.push(`${where}${label}: sends ${JSON.stringify(call.args)}, contract expects ${JSON.stringify(expectedArgs)}`);
        if (m.kind === 'invoke' && result !== INVOKE_RESULT) problems.push(`${where}${label}: does not return the ipcRenderer.invoke promise`);
      };
      probe(params.map((_p, i) => sentinel(i)), template.map(expand), '');
      const firstDefault = params.findIndex((p) => p.default !== undefined);
      if (firstDefault >= 0) {
        const args = params.slice(0, firstDefault).map((_p, i) => sentinel(i));
        const expectedArgs = template.map((t) => {
          const idx = typeof t === 'string' ? Number((t.match(/^\$(\d+)$/) ?? [])[1]) : NaN;
          return idx >= firstDefault ? params[idx].default : expand(t);
        });
        probe(args, expectedArgs, ' (defaults)');
      }
    }
  }
  return problems;
}

// ---- runtime value validation ----
// A deliberately small validator for the type expressions the contract uses:
// primitives, string literals, unions, `T[]`, and named types (structured
// `fields` types are checked strictly: every required field present, no extras).
// Inline object literals in `ts` strings are not interpreted.
function splitUnion(expr) {
  return expr.split('|').map((s) => s.trim()).filter(Boolean);
}

function describe(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value === 'string' ? JSON.stringify(value) : typeof value;
}

export function validateValue(value, expr, contract, where = 'value') {
  if (expr.includes('{')) return [];
  const alternatives = splitUnion(expr);
  const results = alternatives.map((alt) => validateAlternative(value, alt, contract, where));
  if (results.some((r) => r.length === 0)) return [];
  return alternatives.length === 1 ? results[0] : [`${where}: expected ${expr}, got ${describe(value)}`];
}

function validateAlternative(value, alt, contract, where) {
  const fail = [`${where}: expected ${alt}, got ${describe(value)}`];
  if (alt === 'unknown') return [];
  if (alt === 'string') return typeof value === 'string' ? [] : fail;
  if (alt === 'number') return Number.isFinite(value) ? [] : fail;
  if (alt === 'boolean') return typeof value === 'boolean' ? [] : fail;
  if (alt === 'true' || alt === 'false') return value === (alt === 'true') ? [] : fail;
  if (alt === 'null') return value === null ? [] : fail;
  if (alt === 'undefined' || alt === 'void') return value === undefined ? [] : fail;
  if (/^'[^']*'$/.test(alt)) return value === alt.slice(1, -1) ? [] : fail;
  if (alt.endsWith('[]')) {
    if (!Array.isArray(value)) return fail;
    return value.flatMap((item, i) => validateValue(item, alt.slice(0, -2), contract, `${where}[${i}]`));
  }
  const type = contract.types[alt];
  if (!type) return [`${where}: unknown type ${alt}`];
  if (!type.fields) return validateValue(value, type.ts, contract, where);
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail;
  const problems = [];
  for (const [field, spec] of Object.entries(type.fields)) {
    if (!(field in value)) {
      if (!spec.optional) problems.push(`${where}.${field}: missing (${alt})`);
      continue;
    }
    problems.push(...validateValue(value[field], spec.type, contract, `${where}.${field}`));
  }
  for (const key of Object.keys(value)) {
    if (!(key in type.fields)) problems.push(`${where}.${key}: not a field of ${alt}`);
  }
  return problems;
}

// ---- payload checks ----
// tabs:updated is assembled in main.js from pure helper modules plus a few
// inline object literals. The helpers are executed on fixtures that cover
// their branches and the results validated against the contract; the inline
// literals in main.js are compared by key with the contract's fields.
const requireMain = createRequire(path.join(MAIN_DIR, 'main.js'));

function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"\\])\/\/[^\n]*/g, '$1');
}

// From the `{` at `start`, return the text up to its matching `}`, skipping
// quoted strings and template literals.
function balanced(text, start) {
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (ch === "'" || ch === '"' || ch === '`') {
      for (i++; i < text.length && text[i] !== ch; i++) if (text[i] === '\\') i++;
      continue;
    }
    if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) return text.slice(start, i + 1);
  }
  throw new Error(`unbalanced braces from offset ${start}`);
}

// Top-level keys of an object literal (`{ a: 1, b, ...c }` → keys a, b and
// spread c). `values` maps a key to its value when that is a plain literal
// (`'x'`, true, false, null or a number), as the literal's own source text.
export function literalKeys(objectText) {
  const entries = splitTopLevel(objectText.slice(1, -1));
  const keys = [];
  const spreads = [];
  const values = {};
  for (const raw of entries.map((e) => e.trim()).filter(Boolean)) {
    if (raw.startsWith('...')) { spreads.push(raw.slice(3).trim()); continue; }
    const m = raw.match(/^([A-Za-z_$][\w$]*)\s*(?::\s*([^]*))?$/);
    if (!m) throw new Error(`cannot read object key from "${raw.slice(0, 40)}"`);
    keys.push(m[1]);
    const value = m[2]?.trim();
    if (value && /^(?:'[^']*'|true|false|null|-?\d[\d.]*)$/.test(value)) values[m[1]] = value;
  }
  return { keys, spreads, values };
}

function functionBody(source, name) {
  const at = source.indexOf(`function ${name}(`);
  if (at < 0) throw new Error(`function ${name} not found in main.js`);
  return balanced(source, source.indexOf('{', source.indexOf(')', at)));
}

function objectAfter(text, marker, { last = false } = {}) {
  const at = last ? text.lastIndexOf(marker) : text.indexOf(marker);
  if (at < 0) throw new Error(`"${marker}" not found`);
  return balanced(text, text.indexOf('{', at));
}

function compareKeys(label, actual, typeName, contract) {
  const expected = Object.keys(contract.types[typeName].fields);
  const missing = expected.filter((k) => !actual.includes(k));
  const extra = actual.filter((k) => !expected.includes(k));
  return [
    ...missing.map((k) => `${label}: contract field ${typeName}.${k} is not produced in main.js`),
    ...extra.map((k) => `${label}: main.js produces "${k}", which is not a field of ${typeName}`),
  ];
}

export function checkMainPayloadKeys(contract, mainSource = fs.readFileSync(path.join(MAIN_DIR, 'main.js'), 'utf8')) {
  const source = stripComments(mainSource);
  const problems = [];
  try {
    const metrics = literalKeys(objectAfter(functionBody(source, 'verticalTabsMetrics'), 'return')).keys;
    const captureFn = functionBody(source, 'captureBroadcastState');
    const capture = literalKeys(objectAfter(captureFn, 'return', { last: true })).keys;
    const resolveSpreads = (label, { keys, spreads }) => {
      const out = [...keys];
      for (const spread of spreads) {
        if (spread === 'widthMetrics' || spread === 'verticalTabsMetrics()') out.push(...metrics);
        else if (spread === 'captureBroadcastState(serialized)') out.push(...capture);
        else problems.push(`${label}: unrecognized spread "...${spread}"; teach browser-api/build.mjs how to read it`);
      }
      return out;
    };

    // TabEntry: the `rest` allowlist plus the derived fields both returns add.
    const serialize = functionBody(source, 'serializeTabs');
    const rest = literalKeys(objectAfter(serialize, 'const rest =')).keys;
    const returns = [...serialize.matchAll(/return \{ \.\.\.rest,/g)].map((m) => literalKeys(balanced(serialize, m.index + 7)));
    if (returns.length === 0) problems.push('serializeTabs: no `return { ...rest, ... }` found');
    const derived = returns.map((r) => r.keys.filter((k) => !rest.includes(k)));
    if (derived.some((d) => JSON.stringify(d) !== JSON.stringify(derived[0]))) {
      problems.push(`serializeTabs: its returns add different fields (${derived.map((d) => d.join(',')).join(' vs ')})`);
    }
    problems.push(...compareKeys('serializeTabs', [...rest, ...(derived[0] ?? [])], 'TabEntry', contract));

    problems.push(...compareKeys('currentTabsPayload',
      resolveSpreads('currentTabsPayload', literalKeys(objectAfter(functionBody(source, 'currentTabsPayload'), 'return'))),
      'TabsUpdatedPayload', contract));

    const getAll = source.indexOf("chromeHandle('tabs:get-all'");
    if (getAll < 0) problems.push("tabs:get-all handler not found in main.js");
    else problems.push(...compareKeys('tabs:get-all', resolveSpreads('tabs:get-all', literalKeys(balanced(source, source.indexOf('{', getAll)))), 'TabsSnapshot', contract));

    for (const m of captureFn.matchAll(/rows\.push\(\{/g)) {
      problems.push(...compareKeys('captureBroadcastState row', literalKeys(balanced(captureFn, m.index + 10)).keys, 'CaptureRow', contract));
    }
  } catch (error) {
    problems.push(`main.js payload literals could not be read: ${error.message}`);
  }
  return problems;
}

// ---- event send sites ----
// For every event whose payload is a structured type, find each
// `send('<channel>', <arg>)` in src/main and compare the payload's keys with
// the contract. <arg> may be an object literal, a local `const`/`let` bound to
// a literal or a call, or a call whose function returns an object literal.
// Members marked `"payloadCheck": "fixtures"` are proven by payloadFixtures()
// instead, and `"custom"` by a dedicated check (tabs:updated). A replay of a
// stored payload (`<expr>.payload`) is accepted only when another send site
// for the same channel was checked as a literal. Any other form fails, so a
// new send site has to be readable.
const SEND_EXCLUDE = new Set(['preload.js', 'test-hook.js']);

function mainSources() {
  return jsFiles(MAIN_DIR)
    .filter((f) => !SEND_EXCLUDE.has(path.basename(f)))
    .map((f) => ({ file: path.basename(f), text: stripComments(fs.readFileSync(f, 'utf8')) }));
}

function structuredType(expr, contract) {
  const names = splitUnion(expr).filter((t) => t !== 'null');
  return names.length === 1 && contract.types[names[0]]?.fields ? names[0] : null;
}

function returnedKeys(sources, fnName) {
  for (const { text } of sources) {
    if (!text.includes(`function ${fnName}(`)) continue;
    const body = functionBody(text, fnName);
    return literalKeys(objectAfter(body, 'return {', { last: true }).replace(/^return /, ''));
  }
  throw new Error(`function ${fnName} not found in src/main`);
}

function argumentKeys(sources, text, argStart) {
  const rest = text.slice(argStart);
  if (rest.startsWith('{')) return literalKeys(balanced(text, argStart));
  const call = rest.match(/^([A-Za-z_$][\w$]*)\(/);
  if (call) return returnedKeys(sources, call[1]);
  const ident = rest.match(/^([A-Za-z_$][\w$]*)\s*[),]/);
  if (!ident) throw new Error(`unreadable payload argument "${rest.slice(0, 40)}"`);
  const before = text.slice(0, argStart);
  const decl = [...before.matchAll(new RegExp(`(?:const|let)\\s+${ident[1]}\\s*=\\s*`, 'g'))].at(-1);
  if (!decl) throw new Error(`payload variable "${ident[1]}" has no local declaration`);
  return argumentKeys(sources, text, decl.index + decl[0].length);
}

export function checkEventSends(contract, rawSources = mainSources()) {
  const sources = rawSources.map(({ file, text }) => ({ file, text: stripComments(text) }));
  const problems = [];
  for (const m of contract.members) {
    if (m.kind !== 'event' || m.payload === null || m.payloadCheck) continue;
    const typeName = structuredType(m.payload, contract);
    if (!typeName) continue;
    const fields = contract.types[typeName].fields;
    const required = Object.keys(fields).filter((k) => !fields[k].optional);
    const pattern = new RegExp(`\\.send\\(\\s*'${m.channel}'\\s*,\\s*`, 'g');
    let sites = 0;
    let checked = 0;
    let replays = 0;
    for (const source of sources) {
      for (const hit of source.text.matchAll(pattern)) {
        sites++;
        const where = `${m.name} (${source.file})`;
        if (/^[\w$?.]+\.payload\s*\)/.test(source.text.slice(hit.index + hit[0].length))) { replays++; continue; }
        checked++;
        try {
          const { keys, spreads } = argumentKeys(sources, source.text, hit.index + hit[0].length);
          for (const s of spreads) problems.push(`${where}: unrecognized spread "...${s}" in the ${m.channel} payload`);
          for (const k of keys) if (!(k in fields)) problems.push(`${where}: sends "${k}", which is not a field of ${typeName}`);
          for (const k of required) if (!keys.includes(k)) problems.push(`${where}: does not send required field ${typeName}.${k}`);
        } catch (error) {
          problems.push(`${where}: ${error.message}; teach browser-api/build.mjs to read it or mark the member "payloadCheck": "fixtures"`);
        }
      }
    }
    if (sites === 0) problems.push(`${m.name}: no send('${m.channel}', …) found in src/main`);
    else if (replays && !checked) problems.push(`${m.name}: only replays of a stored payload were found; the original send must be checkable`);
  }
  return problems;
}

// ---- invoke results ----
// Statically classify what an invoke handler can resolve to: the handler's
// own top-level returns (nested functions excluded), following a direct call
// to a local helper one level deep. Each result is 'undefined' (bare return or
// falling off the end), a boolean / null / number / string literal, an object
// literal (keys), or 'opaque' (anything else, e.g. an identifier or call).
function skipNestedFunctions(body) {
  let out = '';
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch === "'" || ch === '"' || ch === '`') {
      let j = i + 1;
      for (; j < body.length && body[j] !== ch; j++) if (body[j] === '\\') j++;
      out += body.slice(i, j + 1);
      i = j;
      continue;
    }
    const arrow = body.startsWith('=>', i) && body.slice(i + 2).match(/^\s*\{/);
    const fn = !arrow && /^function\b[^{]*\{/.exec(body.slice(i));
    if (arrow || fn) {
      const open = body.indexOf('{', i);
      out += body.slice(i, open) + '{}';
      i = open + balanced(body, open).length - 1;
      continue;
    }
    out += ch;
  }
  return out;
}

function topLevelReturns(block) {
  const flat = skipNestedFunctions(block.slice(1, -1));
  const results = [...flat.matchAll(/\breturn\b\s*([^;]*);?/g)].map((m) => m[1].trim());
  // Falling off the end resolves to undefined.
  if (completes(flat)) results.push('');
  return results;
}

// Start of the last top-level `{ … }` block in a statement list.
function lastBlockStart(text) {
  let depth = 0;
  let start = -1;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "'" || ch === '"' || ch === '`') {
      for (i++; i < text.length && text[i] !== ch; i++) if (text[i] === '\\') i++;
      continue;
    }
    if (ch === '{') { if (depth === 0) start = i; depth++; } else if (ch === '}') depth--;
  }
  return start;
}

// Whether a statement list can run off its end: it doesn't end in a return or
// throw. A trailing `try { … } catch { … } finally { … }` can't when its try
// and catch blocks can't (or its finally block itself returns). Any other
// trailing block (if, loop) is assumed to complete.
function completes(statements) {
  const text = statements.trim();
  if (!text.endsWith('}')) return !/\b(?:return|throw)\b[^;]*;?$/.test(text);
  const open = lastBlockStart(text);
  const head = text.slice(0, open).trimEnd();
  const inner = text.slice(open + 1, -1);
  if (/\bfinally$/.test(head)) return completes(inner) && completes(head.slice(0, -'finally'.length));
  const caught = head.match(/\bcatch\s*(?:\([^)]*\))?$/);
  if (caught) return completes(inner) || completes(head.slice(0, caught.index));
  if (/\btry$/.test(head)) return completes(inner);
  return true;
}

function classify(expr) {
  const e = expr.trim();
  if (e === '' || e === 'undefined') return { kind: 'undefined' };
  if (e === 'true' || e === 'false') return { kind: 'boolean' };
  if (e === 'null') return { kind: 'null' };
  if (/^-?\d/.test(e)) return { kind: 'number' };
  if (/^'[^']*'$/.test(e)) return { kind: 'string', value: e.slice(1, -1) };
  if (e.startsWith('{')) return { kind: 'object', text: e };
  return { kind: 'opaque', text: e };
}

function handlerExpression(source, channel) {
  let at = source.indexOf(`chromeHandle('${channel}'`);
  if (at < 0) {
    // A handler table: `['<channel>', (…) => op(…)]` entries consumed by a loop
    // that registers `chromeHandle(channel, …)` with one shared body.
    const entry = source.indexOf(`['${channel}',`);
    if (entry < 0) return null;
    at = source.indexOf('chromeHandle(channel,', entry);
    if (at < 0) return null;
  }
  const arrow = source.indexOf('=>', at);
  const after = source.slice(arrow + 2);
  const lead = after.length - after.trimStart().length;
  if (after.trimStart().startsWith('{')) return { block: balanced(source, arrow + 2 + lead) };
  const text = after.trimStart();
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    if ('([{'.includes(text[i])) depth++;
    else if (')]}'.includes(text[i])) { if (depth === 0) return { expr: text.slice(0, i).trim() }; depth--; }
  }
  return null;
}

export function resultKinds(contract, member, sources = mainSources()) {
  const main = sources.find((s) => s.file === 'main.js').text;
  const handler = handlerExpression(main, member.channel);
  if (!handler) return null;
  const scope = handler.block ?? '';
  const exprs = handler.block ? topLevelReturns(handler.block) : [handler.expr];
  const kinds = [];
  for (const expr of exprs) {
    const call = expr.match(/^(?:await\s+)?([A-Za-z_$][\w$]*)\((?:[^()]|\([^()]*\))*\)$/);
    const helper = call && sources.find((s) => new RegExp(`(?:^|\\n)(?:async\\s+)?function\\s+${call[1]}\\s*\\(`).test(s.text));
    if (helper) {
      const body = functionBody(helper.text.replace(/async\s+function/g, 'function'), call[1]);
      kinds.push(...returnKinds(body));
    } else kinds.push(classifyIn(scope, expr));
  }
  return kinds;
}

// Classify a function body's top-level returns. A returned local that was
// bound to an object literal (`const response = { … }; … return response;`)
// is read as that literal.
function returnKinds(body) {
  return topLevelReturns(body).map((expr) => classifyIn(body, expr));
}

function classifyIn(scope, expr) {
  const kind = classify(expr);
  if (kind.kind !== 'opaque' || !/^[A-Za-z_$][\w$]*$/.test(kind.text)) return kind;
  const decl = scope.match(new RegExp(`\\bconst\\s+${kind.text}\\s*=\\s*\\{`));
  return decl ? { kind: 'object', text: balanced(scope, decl.index + decl[0].length - 1) } : kind;
}

// Handlers that forward a module function's result unread. That function's
// own top-level returns are classified the same way and must fit the member's
// result type too.
const FORWARDED_RESULTS = [
  { member: 'fillLoginFromOnePassword', file: 'credential-fill-controller.js', functions: ['fill', 'failWithError'] },
];

// The body of `const <name> = (…) => { … }` (or `async (…) => { … }`).
function arrowBody(source, name) {
  const at = source.search(new RegExp(`\\bconst\\s+${name}\\s*=\\s*(?:async\\s*)?\\(`));
  if (at < 0) throw new Error(`const ${name} = (…) => { … } not found`);
  const arrow = source.indexOf('=>', at);
  const open = source.indexOf('{', arrow);
  if (source.slice(arrow + 2, open).trim()) throw new Error(`${name} is not a block-bodied arrow function`);
  return balanced(source, open);
}

// Whether a literal's source text (`'x'`, true, null, 3) is allowed by a type expression.
function literalFits(literal, expr, contract) {
  return splitUnion(expr).some((alt) => {
    if (alt === 'unknown' || alt === literal) return true;
    const named = contract.types[alt];
    if (named?.ts !== undefined) return literalFits(literal, named.ts, contract);
    if (literal.startsWith("'")) return alt === 'string';
    if (literal === 'true' || literal === 'false') return alt === 'boolean';
    return literal !== 'null' && alt === 'number';
  });
}

function checkKinds(where, kinds, returns, contract, sources) {
  const problems = [];
  const alts = splitUnion(returns);
  const allows = (k) => alts.includes(k) || (k === 'undefined' && alts.includes('void'));
  const structured = alts.map((a) => contract.types[a]?.fields ? a : null).filter(Boolean);
  for (const k of kinds) {
    if (k.kind === 'opaque') {
      if (alts.length === 1 && (alts[0] === 'void' || alts[0] === 'undefined')) problems.push(`${where}: returns a value (${k.text.slice(0, 50)}) but the contract says ${returns}`);
      continue;
    }
    if (k.kind === 'object') {
      if (!structured.length) { problems.push(`${where}: returns an object literal but the contract says ${returns}`); continue; }
      try {
        const { keys, spreads, values } = literalKeys(balanced(k.text, 0));
        // `...helper()` contributes the keys that helper returns; a spread of
        // an opaque value (`...result`) can't be read, so it only waives the
        // required-field check.
        let opaqueSpread = false;
        for (const spread of spreads) {
          const call = spread.match(/^([A-Za-z_$][\w$]*)\(\)$/);
          if (call) keys.push(...returnedKeys(sources, call[1]).keys);
          else opaqueSpread = true;
        }
        // Literal values (`error: 'busy'`, `ok: false`) must also fit the field.
        const fits = structured.some((t) => {
          const f = contract.types[t].fields;
          return keys.every((key) => key in f && (!(key in values) || literalFits(values[key], f[key].type, contract)))
            && (opaqueSpread || Object.keys(f).every((key) => f[key].optional || keys.includes(key)));
        });
        const shown = keys.map((key) => (key in values ? `${key}: ${values[key]}` : key));
        if (!fits) problems.push(`${where}: returned object { ${shown.join(', ')}${opaqueSpread ? ', …' : ''} } does not match ${structured.join(' | ')}`);
      } catch (error) { problems.push(`${where}: ${error.message}`); }
      continue;
    }
    if (k.kind === 'string' && alts.some((a) => a === `'${k.value}'` || a === 'string')) continue;
    if (k.kind === 'number' && alts.includes('number')) continue;
    if (!allows(k.kind)) problems.push(`${where}: can resolve to ${k.kind === 'string' ? `'${k.value}'` : k.kind}, which ${returns} does not allow`);
  }
  return problems;
}

export function checkInvokeResults(contract, rawSources = mainSources()) {
  const sources = rawSources.map(({ file, text }) => ({ file, text: stripComments(text) }));
  const problems = [];
  for (const m of contract.members) {
    if (m.kind !== 'invoke' || m.returns === 'unknown' || m.resultCheck === 'none') continue;
    const where = `${m.name} result`;
    const kinds = resultKinds(contract, m, sources);
    if (!kinds) { problems.push(`${where}: handler for '${m.channel}' not found as chromeHandle('${m.channel}', …) in main.js`); continue; }
    problems.push(...checkKinds(where, kinds, m.returns, contract, sources));
  }
  for (const { member, file, functions } of FORWARDED_RESULTS) {
    const m = contract.members.find((x) => x.name === member);
    const source = sources.find((s) => s.file === file);
    if (!m || !source) { problems.push(`forwarded result ${member}: ${!m ? 'not a contract member' : `${file} not found`}`); continue; }
    for (const fn of functions) {
      try {
        problems.push(...checkKinds(`${member} result (${file} ${fn})`, returnKinds(arrowBody(source.text, fn)), m.returns, contract, sources));
      } catch (error) { problems.push(`${member} result (${file}): ${error.message}`); }
    }
  }
  return problems;
}

// ---- parameter shapes ----
// A structured parameter is checked from both ends. In the renderers, every
// object passed for it must fit the type: an object literal, a local bound to
// one, a function that returns one, or a parameter of the enclosing function
// (followed to that function's call sites). In main, every field its handler
// reads from it must be in the type, following the value into a local
// function or a module function listed in FORWARDED_PARAMS.
const FORWARDED_PARAMS = [
  { member: 'resizeGlance', file: 'glance-layout.js', fn: 'ratioForGlanceDivider', index: 1 },
  { member: 'openMainMenu', file: 'platform-main-menu.js', fn: 'popupPoint', index: 0 },
  { member: 'listHistory', file: 'history.js', fn: 'listHistory', index: 0 },
  { member: 'resolveDisplayPicker', file: 'display-capture-picker.js', fn: 'resolve', index: 1 },
];
// Members whose argument main hands to an Electron method: the type must name
// the same fields as Electron's own options interface. electron.d.ts ships
// with node_modules, so this half runs wherever dependencies are installed
// (the substrate CI job) and is skipped by the dependency-free parity step.
const ELECTRON_PARAMS = [
  { member: 'findInPage', param: 'options', type: 'FindInPageOptions' },
];
const ELECTRON_DTS = path.join(ROOT, 'node_modules', 'electron', 'electron.d.ts');

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function splitTopLevel(text, separator = ',') {
  const entries = [];
  let depth = 0;
  let current = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "'" || ch === '"' || ch === '`') {
      let j = i + 1;
      for (; j < text.length && text[j] !== ch; j++) if (text[j] === '\\') j++;
      current += text.slice(i, j + 1);
      i = j;
      continue;
    }
    if ('{[('.includes(ch)) depth++;
    if ('}])'.includes(ch)) depth--;
    if (ch === separator && depth === 0) { entries.push(current); current = ''; continue; }
    current += ch;
  }
  entries.push(current);
  return entries.map((e) => e.trim());
}

// From the `(` at `start`, the text up to its matching `)`.
function parenthesized(text, start) {
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (ch === "'" || ch === '"' || ch === '`') {
      for (i++; i < text.length && text[i] !== ch; i++) if (text[i] === '\\') i++;
      continue;
    }
    if (ch === '(') depth++;
    else if (ch === ')' && --depth === 0) return text.slice(start, i + 1);
  }
  throw new Error(`unbalanced parentheses from offset ${start}`);
}

// `cond ? a : b` at the top level of an expression, or null.
function ternary(expr) {
  let depth = 0;
  let question = -1;
  for (let i = 0; i < expr.length; i++) {
    const ch = expr[i];
    if (ch === "'" || ch === '"' || ch === '`') {
      for (i++; i < expr.length && expr[i] !== ch; i++) if (expr[i] === '\\') i++;
      continue;
    }
    if ('{[('.includes(ch)) depth++;
    else if ('}])'.includes(ch)) depth--;
    else if (depth === 0 && ch === '?' && expr[i + 1] !== '.' && expr[i + 1] !== '?' && expr[i - 1] !== '?') {
      if (question < 0) question = i;
    } else if (depth === 0 && ch === ':' && question >= 0) {
      return { then: expr.slice(question + 1, i).trim(), else: expr.slice(i + 1).trim() };
    }
  }
  return null;
}

// Every function in a source with a block body: its name (when it has one),
// parameter list and body range.
function functionScopes(text) {
  const scopes = [];
  const add = (name, params, open) => {
    if (text[open] !== '{') return;
    scopes.push({ name, params: splitTopLevel(params).filter(Boolean), start: open, end: open + balanced(text, open).length });
  };
  for (const m of text.matchAll(/\bfunction\s*([A-Za-z_$][\w$]*)?\s*\(/g)) {
    const params = parenthesized(text, m.index + m[0].length - 1);
    add(m[1] ?? null, params.slice(1, -1), text.indexOf('{', m.index + m[0].length - 1 + params.length));
  }
  for (const m of text.matchAll(/(?:\b(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?)?\(([^()]*(?:\([^()]*\)[^()]*)*)\)\s*=>\s*\{/g)) {
    add(m[1] ?? null, m[2], m.index + m[0].length - 1);
  }
  for (const m of text.matchAll(/\b([A-Za-z_$][\w$]*)\s*=>\s*\{/g)) add(null, m[1], m.index + m[0].length - 1);
  return scopes;
}

// A parameter without its default (`{ a = 1 } = {}` → `{ a = 1 }`), and the default.
function paramName(param) {
  return splitTopLevel(param, '=')[0];
}

function paramDefault(param) {
  const parts = splitTopLevel(param, '=');
  return parts.length > 1 ? parts.slice(1).join('=') : null;
}

// The object shapes an argument expression can carry, as
// [{ keys, open }] (open: an unreadable spread). null/undefined carry none.
function argumentShapes(file, expr, at, depth = 0) {
  const e = expr.trim().replace(/^await\s+/, '');
  if (depth > 6) throw new Error(`"${e.slice(0, 40)}" is too indirect to read`);
  if (e === '' || e === 'null' || e === 'undefined') return [];
  if (e.startsWith('{') && balanced(e, 0).length === e.length) {
    const { keys, spreads } = literalKeys(e);
    let open = false;
    for (const spread of spreads) {
      // `...(cond ? { a } : {})` contributes its keys; anything else can't be read.
      const branch = /^\(([^]*)\)$/.test(spread) && ternary(spread.slice(1, -1));
      if (!branch) { open = true; continue; }
      for (const side of [branch.then, branch.else]) {
        for (const shape of argumentShapes(file, side, at, depth + 1)) { keys.push(...shape.keys); open ||= shape.open; }
      }
    }
    return [{ keys, open }];
  }
  const branch = ternary(e);
  if (branch) return [...argumentShapes(file, branch.then, at, depth + 1), ...argumentShapes(file, branch.else, at, depth + 1)];
  const scopes = functionScopes(file.text);
  const call = e.match(/^([A-Za-z_$][\w$]*)\((?:[^()]|\([^()]*\))*\)$/);
  if (call) {
    const fn = scopes.find((s) => s.name === call[1]);
    if (!fn) throw new Error(`"${e.slice(0, 40)}" calls a function not defined in ${file.file}`);
    return topLevelReturns(file.text.slice(fn.start, fn.end))
      .flatMap((ret) => argumentShapes(file, ret, fn.start, depth + 1));
  }
  if (!/^[A-Za-z_$][\w$]*$/.test(e)) throw new Error(`"${e.slice(0, 40)}" can't be read`);
  // The innermost scope that declares the name (or the file), then every
  // assignment to it anywhere in that scope.
  const enclosing = scopes.filter((s) => s.start < at && at < s.end).sort((a, b) => (a.end - a.start) - (b.end - b.start));
  const name = escapeRegExp(e);
  for (const scope of [...enclosing, { name: null, params: [], start: 0, end: file.text.length }]) {
    const body = file.text.slice(scope.start, scope.end);
    const index = scope.params.findIndex((p) => paramName(p) === e);
    if (index < 0 && !new RegExp(`\\b(?:const|let|var)\\s+${name}\\b`).test(body) && scope.start > 0) continue;
    const shapes = [];
    for (const a of body.matchAll(new RegExp(`(?:\\b(?:const|let|var)\\s+|[^.\\w$])${name}\\s*=(?![=>])\\s*`, 'g'))) {
      const from = scope.start + a.index + a[0].length;
      const init = splitTopLevel(file.text.slice(from).split(/;|\n\s*\n/)[0])[0];
      shapes.push(...argumentShapes(file, init, from, depth + 1));
    }
    if (index >= 0) {
      const param = scope.params[index];
      if (paramDefault(param) !== null) shapes.push(...argumentShapes(file, paramDefault(param), scope.start, depth + 1));
      if (!scope.name) throw new Error(`"${e}" is a parameter of an anonymous function`);
      for (const site of file.text.matchAll(new RegExp(`(?<![\\w$.])${escapeRegExp(scope.name)}\\(`, 'g'))) {
        if (/\bfunction\s+$/.test(file.text.slice(Math.max(0, site.index - 20), site.index))) continue; // the definition
        const args = splitTopLevel(parenthesized(file.text, site.index + scope.name.length).slice(1, -1));
        if (index < args.length) shapes.push(...argumentShapes(file, args[index], site.index, depth + 1));
      }
    } else if (scope.start === 0 && !shapes.length && !new RegExp(`\\b(?:const|let|var)\\s+${name}\\b`).test(body)) break;
    return shapes;
  }
  throw new Error(`"${e}" has no readable declaration in ${file.file}`);
}

function rendererSources() {
  return jsFiles(RENDERER_DIR).map((f) => ({ file: path.basename(f), text: fs.readFileSync(f, 'utf8') }));
}

// browserAPI calls in the renderers, including through an alias passed as
// `name: window.browserAPI`.
function rendererCalls(sources, member) {
  const aliases = new Set(['browserAPI']);
  for (const { text } of sources) for (const [, alias] of text.matchAll(/\b([A-Za-z_$][\w$]*):\s*window\.browserAPI\b/g)) aliases.add(alias);
  const calls = [];
  const names = [...aliases].map(escapeRegExp).join('|');
  for (const file of sources) {
    for (const m of file.text.matchAll(new RegExp(`\\b(?:${names})\\??\\.${escapeRegExp(member)}\\??\\.?\\(`, 'g'))) {
      calls.push({ file, at: m.index, args: splitTopLevel(parenthesized(file.text, m.index + m[0].length - 1).slice(1, -1)) });
    }
  }
  return calls;
}

// Fields read from `name` in a body (`name.a`, `name?.a?.b`, `const { a } = name`),
// following it into local functions it is passed to.
function readsOf(name, body, sources, file, depth = 0) {
  const reads = [];
  const n = escapeRegExp(name);
  for (const m of body.matchAll(new RegExp(`(?<![\\w$.])${n}((?:\\??\\.[A-Za-z_$][\\w$]*)+)`, 'g'))) {
    reads.push(m[1].split(/\??\./).filter(Boolean));
  }
  for (const m of body.matchAll(new RegExp(`\\b(?:const|let)\\s*\\{([^}]*)\\}\\s*=\\s*${n}\\b`, 'g'))) {
    for (const key of splitTopLevel(m[1])) if (key) reads.push([key.split(/[:=]/)[0].trim()]);
  }
  if (depth > 1) return reads;
  // Passed on to a local function: follow into its matching parameter.
  for (const m of body.matchAll(/(?<![\w$.])([A-Za-z_$][\w$]*)\(/g)) {
    const args = splitTopLevel(parenthesized(body, m.index + m[1].length).slice(1, -1));
    const index = args.findIndex((a) => new RegExp(`^${n}(?:\\s*\\?\\?.*)?$`).test(a));
    if (index < 0) continue;
    const scope = functionScopes(file.text).find((s) => s.name === m[1]);
    if (!scope || index >= scope.params.length) continue;
    reads.push(...paramReads(scope.params[index], file.text.slice(scope.start, scope.end), sources, file, depth + 1));
  }
  return reads;
}

function paramReads(param, body, sources, file, depth) {
  const p = paramName(param);
  if (p.startsWith('{')) return splitTopLevel(p.slice(1, -1)).filter(Boolean).map((key) => [key.split(/[:=]/)[0].trim()]);
  return readsOf(p, body, sources, file, depth);
}

function mainHandlers(source, channel) {
  const sites = [];
  for (const m of source.matchAll(new RegExp(`\\b(?:chromeHandle|chromeOn|ipcMain\\.on|ipcMain\\.handle)\\('${escapeRegExp(channel)}',\\s*(?:async\\s*)?\\(`, 'g'))) {
    const open = m.index + m[0].length - 1;
    const params = parenthesized(source, open);
    let i = source.indexOf('=>', open + params.length) + 2;
    while (/\s/.test(source[i])) i++;
    // A block body, or an expression running to the registration's closing paren.
    const rest = source.slice(i);
    const body = source[i] === '{' ? balanced(source, i) : rest.slice(0, parenthesized(`(${rest}`, 0).length - 2);
    sites.push({ params: splitTopLevel(params.slice(1, -1)), body });
  }
  return sites;
}

// A read path checked against a type: each step must be a field, descending
// into nested structured types.
function checkRead(path, typeName, contract) {
  let type = typeName;
  for (const field of path) {
    const fields = contract.types[type]?.fields;
    if (!fields) return null;
    if (!(field in fields)) return `${field} is not a field of ${type}`;
    type = structuredType(fields[field].type.replace(/\|\s*undefined/g, ''), contract);
    if (!type) return null;
  }
  return null;
}

function electronInterfaceFields(name) {
  if (!fs.existsSync(ELECTRON_DTS)) return null;
  const dts = fs.readFileSync(ELECTRON_DTS, 'utf8');
  const at = dts.indexOf(`interface ${name} {`);
  if (at < 0) throw new Error(`interface ${name} not found in electron.d.ts`);
  const body = stripComments(balanced(dts, dts.indexOf('{', at)));
  return [...body.matchAll(/^\s*([A-Za-z_$][\w$]*)\??\s*:/gm)].map((m) => m[1]);
}

export function checkParamShapes(contract, { main = mainSources(), renderers: rawRenderers = rendererSources() } = {}) {
  const mains = main.map(({ file, text }) => ({ file, text: stripComments(text) }));
  const renderers = rawRenderers.map(({ file, text }) => ({ file, text: stripComments(text) }));
  const mainFile = mains.find((s) => s.file === 'main.js');
  const problems = [];
  for (const m of contract.members) {
    (m.params ?? []).forEach((p, i) => {
      const typeName = structuredType(p.type.replace(/\|\s*undefined/g, ''), contract);
      if (!typeName) return;
      const fields = contract.types[typeName].fields;
      const required = Object.keys(fields).filter((k) => !fields[k].optional);
      const where = `${m.name}(${p.name})`;
      // Renderer side: what is sent.
      for (const call of rendererCalls(renderers, m.name)) {
        if (i >= call.args.length) continue;
        try {
          for (const { keys, open } of argumentShapes(call.file, call.args[i], call.at)) {
            for (const k of keys) if (!(k in fields)) problems.push(`${where} in ${call.file.file}: sends "${k}", which is not a field of ${typeName}`);
            if (!open) for (const k of required) if (!keys.includes(k)) problems.push(`${where} in ${call.file.file}: does not send required field ${typeName}.${k}`);
          }
        } catch (error) { problems.push(`${where} in ${call.file.file}: ${error.message}`); }
      }
      // Main side: what is read.
      if (m.ipcArgs) return;
      const reads = [];
      for (const site of mainHandlers(mainFile.text, m.channel)) {
        const param = site.params[i + 1];
        if (param) reads.push(...paramReads(param, site.body, mains, mainFile, 0));
      }
      for (const fwd of FORWARDED_PARAMS.filter((f) => f.member === m.name)) {
        const file = mains.find((s) => s.file === fwd.file);
        const scope = file && functionScopes(file.text).find((s) => s.name === fwd.fn);
        if (!scope) { problems.push(`${where}: ${fwd.fn}() not found in ${fwd.file}`); continue; }
        reads.push(...paramReads(scope.params[fwd.index], file.text.slice(scope.start, scope.end), mains, file, 0));
      }
      for (const read of reads) {
        const problem = checkRead(read, typeName, contract);
        if (problem) problems.push(`${where}: main reads ${p.name}.${read.join('.')}, but ${problem}`);
      }
      for (const e of ELECTRON_PARAMS.filter((x) => x.member === m.name && x.param === p.name)) {
        try {
          const electron = electronInterfaceFields(e.type);
          if (electron && JSON.stringify([...electron].sort()) !== JSON.stringify(Object.keys(fields).sort())) {
            problems.push(`${where}: ${typeName} (${Object.keys(fields).join(', ')}) does not match Electron's ${e.type} (${electron.join(', ')})`);
          }
        } catch (error) { problems.push(`${where}: ${error.message}`); }
      }
    });
  }
  return [...new Set(problems)];
}

// ---- workspace action codes ----
// Every error / reason / action literal a workspace action can produce must be
// in the contract's unions. Literals are read from the workspace modules and
// from the workspace functions and controller adapter in main.js.
const WORKSPACE_FILES = ['workspace-controller.js', 'workspaces.js', 'workspaces-model.js'];
const WORKSPACE_FUNCTIONS = ['saveCurrentWindowAsWorkspace', 'removeNamedWorkspace', 'checkpointWorkspaceSession', 'flushWorkspaceSession', 'workspaceProtection', 'stageWorkspace'];

export function checkWorkspaceCodes(contract, rawSources = mainSources()) {
  const sources = rawSources.map(({ file, text }) => ({ file, text: stripComments(text) }));
  const main = sources.find((s) => s.file === 'main.js').text;
  const texts = sources.filter((s) => WORKSPACE_FILES.includes(s.file)).map((s) => [s.file, s.text]);
  for (const name of WORKSPACE_FUNCTIONS) texts.push([`main.js ${name}()`, functionBody(main, name)]);
  const adapterAt = main.indexOf('createWorkspaceController({');
  if (adapterAt >= 0) texts.push(['main.js controller adapter', balanced(main, main.indexOf('{', adapterAt))]);
  for (const channel of ['chrome:workspaces-save-as', 'chrome:workspaces-open', 'chrome:workspaces-create-blank', 'chrome:workspaces-rename', 'chrome:workspaces-remove']) {
    const h = handlerExpression(main, channel);
    if (h?.block) texts.push([`main.js ${channel} handler`, h.block]);
  }
  const unions = {
    error: splitUnion(contract.types.WorkspaceErrorCode.ts).map((v) => v.slice(1, -1)),
    reason: splitUnion(contract.types.WorkspaceProtectionReason.ts).map((v) => v.slice(1, -1)),
    action: splitUnion(contract.types.WorkspaceAction.ts).map((v) => v.slice(1, -1)),
  };
  const problems = [];
  for (const [label, text] of texts) {
    for (const [, key, value] of text.matchAll(/\b(error|reason|action):\s*'([^']*)'/g)) {
      if (key === 'reason' && !label.includes('workspaceProtection')) continue;
      if (!unions[key].includes(value)) problems.push(`${label}: ${key} '${value}' is not in the contract's ${key === 'error' ? 'WorkspaceErrorCode' : key === 'reason' ? 'WorkspaceProtectionReason' : 'WorkspaceAction'}`);
    }
  }
  return problems;
}

export function workspaceControllerFixtures() {
  const { createWorkspaceController } = requireMain('./workspace-controller');
  const cases = [];
  const runtime = { id: 'r1', profileId: 'p' };
  const other = { id: 'r2', resident: false };
  const record = { id: 'w1', name: 'Research' };
  const base = {
    randomId: () => 'x', fingerprint: () => 'fp', canCreate: () => true,
    get: () => record, readError: () => null, owner: () => null,
    protection: () => ({ blocked: false, tabCount: 0 }),
    checkpoint: () => ({ ok: true }),
    stage: () => ({ commit: () => ({ ok: true }), rollback() {}, finish() {} }),
    validateCreate: () => ({ ok: true }),
    create: () => ({ ok: true, workspace: record }),
    focus: (target) => ({ ok: true, action: 'focus', windowId: String(target.id) }),
    openElsewhere: () => ({ ok: true, action: 'focus', windowId: 'r9' }),
  };
  const variants = {
    swap: {},
    noop: { owner: () => runtime },
    'focus elsewhere': { owner: () => other },
    'not found': { get: () => null },
    'read error': { get: () => null, readError: () => 'future-format' },
    'protected pages': { protection: () => ({ blocked: true, reason: 'active-page' }) },
    'unsaved scratch': { protection: () => ({ blocked: false, tabCount: 3, privateCount: 1 }) },
    'checkpoint failed': { checkpoint: () => ({ ok: false, error: 'storage-failed' }) },
    'commit failed': { stage: () => ({ commit: () => ({ ok: false, error: 'storage-failed' }), rollback() {}, finish() {} }) },
    'stage threw': { stage: () => { throw new Error('boom'); } },
    'not patron': { canCreate: () => false },
    'invalid name': { validateCreate: () => ({ ok: false, error: 'invalid-name' }) },
    'create failed': { create: () => ({ ok: false, error: 'limit' }) },
  };
  for (const [label, override] of Object.entries(variants)) {
    for (const newWindow of [false, true]) {
      const controller = createWorkspaceController({ ...base, ...override });
      cases.push({ label: `controller open (${label}${newWindow ? ', new window' : ''})`, type: 'WorkspaceActionResult', value: controller.open(runtime, 'w1', { newWindow }) });
      cases.push({ label: `controller create (${label}${newWindow ? ', new window' : ''})`, type: 'WorkspaceActionResult', value: controller.create(runtime, 'Research', { newWindow }) });
    }
  }
  // Reentrancy: an open started while another is in flight is refused as busy.
  let nested = null;
  const reentrant = createWorkspaceController({ ...base, get: () => { nested ??= reentrant.open(runtime, 'w1'); return record; } });
  reentrant.open(runtime, 'w1');
  cases.push({ label: 'controller open (busy)', type: 'WorkspaceActionResult', value: nested });
  // The confirmed decision token from an unsaved-scratch result lets the switch through.
  const scratch = createWorkspaceController({ ...base, protection: () => ({ blocked: false, tabCount: 2, privateCount: 0 }) });
  const guard = scratch.open(runtime, 'w1');
  cases.push({ label: 'controller open (confirmed decision)', type: 'WorkspaceActionResult', value: scratch.open(runtime, 'w1', { decision: guard.decision }) });
  return cases;
}

// A canonical PNG data URL with the header the icon validators check
// (signature, IHDR, square size); no pixel data is needed for that.
function iconFixture(size) {
  const header = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(header);
  header.writeUInt32BE(13, 8);
  header.write('IHDR', 12, 'ascii');
  header.writeUInt32BE(size, 16);
  header.writeUInt32BE(size, 20);
  return `data:image/png;base64,${header.toString('base64')}`;
}

// history.js and bookmarks.js keep their data in a JsonStore, which needs
// Electron. Load fresh copies of both against an in-memory store, run them,
// and leave the module cache as it was.
function withMemoryStore(run) {
  const storePath = requireMain.resolve('./store');
  const modules = ['./history', './bookmarks'].map((m) => requireMain.resolve(m));
  const cache = requireMain.cache;
  const saved = [storePath, ...modules].map((key) => [key, cache[key]]);
  class MemoryStore {
    constructor(_name, defaults) { this.data = structuredClone(defaults); }
    update(mutate) { mutate(this.data); }
  }
  const stub = new Module(storePath);
  Object.assign(stub, { filename: storePath, loaded: true, exports: { JsonStore: MemoryStore } });
  cache[storePath] = stub;
  for (const key of modules) delete cache[key];
  try {
    return run(requireMain('./history'), requireMain('./bookmarks'));
  } finally {
    for (const [key, module] of saved) {
      if (module) cache[key] = module;
      else delete cache[key];
    }
  }
}

export function listFixtures() {
  const { ICON_SIZE, LEGACY_ICON_SIZE } = requireMain('./tabicons-model');
  const icon = iconFixture(ICON_SIZE);
  const cases = [];
  const add = (label, type, value) => cases.push({ label, type, value });
  withMemoryStore((history, bookmarks) => {
    history.addVisit('https://example.com/a', 'Example');
    history.addVisit('https://example.com/a', 'Example, retitled');
    history.addVisit('https://example.org/', '');
    history.addVisit('blanc://newtab/', 'Not recorded');
    history.updateTitle('https://example.org/', 'Org');
    history.cacheSiteIcon('https://example.com/a', icon);
    history.cacheSiteIcon('https://example.org/', 'data:image/png;base64,invalid');
    add('listHistory()', 'HistoryEntry[]', history.listHistory({}));
    add('listHistory(query)', 'HistoryEntry[]', history.listHistory({ query: 'example', limit: 1 }));

    bookmarks.toggleBookmark('https://example.com/a', 'Example', icon);
    bookmarks.toggleBookmark('https://example.net/', '', 'https://example.net/favicon.ico');
    bookmarks.saveFavorite('https://example.org/', 'Org', iconFixture(LEGACY_ICON_SIZE), 'Reading');
    bookmarks.importBookmarks([
      { url: 'https://imported.example/', title: 'Imported', addedAt: 1700000000000, folder: 'Work' },
      { url: 'https://imported.example/two', folder: '   ' },
      { url: 42 },
    ]);
    const first = bookmarks.listBookmarks()[0];
    bookmarks.setBookmarkFolder(first.id, 'Later');
    bookmarks.renameFolder('Work', 'Projects');
    bookmarks.removeFolder('Reading');
    bookmarks.updateFavicon('https://example.net/', icon);
    bookmarks.mergeFromSync({
      items: [
        { id: 'remote-1', url: 'https://remote.example/', title: 'Remote', favicon: icon, addedAt: 1700000000000, updatedAt: 1800000000000, folder: 'Shared' },
        { url: 'https://remote.example/legacy', addedAt: 1600000000000 },
        { title: 'no url' },
      ],
      tombstones: [{ url: 'https://example.net/', deletedAt: 1 }],
    });
    add('listBookmarks()', 'FavoriteItem[]', bookmarks.listBookmarks());
    bookmarks.toggleBookmark('https://example.com/a');
    add('listBookmarks() after removal', 'FavoriteItem[]', bookmarks.listBookmarks());
  });

  const tabsync = requireMain('./tabsync-model');
  const tabicons = requireMain('./tabicons-model');
  const now = Date.now();
  const rawDevices = {
    own: { name: 'This Mac', platform: 'darwin', updatedAt: now, tabs: [{ url: 'https://own.example/' }] },
    laptop: {
      name: 'Laptop', platform: 'win32', updatedAt: now - 1000,
      tabs: [
        { url: 'https://example.com/a', title: 'Example', groupId: 'g1', pinned: true },
        { url: 'https://example.com/b' },
        { url: 'blanc://settings/' },
        null,
      ],
      groups: [{ id: 'g1', name: 'research' }, { id: 2, name: 'bad' }],
    },
    phone: { name: '', updatedAt: now - 2000, tabs: [{ url: 'http://example.org/', title: 7 }] },
    empty: { name: 'Empty', platform: 'linux', updatedAt: now, tabs: [] },
    stale: { name: 'Old', platform: 'linux', updatedAt: now - tabsync.PRUNE_MS - 1, tabs: [{ url: 'https://old.example/' }] },
    gone: { retracted: true, updatedAt: now },
  };
  const devices = Object.fromEntries(Object.entries(rawDevices).map(([id, raw]) => [id, tabsync.sanitizeEntry(raw)]).filter(([, e]) => e));
  const iconEntries = Object.fromEntries(Object.entries({
    laptop: { updatedAt: now, icons: [{ url: 'https://example.com/a', data: icon }, { url: 'https://example.com/b', data: 'data:image/png;base64,AAAA' }] },
  }).map(([id, raw]) => [id, tabicons.sanitizeEntry(raw)]));
  const listed = tabsync.displayDevices(devices, 'own', { now });
  add('remote devices', 'RemoteDevice[]', tabicons.attachIcons(listed, tabicons.displayDevices(iconEntries, 'own', { now })));
  add('remote devices without icons', 'RemoteDevice[]', tabicons.attachIcons(listed, {}));
  add('remote devices (none)', 'RemoteDevice[]', tabicons.attachIcons(tabsync.displayDevices({}, 'own', { now }), {}));

  const { resolveBlockAdsCommand } = requireMain('./adblock-exceptions');
  for (const hostname of ['example.com', 'other.example', null]) {
    for (const enabled of [true, false]) {
      for (const exceptions of [['example.com'], [], undefined]) {
        add(`resolveBlockAdsCommand(${hostname}, ${enabled})`, 'BlockAdsResult', resolveBlockAdsCommand({ hostname, exceptions, enabled }));
      }
    }
  }

  // The handler builds { engine, label, suggestions } from Settings; the
  // engine ids are pinned to the settings schema in checkSearchEngines().
  const { parseOpenSearchSuggestions } = requireMain('./search-suggestions');
  for (const { id, label } of JSON.parse(fs.readFileSync(SETTINGS_SCHEMA, 'utf8')).searchEngines) {
    for (const payload of [['q', ['one', ' two  words ', 'One', 3, '']], ['q'], null]) {
      add(`search suggestions (${id})`, 'SearchSuggestions', { engine: id, label, suggestions: parseOpenSearchSuggestions(payload) });
    }
  }
  return cases;
}

// SearchEngineId must list exactly the engines Settings offers.
export function checkSearchEngines(contract, schema = JSON.parse(fs.readFileSync(SETTINGS_SCHEMA, 'utf8'))) {
  const ids = schema.searchEngines.map((e) => `'${e.id}'`).sort();
  const pinned = splitUnion(contract.types.SearchEngineId?.ts ?? '').sort();
  return JSON.stringify(ids) === JSON.stringify(pinned) ? []
    : [`SearchEngineId: ${pinned.join(' | ') || 'missing'} does not match settings-schema/schema.json searchEngines (${ids.join(' | ')})`];
}

export function payloadFixtures() {
  const { shieldChipState, connectionFor, shieldPopoverModel, shieldProviderModel } = requireMain('./shield-model');
  const { buildSiteInfo, sanitizeCertificate } = requireMain('./site-security');
  // Main's text builders take the interface translator; fixtures use English.
  const { createTranslator } = requireMain('../renderer/pages/i18n.js');
  const t = createTranslator({ locale: 'en', messages: requireMain('../renderer/pages/strings.en.js').messages });
  const { projectEntries } = requireMain('./closed-tabs');
  const { projectDisplayShares } = requireMain('./display-capture-indicator');
  const captureState = requireMain('./capture-state');
  const { createDarkWebsitesService } = requireMain('./dark-websites-service');
  // The real darkSite projection, over each settings and appearance combination.
  const darkSites = [];
  for (const [darkWebsites, darkWebsitesExceptions] of [[false, []], [true, []], [true, ['example.com']]]) {
    for (const shouldUseDarkColors of [false, true]) {
      const service = createDarkWebsitesService({
        ipcMain: null,
        nativeTheme: { shouldUseDarkColors },
        settings: { getSettings: () => ({ darkWebsites, darkWebsitesExceptions }) },
        getFetchSession: () => null,
        forEachTabContents: () => {},
        allowStylesheet: async () => false,
      });
      darkSites.push((url, privateTab) => service.siteState({ url, private: privateTab }));
    }
  }

  const urls = ['https://example.com/a', 'http://example.com/', 'http://localhost:3000/', 'blanc://newtab/', 'file:///tmp/x.html', 'not a url', ''];
  const cert = sanitizeCertificate({ subjectName: 'example.com', issuerName: 'Example CA', validStart: 1700000000, validExpiry: 1800000000, fingerprint: 'sha256/abc' });
  const statuses = [
    undefined,
    { active: 'blanc', selected: 'blanc', phase: 'ready', enabled: true, supported: true, exposed: true },
    { active: 'ublock-origin', selected: 'ublock-origin', phase: 'ready', enabled: true, supported: true, exposed: true },
    { active: 'blanc', selected: 'ublock-origin', phase: 'initializing', enabled: true, supported: true, exposed: true, restartPending: true },
    { active: 'blanc', selected: 'blanc', phase: 'failed', enabled: false, supported: false, exposed: true, fallback: 'manifest-v2-retired' },
    { active: 'blanc', selected: 'blanc', phase: 'disabled', enabled: false, supported: true, exposed: false },
  ];

  const cases = [];
  const add = (label, type, value) => cases.push({ label, type, value });
  for (const url of urls) {
    for (const provider of ['blanc', 'ublock-origin']) {
      for (const readiness of ['ready', 'failed']) {
        for (const [excepted, adblockEnabled, blockedCount] of [[false, true, 0], [false, true, 3], [true, true, 1], [false, false, 2]]) {
          add(`shieldChipState(${url}, ${provider}, ${readiness})`, 'ShieldChip', shieldChipState({ url, blockedCount, excepted, adblockEnabled, provider, readiness, t }));
          for (const status of statuses) {
            for (const privateTab of [false, true]) {
              const model = shieldPopoverModel({ url, blockedCount, excepted, adblockEnabled, provider, readiness, connection: connectionFor({ url, isLoading: false }), t });
              if (model) {
                for (const darkSite of darkSites) {
                  add(`shieldPopover(${url}, ${provider}, ${readiness})`, 'ShieldPopover', { ...model, controls: shieldProviderModel(status, privateTab, t), darkSite: darkSite(url, privateTab) });
                }
              }
            }
          }
        }
      }
    }
    for (const isLoading of [false, true]) add(`connectionFor(${url})`, 'ConnectionState | null', connectionFor({ url, isLoading }));
    add(`buildSiteInfo(${url})`, 'SiteInfo', buildSiteInfo(url, { blockedCount: 2, t }));
    add(`buildSiteInfo(${url}, certificate)`, 'SiteInfo', buildSiteInfo(url, { certificateRecord: { certificate: cert, isIssuedByKnownRoot: false }, t }));
  }
  add('buildSiteInfo(certificate error)', 'SiteInfo', buildSiteInfo('https://expired.example/', {
    certificateError: { url: 'https://expired.example/', error: 'net::ERR_CERT_DATE_INVALID', certificate: cert },
    t,
  }));
  add('sanitizeCertificate', 'CertificateSummary | null', cert);
  add('sanitizeCertificate(empty)', 'CertificateSummary | null', sanitizeCertificate({}));
  add('sanitizeCertificate(none)', 'CertificateSummary | null', sanitizeCertificate(null));
  add('projectEntries', 'ClosedEntrySummary[]', projectEntries([
    { id: 'c1', kind: 'tab', title: 'Docs', favicon: 'data:image/png;base64,AAAA' },
    { id: 'c2', kind: 'tab', title: 'Remote', favicon: 'https://example.com/favicon.ico' },
    { id: 'c3', kind: 'group', group: { name: 'research' }, tabs: [{}, {}] },
    { id: 'c4', kind: 'batch', tabs: [{}, {}, {}] },
  ]));
  add('projectDisplayShares', 'DisplayShareSummary[]', projectDisplayShares([
    { shareId: 'share-1', pending: true, origin: 'https://meet.example', surfaceLabel: 'Screen 1', surfaceKind: 'screen', computerAudio: true, tabId: 't1' },
    { shareId: 'share-2', tabId: 't1' },
  ], { tabIds: ['t1'] }));
  add('capture projection', 'TabCapture', captureState.projection(captureState.createCaptureRecord()));
  const { calculateGlanceLayout } = requireMain('./glance-layout');
  for (const bounds of [{ x: 0, y: 68, width: 1400, height: 900 }, { x: 0, y: 68, width: 600, height: 900 }, { x: 0, y: 0, width: 0, height: 0 }, null]) {
    for (const ratio of [0.5, 0.7, 2, undefined]) add(`calculateGlanceLayout(${JSON.stringify(bounds)}, ${ratio})`, 'GlanceLayout | null', calculateGlanceLayout(bounds, ratio));
  }
  cases.push(...workspaceControllerFixtures(), ...listFixtures());
  return cases;
}

export function checkPayloads(contract) {
  const problems = [...checkMainPayloadKeys(contract), ...checkEventSends(contract), ...checkInvokeResults(contract), ...checkWorkspaceCodes(contract), ...checkSearchEngines(contract), ...checkParamShapes(contract)];
  for (const { label, type, value } of payloadFixtures()) {
    problems.push(...validateValue(value, type, contract, label));
  }
  return [...new Set(problems)];
}

// ---- main + renderer cross-checks ----
function jsFiles(dir) {
  return fs.readdirSync(dir).filter((f) => f.endsWith('.js')).map((f) => path.join(dir, f));
}

export function checkMain(contract) {
  const problems = [];
  const sources = jsFiles(MAIN_DIR).filter((f) => f !== PRELOAD).map((f) => fs.readFileSync(f, 'utf8')).join('\n');
  for (const m of contract.members) {
    if (!m.channel) continue;
    if (!sources.includes(`'${m.channel}'`) && !sources.includes(`"${m.channel}"`)) {
      problems.push(`${m.name}: channel '${m.channel}' no longer appears in src/main (handler or sender removed?)`);
    }
  }
  return problems;
}

export function rendererUsage() {
  const used = new Map();
  for (const file of jsFiles(RENDERER_DIR)) {
    const text = fs.readFileSync(file, 'utf8');
    for (const [, name] of text.matchAll(/\bbrowserAPI\??\.([A-Za-z_$][\w$]*)/g)) {
      if (!used.has(name)) used.set(name, new Set());
      used.get(name).add(path.basename(file));
    }
  }
  return used;
}

export function checkRenderers(contract) {
  const names = new Set(contract.members.map((m) => m.name));
  return [...rendererUsage().entries()]
    .filter(([name]) => !names.has(name))
    .map(([name, files]) => `renderer calls browserAPI.${name} (${[...files].join(', ')}), which is not in the contract`);
}

// The committed test vectors (generated/vectors.json) must still replay
// against the preload, and every value in them must fit its contract type.
// A stale file is reported separately with the other generated files.
export function checkVectors(contract, { file = path.join(OUT, VECTORS_FILE), adapter = electronAdapter() } = {}) {
  if (!fs.existsSync(file)) return [`browser-api/generated/${VECTORS_FILE} is missing — run \`npm run browser-api:build\``];
  const vectors = JSON.parse(fs.readFileSync(file, 'utf8'));
  return [...replayVectorsSync(vectors, adapter), ...checkVectorTypes(vectors, contract, validateValue)];
}

export function check(contract = loadContract(), bridges = loadBridges()) {
  const sections = [
    ['contract', validateContract(contract)],
    ['preload', checkPreload(contract)],
    ['main', checkMain(contract)],
    ['renderers', checkRenderers(contract)],
    ['payloads', checkPayloads(contract)],
  ];
  // The smaller page bridges (bowserPages, blancFillStatus) live in bridges.json.
  sections.push(...checkBridges(bridges));
  sections.push(['vectors', checkVectors(contract)]);
  const stale = [];
  let vectors;
  try { vectors = { [VECTORS_FILE]: vectorsText(contract) }; } catch (error) {
    vectors = {};
    stale.push(`browser-api/generated/${VECTORS_FILE} could not be generated: ${error.message}`);
  }
  for (const [name, content] of Object.entries({ ...artifacts(contract), ...bridgeArtifacts(bridges), ...vectors })) {
    const p = path.join(OUT, name);
    const onDisk = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
    if (onDisk !== content) stale.push(`browser-api/generated/${name} — run \`npm run browser-api:build\``);
  }
  sections.push(['generated', stale]);
  return sections.filter(([, problems]) => problems.length > 0);
}

function build() {
  const contract = loadContract();
  const bridges = loadBridges();
  const problems = [...validateContract(contract), ...validateBridges(bridges)];
  if (problems.length) {
    console.error('contract.json or bridges.json is invalid:\n' + problems.map((p) => '  ' + p).join('\n'));
    process.exit(1);
  }
  fs.mkdirSync(OUT, { recursive: true });
  for (const [name, content] of Object.entries({ ...artifacts(contract), ...bridgeArtifacts(bridges), [VECTORS_FILE]: vectorsText(contract) })) {
    fs.writeFileSync(path.join(OUT, name), content);
    console.log(`wrote browser-api/generated/${name}`);
  }
}

function runCheck() {
  const failures = check();
  if (failures.length) {
    for (const [section, problems] of failures) {
      console.error(`DRIFT (${section}):\n` + problems.map((p) => '  ' + p).join('\n'));
    }
    console.error('\nbrowser-api:check failed.');
    process.exit(1);
  }
  const { members } = loadContract();
  const { bowserPages, blancFillStatus } = loadBridges();
  console.log(`browser-api:check OK — preload, main and renderers match all ${members.length} browserAPI members, `
    + `${bowserPages.members.length} bowserPages members and ${blancFillStatus.members.length} blancFillStatus members; test vectors replay; generated files current.`);
}

// Entry guard: unit tests import the checkers without running the CLI.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.argv.includes('--check') ? runCheck() : build();
}
