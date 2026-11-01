// N6 smoke: links a page starts to OS-control schemes on shipping's deny list
// are consumed by Blanc's rule, while other app links reach Chromium's prompt
// (V9). Under --blanc-test the browser records each decision instead of
// launching an app or showing a dialog. The page itself never navigates away.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {NativeFixture} from './lib/fixture.mjs';
import {waitFor} from './lib/cdp.mjs';
import {jsLiteral} from './lib/js-literal.mjs';
import {installDriver,nativeCall} from './lib/test-driver.mjs';
const [configPath,outFile]=process.argv.slice(2);
if(!configPath||!outFile)throw Error('Usage: external-launch-smoke.mjs runtime-config.json result.json');
const config=JSON.parse(fs.readFileSync(configPath));
const fixture=new NativeFixture();
const result={candidate:config.candidate,checks:{},status:'started'};
// Each link, how the page starts it, and shipping's decision for it.
const LINKS=[
 ['ms-settings:display','link','deny'],
 ['MS-SETTINGS:privacy','link','deny'],
 ['x-apple.systempreferences:com.apple.preference.security','location','deny'],
 ['ssh://example.test','link','deny'],
 ['search-ms:query=x','frame','deny'],
 ['claude://login','link','prompt'],
 ['mailto:someone@example.test','link','prompt'],
 ['zoommtg://zoom.us/join','location','prompt'],
];
try{
 await fixture.launch(config,fs.mkdtempSync(path.join(os.tmpdir(),'blanc-external-'))+'/case',{diskAssets:false,testHooks:true});
 await installDriver(fixture.host);
 const launches=async()=>nativeCall(fixture.host,'externalLaunches');
 const page=fixture.page;
 const start=await page.eval('location.href');
 for(const [url,how,expected] of LINKS){
  const before=(await launches()).length;
  const script=how==='link'?`(() => { const a = document.createElement('a'); a.href = ${jsLiteral(url)}; document.body.append(a); a.click(); a.remove(); })()`
   :how==='location'?`location.href = ${jsLiteral(url)}`
   :`(() => { const f = document.createElement('iframe'); document.body.append(f); f.contentWindow.location.href = ${jsLiteral(url)}; })()`;
  await page.eval(script);
  const recorded=await waitFor(async()=>(await launches()).slice(before),r=>r.length>0,'launch of '+url);
  // GURL lowercases the scheme; the rule sees the canonical address.
  assert.equal(recorded.length,1,url);
  assert.equal(recorded[0].url.toLowerCase(),url.toLowerCase(),url);
  result.checks[url]=recorded[0].decision;
  assert.equal(recorded[0].decision,expected,url);
 }
 assert.equal(await page.eval('location.href'),start,'the page stays where it was');
 result.checks.pageStayed=true;
 result.status='passed';
}catch(e){result.status='failed';result.error=String(e.stack||e);}
finally{result.browserExit=await fixture.close();if(result.status==='passed'&&result.browserExit?.code!==0)result.status='failed';
 fs.writeFileSync(outFile,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({status:result.status,checks:result.checks,error:result.error?.split('\n')[0]}));}
if(result.status!=='passed')process.exitCode=1;
