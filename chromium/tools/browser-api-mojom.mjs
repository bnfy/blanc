// Generates the fork's typed Island interface from browser-api/contract.json
// (F0.6): one Mojo interface per contract group, C++ checks for string-union
// values, and a table-driven JS codec that keeps Island objects contract-shaped.
// `--check` fails when the committed output differs from the contract.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const CONTRACT = path.resolve(here, '../../browser-api/contract.json');
export const OUT = path.resolve(here, '../blanc/common/browser_api');
export const CODEC = path.resolve(here, '../blanc/island/browser-api-codec.js');

const PRIMITIVES = new Set(['string', 'number', 'boolean', 'unknown', 'void', 'null', 'undefined', 'true', 'false']);
// Words that collide with C++ or mojom identifiers once a field is snake_cased.
const RESERVED = new Set(['private', 'public', 'protected', 'delete', 'default', 'new', 'class', 'enum', 'union',
  'struct', 'interface', 'module', 'import', 'const', 'case', 'switch', 'register', 'template', 'this', 'operator',
  'namespace', 'bool', 'double', 'string', 'array', 'map', 'handle', 'auto', 'char', 'int', 'long', 'short',
  'signed', 'unsigned', 'void', 'volatile', 'virtual', 'friend', 'inline', 'static', 'typedef', 'typename', 'using']);

export const pascal = s => s.replace(/(^|[-_ ])(\w)/g, (_, __, c) => c.toUpperCase()).replace(/^\w/, c => c.toUpperCase());
export const snake = s => s.replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2').toLowerCase();
// How the TypeScript WebUI bindings name a snake_case mojom field.
export const camel = s => s.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());

// A contract type expression: a union of terms, each a string or boolean
// literal, a primitive, a contract type name (optionally `[]`) or `{ a?: T }`.
export function parseType(expression) {
  const text = expression.trim();
  if (text.startsWith('{')) {
    const body = text.replace(/^\{|\}$/g, '').trim();
    const fields = {};
    for (const part of body.split(/[;,]/).map(p => p.trim()).filter(Boolean)) {
      const m = /^(\w+)(\?)?:\s*(.+)$/.exec(part);
      if (!m) throw Error('Unsupported object literal type: ' + expression);
      fields[m[1]] = {type: m[3], ...(m[2] ? {optional: true} : {})};
    }
    return [{object: fields}];
  }
  return text.split('|').map(t => t.trim()).map(term => {
    if (/^'[^']*'$/.test(term)) return {literal: term.slice(1, -1)};
    const array = term.endsWith('[]');
    const name = array ? term.slice(0, -2) : term;
    if (!/^\w+$/.test(name)) throw Error('Unsupported type term: ' + term);
    return array ? {array: name} : {name};
  });
}

