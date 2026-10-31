import {waitFor} from './lib/cdp.mjs';
import {nativeCall} from './lib/test-driver.mjs';
import {shippingCore} from './steps.mjs';
import {UndefinedNativeAdapterError,observedState} from './lib/adapters.mjs';
export {nativeId} from './lib/adapters.mjs';
import {createAppShim} from './lib/page-shim.mjs';
import {shippingState} from './adapters/state.mjs';
import {adapters} from './adapters/index.mjs';
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
  insecureFixtureUrl(){throw new UndefinedNativeAdapterError('insecure.test fixture host is not mapped for the fork');},
  secureFixtureUrl(){throw new UndefinedNativeAdapterError('TLS fixture host is not mapped for the fork');},
  untrustedFixtureUrl(){throw new UndefinedNativeAdapterError('Untrusted TLS fixture host is not mapped for the fork');},
  localFixtureUrl(){throw new UndefinedNativeAdapterError('Local TLS fixture host is not mapped for the fork');},
  native(method,args=[]){return nativeCall(fixture.host,method,args);},
  async snapshot(){return nativeCall(fixture.host,'snapshot');},
  async state(){return observedState(shippingState(await this.snapshot()));},
  async waitForState(predicate,options={}){return waitFor(()=>this.state(),predicate,'shipping state assertion',options.timeout||5000);},
  // The Island facade is the fork's browserAPI: a method it does not
  // implement rejects with the product's own refusal, which is a failure.
  async api(method,args=[]){
   return fixture.host.eval(`window.BlancPrototypeHost.api[${JSON.stringify(method)}](...${JSON.stringify(args)})`);
  },
  hostEval(expression){return fixture.host.eval(expression);},
  frame(name){return app.windows().find(p=>p.frame===name);},
  async call(method,...args){
   const adapter=adapters[method];
   if(!adapter)throw new UndefinedNativeAdapterError('Undefined native adapter: '+method);
   await app.refresh();
   return adapter(this,...args);
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
  bindShippingContext(){
   shippingCore.resetContext({app,profileDir:fixture.profile,fixturesBase:fixture.base,tabByName:{},scenarioApp:app});
  },
 };
 return world;
}
