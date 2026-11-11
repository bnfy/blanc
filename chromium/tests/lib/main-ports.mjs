// Shipping steps that evaluate in Electron's main process, ported one at a
// time (createAppShim's evaluate in page-shim.mjs). Each port is keyed by the
// SHA-256 of the exact function source shipping passes to app.evaluate, so a
// changed shipping step finds no port and stays undefined instead of running
// a stale one. tests/main-ports.test.mjs checks every key against shipping.
import crypto from 'node:crypto';
import {pause} from './cdp.mjs';
import {nativeCall} from './test-driver.mjs';

export const sourceKey = fn => crypto.createHash('sha256').update(String(fn)).digest('hex');

// The function sources a shipping step file passes to ctx.app.evaluate, in
// order: each first argument, up to its top-level comma or closing paren.
export function shippingEvaluations(text) {
  const found = [];
  for (let at = text.indexOf('ctx.app.evaluate('); at >= 0; at = text.indexOf('ctx.app.evaluate(', at + 1)) {
    let i = at + 'ctx.app.evaluate('.length, depth = 0, quote = null;
    const start = i;
    for (; i < text.length; i++) {
      const c = text[i];
      if (quote) { if (c === '\\') i++; else if (c === quote) quote = null; continue; }
      if (c === '"' || c === "'" || c === '`') quote = c;
      else if ('([{'.includes(c)) depth++;
      else if (')]}'.includes(c)) { if (depth === 0) break; depth--; }
      else if (c === ',' && depth === 0) break;
    }
    found.push(text.slice(start, i).trim());
  }
  return found;
}

// Island windows open in this browser (one host document each).
const windows = async fixture => (await fixture.targets())
  .filter(t => t.type === 'page' && t.url === 'chrome://blanc-prototype/host.html').length;
async function resizeWindow(fixture,width,height){
  const snapshot=await nativeCall(fixture.host,'snapshot');
  const targets=await nativeCall(fixture.host,'tabTargets');
  const {windowId}=await fixture.browser.send('Browser.getWindowForTarget',{targetId:targets[String(snapshot.activeTabId)]});
  await fixture.browser.send('Browser.setWindowBounds',{windowId,bounds:{width,height}});
}

