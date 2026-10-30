// Static lexical checks only; this script never imports or runs the fixture.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';
const s=fs.readFileSync(new URL('./local-exploratory-fixture-v2.mjs',import.meta.url),'utf8');
const regexLiteral=s.match(/assert\.match\(name,(\/[^\n]+?\/[a-z]*)\)/)?.[1];
assert.ok(regexLiteral,'module regex extracted');const re=vm.runInNewContext(regexLiteral);
for(const x of ['custom_template.cc','custom_template.h','selected_custom.cc','selected_custom.h','selected_shipping.cc','selected_shipping.h','selected_shipping_browser.cc'])assert.ok(re.test(x),x);
for(const x of ['selected_shipping.ccx','selected_shipping/cc','foo.cc'])assert.ok(!re.test(x),x);
const connectLiteral=s.match(/socket\.end\(('(?:[^'\\]|\\.)*')\)/)?.[1];assert.ok(connectLiteral,'CONNECT literal extracted');
assert.equal(vm.runInNewContext(connectLiteral),'HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
assert.ok(s.includes(".split('\\n')[0]"));assert.equal(vm.runInNewContext("'43121\\n/devtools/browser/fixture\\n'.split('\\n')[0]"),'43121');
const portRegex=s.match(/return (\/\^\\d\+\$\/)\.test\(x\?\.port/)?.[1];assert.ok(portRegex,'port regex extracted');const port=vm.runInNewContext(portRegex);assert.ok(port.test('43121'));assert.ok(!port.test('abc'));
const doneLiteral=s.match(/const done=p=>([^;]+);/)?.[1];assert.ok(doneLiteral,'termination expression extracted');const done=vm.runInNewContext(`p=>${doneLiteral}`);assert.equal(done({exitCode:null,signalCode:null}),false);assert.equal(done({exitCode:null,signalCode:'SIGTERM'}),true);assert.equal(done({exitCode:0,signalCode:null}),true);
const bind=s.indexOf('server.once(\'error\''),start=s.lastIndexOf('try{',bind);assert.ok(start>=0&&start<bind,'server bind inside try');assert.ok(s.includes('if(server.listening)await new Promise(resolve=>server.close(resolve))'));assert.ok(s.includes('if(proxy.listening)await new Promise(resolve=>proxy.close(resolve))'));
const commit=s.indexOf("assert.equal(navigation,true,'replacement navigation must commit')"), root=s.indexOf("'replacement root request observed'"), identity=s.indexOf("'new document identity observed'"), baseline=s.indexOf('const staleBefore='), stale=s.indexOf("const stale=await host.eval");assert.ok(commit<root&&root<identity&&identity<baseline&&baseline<stale,'stale test waits for committed replacement and its request');
console.log('PASS static module regex, CONNECT CRLF, port parsing, exit/signal, bind cleanup, and stale ordering; no browser or fixture run');
