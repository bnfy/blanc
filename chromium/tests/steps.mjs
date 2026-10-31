import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {CucumberExpression,RegularExpression,ParameterTypeRegistry}=require('@cucumber/cucumber-expressions');
const parameters=new ParameterTypeRegistry();
const {loadShippingCore}=require('./lib/shipping-core.cjs');
export const definitions=[];
// These intent-level steps preserve the assertions in shipping v1.45.1
// test/desktop/steps/runnable.steps.js; only the native transport changes.
function register(expression,run,source,sourceSha256=null){
 const matcher=expression instanceof RegExp?new RegularExpression(expression,parameters):typeof expression==='string'?new CucumberExpression(expression,parameters):null;
 if(!matcher)throw Error('Core registry needs an explicit expression adapter');
 definitions.push({expression:String(expression),matcher,run,shippingSource:source,shippingSourceSha256:sourceSha256});
}
export const shippingCore=loadShippingCore(register);
function step(expression,run,source){
 if(definitions.some(d=>d.expression===expression))return;
 register(expression,run,source);
}
const origin='test/desktop/steps/runnable.steps.js';
async function openNamed(name){const url=this.fixtureUrl(name);const id=await this.call('openTab',url);this.named.set(name,id);this.activeName=name;}
step('a tab open on {string}',openNamed,origin);
step('the active tab is on {string}',openNamed,origin);
step('tabs open on {string} and {string}',async function(a,b){await openNamed.call(this,a);await openNamed.call(this,b);},origin);
step('I close that tab',async function(){await this.call('closeTab',this.named.get(this.activeName));},origin);
step('I reopen the last closed tab',async function(){await this.call('reopenClosed');},origin);
step('I duplicate the active tab',async function(){await this.call('duplicateActive');},origin);
step('I pin {string}',async function(name){await this.call('pinTab',this.named.get(name));},origin);
step('a tab open on {string} is present',async function(name){await this.waitForState(s=>s.tabs.some(t=>t.url===this.fixtureUrl(name)));},origin);
step('a second tab open on {string} is present',async function(name){await this.waitForState(s=>s.tabs.filter(t=>t.url===this.fixtureUrl(name)).length>=2);},origin);
step('{string} is marked pinned',async function(name){const s=await this.state();assert(s.tabs.some(t=>t.id===this.named.get(name)&&t.pinned===true));},origin);
// Shipping platform-services.feature zoom assertions use the actual local page.
step("I enlarge the page through the platform's zoom control",async function(){this.zoomBefore=await this.fixture.page.eval('devicePixelRatio');assert.equal(await this.call('zoomIn'),true);},'spec/acceptance/platform-services.feature');
step('the page content is enlarged',async function(){await this.waitFor(()=>this.fixture.page.eval('devicePixelRatio'),n=>n>this.zoomBefore,'page enlarged');},'spec/acceptance/platform-services.feature');
step('I reset the zoom',async function(){assert.equal(await this.call('zoomReset'),true);},'spec/acceptance/platform-services.feature');
step("the page returns to its default scale",async function(){await this.waitFor(()=>this.fixture.page.eval('devicePixelRatio'),n=>Math.abs(n-this.zoomBefore)<1e-6,'page reset');},'spec/acceptance/platform-services.feature');
// Steps shipping never defined, written for the fork from their Gherkin.
for(const area of ['island','commands','pages','tabs']){
 const {default:registerArea}=await import(`./fork-steps/${area}.mjs`);
 registerArea((expression,run)=>step(expression,run,`chromium/tests/fork-steps/${area}.mjs`));
}
export function matchStep(text){
 const matches=definitions.flatMap(d=>{const args=d.matcher.match(text);return args?[{definition:d,args:args.map(a=>a.getValue(null))}]:[];});
 if(matches.length>1)throw Error('Ambiguous fork step: '+text);
 return matches[0]||null;
}
