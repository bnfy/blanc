// Offline checks of source text and isolated mapping logic; no fixture import or browser.
import fs from 'node:fs';import assert from 'node:assert/strict';import vm from 'node:vm';
const s=fs.readFileSync(new URL('./private-search-diagnostic-v2.mjs',import.meta.url),'utf8');
const start=s.indexOf('function mapPrivateTargets('),end=s.indexOf('\nfunction inventory(',start);assert.ok(start>=0&&end>start);
const map=vm.runInNewContext(`${s.slice(start,end)}\nmapPrivateTargets`);
const page={type:'page',url:'http://127.0.0.1:1/private-probe-fixture',targetId:'p',browserContextId:'ctx'};
const host={type:'page',url:'chrome://blanc/host.html',targetId:'h',browserContextId:'ctx'};
assert.equal(JSON.stringify(map([page,host],page.url)),JSON.stringify({pageTargetId:'p',hostTargetId:'h',browserContextId:'ctx',uniqueUrl:page.url}));
assert.equal(map([page,{...host,browserContextId:'other'}],page.url),null);
assert.equal(map([page,host,{...host,targetId:'h2'}],page.url),null);
assert.equal(map([page,{...page,targetId:'p2'},host],page.url),null);
assert.equal(map([{...page,browserContextId:''},host],page.url),null);
assert.ok(s.includes('privateState.activeTabId,mappedTab.id'));assert.ok(s.includes('proof.firstAttemptFailed=!result.ok'));assert.ok(s.includes('proof.retryRequired=true'));assert.ok(s.includes('proof.recoveredAfterRetry=true'));assert.ok(s.includes('proof.exploratoryPass=proof.firstAttemptFailed===false'));
console.log('PASS isolated mapping edge cases and first-failure reporting assertions; no fixture/browser run');
