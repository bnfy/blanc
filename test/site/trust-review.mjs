// Run against the built preview. Remote measurement requests are recorded
// and fulfilled locally, so synthetic events never reach third parties.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { _electron } from 'playwright';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'blanc-site-trust-'));
const fixture=path.join(root,'host.cjs');
fs.writeFileSync(fixture,`const {app,BrowserWindow}=require('electron');app.whenReady().then(()=>{new BrowserWindow({show:false,width:1280,height:900,webPreferences:{javascript:process.env.SITE_JS!=='0',contextIsolation:true,sandbox:true,nodeIntegration:false}}).loadURL('about:blank');});app.on('window-all-closed',()=>app.quit());`);
const origin=process.env.BLANC_SITE_PREVIEW_URL || 'http://127.0.0.1:4328';
const output=process.env.BLANC_REVIEW_OUTPUT_DIR || path.join(os.tmpdir(),'blanc-trust-review');fs.mkdirSync(output,{recursive:true});
const { ELECTRON_RUN_AS_NODE: ignored, ...env }=process.env;
async function run({choice,storageBlocked=false,js=true},fn) {
  const profile=path.join(root,`${choice||'unset'}-${storageBlocked}-${js}-${Date.now()}`);
  const app=await _electron.launch({args:[fixture,`--user-data-dir=${profile}`],env:{...env,SITE_JS:js?'1':'0'}});
  try {
    const page=await app.firstWindow(); const requests=[]; const errors=[];
    page.on('request',r=>requests.push(r.url())); page.on('pageerror',e=>errors.push(e.message));
    await app.context().route('https://**/*',route=>route.fulfill({status:200,contentType:route.request().url().includes('api.github.com')?'application/json':'application/javascript',body:route.request().url().includes('api.github.com')?JSON.stringify({assets:[{name:'Blanc-1.25.0-arm64.dmg'},{name:'Blanc-Setup-1.25.0.exe'},{name:'Blanc-1.25.0.AppImage'}]}):'void 0;'}));
    if(js) await page.addInitScript(({choice,storageBlocked})=>{
      if(storageBlocked) Object.defineProperty(window,'localStorage',{get(){throw new Error('Blocked fixture storage');}});
      else if(choice && localStorage.getItem('measurement-consent-v2') === null) localStorage.setItem('measurement-consent-v2',choice);
    },{choice,storageBlocked});
    await fn({app,page,requests});
    assert.deepEqual(errors,[]);
  }finally{await app.close();}
}
try {
  for(const state of [{},{choice:'denied'},{choice:'granted'},{choice:'granted',storageBlocked:true}]) {
    await run(state,async({page,requests})=>{
      await page.goto(`${origin}/download?oppref=discardable-fixture`);
      await page.locator('[data-consent-open]').waitFor();
      assert.equal(await page.locator('#consent').isVisible(),false);
      const google=()=>requests.filter(u=>u.includes('googletagmanager.com'));
      assert.equal(google().length,state.choice==='granted'&&!state.storageBlocked?1:0);
      assert.ok(requests.some(u=>u.includes('cloudflareinsights.com')));
      assert.match(await page.locator('[data-download-link]').first().getAttribute('href'),/^\/dl\//);
      if(state.storageBlocked)return;
      await page.locator('[data-consent-open]').click(); await page.locator('#consentAllow').click();
      assert.equal(google().length,1);
      await page.locator('[data-consent-open]').click();
      // The seed applies only when no choice exists. Reload must read denial.
      await page.locator('#consentDeny').click();
      await page.waitForLoadState('load');
      assert.equal(await page.evaluate(()=>localStorage.getItem('measurement-consent-v2')),'denied');
      assert.equal(await page.evaluate(()=>typeof window.gtag),'undefined');
      assert.equal(google().length,1);
      assert.equal(new URL(page.url()).searchParams.has('oppref'),false);
    });
  }
  await run({},async({app,page})=>{
    await page.goto(origin);
    assert.equal(await page.locator('#demoShowcase').isVisible(),false);
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.locator('#watchDemo').press('Enter');
    assert.equal(await page.locator('#demoShowcase').isVisible(),true);
    assert.equal(await page.locator('#demoScrubToggle').getAttribute('aria-label'),'Play demo');
    await page.getByRole('button',{name:'Jump to ad blocker',exact:true}).click();
    await page.locator('#demoScrubToggle').press('Enter');
    assert.equal(await page.locator('#demoScrubToggle').getAttribute('aria-label'),'Pause demo');
    await page.locator('#demoScrubToggle').press('Enter');
    assert.equal(await page.locator('#demoScrubToggle').getAttribute('aria-label'),'Play demo');
    await page.goto(origin+'/how-it-works');
    for(const [width,height,zoom] of [[1280,900,1],[390,844,1],[1280,900,2]]) {
      await page.setViewportSize({width:Math.round(width/zoom),height:Math.round(height/zoom)});
      await app.evaluate(({BrowserWindow},{width,height,zoom})=>{const w=BrowserWindow.getAllWindows()[0];w.setContentSize(width,height);w.webContents.setZoomFactor(zoom);},{width,height,zoom});
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`No overflow at ${width}/${zoom}`);
      await page.screenshot({path:path.join(output,`how-it-works-${width}-${zoom}.png`)});
    }
    await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];w.setContentSize(390,844);w.webContents.setZoomFactor(1);});
    await page.setViewportSize({width:390,height:844});
    await page.goto(origin);
    const menu=page.locator('.site-menu-toggle');
    await menu.press('Enter');
    assert.equal(await page.locator('#siteMobileMenu').isVisible(),true);
    await menu.press('Tab');
    assert.equal(await page.evaluate(()=>document.activeElement.textContent),'Features');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#siteMobileMenu').isVisible(),false);
    assert.equal(await page.evaluate(()=>document.activeElement.getAttribute('aria-label')),'Open menu');
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    await page.screenshot({path:path.join(output,'homepage-mobile.png')});
    await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];w.setContentSize(1280,900);w.webContents.setZoomFactor(1);});
    await page.setViewportSize({width:1280,height:900});
    await page.screenshot({path:path.join(output,'homepage-desktop.png')});
  });
  await run({js:false},async({app,page})=>{
    await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setContentSize(390,844));
    await page.setViewportSize({width:390,height:844});
    await page.goto(origin);
    assert.equal(await page.locator('#watchDemo').isVisible(),false);
    assert.equal(await page.locator('#demoShowcase').isVisible(),false);
    assert.equal(await page.locator('.trust-product-shot img').isVisible(),true);
    assert.equal(await page.locator('.site-nav-links').isVisible(),true);
    assert.equal(await page.locator('.site-menu-toggle').isVisible(),false);
    assert.match(await page.locator('.trust-hero-actions a').getAttribute('href'),/download/);
    await page.screenshot({path:path.join(output,'homepage-no-js.png')});
  });
  console.log('Website browser checks passed: consent network states, no automatic prompt, withdrawal reload, no-JS fallback, keyboard menu/demo, reduced motion, mobile/desktop and 200% zoom.');
}finally{fs.rmSync(root,{recursive:true,force:true});}
