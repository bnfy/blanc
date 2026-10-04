// Blanc browserAPI contract generator + drift guard (Phase 0 bridge contract).
//
//   node browser-api/build.mjs           emit generated/{browser-api.d.ts,browser-api.md}
//   node browser-api/build.mjs --check   verify src/main/preload.js exposes exactly the
//                                        contract (members, IPC kind, channel, argument
//                                        shaping, platform availability, trusted documents),
//                                        every channel still exists in main, every
//                                        browserAPI call in the renderers is a contract
//                                        member, and the generated files are current.
//                                        Exit 1 on drift.
//
// Same shape as tokens/, settings-schema/ and copy/: one source (contract.json),
// desktop guarded rather than generated. Unlike those checkers, the preload is not
// parsed with regexes: it is executed in a vm sandbox against a recording
// ipcRenderer stub, so the check sees exactly what a chrome document would get.

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SPEC = path.join(ROOT, 'browser-api', 'contract.json');
const OUT = path.join(ROOT, 'browser-api', 'generated');
const PRELOAD = path.join(ROOT, 'src', 'main', 'preload.js');
const MAIN_DIR = path.join(ROOT, 'src', 'main');
const RENDERER_DIR = path.join(ROOT, 'src', 'renderer');

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
// quoted strings.
function balanced(text, start) {
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (ch === "'" || ch === '"') {
      for (i++; i < text.length && text[i] !== ch; i++) if (text[i] === '\\') i++;
      continue;
    }
    if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) return text.slice(start, i + 1);
  }
  throw new Error(`unbalanced braces from offset ${start}`);
}

// Top-level keys of an object literal (`{ a: 1, b, ...c }` → keys a, b and spread c).
export function literalKeys(objectText) {
  const body = objectText.slice(1, -1);
  const entries = [];
  let depth = 0;
  let current = '';
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch === "'" || ch === '"' || ch === '`') {
      let j = i + 1;
      for (; j < body.length && body[j] !== ch; j++) if (body[j] === '\\') j++;
      current += body.slice(i, j + 1);
      i = j;
      continue;
    }
    if ('{[('.includes(ch)) depth++;
    if ('}])'.includes(ch)) depth--;
    if (ch === ',' && depth === 0) { entries.push(current); current = ''; continue; }
    current += ch;
  }
  entries.push(current);
  const keys = [];
  const spreads = [];
  for (const raw of entries.map((e) => e.trim()).filter(Boolean)) {
    if (raw.startsWith('...')) { spreads.push(raw.slice(3).trim()); continue; }
    const m = raw.match(/^([A-Za-z_$][\w$]*)\s*(?::|$)/);
    if (m) keys.push(m[1]);
    else throw new Error(`cannot read object key from "${raw.slice(0, 40)}"`);
  }
  return { keys, spreads };
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
  // Falling off the end resolves to undefined unless the body ends in a return/throw.
  if (!/\b(?:return|throw)\b[^;]*;?\s*$/.test(flat.trim())) results.push('');
  return results;
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
  const at = source.indexOf(`chromeHandle('${channel}'`);
  if (at < 0) return null;
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
  const exprs = handler.block ? topLevelReturns(handler.block) : [handler.expr];
  const kinds = [];
  for (const expr of exprs) {
    const call = expr.match(/^(?:await\s+)?([A-Za-z_$][\w$]*)\((?:[^()]|\([^()]*\))*\)$/);
    const helper = call && sources.find((s) => new RegExp(`(?:^|\\n)(?:async\\s+)?function\\s+${call[1]}\\s*\\(`).test(s.text));
    if (helper) {
      const body = functionBody(helper.text.replace(/async\s+function/g, 'function'), call[1]);
      kinds.push(...topLevelReturns(body).map(classify));
    } else kinds.push(classify(expr));
  }
  return kinds;
}