export function model(contract) {
  const types = contract.types;
  const isTypeName = n => Object.hasOwn(types, n);
  // Resolve a term to its wire category: string, double, bool, json, struct
  // (a named record), or an array of one of those.
  function category(term) {
    if (term.literal !== undefined) return {kind: 'string', literals: [term.literal]};
    if (term.array) return {kind: 'array', of: category({name: term.array})};
    if (term.object) throw Error('Object literals are only supported as named types');
    const n = term.name;
    if (n === 'string') return {kind: 'string'};
    if (n === 'number') return {kind: 'double'};
    if (n === 'boolean') return {kind: 'bool'};
    if (n === 'true' || n === 'false') return {kind: 'bool', literals: [n === 'true']};
    if (n === 'unknown') return {kind: 'json'};
    if (!isTypeName(n)) throw Error('Unknown contract type: ' + n);
    const def = types[n];
    if (def.fields || def.ts?.trim().startsWith('{')) return {kind: 'struct', name: n};
    const resolved = resolve(def.ts);
    if (resolved.nullable) throw Error('Nullable alias is unsupported: ' + n);
    return {...resolved.type, alias: n};
  }
  // A whole expression: drops null/undefined into `nullable` and merges
  // same-kind terms (string literals, aliases); mixed kinds become a union.
  function resolve(expression, optional = false) {
    let nullable = optional;
    const parts = [];
    for (const term of parseType(expression)) {
      if (term.name === 'null' || term.name === 'undefined') { nullable = true; continue; }
      if (term.name === 'void') return {type: {kind: 'void'}, nullable: false};
      parts.push(category(term));
    }
    const strings = parts.filter(p => p.kind === 'string');
    if (strings.length === parts.length && parts.length) {
      const open = strings.some(p => !p.literals);
      return {type: {kind: 'string', ...(open ? {} : {literals: [...new Set(strings.flatMap(p => p.literals))]}),
        ...(strings.length === 1 && strings[0].alias ? {alias: strings[0].alias} : {})}, nullable};
    }
    const bools = parts.filter(p => p.kind === 'bool');
    if (bools.length === parts.length && parts.length) {
      const open = bools.some(p => !p.literals);
      return {type: {kind: 'bool', ...(open ? {} : {literals: [...new Set(bools.flatMap(p => p.literals))]})}, nullable};
    }
    if (parts.length === 1) return {type: parts[0], nullable};
    return {type: {kind: 'union', variants: parts}, nullable};
  }
  const structs = {};
  for (const [name, def] of Object.entries(types)) {
    let fields = def.fields;
    if (!fields && def.ts?.trim().startsWith('{')) fields = parseType(def.ts)[0].object;
    if (!fields) continue;
    structs[name] = Object.entries(fields).map(([js, f]) => {
      const r = resolve(f.type, !!f.optional);
      const mojo = RESERVED.has(snake(js)) ? 'is_' + snake(js) : snake(js);
      return {js, mojo, ...r, optional: !!f.optional};
    });
  }
  const groups = {};
  for (const m of contract.members) {
    if (m.kind === 'value') continue;
    const g = groups[m.group] ||= {name: m.group, methods: [], events: []};
    if (m.kind === 'event') {
      g.events.push({js: m.name, mojo: pascal(m.name), payload: m.payload ? resolve(m.payload) : null});
      continue;
    }
    g.methods.push({js: m.name, mojo: pascal(m.name), kind: m.kind, channel: m.channel,
      params: (m.params || []).map(p => ({js: p.name, mojo: RESERVED.has(snake(p.name)) ? 'is_' + snake(p.name) : snake(p.name),
        ...resolve(p.type, !!p.optional || p.default !== undefined)})),
      returns: m.kind === 'invoke' ? resolve(m.returns || 'void') : null,
      // The contract's "nothing": null when it names null, else undefined.
      none: m.kind === 'invoke' && parseType(m.returns || 'void').some(t => t.name === 'null') ? 'null' : 'undefined'});
  }
  return {structs, groups, values: contract.members.filter(m => m.kind === 'value').map(m => m.name)};
}

// Unions are named after their variants, so equal shapes share one definition.
function unionName(type) {
  return type.variants.map(v => v.kind === 'struct' ? v.name : v.kind === 'array' ? pascal(wireName(v.of)) + 'List' : pascal(v.kind === 'double' ? 'number' : v.kind)).join('Or');
}
function wireName(t) { return t.kind === 'struct' ? t.name : t.kind; }
function mojoType(t, nullable, unions) {
  let s;
  switch (t.kind) {
    case 'string': case 'json': s = 'string'; break;
    case 'double': s = 'double'; break;
    case 'bool': s = 'bool'; break;
    case 'struct': s = t.name; break;
    case 'array': s = `array<${mojoType(t.of, false, unions)}>`; break;
    case 'union': { const n = unionName(t); unions.set(n, t); s = n; break; }
    default: throw Error('No mojom type for ' + t.kind);
  }
  return nullable ? s + '?' : s;
}
const variantField = v => snake(v.kind === 'struct' ? v.name : v.kind === 'array' ? wireName(v.of) + 'List' : (v.kind === 'double' ? 'number' : v.kind) + 'Value');

