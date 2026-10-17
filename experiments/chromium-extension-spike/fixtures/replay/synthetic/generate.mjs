// First-party generator; generated list-derived artifacts carry ../NOTICE.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import scrub from '../pipeline/scrub.cjs';
export const sha = data => createHash('sha256').update(data).digest('hex');
const types = new Map([['script','script'],['image','image'],['stylesheet','stylesheet'],['xmlhttprequest','xhr']]);
const hostPattern = /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/;
const pageHost = 'page.blanc-fixture.test';

// Intentionally not an ABP parser. Only this explicit subset can seed a case;
// all other rules remain accounted for as unsupported, never silently changed.
export function parseSeed(line) {
  if (!line || line.startsWith('!') || line.startsWith('[')) return {skip:'metadata'};
  if (line.includes('#')) return {skip:'cosmetic-or-fragment'};
  const match = /^(?<exception>@@)?\|\|(?<host>[^/^$|]+)(?<suffix>\^|\/[^$|*^]*)(?:\$(?<options>.*))?$/.exec(line);
  if (!match || !hostPattern.test(match.groups.host)) return {skip:'unsupported-pattern'};
  const {host,suffix,options='',exception} = match.groups;
  const tokens = options ? options.split(',') : [];
  let resourceType = 'script', party = 'third-party', sourceHost = pageHost;
  const requestedTypes = tokens.filter(x=>types.has(x));
  if (requestedTypes.length > 1) return {skip:'multiple-resource-types'};
  if (requestedTypes.length) resourceType=types.get(requestedTypes[0]);
  for (const token of tokens) {
    if (types.has(token)) continue;
    if (token==='third-party') party='third-party';
    else if (token==='~third-party') party='first-party';
    else if (token.startsWith('domain=')) {
      const domains=token.slice(7).split('|');
      if (domains.length!==1 || !hostPattern.test(domains[0])) return {skip:'unsupported-domain-scope'};
      sourceHost=domains[0];
    } else return {skip:'unsupported-modifier'};
  }
  if(tokens.includes('third-party')&&tokens.includes('~third-party'))return {skip:'contradictory-party'};
  if (party==='first-party') {
    if (sourceHost!==pageHost && sourceHost!==host) return {skip:'first-party-domain-scope'};
    sourceHost=host;
  }
  let pathname=suffix==='^'?'/blanc-fixture/resource.js':suffix;
  // Query values come only from pinned sources and still pass the public gate.
  const url='https://'+host+pathname;
  try {scrub.safeUrl(url);scrub.safeUrl('https://'+sourceHost+'/');} catch {return {skip:'public-url-policy'};}
  if(new URL(url).href!==url)return {skip:'url-normalization'};
  return {url,host,sourceHost,resourceType,party,kind:exception?'exception-candidate':'blocking-candidate'};
}

