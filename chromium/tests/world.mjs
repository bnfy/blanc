import {waitFor,pause} from './lib/cdp.mjs';
import {nativeCall,installDriver} from './lib/test-driver.mjs';
import {shippingCore} from './steps.mjs';
import {UndefinedNativeAdapterError,observedState} from './lib/adapters.mjs';
export {nativeId} from './lib/adapters.mjs';
import {createAppShim} from './lib/page-shim.mjs';
import {shippingState} from './adapters/state.mjs';
import {adapters} from './adapters/index.mjs';
import {jsLiteral} from './lib/js-literal.mjs';
// Shipping step files call globalThis.__blanc hooks by name; each name the
// fork can serve has an adapter over a production path, CDP or the Island DOM.
export const supportedHooks=new Set(Object.keys(adapters));
export function missingAdapters(definition){
 return [...new Set([...definition.run.toString().matchAll(/(?:this|world)\.call\(\s*['"]([^'"]+)['"]/g)].map(m=>m[1]).filter(name=>!supportedHooks.has(name)))];
}
export function createWorld(fixture){
 const app=createAppShim(fixture);
 const world={fixture,app,named:new Map(),waitFor,
  fixtureUrl:n=>fixture.base+'/site/'+encodeURIComponent(n),
  // Shipping hooks.js host mapping: the resolver sends these names to the
  // loopback fixture servers (lib/fixture.mjs).
  insecureFixtureUrl(n){return this.fixtureUrl(n).replace('127.0.0.1','insecure.test');},
  secureFixtureUrl(n){if(!fixture.secureBase)throw Error('TLS fixtures were not started');return fixture.secureBase+'/site/'+encodeURIComponent(n);},
  untrustedFixtureUrl(n){if(!fixture.untrustedBase)throw Error('TLS fixtures were not started');return fixture.untrustedBase+'/site/'+encodeURIComponent(n);},
  localFixtureUrl(name,query='',host='nas.home.arpa'){return `https://${host}:${fixture.localServer.port}/site/${encodeURIComponent(name)}${query}`;},
  native(method,args=[]){return nativeCall(fixture.host,method,args);},
  async snapshot(){return nativeCall(fixture.host,'snapshot');},
  async state(){
   // The overlay's mode lives in the Island host, not the native snapshot.
   const overlayMode=await fixture.host.eval(`(()=>{const f=document.querySelector('#overlay');return !f||f.hidden?null:f.dataset.mode||null})()`);
   return observedState({...shippingState(await this.snapshot()),overlayMode});
  },
  async waitForState(predicate,options={}){return waitFor(()=>this.state(),predicate,'shipping state assertion',options.timeout||5000);},
  // The Island facade is the fork's browserAPI: a method it does not
  // implement rejects with the product's own refusal, which is a failure.
  async api(method,args=[]){
   return fixture.host.eval(`window.BlancPrototypeHost.api[${jsLiteral(method)}](...${jsLiteral(args)})`);
  },
  hostEval(expression){return fixture.host.eval(expression);},
  frame(name){return app.windows().find(p=>p.frame===name);},
  async call(method,...args){
   const adapter=adapters[method];
   if(!adapter)throw new UndefinedNativeAdapterError('Undefined native adapter: '+method);
   await app.refresh();
   // Refresh again so pages the hook opened are in app.windows() at once.
   const result=await adapter(this,...args);await app.refresh();return result;
  },
  // Shipping's reset leaves one loose new tab, no closed entries and no
  // open surface; reach the same state through production paths.
  async reset(){
   const keep=String((await this.native('createTab',['chrome://newtab/'])).tabId);
   for(const t of (await this.snapshot()).tabs)if(String(t.id)!==keep)await this.native('closeTab',[t.id]);
   await this.api('clearClosedEntries');
   await this.waitForState(s=>s.tabs.length===1&&s.activeTabId===keep&&!s.tabs[0].loading);
   await app.refresh();
  },
  async relaunch({crash=false}={}){
   // adapters/tabs.mjs's runtimes() caches the primary window's CDP target id
   // on this world object (_primaryTarget) and its secondary hosts (_hosts)
   // to avoid reinstalling the test driver on every call. A relaunch is a new
   // process with new target ids throughout, so a stale cache makes runtimes()
   // treat the one real window as unknown and reinstall the driver a second
   // time onto the SAME live page - resetting its id counter mid-process and
   // colliding with ids the native side already has on record for it.
   delete this._primaryTarget;this._hosts=new Map();
   if(!crash){
    await fixture.stop({crash});await fixture.start();
    await installDriver(fixture.host);app.reset();await app.refresh();
    return;
   }
   // Chromium's own session save is debounced 2.5s after the first unsaved
   // change (components/sessions/core/command_storage_manager.cc), and later
   // changes don't restart that timer: shipping's own 1.5s pre-crash wait
   // (test/desktop/steps/move-to-space.steps.js) isn't enough here. Land the
   // crash exit-type mark on disk too (it's set in memory at launch, but by
   // default only committed to Preferences on a ~10s delayed writer), or the
   // next launch can read a stale "Normal" and skip the bubble entirely.
   await pause(2800);
   await nativeCall(fixture.host,'flushExitType');
   await fixture.stop({crash:true});
   // Crash startup shows Chromium's native "Restore pages?" bubble instead of
   // restoring on its own (owner, 2026-11-07); the window holds nothing worth
   // waiting the blocker on until that choice is made.
   try{await fixture.start(null,{waitBlocker:false});}
   catch(e){throw Error('Crash relaunch failed to start: '+e.message);}
   await installDriver(fixture.host);
   const bubble=await waitFor(()=>nativeCall(fixture.host,'crashBubble',['state']),s=>s.shown,'crash-restore bubble',15000);
   if(!bubble.visible||!bubble.anchoredHere)throw Error('Crash-restore bubble not usable: '+JSON.stringify(bubble));
   const pressed=await nativeCall(fixture.host,'crashBubble',['restore']);
   if(!pressed.pressed)throw Error('Could not press the bubble\'s Restore button: '+JSON.stringify(pressed));
   await waitFor(()=>nativeCall(fixture.host,'crashBubble',['state']),s=>!s.awaitingAck,'the crash acknowledged',45000);
   // The blocker only starts once something needs it. A restored window can
   // hold nothing but chrome://newtab/ (e.g. a successful move leaves the
   // source with no page of its own), and would never reach "ready" then.
   const restored=await fixture.snapshot();
   if(restored.tabs.some(t=>/^https?:\/\//.test(t.url)))
    await waitFor(fixture.snapshot,s=>s.blockerHealth==='ready','blocker',45000);
   await app.refresh();
  },
  bindShippingContext(){
   // Shipping's relaunch helpers: same profile, no launch URL, so the
   // browser's own session restore decides what returns.
   const relaunch=async(options)=>{await this.relaunch(options);};
   shippingCore.resetContext({app,browserHomeDir:fixture.browserHome,profileDir:fixture.profile,fixturesBase:fixture.base,tabByName:{},scenarioApp:app,
    localFixtures:fixture.localFixtures,localFixturesPort:fixture.localServer?.port,localFixturesBase:fixture.localServer&&`https://nas.home.arpa:${fixture.localServer.port}`,
    relaunch:async(extraEnv={},{freshProfile=false}={})=>{
     if(Object.keys(extraEnv).length||freshProfile)throw new UndefinedNativeAdapterError('Relaunch with an environment or fresh profile needs an adapter');
     await relaunch();},
    crashAndRelaunch:()=>relaunch({crash:true}),
    quitAndRelaunch:async whileQuit=>{
     if(whileQuit)throw new UndefinedNativeAdapterError('Reading Electron profile files while quit has no fork equivalent');
     await relaunch();}});
  },
 };
 return world;
}
