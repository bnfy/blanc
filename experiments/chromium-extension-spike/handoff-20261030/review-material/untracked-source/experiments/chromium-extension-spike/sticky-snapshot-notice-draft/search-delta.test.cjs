'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const get=n=>fs.readFileSync(path.join(__dirname,n),'utf8'),sha=s=>crypto.createHash('sha256').update(s).digest('hex');
test('identical notice delta preserves every byte of the search-routing suffix',()=>{
 const base=get('host-base.js'),candidate=get('host-candidate.js'),search=get('host-search-base.js'),combined=get('host-search-candidate.js'),input=JSON.parse(get('search-inputs.json'));
 assert.equal(sha(search),input.base_sha256);assert.equal(sha(combined),input.candidate_sha256);assert.equal(sha(base),input.development_base_sha256);assert.equal(sha(candidate),input.development_candidate_sha256);
 const marker='  function destination(value) {',split=s=>{const n=s.indexOf(marker);assert(n>=0);return [s.slice(0,n),s.slice(n)]};
 const [bp,bs]=split(base),[cp,cs]=split(candidate),[sp,ss]=split(search),[xp,xs]=split(combined);
 assert.equal(bp,sp);assert.equal(cp,xp);assert.equal(bs,cs);assert.equal(ss,xs);
 assert.match(xs,/typeof tab\.searchDocumentId !== 'string'/);assert.match(xs,/typeof snapshot\.searchSelectionEpoch !== 'string'/);assert.match(xs,/searchCurrent\(id, target\.url, 'navigateTab'\)/);
});