export function authoredResponse(candidate) {
  const id=candidate.id;
  if (candidate.resourceType==='script') return {status:200,contentType:'application/javascript',body:
    `window.blancFixtureExecuted=(window.blancFixtureExecuted||[]).concat(${JSON.stringify(id)});\nfetch(${JSON.stringify(candidate.descendantUrl)},{credentials:'omit'}).then(()=>{window.blancFixtureChildren=(window.blancFixtureChildren||[]).concat(${JSON.stringify(id)});}).catch(()=>{});\n`};
  if (candidate.resourceType==='xhr') return {status:200,contentType:'application/json',body:'{"fixture":"authored-response"}'};
  if (candidate.resourceType==='stylesheet') return {status:200,contentType:'text/css',body:`#fixture-probe { color: rgb(11, 22, 33); }\n`};
  if (candidate.resourceType==='image') return {status:200,contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"><rect width="2" height="2" fill="red"/></svg>'};
  throw new Error('Unsupported fixture resource type');
}

export function buildCandidates(sources, {limit=2500}={}) {
  if (!Number.isSafeInteger(limit)||limit<1) throw new Error('Positive integer limit required');
  const candidates=[],seen=new Set(),refusals={},counts={},sourceCounts={};
  const increment=k=>{refusals[k]=(refusals[k]||0)+1;};
  for(const source of sources) {
    for(const [index,rule] of source.text.split(/\r?\n/).entries()) {
      const seed=parseSeed(rule);if(seed.skip){increment(seed.skip);continue;}
      if(!rule.includes('$'))seed.resourceType=['script','image','stylesheet','xhr'][parseInt(sha(rule).slice(0,2),16)%4];
      const key=seed.kind;
      if((sourceCounts[source.file+':'+key]||0)>=Math.ceil(limit/sources.length)||(counts[key]||0)>=limit){increment('per-kind-cap');continue;}
      if(seen.has(seed.url)){increment('duplicate-url');continue;}
      const provenance={list:source.file,line:index+1,rule,sourceSha256:source.sha256};
      function add(item) {
        const id='case-'+sha(item.url).slice(0,16);
        const descendantUrl='https://'+item.sourceHost+'/blanc-fixture/child/'+id+'.json';
        const c={...item,id,provenance,descendantUrl:item.resourceType==='script'?descendantUrl:null};
        c.response=authoredResponse(c);c.response.sha256=sha(c.response.body);
        if(c.descendantUrl)c.descendantResponse={status:200,contentType:'application/json',body:'{"fixture":"authored-child"}',causedBy:id};
        candidates.push(c);seen.add(item.url);counts[item.kind]=(counts[item.kind]||0)+1;
      }
      add(seed);sourceCounts[source.file+':'+key]=(sourceCounts[source.file+':'+key]||0)+1;
      if(seed.kind==='blocking-candidate'&&seed.party==='third-party'&&seed.sourceHost===pageHost){
        // A suffix after the original hostname tests the domain-anchor boundary;
        // it is a different authority, not a random identifier added to a URL.
        const host=seed.host+'.blanc-control.test';
        const url=seed.url.replace('https://'+seed.host+'/', 'https://'+host+'/');
        try{scrub.safeUrl(url);}catch{increment('control-public-url-policy');continue;}
        if(!seen.has(url))add({...seed,host,url,kind:'near-miss-candidate',controlFor:seed.url});
      }
    }
  }
  return {schema:1,kind:'synthetic-candidates-not-oracle',licence:'CC-BY-SA-3.0-or-later',
    attribution:'The EasyList authors',generatorSha256:sha(fs.readFileSync(fileURLToPath(import.meta.url))),
    generation:{algorithm:'literal-domain-anchor-v1',order:'pinned-list-order-then-line',limitPerSeedKind:limit,maxPerListAndSeedKind:Math.ceil(limit/sources.length),
      unconstrainedResourceType:'sha256(rule) first byte modulo script/image/stylesheet/xhr',
      deduplication:'exact URL across all sources; reruns and profile variants do not add candidates'},
    sources:sources.map(({file,sha256})=>({file,sha256})),counts,sourceCounts,refusals,candidates,
    observedDecisions:0,acceptedOracleUrls:0,captureProvenanceVerified:false};
}

export function generate(sourceDirectory,limit=2500) {
  const pin=JSON.parse(fs.readFileSync(path.join(sourceDirectory,'pinned.json'),'utf8'));
  const sources=pin.lists.map(({file,sha256})=>{
    if(path.basename(file)!==file)throw new Error('Unsafe source path');
    const bytes=fs.readFileSync(path.join(sourceDirectory,file));
    if(sha(bytes)!==sha256)throw new Error('Pinned source hash mismatch: '+file);
    return {file,sha256,text:bytes.toString('utf8')};
  });
  return buildCandidates(sources,{limit});
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const [sourceDirectory,output,limit]=process.argv.slice(2);
  if(!sourceDirectory||!output)throw new Error('Usage: generate.mjs SOURCES OUTPUT [LIMIT]');
  const bundle=generate(sourceDirectory,limit===undefined?2500:Number(limit));
  fs.writeFileSync(output,JSON.stringify(bundle,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({counts:bundle.counts,refusals:bundle.refusals,acceptedOracleUrls:0}));
}
