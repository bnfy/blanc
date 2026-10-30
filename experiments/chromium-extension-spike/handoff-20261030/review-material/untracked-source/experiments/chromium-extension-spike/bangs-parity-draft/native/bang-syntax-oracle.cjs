'use strict';
const fs=require('node:fs'),vm=require('node:vm'),{spawnSync}=require('node:child_process'),crypto=require('node:crypto'),path=require('node:path');
const p=__dirname, source=fs.readFileSync(path.join(p,'../shipping/bangs.js'),'utf8');
const marker='const api = { BANG_CODE,';if(!source.includes(marker))throw Error('shipping source drift');
const sandbox={module:{exports:{}},URL,encodeURIComponent};vm.runInNewContext(source.replace(marker,'const api = { encodeQuery, BANG_CODE,'),sandbox);const B=sandbox.module.exports;
const hex=s=>Array.from({length:s.length},(_,i)=>s.charCodeAt(i).toString(16).padStart(4,'0')).join('');
const requests=[],expected=[];
function parse(s){requests.push('P\t'+hex(s));const r=B.parseBang(s);expected.push(r?'S|'+r.code+'|'+(r.position==='start'?'S':'E')+'|'+hex(r.query):'N');}
function encode(s,bits){requests.push('E\t'+bits+'\t'+hex(s));try{expected.push('S|'+hex(B.encodeQuery(s,bits)));}catch{expected.push('E');}}
const ws=['\u0009','\u000a','\u000b','\u000c','\u000d',' ','\u00a0','\u1680','\u2000','\u200a','\u2028','\u2029','\u202f','\u205f','\u3000','\ufeff','\u0085','\u200b'];
for(const w of ws){parse(w+'!YT'+w+'snow'+w+'ice'+w);parse(w+'snow'+w+'!youtube'+w);}
for(const s of ['','!','!yt','!YT sample','sample !YOUTUBE','!yt !w','!bad? !yt','!_bad','!-bad','!a'.padEnd(33,'b'),'!a'.padEnd(34,'b'),'!\u212a value','!x \ud800','test\u0085!yt','\ud800'])parse(s);
let seed=0x6ab43c2d;const rnd=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return seed>>>0};const chars=['!','a','Z','7','_','-','?',' ',...ws,'\u00e9','\u4e2d','\ud800','\udc00','\ud83d\ude00','&','%','\u0000'];
for(let i=0;i<12000;i++){let s='';for(let j=0,n=rnd()%28;j<n;j++)s+=chars[rnd()%chars.length];if(i%3===0)s='!yt '+s;if(i%5===0)s+=' !youtube';parse(s);}
for(let i=0;i<3000;i++){let s='';for(let j=0,n=rnd()%20;j<n;j++)s+=chars[rnd()%chars.length];for(let b=0;b<4;b++)encode(s,b);}
const r=spawnSync(path.join(p,'bang_syntax_oracle'),[],{input:requests.join('\n')+'\n',encoding:'utf8',maxBuffer:16*1024*1024});if(r.status!==0)throw Error('native runner failed: '+r.stderr);const actual=r.stdout.trimEnd().split('\n');if(actual.length!==expected.length)throw Error('wrong line count');
const mismatch=[];for(let i=0;i<actual.length;i++)if(actual[i]!==expected[i])mismatch.push({input:requests[i],expected:expected[i],actual:actual[i]});
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');const result={status:mismatch.length?'failed':'passed',scope:'standalone native UTF-16 token and encoding logic vs exact released JS; no actual Chromium URL, catalog authority, profile, navigation or UI',cases:requests.length,mismatches:mismatch.slice(0,20),mismatchCount:mismatch.length,shippingSha256:sha(Buffer.from(source)),nativeSourceSha256:sha(fs.readFileSync(path.join(p,'bang_syntax.cc'))),testSha256:sha(fs.readFileSync(__filename))};fs.writeFileSync(path.join(p,'bang-syntax-oracle-result.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(result));if(mismatch.length)process.exitCode=1;
