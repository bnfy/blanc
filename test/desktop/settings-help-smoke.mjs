// Runs actual first-run, Help and updater controls on a disposable profile.
// No real user accounts, permissions or browser profiles are inspected.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { _electron } from 'playwright';
import poll from './support/poll.js';
const { waitForValue } = poll;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-trust-help-'));
const output = process.env.BLANC_REVIEW_OUTPUT_DIR || path.join(os.tmpdir(), 'blanc-trust-review'); fs.mkdirSync(output, {recursive:true});
const server = http.createServer((_req,res)=>res.end('<!doctype html><title>Bridge boundary fixture</title><main>Ordinary website</main>'));
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const { ELECTRON_RUN_AS_NODE: ignored, ...env }=process.env;
let app;
try {
  app=await _electron.launch({args:[path.resolve('.'),`--user-data-dir=${dir}`],env:{...env,BLANC_TEST:'0'}});
  await app.firstWindow();
  const start=await waitForValue(async()=>app.windows().find(p=>p.url().startsWith('blanc://newtab/')),Boolean,'start page');
  await start.locator('#onboardDialog').waitFor({state:'visible'});
  for(let i=0;i<4;i++) await start.locator('#obNext').click();
  assert.equal(await start.locator('#obSuggestions').getAttribute('aria-checked'),'true');
  assert.equal(await start.locator('#obPing').getAttribute('aria-checked'),'true');
  await start.screenshot({path:path.join(output,'onboarding.png')});
  await start.locator('#obSuggestions').click(); await start.locator('#obPing').click();
  await start.locator('#obNext').click(); await start.locator('#obNext').click();
  await start.locator('#onboardDialog').waitFor({state:'hidden'});
  await app.evaluate(({Menu})=>{
    const find=items=>items.flatMap(i=>[i,...(i.submenu?find(i.submenu.items):[])]);
    const item=find(Menu.getApplicationMenu().items).find(i=>i.label.startsWith('Settings'));
    if(!item)throw new Error('Settings menu item missing'); item.click();
  });
  const settings=await waitForValue(async()=>app.windows().find(p=>p.url().startsWith('blanc://settings/')),Boolean,'Settings');
  await settings.locator('a[data-group="help"]').click();
  await settings.locator('#appAboutCard').waitFor({state:'visible'});
  const info=await settings.evaluate(()=>window.bowserPages.settings.get());
  const actual=await app.evaluate(({app})=>({blancVersion:app.getVersion(),electronVersion:process.versions.electron,chromiumVersion:process.versions.chrome,platform:process.platform,architecture:process.arch}));
  assert.deepEqual(info.appInfo,actual);
  assert.equal(info.settings.searchSuggestions,false); assert.equal(info.settings.usagePing,false);
  await settings.locator('#group-help').scrollIntoViewIfNeeded();
  await settings.screenshot({path:path.join(output,'settings-help.png')});
  await app.evaluate(({dialog})=>{globalThis.__trustDialogs=[];dialog.showMessageBox=async(...args)=>{globalThis.__trustDialogs.push(args.at(-1));return {response:1};};});
  await settings.locator('#checkForUpdates').click();
  await waitForValue(()=>app.evaluate(()=>globalThis.__trustDialogs.at(-1)),Boolean,'manual update dialog');
  assert.match(await app.evaluate(()=>globalThis.__trustDialogs.at(-1).message),/packaged builds/);
  await settings.evaluate(()=>window.bowserPages.settings.welcomeTour());
  const tour=await waitForValue(async()=>app.windows().find(p=>p.url().includes('blanc://newtab/?tour=1')),Boolean,'replayed tour');
  for(let i=0;i<4;i++) await tour.locator('#obNext').click();
  assert.equal(await tour.locator('#obSuggestions').getAttribute('aria-checked'),'false');
  assert.equal(await tour.locator('#obPing').getAttribute('aria-checked'),'false');
  await tour.locator('#obNext').click(); await tour.locator('#obNext').click();
  await tour.goto(`http://127.0.0.1:${server.address().port}/`);
  const web=tour;
  assert.equal(await web.evaluate(()=>typeof window.bowserPages),'undefined');
  console.log('Settings Help smoke passed: real runtime versions, existing manual updater dialog, defaults on, saved choices retained, ordinary website has no bridge.');
} finally {
  await app?.close(); server.close();
  fs.rmSync(dir,{recursive:true,force:true}); fs.rmSync(`${dir}-Dev`,{recursive:true,force:true});
}
