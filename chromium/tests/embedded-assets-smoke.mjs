// F0.6 smoke: with no asset folder, the Island and Start Page load from the
// compiled-in copy, and every resource they load equals the canonical file.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {NativeFixture} from './lib/fixture.mjs';
import {connect,waitFor} from './lib/cdp.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'blanc/island-assets.json'))).manifest;
const [configPath,outFile]=process.argv.slice(2);
if(!configPath||!outFile)throw Error('Usage: embedded-assets-smoke.mjs runtime-config.json result.json');
const config=JSON.parse(fs.readFileSync(configPath));
const fixture=new NativeFixture();
const result={candidate:config.candidate,diskAssets:false,checked:{},status:'started'};
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
// Windows-1252, which Chromium uses for a stylesheet served with no charset.
const CP1252='\u20ac\u0081\u201a\u0192\u201e\u2026\u2020\u2021\u02c6\u2030\u0160\u2039\u0152\u008d\u017d\u008f\u0090\u2018\u2019\u201c\u201d\u2022\u2013\u2014\u02dc\u2122\u0161\u203a\u0153\u009d\u017e\u0178';
const cp1252=text=>Buffer.from([...text].map(c=>{const i=CP1252.indexOf(c);const code=i>=0?0x80+i:c.codePointAt(0);if(code>0xff)throw Error('not cp1252');return code;}));
async function compare(cdp,label){
 await cdp.send('Page.enable');
 const frames=[];const walk=t=>{frames.push(t);for(const c of t.childFrames||[])walk(c);};
 walk((await cdp.send('Page.getResourceTree')).frameTree);
 for(const f of frames)for(const r of [{url:f.frame.url},...f.resources]){
  const m=/^chrome:\/\/blanc-prototype\/([^?#]+)/.exec(r.url);if(!m||!(m[1] in manifest))continue;
  let reply;
  try{reply=await cdp.send('Page.getResourceContent',{frameId:f.frame.id,url:r.url});}
  catch(e){if(/No resource with given URL/.test(e.message)){(result.unretrievable??=[]).push(r.url);continue;}throw e;}
  const {content,base64Encoded}=reply;
  // DevTools returns text decoded by the page's charset; a stylesheet with no
  // @charset can come back as Windows-1252. Re-encode the way it was decoded.
  const decoders=base64Encoded?{base64:c=>Buffer.from(c,'base64')}:{utf8:c=>Buffer.from(c,'utf8'),cp1252};
  const match=Object.keys(decoders).find(e=>{try{return sha(decoders[e](content))===manifest[m[1]];}catch{return false;}});
  assert(match,`${label}: ${m[1]} differs from the canonical file`);
  if(match==='cp1252')(result.decodedAsWindows1252??=new Set()).add(m[1]);
  result.checked[m[1]]=manifest[m[1]];
 }
}
try{
 await fixture.launch(config,fs.mkdtempSync(path.join(os.tmpdir(),'blanc-embedded-'))+'/case',{diskAssets:false});
 assert(!fixture.flags.some(f=>f.startsWith('--blanc-prototype-assets')),'launched without an asset folder');
 await compare(fixture.host,'Island');
 // Open the tab the way a user does, through the Island's new-tab action.
 const before=new Set((await fixture.targets()).map(t=>t.id));
 await fixture.host.eval('window.BlancPrototypeHost.api.createTab()');
 const start=(await waitFor(fixture.targets,ts=>ts.some(t=>t.type==='page'&&!before.has(t.id)),'Start Page')).find(t=>t.type==='page'&&!before.has(t.id));
 const page=await connect(start);fixture.connections.push(page);
 await waitFor(()=>page.eval('document.readyState+" "+location.href'),s=>s.startsWith('complete chrome://blanc-prototype/pages/newtab.html'),"Blanc's Start Page");
 await compare(page,'Start Page');
 assert(Object.keys(result.checked).length>=20,'too few resources checked: '+Object.keys(result.checked).length);
 result.status='passed';
}catch(e){result.status='failed';result.error=String(e.stack||e);}
finally{result.browserExit=await fixture.close();if(result.status==='passed'&&result.browserExit?.code!==0)result.status='failed';
 if(result.decodedAsWindows1252)result.decodedAsWindows1252=[...result.decodedAsWindows1252];
 fs.writeFileSync(outFile,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({status:result.status,resources:Object.keys(result.checked).length,error:result.error?.split('\n')[0]}));}
if(result.status!=='passed')process.exitCode=1;
