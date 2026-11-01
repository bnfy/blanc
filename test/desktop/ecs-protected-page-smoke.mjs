import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {createRequire} from 'node:module';
import {launchPackagedOverCdp} from './support/packaged-cdp.mjs';
const require=createRequire(import.meta.url);
const {protectedPage}=require('./support/ecs-protected-page.cjs');
const {browserStartupReady}=require('./support/ecs-startup.cjs');
const {waitFor}=require('./ecs-local-html-smoke.cjs');
assert.equal(process.env.BLANC_UPDATE_CHANNEL,'ecs-qualification-disabled');
const profile=await fs.mkdtemp(path.join(os.tmpdir(),'ecs-page-probe-'));
await fs.writeFile(path.join(profile,'settings.json'),JSON.stringify({onboardingVersion:1,usagePing:false,searchSuggestions:false}));
const token='a'.repeat(32);
let result,app,ready=false;
const server=http.createServer(async(request,response)=>{
  if(request.method==='GET'){response.setHeader('Content-Type','text/html');return response.end(protectedPage(token));}
  let body='';for await(const chunk of request){body+=chunk;if(body.length>4096)return response.writeHead(413).end();}
  if(request.url==='/result'&&request.headers['x-blanc-probe']===token)result=JSON.parse(body);
  if(request.url==='/ready'&&request.headers['x-blanc-probe']===token)ready=JSON.parse(body).ready===true;
  response.end('ok');
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
try{
  // First launch installs the actual component; Linux needs a native relaunch.
  for(let round=0;round<2;round++){
    app=await launchPackagedOverCdp({executablePath:process.env.BLANC_PACKAGED_EXECUTABLE,launchViaOpen:process.platform==='darwin',args:[`--user-data-dir=${profile}`],env:process.env,timeoutMs:30000});
    await waitFor(()=>browserStartupReady(app),'ready browser');
    if(round===0){
      await waitFor(async()=>{const entries=await fs.readdir(path.join(profile,'WidevineCdm')).catch(()=>[]);return entries.some(v=>/^\d+(?:\.\d+){3}$/.test(v));},'component installation');
      await app.close();app=null;
    }
  }
  const chrome=app.pages().find(page=>page.url()==='blanc-chrome://index/');
  await chrome.evaluate(()=>window.browserAPI.openPage('settings'));
  const settings=await waitFor(()=>app.pages().find(page=>page.url()==='blanc://settings/'),'settings');
  console.log('blocker',await settings.evaluate(()=>window.bowserPages.settings.blockingStatus()));
  const url=`http://127.0.0.1:${server.address().port}/`;
  await chrome.evaluate(url=>window.browserAPI.createTab(url),url);
  const page=await waitFor(()=>app.pages().find(page=>page.url().startsWith(url)),'probe page');
  await waitFor(()=>ready,'probe script readiness');
  await page.locator('#play').click();
  await waitFor(()=>result,'protected result');
  assert.equal(result.failure,undefined);assert.equal(result.error,null);assert.equal(result.mediaKeys,true);
  assert(result.encryptedEvents>0);assert(result.second-result.first>2);assert.deepEqual(result.mediaErrors,[]);
  console.log(JSON.stringify(result));
}catch(error){
  console.error('Probe failure',error.message,app?.pages().map(page=>page.url()));throw error;
}finally{
  try{if(app)await app.close();}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await fs.rm(profile,{recursive:true,force:true});}
}