export function checkInvokeResults(contract, rawSources = mainSources()) {
  const sources = rawSources.map(({ file, text }) => ({ file, text: stripComments(text) }));
  const problems = [];
  for (const m of contract.members) {
    if (m.kind !== 'invoke' || m.returns === 'unknown' || m.resultCheck === 'none') continue;
    const where = `${m.name} result`;
    const kinds = resultKinds(contract, m, sources);
    if (!kinds) { problems.push(`${where}: handler for '${m.channel}' not found as chromeHandle('${m.channel}', …) in main.js`); continue; }
    const alts = splitUnion(m.returns);
    const allows = (k) => alts.includes(k) || (k === 'undefined' && alts.includes('void'));
    const structured = alts.map((a) => contract.types[a]?.fields ? a : null).filter(Boolean);
    for (const k of kinds) {
      if (k.kind === 'opaque') {
        if (alts.length === 1 && (alts[0] === 'void' || alts[0] === 'undefined')) problems.push(`${where}: returns a value (${k.text.slice(0, 50)}) but the contract says ${m.returns}`);
        continue;
      }
      if (k.kind === 'object') {
        if (!structured.length) { problems.push(`${where}: returns an object literal but the contract says ${m.returns}`); continue; }
        try {
          const { keys, spreads } = literalKeys(balanced(k.text, 0));
          const fits = structured.some((t) => {
            const f = contract.types[t].fields;
            return !spreads.length && keys.every((key) => key in f) && Object.keys(f).every((key) => f[key].optional || keys.includes(key));
          });
          if (!fits) problems.push(`${where}: returned object { ${keys.join(', ')}${spreads.length ? ', …' : ''} } does not match ${structured.join(' | ')}`);
        } catch (error) { problems.push(`${where}: ${error.message}`); }
        continue;
      }
      if (k.kind === 'string' && alts.some((a) => a === `'${k.value}'` || a === 'string')) continue;
      if (k.kind === 'number' && alts.includes('number')) continue;
      if (!allows(k.kind)) problems.push(`${where}: can resolve to ${k.kind === 'string' ? `'${k.value}'` : k.kind}, which ${m.returns} does not allow`);
    }
  }
  return problems;
}

export function payloadFixtures() {
  const { shieldChipState, connectionFor, shieldPopoverModel, shieldProviderModel } = requireMain('./shield-model');
  const { buildSiteInfo, sanitizeCertificate } = requireMain('./site-security');
  const { projectEntries } = requireMain('./closed-tabs');
  const { projectDisplayShares } = requireMain('./display-capture-indicator');
  const captureState = requireMain('./capture-state');

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
          add(`shieldChipState(${url}, ${provider}, ${readiness})`, 'ShieldChip', shieldChipState({ url, blockedCount, excepted, adblockEnabled, provider, readiness }));
          for (const status of statuses) {
            for (const privateTab of [false, true]) {
              const model = shieldPopoverModel({ url, blockedCount, excepted, adblockEnabled, provider, readiness, connection: connectionFor({ url, isLoading: false }) });
              if (model) add(`shieldPopover(${url}, ${provider}, ${readiness})`, 'ShieldPopover', { ...model, controls: shieldProviderModel(status, privateTab) });
            }
          }
        }
      }
    }
    for (const isLoading of [false, true]) add(`connectionFor(${url})`, 'ConnectionState | null', connectionFor({ url, isLoading }));
    add(`buildSiteInfo(${url})`, 'SiteInfo', buildSiteInfo(url, { blockedCount: 2 }));
    add(`buildSiteInfo(${url}, certificate)`, 'SiteInfo', buildSiteInfo(url, { certificateRecord: { certificate: cert, isIssuedByKnownRoot: false } }));
  }
  add('buildSiteInfo(certificate error)', 'SiteInfo', buildSiteInfo('https://expired.example/', {
    certificateError: { url: 'https://expired.example/', error: 'net::ERR_CERT_DATE_INVALID', certificate: cert },
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
  return cases;
}

export function checkPayloads(contract) {
  const problems = [...checkMainPayloadKeys(contract), ...checkEventSends(contract), ...checkInvokeResults(contract)];
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

export function check(contract = loadContract()) {
  const sections = [
    ['contract', validateContract(contract)],
    ['preload', checkPreload(contract)],
    ['main', checkMain(contract)],
    ['renderers', checkRenderers(contract)],
    ['payloads', checkPayloads(contract)],
  ];
  const stale = [];
  for (const [name, content] of Object.entries(artifacts(contract))) {
    const p = path.join(OUT, name);
    const onDisk = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
    if (onDisk !== content) stale.push(`browser-api/generated/${name} — run \`npm run browser-api:build\``);
  }
  sections.push(['generated', stale]);
  return sections.filter(([, problems]) => problems.length > 0);
}

function build() {
  const contract = loadContract();
  const problems = validateContract(contract);
  if (problems.length) {
    console.error('contract.json is invalid:\n' + problems.map((p) => '  ' + p).join('\n'));
    process.exit(1);
  }
  fs.mkdirSync(OUT, { recursive: true });
  for (const [name, content] of Object.entries(artifacts(contract))) {
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
  console.log(`browser-api:check OK — preload, main and renderers match all ${members.length} contract members; generated files current.`);
}

// Entry guard: unit tests import the checkers without running the CLI.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.argv.includes('--check') ? runCheck() : build();
}
