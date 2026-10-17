import test from 'node:test';
import assert from 'node:assert/strict';
import {buildCandidates,parseSeed,sha} from './generate.mjs';
const source=text=>[{file:'fixture.txt',sha256:sha(text),text}];
test('supported seeds preserve URL/type/domain and never assign decisions',()=>{
  const c=parseSeed('@@||asset.example/path.js$script,domain=page.example');
  assert.equal(c.kind,'exception-candidate');assert.equal(c.sourceHost,'page.example');
  assert.equal(c.url,'https://asset.example/path.js');assert(!Object.hasOwn(c,'decision'));
});
test('unsupported rules are accounted for, never approximated',()=>{
  for(const rule of ['||example.com/*$script','||example.com^$redirect=noopjs','||example.com^$~script','||example.com^$domain=foo.com|bar.com','||example.com^$script,image','||example.com^$third-party,~third-party'])assert(parseSeed(rule).skip,rule);
});
test('hash reproducibility and duplicate URLs across lists',()=>{
  const inputs=source('||ads.example^\n||ads.example^\n||other.example^');
  const a=buildCandidates(inputs),b=buildCandidates(inputs);
  assert.deepEqual(a,b);assert.equal(a.refusals['duplicate-url'],1);
  assert.equal(new Set(a.candidates.map(c=>c.url)).size,a.candidates.length);
  assert.equal(a.acceptedOracleUrls,0);assert.equal(a.captureProvenanceVerified,false);
});
test('near miss changes domain boundary, not random request identifiers',()=>{
  const a=buildCandidates(source('||ads.example^'));
  const c=a.candidates.find(c=>c.kind==='near-miss-candidate');
  assert.equal(new URL(c.url).hostname,'ads.example.blanc-control.test');
  assert.equal(c.controlFor,a.candidates[0].url);
});
test('every script has executable authored content and declared child response',()=>{
  const a=buildCandidates(source('||ads.example^$script'));
  for(const c of a.candidates){assert(c.response.body.includes(c.descendantUrl));assert.equal(c.descendantResponse.causedBy,c.id);assert.equal(c.response.sha256,sha(c.response.body));}
});
test('first-party seeds keep same source authority and no automatic third-party control',()=>{
  const a=buildCandidates(source('||cdn.example/a.js$~third-party'));
  assert.equal(a.candidates.length,1);assert.equal(a.candidates[0].sourceHost,'cdn.example');
});
test('public gate and URL normalization remain fail closed',()=>{
  assert.equal(parseSeed('||ads.example/x?token=abc').skip,'public-url-policy');
  assert.equal(parseSeed('||ads.example/../x').skip,'url-normalization');
});
test('limits cap seeds without turning surplus candidates into oracle observations',()=>{
  const a=buildCandidates(source('||a.example^\n||b.example^'),{limit:1});
  assert.equal(a.counts['blocking-candidate'],1);assert.equal(a.refusals['per-kind-cap'],1);assert.equal(a.observedDecisions,0);
});

test('authored child identifiers cannot trip numeric identifier privacy gate',()=>{
  const a=buildCandidates(source('||029519cbdc.com^$script'));
  for(const c of a.candidates)assert.match(c.id,/^case-[a-p]{16}$/);
});