export function generate(contract) {
  const m = model(contract);
  const unions = new Map();
  const header = '// Generated by chromium/tools/browser-api-mojom.mjs from browser-api/contract.json.\n// Do not edit; run `node chromium/tools/browser-api-mojom.mjs`.\n';
  const lines = [];
  for (const [name, fields] of Object.entries(m.structs)) {
    lines.push(`struct ${name} {`);
    for (const f of fields) lines.push(`  ${mojoType(f.type, f.nullable, unions)} ${f.mojo};`);
    lines.push('};', '');
  }
  const ifaces = [];
  for (const g of Object.values(m.groups)) {
    const iface = pascal(g.name);
    ifaces.push(`// Contract group "${g.name}".`, `interface ${iface} {`);
    for (const x of g.methods) {
      const params = x.params.map(p => `${mojoType(p.type, p.nullable, unions)} ${p.mojo}`).join(', ');
      const ret = x.returns ? (x.returns.type.kind === 'void' ? ' => ()' : ` => (${mojoType(x.returns.type, x.returns.nullable, unions)} result)`) : '';
      ifaces.push(`  ${x.mojo}(${params})${ret};`);
    }
    ifaces.push('};', '');
    if (g.events.length) {
      ifaces.push(`interface ${iface}Client {`);
      for (const e of g.events) ifaces.push(`  ${e.mojo}(${e.payload ? mojoType(e.payload.type, e.payload.nullable, unions) + ' payload' : ''});`);
      ifaces.push('};', '');
    }
  }
  const unionLines = [];
  for (const [name, t] of unions) {
    unionLines.push(`union ${name} {`);
    for (const v of t.variants) unionLines.push(`  ${mojoType(v, false, new Map())} ${variantField(v)};`);
    unionLines.push('};', '');
  }
  const factory = ['// Binds one contract group at a time; a group is bound once its handler moved', '// off the untyped dispatcher.', 'interface BrowserApiFactory {'];
  for (const g of Object.values(m.groups)) {
    const iface = pascal(g.name);
    factory.push(`  Bind${iface}(pending_receiver<${iface}> receiver${g.events.length ? `, pending_remote<${iface}Client> client` : ''});`);
  }
  factory.push('};', '');
  const mojom = `${header}\nmodule blanc.browser_api.mojom;\n\n${unionLines.join('\n')}${lines.join('\n')}${ifaces.join('\n')}${factory.join('\n')}`;

  // C++ checks for every string or bool value restricted to literals.
  const checks = new Map();
  const addCheck = (name, t) => { if (t.literals && !checks.has(name)) checks.set(name, t); };
  for (const [s, fields] of Object.entries(m.structs)) for (const f of fields) addCheck(f.type.alias || s + pascal(f.js), f.type);
  for (const g of Object.values(m.groups)) for (const x of g.methods) for (const p of x.params) addCheck(p.type.alias || pascal(x.js) + pascal(p.js), p.type);
  const cc = [header, '#ifndef BLANC_COMMON_BROWSER_API_BROWSER_API_CHECKS_H_', '#define BLANC_COMMON_BROWSER_API_BROWSER_API_CHECKS_H_', '',
    '#include <string_view>', '', 'namespace blanc::browser_api {', ''];
  for (const [name, t] of checks) {
    if (t.kind === 'string') cc.push(`inline bool IsValid${name}(std::string_view value) {`, `  return ${t.literals.map(l => `value == ${JSON.stringify(l)}`).join(' ||\n         ')};`, '}', '');
    else cc.push(`inline bool IsValid${name}(bool value) { return ${t.literals.length === 2 ? 'true' : (t.literals[0] ? 'value' : '!value')}; }`, '');
  }
  cc.push('}  // namespace blanc::browser_api', '', '#endif  // BLANC_COMMON_BROWSER_API_BROWSER_API_CHECKS_H_', '');

  // Every group binds nothing until a handler overrides its Bind method.
  const base = [header, '#ifndef BLANC_COMMON_BROWSER_API_BROWSER_API_FACTORY_BASE_H_', '#define BLANC_COMMON_BROWSER_API_BROWSER_API_FACTORY_BASE_H_', '',
    '#include "blanc/common/browser_api/browser_api.mojom.h"', '', 'namespace blanc::browser_api {', '',
    '// Drops the receiver of every group still on the untyped dispatcher, so its', '// pipe closes; a migrated group overrides its Bind method.',
    'class BrowserApiFactoryBase : public blanc::browser_api::mojom::BrowserApiFactory {', ' public:'];
  for (const g of Object.values(m.groups)) {
    const i = pascal(g.name);
    base.push(`  void Bind${i}(mojo::PendingReceiver<blanc::browser_api::mojom::${i}>${g.events.length ? `,\n      mojo::PendingRemote<blanc::browser_api::mojom::${i}Client>` : ''}) override {}`);
  }
  base.push('};', '', '}  // namespace blanc::browser_api', '', '#endif  // BLANC_COMMON_BROWSER_API_BROWSER_API_FACTORY_BASE_H_', '');

  // The codec table: per struct, fields whose JS shape differs from what the
  // TypeScript bindings produce (renamed, JSON-carried, optional, union, nested).
  const shape = t => {
    if (t.kind === 'json') return 'json';
    if (t.kind === 'struct') return {struct: t.name};
    if (t.kind === 'array') { const o = shape(t.of); return o ? {array: o} : null; }
    if (t.kind === 'union') return {union: Object.fromEntries(t.variants.map(v => [camel(variantField(v)), shape(v)]))};
    return null;
  };
  const table = {structs: {}, methods: {}, events: {}};
  for (const [s, fields] of Object.entries(m.structs)) {
    table.structs[s] = fields.map(f => {
      const e = {js: f.js};
      if (camel(f.mojo) !== f.js) e.wire = camel(f.mojo);
      if (f.optional) e.optional = true;
      const sh = shape(f.type); if (sh) e.shape = sh;
      return e;
    });
  }
  for (const g of Object.values(m.groups)) {
    for (const x of g.methods) table.methods[x.js] = {group: g.name, method: camel(x.mojo.replace(/^\w/, c => c.toLowerCase())),
      params: x.params.map(p => shape(p.type)), ...(x.returns && x.returns.type.kind !== 'void' ? {returns: shape(x.returns.type)} : {}),
      ...(x.returns ? {} : {send: true}), ...(x.none === 'null' ? {none: null} : {})};
    for (const e of g.events) table.events[e.js] = {group: g.name, method: e.mojo.replace(/^\w/, c => c.toLowerCase()), payload: e.payload ? shape(e.payload.type) : null};
  }
  const codec = `${header}// Converts between contract-shaped Island values and the TypeScript Mojo
// bindings: field renames, JSON-carried \`unknown\`, absent optionals and
// single-variant unions. Everything else crosses unchanged.
(() => {
  const table = ${JSON.stringify(table)};
  const encode = (shape, v) => {
    if (v === undefined || v === null || !shape) return v ?? null;
    if (shape === 'json') return JSON.stringify(v);
    if (shape.array) return v.map(x => encode(shape.array, x));
    if (shape.struct) {
      const out = {};
      for (const f of table.structs[shape.struct]) out[f.wire ?? f.js] = encode(f.shape, v[f.js]);
      return out;
    }
    throw new Error('Unions are never sent to the browser');
  };
  const decode = (shape, v) => {
    if (v === undefined || v === null) return v ?? null;
    if (!shape) return v;
    if (shape === 'json') return JSON.parse(v);
    if (shape.array) return v.map(x => decode(shape.array, x));
    if (shape.union) {
      const key = Object.keys(shape.union).find(k => v[k] !== undefined && v[k] !== null);
      return key === undefined ? null : decode(shape.union[key], v[key]);
    }
    const out = {};
    for (const f of table.structs[shape.struct]) {
      const value = v[f.wire ?? f.js];
      if (f.optional && (value === null || value === undefined)) continue;
      out[f.js] = decode(f.shape, value);
    }
    return out;
  };
  // Calls a contract member on its group's remote; resolves to the contract value.
  const invoke = async (remotes, name, args = []) => {
    const m = table.methods[name];
    const remote = m && remotes[m.group];
    if (!remote) throw new Error(name + ' is not on the typed interface yet');
    const response = await remote[m.method](...m.params.map((shape, i) => encode(shape, args[i])));
    if (!('returns' in m)) return undefined;
    const value = decode(m.returns, response.result);
    return value === null ? ('none' in m ? m.none : undefined) : value;
  };
  window.BlancBrowserApiCodec = Object.freeze({table, encode, decode, invoke});
})();
`;
  return {files: {'browser_api.mojom': mojom, 'browser_api_checks.h': cc.join('\n'), 'browser_api_factory_base.h': base.join('\n')}, codec, model: m};
}

if (path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) {
  const {files, codec} = generate(JSON.parse(fs.readFileSync(CONTRACT, 'utf8')));
  const outputs = {...Object.fromEntries(Object.entries(files).map(([n, t]) => [path.join(OUT, n), t])), [CODEC]: codec};
  if (process.argv.includes('--check')) {
    const stale = Object.entries(outputs).filter(([f, t]) => !fs.existsSync(f) || fs.readFileSync(f, 'utf8') !== t).map(([f]) => path.relative(process.cwd(), f));
    if (stale.length) { console.error('Typed interface is stale; run node chromium/tools/browser-api-mojom.mjs:\n  ' + stale.join('\n  ')); process.exit(1); }
    console.log('Typed interface matches browser-api/contract.json');
  } else {
    fs.mkdirSync(OUT, {recursive: true});
    for (const [f, t] of Object.entries(outputs)) fs.writeFileSync(f, t);
    console.log('Wrote ' + Object.keys(outputs).map(f => path.relative(process.cwd(), f)).join(', '));
  }
}
