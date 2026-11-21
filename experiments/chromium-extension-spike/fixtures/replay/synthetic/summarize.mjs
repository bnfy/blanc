// Aggregate actual observations; never promote this pre-integration control.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {sha} from './generate.mjs';
const [electronDir,noReferrerDir,chromiumDir,tldtsPath,output]=process.argv.slice(2);
const read=(dir,name)=>JSON.parse(fs.readFileSync(path.join(dir,name)));
const {getDomain}=createRequire(import.meta.url)(tldtsPath);
const manifest=read(electronDir,'candidate-manifest.json');
const candidateIds=new Set(manifest.candidates.filter(c=>c.kind!=='coverage-control').map(c=>c.url));
const report=read(electronDir,'report.json'),native=read(chromiumDir,'report.json');
assert(report.passed&&native.passed&&read(noReferrerDir,'report.json').passed);assert.equal(native.runs.length,4);assert.equal(report.bundleSha256,native.bundleSha256);
const cells=[],profiles={},referrerDifferences=[];
for(const profile of ['regular','private']){
 const full=read(electronDir,profile+'-stability.json'),noRef=read(noReferrerDir,profile+'-stability.json');
 assert(full.stable&&noRef.stable);
 const rows=full.oracle.filter(r=>candidateIds.has(r.context.url));
 const counts={block:0,allow:0};const table=new Map();
 for(const row of full.oracle){
  const c=manifest.candidates.find(c=>c.url===row.context.url);if(!c)continue;
  const ctx=row.context;
  const requestHost=new URL(ctx.url).hostname,topHost=new URL(ctx.top_frame_origin).hostname;
  const site=h=>getDomain(h,{allowPrivateDomains:true})||h;
  const party=site(requestHost)===site(topHost)?'first-party':'third-party';
  const key=[profile,c.kind,ctx.resource_type,party].join('|');
  if(!table.has(key))table.set(key,{profile,kind:c.kind,resourceType:ctx.resource_type,party,block:0,allow:0});
  table.get(key)[row.decision]++;
 }
 for(const r of rows)counts[r.decision]++;
 assert.equal(rows.length,candidateIds.size);assert.equal(new Set(rows.map(r=>r.context.url)).size,rows.length);
 profiles[profile]={distinctCandidateUrls:rows.length,...counts,meetsNumericalFloor:counts.block>=2000&&counts.allow>=2000,
  repeatedRunsCounted:false,controlsOrChildrenCounted:false};
 cells.push(...table.values());
 for(const r of noRef.oracle){
  if(!candidateIds.has(r.context.url))continue;
  const normal=rows.find(n=>n.context.url===r.context.url);
  if(normal.decision!==r.decision)referrerDifferences.push({profile,url:r.context.url,resourceType:r.context.resource_type,
   defaultReferrerDecision:normal.decision,noReferrerDecision:r.decision,initiatorUnchanged:normal.context.initiator_origin===r.context.initiator_origin});
 }
}
for(const r of native.runs){assert.equal(r.counts.candidates,profiles[r.kind].distinctCandidateUrls);assert.equal(r.counts.electronBlockedChromiumLoaded,profiles[r.kind].block);assert.equal(r.counts.bothLoaded,profiles[r.kind].allow);}
assert.equal(new Set(native.runs.map(r=>r.kind+'-'+r.letter)).size,4);
const result={kind:'synthetic-corpus-and-chromium-negative-control',scope:'Single main frame; script/xhr/image/stylesheet; regular/private; default-referrer full set and no-referrer 24-case probe',
 bundleSha256:report.bundleSha256,sourcePin:manifest.sources,generatedCandidates:Object.values(manifest.counts).reduce((a,b)=>a+b,0),
 eligibleDistinctCandidateUrls:candidateIds.size,excludedDomainScopedCandidates:manifest.excludedDomainScopedCandidates,
 profiles,electronCells:cells,partyClassification:{basis:'Observed request URL and top_frame_origin, registrable domain with private suffixes; never generator party hint',moduleSha256:sha(fs.readFileSync(tldtsPath))},
 noReferrer:{distinctCandidateUrls:24,referrerDifferences,countsNotAddedToFloor:true},
 chromium:{kind:native.kind,nativeBlockerInstalled:false,acceptance:false,runs:native.runs,
  independentRequestInitiator:'not observed; CDP is not the native hook',serviceDenials:'Retained per run, exact named browser services only; any unknown page request faults',
  syntheticFixtureParity:null},
 fullyAdmittedPairedUrls:0,overallAcceptance:'gap',remainingGaps:[
  'Native browser interception and Mojo utility-process engine absent; no native blocking parity or latency measured',
  'Independent native request_initiator observation absent; no frame/referrer substitution',
  'First-party coverage is four authored allowed controls, not list-derived first-party blocking coverage',
  `${manifest.excludedDomainScopedCandidates} domain-scoped candidates require additional top-frame origins`,
  'Subframes, redirects, opaque origins, workers, service workers, sender teardown, prefetch/prerender, WebSocket/WebTransport',
  'Font/media/object/other resource coverage, cosmetics/procedural rules/main-world scriptlets',
  'Private real-page sanity sample not acquired; no real-web block-rate claim'],
 nativeBuilds:0,baselinePromoted:false,publicRecordingPrivacyPolicyChanged:false};
fs.writeFileSync(output,JSON.stringify(result,null,2),{flag:'wx'});
console.log(JSON.stringify({profiles,fullyAdmittedPairedUrls:0,overallAcceptance:'gap'}));
