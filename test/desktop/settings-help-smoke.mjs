// Runs actual first-run, Help and updater controls on a disposable profile.
// No real user accounts, permissions or browser profiles are inspected.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { _electron } from 'playwright';
import poll from './support/poll.js';
const { waitForValue } = poll;
const islandCapture = JSON.parse(fs.readFileSync('docs/reddit-feedback-2026-10-02/island-capture.json', 'utf8'));
for (const [file, hash] of Object.entries(islandCapture.sources)) {
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'), hash, `${file}: regenerate the quiet Island capture after renderer changes`);
}
for (const capture of islandCapture.captures) {
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(capture.file)).digest('hex'), capture.sha256, capture.file);
}

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
  for(let i=0;i<2;i++) await start.locator('#obNext').click();
  assert.equal(await start.locator('#onboardDialog').getAttribute('data-step'),'2');
  assert.equal(await start.locator('#onboardDialog [data-step]').count(),6);
  assert.equal(await start.locator('.ob-tab-discovery').isVisible(),true);
  assert.equal(await start.locator('[data-step="2"] > p').first().innerText(), 'Tabs, search and navigation, all in one place.');
  assert.match(await start.locator('#obTabDiscoveryCaption').innerText(), /Back and Forward.*three tab dots.*New Tab.*blocker shield.*Reload, Favorite and Close/);
  assert.equal(await start.locator('#obIslandShortcut').innerText(), process.platform === 'darwin' ? '⌘L' : 'Ctrl+L');
  assert.equal(await start.locator('#obIslandShortcut').getAttribute('aria-label'), process.platform === 'darwin' ? 'Command L' : 'Control L');
  await start.locator('#onboardDialog').screenshot({path:path.join(output,'meet-the-island.png')});
  const initialWindow = await app.evaluate(({BrowserWindow,nativeTheme}) => {
    const win=BrowserWindow.getAllWindows()[0];
    return {bounds:win.getBounds(),minimum:win.getMinimumSize(),theme:nativeTheme.themeSource};
  });
  const displayScale=await start.evaluate(()=>devicePixelRatio);
  const colors=new Set();
  try {
    for(const theme of ['light','dark']) {
      await app.evaluate(({nativeTheme},theme)=>{nativeTheme.themeSource=theme;},theme);
      await start.emulateMedia({colorScheme:theme});
      colors.add(await start.locator('#onboardDialog').evaluate(el=>getComputedStyle(el).backgroundColor));
      await start.locator('.ob-quiet-island').evaluate(image => image.decode());
      const capture = islandCapture.captures.find(capture => capture.theme === theme);
      const image = await start.locator('.ob-quiet-island').evaluate(image => ({src: image.currentSrc, width: image.naturalWidth, height: image.naturalHeight}));
      assert.ok(image.src.endsWith(`onboarding-island-${theme}.png`));
      assert.equal(image.width, capture.width);
      assert.equal(image.height, capture.height);
      await start.locator('#onboardDialog').screenshot({path:path.join(output,`meet-the-island-${theme}.png`)});
    }
    assert.equal(colors.size,2,'both onboarding themes must render');
    await app.evaluate(({nativeTheme})=>{nativeTheme.themeSource='light';});
    await start.emulateMedia({colorScheme:'light'});
    for(const width of [320,390,1280]) {
      await app.evaluate(({BrowserWindow},width)=>{
        const win=BrowserWindow.getAllWindows()[0];
        win.setMinimumSize(320,320); win.setContentSize(width,800);
      },width);
      await start.waitForFunction(width=>innerWidth===width,width);
      for(const zoom of (width===1280 ? [1,2] : [1])) {
        // The start page is a WebContentsView, separate from window chrome.
        await app.evaluate(({webContents},zoom)=>webContents.getAllWebContents().find(wc=>wc.getURL()==='blanc://newtab/').setZoomFactor(zoom),zoom);
        assert.equal(await start.evaluate(()=>window.devicePixelRatio),displayScale*zoom);
        const overflow=await start.evaluate(()=>{
          const dialog=document.getElementById('onboardDialog');
          const example=document.querySelector('.ob-island-example');
          return document.documentElement.scrollWidth>innerWidth || dialog.scrollWidth>dialog.clientWidth || example.scrollWidth>example.clientWidth;
        });
        assert.equal(overflow,false,`onboarding fits ${width}px at ${zoom*100}%`);
        const uniformScale = await start.locator('.ob-quiet-island').evaluate(image => {
          const rect = image.getBoundingClientRect();
          return Math.abs(rect.width / rect.height - image.naturalWidth / image.naturalHeight) < 0.01;
        });
        assert.ok(uniformScale, 'the full quiet Island retains its captured proportions');
        const footer=start.locator('#obNext');
        await footer.scrollIntoViewIfNeeded();
        assert.equal(await footer.isVisible(),true);
        await start.locator('#onboardDialog').screenshot({path:path.join(output,`meet-the-island-${width}-${zoom*100}.png`)});
      }
    }
  } finally {
    await app.evaluate(({BrowserWindow,webContents,nativeTheme},state)=>{
      webContents.getAllWebContents().find(wc=>wc.getURL()==='blanc://newtab/').setZoomFactor(1);
      const win=BrowserWindow.getAllWindows()[0];
      win.setBounds(state.bounds); win.setMinimumSize(...state.minimum); nativeTheme.themeSource=state.theme;
    },initialWindow);
    await start.emulateMedia({colorScheme:null});
  }
  for(let i=0;i<2;i++) await start.locator('#obNext').click();
  assert.equal(await start.locator('#obSuggestions').getAttribute('aria-checked'),'true');
  assert.equal(await start.locator('#obPing').getAttribute('aria-checked'),'true');
  await start.screenshot({path:path.join(output,'onboarding.png')});
  await start.locator('#obSuggestions').click(); await start.locator('#obPing').click();
  // Privacy details must not replace setup or reset its unsaved choices.
  const explanationURL = 'https://blancbrowser.com/how-it-works#connections';
  await app.context().route('https://blancbrowser.com/how-it-works', route => route.fulfill({
    status: 200, contentType: 'text/html', body: '<!doctype html><title>Privacy explanation fixture</title><p>Locally fulfilled review page</p>',
  }));
  await start.locator('.ob-privacy-details a').click();
  const explanation = await waitForValue(async () => (await app.windows()).find(page => page.url() === explanationURL), Boolean, 'separate explanation tab');
  assert.notEqual(explanation, start);
  assert.equal(start.url(), 'blanc://newtab/');
  assert.equal(await start.locator('#onboardDialog').getAttribute('data-step'), '4');
  assert.equal(await start.locator('#obSuggestions').getAttribute('aria-checked'), 'false');
  assert.equal(await start.locator('#obPing').getAttribute('aria-checked'), 'false');
  await explanation.close();
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
  console.log('Settings Help smoke passed: real runtime versions, existing manual updater dialog, defaults on, unsaved choices preserved across privacy details, saved choices retained, ordinary website has no bridge.');
} finally {
  await app?.close(); server.close();
  fs.rmSync(dir,{recursive:true,force:true}); fs.rmSync(`${dir}-Dev`,{recursive:true,force:true});
}
