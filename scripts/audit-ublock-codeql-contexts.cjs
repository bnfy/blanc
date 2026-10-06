'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
// Reviewer-only evidence probes. This does not dismiss alerts or clear a release.
const path = require('node:path');
const { readVerifiedPackage } = require('../src/main/ublock-package');
const root = path.resolve(__dirname, '..');
const { files } = readVerifiedPackage(path.join(root, 'ublock'));
const baseline = JSON.parse(fs.readFileSync(path.join(root, 'ublock/codeql-baseline.json'), 'utf8'));
const { createHash } = require('node:crypto');
for (const alert of baseline.alerts) {
 const bytes = files.get(alert.path.replace(/^ublock\/upstream\//, ''));
 assert(bytes, alert.path);
 assert.equal(createHash('sha256').update(bytes).digest('hex'), alert.sourceSha256, alert.path);
}
const report = {};
const read = name => files.get(name).toString('utf8');
let source = read('js/resources/cookie.js');
let begin = source.indexOf('export function setCookieFn(');
let end = source.indexOf('registerScriptlet(setCookieFn', begin);
let cookie = '';
const document = {};
Object.defineProperty(document, 'cookie', {get: () => cookie, set: value => {cookie=value;}});
const context = vm.createContext({document,getCookieFn: () => undefined,encodeURIComponent,URL});
vm.runInContext(source.slice(begin, end).replace('export function','function') + '\nthis.setCookieFn=setCookieFn;', context);
for (const value of ['x; Secure; domain=attacker.invalid', 'x\\y', 'x\ny', 'x\u0000y']) {
 context.setCookieFn(false,'probe',value);
 assert.equal(cookie, 'probe='+encodeURIComponent(value)+'; path=/');
}
report.cookie91 = {semicolonBackslashControlBytesEncoded:true};
source = read('web_accessible_resources/nobab2.js');
const outcomes = {};
for (const url of ['https://a.adclixx.net/x','https://a.adnetasia.com/x','https://a.adtrackers.net/x','https://a.bannertrack.net/x','https://a.adclixx.net.attacker.invalid/x','https://attacker.invalid/?x=https://a.adclixx.net/x','https://a.adclixx.net@attacker.invalid/x','javascript:https://a.adclixx.net/x']) {
 const window = {};
 vm.runInNewContext(source,{document:{currentScript:{src:url}},window});
 outcomes[url] = window.nH7eXzOsG===858;
}
assert.deepEqual(Object.values(outcomes), [true,true,true,true,false,false,false,false]);
report.hostname103to106 = {legitimate:4,malicious:4,allExpected:true};
source=read('js/reverselookup-worker.js');
const worker=vm.createContext({self:{postMessage() {}}});
vm.runInContext(source, worker);
worker.self.onmessage({data:{what:'setList',details:{assetKey:'__proto__',content:''}}});
assert.equal(vm.runInContext('Object.getPrototypeOf(listEntries)',worker),null);
assert.equal(vm.runInContext('Object.hasOwn(listEntries,"__proto__")',worker),true);
worker.self.onmessage({data:{what:'resetLists'}});
assert.equal(vm.runInContext('Object.getPrototypeOf(listEntries)',worker),null);
assert.equal(vm.runInContext('Object.hasOwn(listEntries,"__proto__")',worker),false);
report.dictionary102 = {literalPrototypeKey:true,resetKeepsNullPrototype:true};
source=read('lib/codemirror/mode/htmlmixed/htmlmixed.js');
begin=source.indexOf('function getTagRegexp(');end=source.indexOf('\n  }',begin)+4;
const parser=vm.createContext({});vm.runInContext(source.slice(begin,end)+'\nthis.getTagRegexp=getTagRegexp;',parser);
assert.equal(parser.getTagRegexp('script',true).test('</script>'),true);
assert.equal(parser.getTagRegexp('script',true).test('</ script >'),false);
report.highlight95to96 = {ordinaryClosingTag:true,whitespaceClosingTag:false,notASanitizer:true};
source=read('lib/codemirror/mode/css/css.js');
const match=source.match(/!\/(\^#\([^\n]+)\/.test\(stream.current\(\)\)/);
assert(match);const color = new RegExp(match[1]);
assert(color.test('#GGG'));assert(!color.test('#xxx'));
report.highlight92to94 = {invalidColorMisclassified:true,notAnAuthorizationCheck:true};
console.log(JSON.stringify({alerts: [91,92,93,94,95,96,102,103,104,105,106],report,passed:true},null,2));
