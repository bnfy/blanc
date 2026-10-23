import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {launchPackagedOverCdp} from './support/packaged-cdp.mjs';
const require = createRequire(import.meta.url);
const {wav, classify} = require('./support/audio-fixture.cjs');
assert.equal(process.platform, 'darwin'); assert.equal(process.arch, 'x64');
assert.equal(process.env.GITHUB_ACTIONS, 'true');
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'blanc-audio-comparison-'));
const html = await fs.readFile(new URL('./fixtures/audio-control.html', import.meta.url));
const waves = new Map([44100,48000].map(rate => [`/tone-${rate}.wav`, wav(rate)]));
const server = http.createServer((request,response) => {
  if (request.url === '/') {response.setHeader('Content-Type','text/html');return response.end(html);}
  const bytes = waves.get(request.url);
  if (!bytes) return response.writeHead(404).end();
  response.setHeader('Content-Type','audio/wav'); response.setHeader('Content-Length',bytes.length); response.end(bytes);
});
await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
const origin = `http://127.0.0.1:${server.address().port}/`;
const report = {completed:false, fixture:'local PCM16 stereo 440Hz', runtimes:{}};
try {
  for (const [name, executablePath] of [['official',process.env.OFFICIAL_AUDIO_EXECUTABLE],['ecs',process.env.ECS_AUDIO_EXECUTABLE]]) {
    assert(path.isAbsolute(executablePath || ''));
    const profile = path.join(root,name); await fs.mkdir(profile);
    const env = {...process.env}; delete env.ELECTRON_RUN_AS_NODE; delete env.NODE_OPTIONS;
    let app;
    const result = report.runtimes[name] = {trials:[],mediaErrors:[]};
    try {
      app = await launchPackagedOverCdp({executablePath,args:[path.resolve('test/desktop/support/audio-control-app.cjs'),
        `--user-data-dir=${profile}`,origin],env,timeoutMs:30000});
      let page;
      for (let attempt = 0; attempt < 100 && !page; attempt++) {
        page = app.pages().find(p=>p.url()===origin);
        if (!page) await new Promise(resolve=>setTimeout(resolve,100));
      }
      assert(page); await page.waitForURL(origin); await page.bringToFront();
      result.userAgent = await page.evaluate(()=>navigator.userAgent);
      const browserSession = await app.browser.newBrowserCDPSession();
      result.version = await browserSession.send('Browser.getVersion');
      await browserSession.detach();
      const media = await app.context.newCDPSession(page);
      media.on('Media.playerErrorsRaised', event => result.mediaErrors.push(...event.errors.map(e=>({type:e.errorType,code:e.code}))));
      await media.send('Media.enable');
      for (const sampleRate of [44100,48000]) for (const [kind,muted] of [['media',false],['media',true],['web-audio',false]]) {
        const spec={kind,muted,sampleRate};
        try {
          await page.goto(origin);
          await page.evaluate(spec=>{window.spec=spec;window.result=null;},spec);
          await page.locator('#start').click();
          await page.waitForFunction(()=>window.result!==null,undefined,{timeout:15000});
          result.trials.push({...spec,...await page.evaluate(()=>window.result)});
        } catch(error) { result.trials.push({...spec,failure:error.name}); }
      }
      await media.detach();
    } catch(error) {result.failure=error.message.slice(0,400);}
    finally {if(app)await app.close();}
  }
  try {report.native = JSON.parse(execFileSync(process.env.NATIVE_AUDIO_PROBE,[],{encoding:'utf8',timeout:20000}));}
  catch(error) {report.native = {failure:error.name};}
  report.classification = classify(report.runtimes,report.native);
  report.completed = Object.values(report.runtimes).every(r=>!r.failure&&r.trials.length===6);
  assert(report.completed,'The comparison must complete both runtime controls');
} finally {
  server.closeAllConnections(); await new Promise(resolve=>server.close(resolve));
  await fs.rm(root,{recursive:true,force:true,maxRetries:5,retryDelay:200});
  report.profilesRemoved=!(await fs.stat(root).catch(()=>null));
  await fs.mkdir('output/ecs-production',{recursive:true});
  await fs.writeFile('output/ecs-production/intel-audio-comparison.json',JSON.stringify(report,null,2));
}
console.log(JSON.stringify(report));
