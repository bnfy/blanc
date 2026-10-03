// Run against the built preview. Remote measurement requests are recorded
// and fulfilled locally, so synthetic events never reach third parties.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { _electron } from 'playwright';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'blanc-site-trust-'));
const fixture=path.join(root,'host.cjs');
fs.writeFileSync(fixture,`const {app,BrowserWindow}=require('electron');app.whenReady().then(()=>{new BrowserWindow({show:false,width:1280,height:900,webPreferences:{javascript:process.env.SITE_JS!=='0',contextIsolation:true,sandbox:true,nodeIntegration:false,backgroundThrottling:false}}).loadURL('about:blank');});app.on('window-all-closed',()=>app.quit());`);
const origin=process.env.BLANC_SITE_PREVIEW_URL || 'http://127.0.0.1:4328';
const output=process.env.BLANC_REVIEW_OUTPUT_DIR || path.join(os.tmpdir(),'blanc-trust-review');fs.mkdirSync(output,{recursive:true});
const { ELECTRON_RUN_AS_NODE: ignored, ...env }=process.env;
async function run({choice,storageBlocked=false,js=true},fn) {
  const profile=path.join(root,`${choice||'unset'}-${storageBlocked}-${js}-${Date.now()}`);
  const app=await _electron.launch({args:[fixture,`--user-data-dir=${profile}`],env:{...env,SITE_JS:js?'1':'0'}});
  try {
    const page=await app.firstWindow(); const requests=[]; const errors=[];
    page.on('request',r=>requests.push(r.url())); page.on('pageerror',e=>errors.push(e.message));
    await app.context().route('https://**/*',route=>{
      const isReleaseAPI=new URL(route.request().url()).hostname==='api.github.com';
      return route.fulfill({status:200,contentType:isReleaseAPI?'application/json':'application/javascript',body:isReleaseAPI?JSON.stringify({assets:[{name:'Blanc-1.25.0-arm64.dmg'},{name:'Blanc-Setup-1.25.0.exe'},{name:'Blanc-1.25.0.AppImage'}]}):'void 0;'});
    });
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
      const google=()=>requests.filter(u=>new URL(u).hostname==='www.googletagmanager.com');
      assert.equal(google().length,state.choice==='granted'&&!state.storageBlocked?1:0);
      assert.ok(requests.some(u=>new URL(u).hostname==='static.cloudflareinsights.com'));
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
    for(const route of ['/how-it-works','/','/download','/about','/faq','/features/workspaces','/features/security','/features/ad-blocking']) {
    await page.goto(origin+route);
    for(const [width,height,zoom] of [[1280,900,1],[390,844,1],[1280,900,2]]) {
      await page.setViewportSize({width:Math.round(width/zoom),height:Math.round(height/zoom)});
      await app.evaluate(({BrowserWindow},{width,height,zoom})=>{const w=BrowserWindow.getAllWindows()[0];w.setContentSize(width,height);w.webContents.setZoomFactor(zoom);},{width,height,zoom});
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`No overflow at ${width}/${zoom}`);
      await page.screenshot({path:path.join(output,`${route.replaceAll('/','_')||'home'}-${width}-${zoom}.png`)});
    }
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
  await run({},async({app,page})=>{
    await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].showInactive());
    await page.emulateMedia({reducedMotion:'no-preference'});
    await page.goto(origin);
    await page.mouse.move(0,0);
    const preview=page.locator('#heroWallpaper');
    await page.locator('.hero-wallpaper-frame').evaluate(element=>element.scrollIntoView({block:'center'}));
    const cycleStarted=Date.now();
    for(const phase of ['dawn-dark','day','day-dark','dusk','dusk-dark','night','night-dark','dawn']) {
      await page.waitForFunction(phase=>document.getElementById('heroWallpaper').dataset.phase===phase,phase,{timeout:6000});
      const box=await page.locator('.hero-wallpaper-frame').boundingBox();
      const rendered=await page.screenshot();
      const {width}=await sharp(rendered).metadata();
      const scale=width/await page.evaluate(()=>innerWidth);
      const pixels=[];
      for(const x of [0.035,0.15]) {
        const {data}=await sharp(rendered).extract({left:Math.round((box.x+box.width*x)*scale),top:Math.round((box.y+box.height*0.025)*scale),width:1,height:1}).removeAlpha().raw().toBuffer({resolveWithObject:true});
        pixels.push([...data]);
      }
      assert.ok(pixels[0].every((value,i)=>Math.abs(value-pixels[1][i])<=3),`${phase}: clipped corner and Island strip stay seamless during the fade (${pixels})`);
    }
    assert.ok(Date.now()-cycleStarted<36000,'all eight light/dark wallpapers cycle within thirty-six seconds');
    await page.waitForFunction(()=>document.getElementById('heroWallpaper').dataset.phase==='day',null,{timeout:10000});
    assert.equal(await preview.locator('button').count(),0,'wallpaper has no controls');
    await preview.focus();
    assert.equal(await preview.getAttribute('data-running'),'false');
    await page.waitForTimeout(4500);
    assert.equal(await preview.getAttribute('data-phase'),'day','keyboard focus holds the scene');
    await page.locator('#watchDemo').focus();
    await page.mouse.move(0,0);
    await page.waitForFunction(()=>document.getElementById('heroWallpaper').dataset.phase==='day-dark',null,{timeout:6000});
    await page.locator('.hero-wallpaper-frame').hover();
    assert.equal(await preview.getAttribute('data-running'),'false');
    await page.waitForTimeout(4500);
    assert.equal(await preview.getAttribute('data-phase'),'day-dark','hover holds the scene');
    await page.screenshot({path:path.join(output,'wallpaper-no-controls.png')});
    await page.mouse.move(0,0);
    await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));
    await page.waitForTimeout(4500);
    assert.equal(await preview.getAttribute('data-phase'),'day-dark','offscreen wallpaper does not advance');
  });
  await run({},async({app,page})=>{
    await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].showInactive());
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.goto(origin);
    await page.mouse.move(0,0);
    const preview=page.locator('#heroWallpaper');
    await page.locator('.hero-wallpaper-frame').evaluate(element=>element.scrollIntoView({block:'center'}));
    assert.equal(await preview.getAttribute('data-running'),'false');
    await page.waitForTimeout(4500);
    assert.equal(await preview.getAttribute('data-phase'),'dawn','reduced motion has no automatic cycle');
    assert.equal(await page.locator('[data-wallpaper-scene="dawn"]').evaluate(element=>getComputedStyle(element).transitionDuration),'0s');
    for(const [width,height,zoom] of [[390,844,1],[1280,900,2]]) {
      await page.setViewportSize({width:Math.round(width/zoom),height:Math.round(height/zoom)});
      await app.evaluate(({BrowserWindow},{width,height,zoom})=>{const w=BrowserWindow.getAllWindows()[0];w.setContentSize(width,height);w.webContents.setZoomFactor(zoom);},{width,height,zoom});
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`Wallpaper has no overflow at ${width}/${zoom}`);
      await page.locator('.hero-wallpaper-frame').evaluate(element=>element.scrollIntoView({block:'center'}));
      await page.screenshot({path:path.join(output,`wallpaper-${width}-${zoom}.png`)});
    }
  });
  await run({js:false},async({app,page})=>{
    await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setContentSize(390,844));
    await page.setViewportSize({width:390,height:844});
    await page.goto(origin);
    assert.equal(await page.locator('#watchDemo').isVisible(),false);
    assert.equal(await page.locator('#demoShowcase').isVisible(),false);
    assert.equal(await page.locator('.hero-wallpaper-scene.is-current').isVisible(),true);
    assert.equal(await page.locator('#heroWallpaper button').count(),0);
    assert.equal(await page.locator('.hero-wallpaper-scene.is-current').getAttribute('data-wallpaper-scene'),'dawn');
    assert.equal(await page.locator('.site-nav-links').isVisible(),true);
    assert.equal(await page.locator('.site-menu-toggle').isVisible(),false);
    assert.match(await page.locator('.trust-hero-actions a').getAttribute('href'),/download/);
    for(const [width,height,zoom] of [[390,844,1],[900,900,1],[1280,900,1],[1280,900,2]]) {
      await app.evaluate(({BrowserWindow},{width,height,zoom})=>{const w=BrowserWindow.getAllWindows()[0];w.setContentSize(width,height);w.webContents.setZoomFactor(zoom);},{width,height,zoom});
      await page.setViewportSize({width:Math.round(width/zoom),height:Math.round(height/zoom)});
      const layout=await page.evaluate(()=>{
        const header=document.querySelector('.site-header').getBoundingClientRect();
        const hero=document.querySelector('.trust-hero').getBoundingClientRect();
        const links=[...document.querySelectorAll('.site-nav-links > a')].map(link=>link.getBoundingClientRect().bottom);
        return {headerBottom:header.bottom,heroTop:hero.top,linksBottom:Math.max(...links),overflow:document.documentElement.scrollWidth>innerWidth+1};
      });
      assert.ok(layout.headerBottom>=layout.linksBottom-1, `No-JS header contains wrapped navigation at ${width}/${zoom}`);
      assert.ok(layout.heroTop>=layout.headerBottom-1, `No-JS hero starts below navigation at ${width}/${zoom}`);
      assert.equal(layout.overflow,false,`No-JS layout has no overflow at ${width}/${zoom}`);
      await page.screenshot({path:path.join(output,width===390?'homepage-no-js.png':`homepage-no-js-${width}-${zoom}.png`)});
    }
  });
  console.log('Website browser checks passed: consent network states, no automatic prompt, withdrawal reload, no-JS fallback, keyboard menu/demo, reduced motion, mobile/desktop and 200% zoom, control-free wallpaper autoplay/focus/hover pause/offscreen suspension/reduced-motion and static fallback.');
}finally{fs.rmSync(root,{recursive:true,force:true});}
