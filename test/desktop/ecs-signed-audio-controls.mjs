// Diagnostic controls in the unchanged, signed full browser. Never substitutes
// for native acceptance or turns muted playback into an unmuted pass.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import http from 'node:http';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {launchPackagedOverCdp} from './support/packaged-cdp.mjs';
const require = createRequire(import.meta.url);
const {wav, advances} = require('./support/audio-fixture.cjs');
const {protectedPage} = require('./support/ecs-protected-page.cjs');
const {browserStartupReady} = require('./support/ecs-startup.cjs');
const {waitFor} = require('./ecs-drm-playback-smoke.cjs');
assert.equal(process.platform, 'darwin');
assert.equal(process.env.GITHUB_ACTIONS, 'true');
assert.equal(process.env.RUNNER_ARCH, {x64:'X64', arm64:'ARM64'}[process.arch]);
assert.equal(process.env.BLANC_UPDATE_CHANNEL, 'ecs-qualification-disabled');
const executable = process.env.BLANC_PACKAGED_EXECUTABLE;
assert(path.isAbsolute(executable || ''));
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ecs-signed-audio-'));
const profile = path.join(root, 'profile');
const token = crypto.randomBytes(16).toString('hex');
const report = {completed:false, arch:process.arch, trials:[], players:{}, mediaErrors:[], networkFailures:[]};
let app, server, protectedResult;
try {
  await fs.mkdir(profile);
  await fs.writeFile(path.join(profile,'settings.json'), JSON.stringify({onboardingVersion:1,usagePing:false,searchSuggestions:false}));
  report.executableSha256 = crypto.createHash('sha256').update(await fs.readFile(executable)).digest('hex');
  const html = await fs.readFile(new URL('./fixtures/audio-control.html', import.meta.url));
  const fixtures = new Map();
  for (const rate of [44100,48000]) {
    const input = path.join(root,`tone-${rate}.wav`), output = path.join(root,`tone-${rate}.m4a`);
    const bytes = wav(rate); fixtures.set(`/tone-${rate}.wav`,bytes);
    await fs.writeFile(input,bytes);
    execFileSync('/usr/bin/afconvert',['-f','m4af','-d','aac','-b','128000',input,output],{timeout:30000});
    fixtures.set(`/tone-${rate}.m4a`,await fs.readFile(output));
  }
  server = http.createServer(async (request,response) => {
    if (request.url === '/') {response.setHeader('Content-Type','text/html');return response.end(html);}
    if (request.url === '/protected') {response.setHeader('Content-Type','text/html');return response.end(protectedPage(token,{muted:false}));}
    if (['/ready','/result'].includes(request.url) && request.method === 'POST' && request.headers['x-blanc-probe'] === token) {
      try {
        let body=''; for await(const chunk of request) {body+=chunk;if(body.length>4096)return response.writeHead(413).end();}
        const result=JSON.parse(body); if(request.url==='/result')protectedResult=result;
        return response.end('ok');
      } catch {return response.writeHead(400).end();}
    }
    const bytes=fixtures.get(request.url);
    if(!bytes)return response.writeHead(404).end();
    response.setHeader('Content-Type',request.url.endsWith('.m4a')?'audio/mp4':'audio/wav');
    response.setHeader('Content-Length',bytes.length);response.end(bytes);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin=`http://127.0.0.1:${server.address().port}`;
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;delete env.NODE_OPTIONS;
  const launch=()=>launchPackagedOverCdp({executablePath:executable,launchViaOpen:true,args:[`--user-data-dir=${profile}`],env,timeoutMs:30000});
  app=await launch();
  await waitFor(async()=> {
    for(const version of await fs.readdir(path.join(profile,'WidevineCdm')).catch(()=>[])) {
      if(!/^\d+(?:\.\d+){3}$/.test(version))continue;
      const manifest=await fs.readFile(path.join(profile,'WidevineCdm',version,'manifest.json'),'utf8').then(JSON.parse,()=>null);
      if(manifest?.version===version)return version;
    }
    return null;
  }, 'real Widevine download',90000);
  // Match native acceptance: first install the real component, then launch
  // normally again before the measured media trials.
  await app.close();app=null;app=await launch();
  await waitFor(()=>browserStartupReady(app),'normal full browser startup');
  const chrome=app.pages().find(p=>p.url()==='blanc-chrome://index/');
  await chrome.evaluate(url=>window.browserAPI.createTab(url),origin+'/');
  const page=await waitFor(()=>app.pages().find(p=>p.url()===origin+'/'),'audio control tab');
  await page.bringToFront();
  app.context.on('requestfailed', request=>report.networkFailures.push({host:new URL(request.url()).hostname,error:request.failure()?.errorText}));
  const media=await app.context.newCDPSession(page);
  media.on('Media.playerErrorsRaised',event=>report.mediaErrors.push(...event.errors.map(e=>({type:e.errorType,code:e.code}))));
  media.on('Media.playerPropertiesChanged',event=>{
    for(const property of event.properties)if(['kAudioDecoderName','kAudioTracks','kVideoDecoderName','kVideoTracks','kIsPlatformAudioDecoder'].includes(property.name)) {
      (report.players[event.playerId] ||= {})[property.name]=property.value;
    }
  });
  await media.send('Media.enable');
  const playProtected=async()=>{
    protectedResult=null;
    await page.goto(origin+'/protected');
    await page.waitForFunction(()=>!!window.shaka,undefined,{timeout:60000});
    await page.locator('#play').click();
    return await waitFor(()=>protectedResult,'unmuted controlled protected playback',90000);
  };
  report.protectedBeforeControls=await playProtected();
  const specs=[44100,48000].flatMap(sampleRate=>[
    ...['pcm','aac'].flatMap(codec=>[false,true].map(muted=>({kind:'media',codec,muted,sampleRate}))),
    {kind:'web-audio',codec:'pcm',muted:false,sampleRate},
  ]);
  for(const spec of specs) {
    try {
      await page.goto(origin+'/');
      await page.evaluate(spec=>{window.spec=spec;window.result=null;},spec);
      await page.locator('#start').click();
      await page.waitForFunction(()=>window.result!==null,undefined,{timeout:15000});
      report.trials.push({...spec,...await page.evaluate(()=>window.result)});
    } catch(error) {report.trials.push({...spec,failure:error.name});}
  }
  // Same public encrypted media/server as VMP Lab, but our small controlled
  // player: isolate page/player differences without changing signed bytes.
  report.protectedAfterControls=await playProtected();
  const controls=report.trials.filter(t=>!t.muted);
  report.controlsAdvance=controls.length===6&&controls.every(advances);
  const protectedAdvances=result=>!result.failure&&result.status===2&&result.mediaKeys===true
    &&result.muted===false&&result.error===null&&result.mediaErrors.length===0
    &&result.second-result.first>2;
  report.protectedAdvancesBeforeControls=protectedAdvances(report.protectedBeforeControls);
  report.protectedAdvancesAfterControls=protectedAdvances(report.protectedAfterControls);
  report.completed=report.trials.length===10;
  if (process.env.NATIVE_AUDIO_PROBE) {
    try {report.native=JSON.parse(execFileSync(process.env.NATIVE_AUDIO_PROBE,[],{encoding:'utf8',timeout:20000}));}
    catch(error) {report.native={failure:error.name};}
  }
  await media.detach();
} catch(error) {report.failure={name:error.name,message:error.message.slice(0,300)};throw error;}
finally {
  if(app) {
    try {await app.close();}
    catch(error) {report.cleanupFailure=error.name;report.completed=false;}
  }
  if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
  await fs.rm(root,{recursive:true,force:true,maxRetries:5,retryDelay:200});
  report.profilesRemoved=!(await fs.stat(root).catch(()=>null));
  await fs.mkdir('output/ecs-production',{recursive:true});
  await fs.writeFile('output/ecs-production/signed-audio-controls.json',JSON.stringify(report,null,2));
}
// Diagnostic completion is distinct from either acceptance gate.
console.log(JSON.stringify(report));
