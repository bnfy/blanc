import {waitFor} from './lib/cdp.mjs';
import {nativeCall} from './lib/test-driver.mjs';
import {shippingCore} from './steps.mjs';
import {UndefinedNativeAdapterError,observedState} from './lib/adapters.mjs';
export const supportedHooks=new Set(['state','openTab','newTab','closeTab','duplicateActive','pinTab','activateTab','reopenClosed',
 'zoomIn','zoomReset','groupActiveByName','groupTabByName','closeGroupByName','closeTabsInGroupName','closeOverlay','openPanel','openPalette','overlayMode','overlayRendererMode','adblockEnabled']);
export function missingAdapters(definition){
 return [...new Set([...definition.run.toString().matchAll(/(?:this|world)\.call\(['"]([^'"]+)['"]/g)].map(m=>m[1]).filter(name=>!supportedHooks.has(name)))];
}
export function createWorld(fixture){
 const world={fixture,named:new Map(),fixtureUrl:n=>fixture.base+'/site/'+encodeURIComponent(n),waitFor,
  async state(){return observedState(await nativeCall(fixture.host,'snapshot'));},
  async waitForState(predicate,options={}){return waitFor(()=>this.state(),predicate,'shipping state assertion',options.timeout||5000);},
  async api(method,args=[]){
   if(!await fixture.host.eval(`typeof window.BlancPrototypeHost.api[${JSON.stringify(method)}]==='function'`))throw new UndefinedNativeAdapterError('Native UI adapter lacks '+method);
   return fixture.host.eval(`window.BlancPrototypeHost.api[${JSON.stringify(method)}](...${JSON.stringify(args)})`);
  },
  async call(method,...args){
   if(!supportedHooks.has(method))throw new UndefinedNativeAdapterError('Undefined native adapter: '+method);
   if(method==='state')return this.state();
   if(method==='openTab'||method==='newTab'){
    if(args[1]&&Object.keys(args[1]).length)throw new UndefinedNativeAdapterError('Tab creation options need an explicit native adapter');
    const url=method==='newTab'?'chrome://newtab/':args[0];
    const reply=await nativeCall(fixture.host,'createTab',[url]);
    await this.waitForState(s=>s.tabs.some(t=>t.id===reply.tabId&&!t.isLoading));return reply.tabId;
   }
   if(method==='duplicateActive')return nativeCall(fixture.host,'duplicateTab',[(await this.state()).activeTabId]);
   if(method==='pinTab'){
    const tab=(await this.state()).tabs.find(t=>t.id===args[0]);if(!tab)throw Error('Unknown native tab');
    return tab.pinned?true:nativeCall(fixture.host,'togglePinned',args);
   }
   if(method==='activateTab')return nativeCall(fixture.host,'switchTab',args);
   if(method==='reopenClosed')return nativeCall(fixture.host,'reopenClosedTab');
   if(method==='zoomIn'||method==='zoomReset')return nativeCall(fixture.host,'previewPageCommand',[method]);
   if(method==='closeTab')return nativeCall(fixture.host,'closeTab',args);
   if(method==='groupActiveByName')return this.api('groupTabByName',[(await this.state()).activeTabId,args[0]]);
   if(method==='groupTabByName')return this.api('groupTabByName',args);
   if(method==='closeGroupByName'||method==='closeTabsInGroupName'){
    const group=(await this.state()).groups.find(g=>g.name===args[0]);if(!group)throw Error('Unknown native group');
    return this.api('closeGroup',[group.id]);
   }
   if(method==='adblockEnabled')return (await this.state()).adblockEnabled;
   if(method==='closeOverlay')return this.api('closeOverlay');
   if(method==='openPanel'||method==='openPalette')return fixture.host.eval(`window.BlancPrototypeHost.open(${method==='openPanel'})`);
   if(method==='overlayMode'||method==='overlayRendererMode')return fixture.host.eval(`(()=>{const f=document.querySelector('#overlay');return !f||f.hidden?null:f.contentDocument?.body?.dataset.mode??null})()`);
   throw new UndefinedNativeAdapterError('Unimplemented native adapter: '+method);
  },
  bindShippingContext(){
   // Never pretend that a WebUI is an Electron main process. Main-only
   // evaluations and window helpers must be ported explicitly.
   const app=new Proxy({}, {get(_target,name){throw new UndefinedNativeAdapterError('Shipping helper needs a native adapter: app.'+String(name));}});
   shippingCore.resetContext({app,profileDir:fixture.profile,fixturesBase:fixture.base,tabByName:{},scenarioApp:app});
  },
 };
 return world;
}