export async function nativeNavigationHistory(fixture,identity){
 const id=fixture.pageIdentities?.get(identity);
 if(id==null)throw Error('Unknown page identity');
 const targetId=(await nativeCall(fixture.host,'tabTargets'))[String(id)];
 const target=(await fixture.targets()).find(t=>t.id===targetId);
 if(!target)throw Error('Native page is no longer live');
 const page=await fixture.connectTarget(target);
 try{return (await page.send('Page.getNavigationHistory')).entries.map(entry=>entry.url);}
 finally{page.close();}
}
export const PORTS = {
 // F60: exact shipping main-process functions reach the real native local
 // preferences and the same URL dispatcher used by macOS openURLs.
 '4f20693a4f06287542d9ab8cf190387a9f73d56f421e5a4063352915b5c7da7d':f=>nativeCall(f.host,'linkRoutes'),
 '23a55419967a253f935a732e4b23b5cb28dea3387408386e262d3117bcfcd04f':(f,_s,url)=>nativeCall(f.host,'externalLink',[url]),
 '47df83fe691701c48024552f15bbd806c30ae2e3b885fc7510b95b5fa8e82e42':(f,_s,{profileId,host})=>nativeCall(f.host,'setLinkRoutes',[[{id:'routed',match:{kind:'domain',value:host},destination:{profileId}}]]),
 '2aa7da05a7640c5e6fa7c45a22374b6534018bc14b846ab3f2e33b3d2f28ab8a':(f,_s,{profileId,value})=>nativeCall(f.host,'setLinkRoutes',[[{id:'in-app',match:{kind:'contains',value},destination:{profileId}}]]),
 '7c162279255d28ba3f0d17547cd42c0ceef30a0f2b4141b703856753d94a52f9':f=>nativeCall(f.host,'setLinkRoutesInApp',[true]),
 '60dc20a93d2d0b92f8f124081b9b89080d0eb299034c28c0ddecf7cc66f9acd4':f=>nativeCall(f.host,'focusedWindowTitle'),
 '968888fd8427ad4c9f66a4a802d2f5ae8904769485ac25111f7abc37b59975ba':f=>f.host.send('Page.bringToFront'),
 // The shipping UI event seam, through the native snapshot delivery channel.
 'ddda45a20481d7d0c4a7d3dcdc3274ee9431344ddb08d186360b530943ac2858': (fixture,state,activity)=>nativeCall(fixture.host,'seedDownloadsActivity',[activity]),
 '4a2133a8440f0601dcbde090523f8bde7306fe72248c83117c18dbc54a7c1c32':(fixture,state,identity)=>nativeNavigationHistory(fixture,identity),
  // Resize and zoom the real native Island window, including its overlay.
  '295d076520c1b8725f1d47c40a614568ce66335910de65bb8f0747e0bddb118e': async fixture => {
    await resizeWindow(fixture,640,480);
  },
  '830cba0d06e796ed6394eba654fa390ada9b50b367ffe8074245437f2b43248b': fixture => nativeCall(fixture.host,'setIslandZoomFactor',[1.25]),
  '51e40719c2075b4775a63ed25283e307ff4490a185ba3abb51bd14e9cacd53df': async fixture => {
    await nativeCall(fixture.host,'setIslandZoomFactor',[1]);
    await resizeWindow(fixture,1280,800);
  },
  // Whether a set-aside page's download was stopped: shipping's will-download,
  // as the count of downloads started, from a page's own download link.
  '270cc54fc97d5ae90d03ddf003f93e0e4039021fc2b627e44432ee24a29f7d99': async (fixture, state, identity) => {
    const id = fixture.pageIdentities?.get(identity);
    const targetId = (await nativeCall(fixture.host, 'tabTargets'))[String(id)];
    const target = (await fixture.targets()).find(t => t.id === targetId);
    const before = await nativeCall(fixture.host, 'downloadCount');
    const page = await fixture.connectTarget(target);
    await page.eval(`(()=>{const a=document.createElement('a');a.href=new URL('/workspace-download',location.href).href;a.download='';document.body.append(a);a.click();})()`);
    await pause(1500);
    page.close();
    return await nativeCall(fixture.host, 'downloadCount') === before;
  },
  // Whether a pane's contents hold focus: the host's focused tab.
  'ffe82b57714edbb86a70d42ba87b0e6582b9138abb48ee03d3b4241e44da35a0': async (fixture, state, id) => String((await nativeCall(fixture.host, 'snapshot')).focusedTabId) === String(id),
  // process.platform, for the platform's new-tab modifier.
  '5ab682247983acf33b7a57d5d4aec583451f33be98a23aacabdd3ae0e2485a60': async () => process.platform,
  // test/desktop/steps/http-auth.steps.js (F20), installProbe: Blanc's
  // refusal records each challenge natively (http_auth.h). A credential
  // dialog could only be a new window or a tab-modal one, and with no login
  // delegate Chromium builds neither; windows are still counted.
  '6eff2f86c52908408309a7cd0dfe2815eafd02a22b6043109c9094a3547ca01d': async (fixture, state) => {
    await nativeCall(fixture.host, 'resetAuthChallenges');
    state.authProbe = {windows: await windows(fixture)};
  },
  // readProbe: the challenges since installProbe, as shipping's login events.
  'bd1f99ce463c197760613b7d483716fb162610d2533187ca3367d11f9a77558f': async (fixture, state) => state.authProbe ? {
    logins: await nativeCall(fixture.host, 'authChallenges'),
    windowsCreated: Math.max(0, await windows(fixture) - state.authProbe.windows),
  } : null,
  // The proxy scenario's setup: the fixture's own proxy already fronts every
  // non-loopback page, so it now demands sign-in, as shipping's fixtures
  // server does for absolute-form requests.
  '77d42a707dec9700293a4f304e19fa164d201476106bcf04d0860b88c66f5c1a': async fixture => {
    fixture.proxyAuthRequired = true;
  },
  // Whether the tab uses the session the proxy was set on: a regular tab's
  // contents are the window profile's, which the fixture proxy fronts.
  '51a467af320c6f3451f8662c0e5d29ebf411d8d8ff79cb4af60c205c839f1eea': async (fixture, state, id) => {
    const snapshot = await nativeCall(fixture.host, 'snapshot');
    const tab = snapshot.tabs.find(t => Number(t.id) === Number(id));
    return !!tab && !tab.private;
  },
};
