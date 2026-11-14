// S4a source/logic checks only. No runner, Worker, browser or native build.
import test, {after} from 'node:test';
import os from 'node:os';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url);
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const staging=fs.mkdtempSync(path.join(os.tmpdir(),'blanc-sync-settings-'));
after(()=>fs.rmSync(staging,{recursive:true,force:true}));
const lane=JSON.parse(fs.readFileSync(path.join(root,'chromium/lanes/desktop.json')));
fs.cpSync(path.join(root,'chromium/upstream'),staging,{recursive:true});
for(const patch of lane.patches)execFileSync('git',['apply',path.join(root,'chromium',patch)],{cwd:staging});
const web=path.join(staging,'chrome/browser/resources/settings');
const read=p=>fs.readFileSync(p,'utf8');
const native=read(path.join(root,'chromium/blanc/browser/ui/chromium_settings_handler.inc'));
const ui=read(path.join(web,'blanc_sync_page/blanc_sync_page.ts'));
const strings=new Map([...read(path.join(staging,'chrome/browser/ui/webui/settings/settings_ui.cc'))
 .matchAll(/AddString\("(blancSync\w+)", u("(?:[^"\\\n]|\\.)*")\);/g)].map(m=>[m[1],JSON.parse(m[2])]));

// Use the integration tree's TS parser only when available. No emitted files.
const source=process.env.BLANC_CHROMIUM_SRC??path.resolve(root,'../src');
const compiler=path.join(source,'third_party/node/node_modules/typescript/lib/typescript.js');
const ts=fs.existsSync(compiler)?require(compiler):null;
function harness(){
 const calls=[];
 const off={enabled:false,handle:'',lastSyncedAt:0,lastError:null,origin:'',recoveryPromptDismissed:false};
 const state={available:true,status:off,pendingFirstUpload:0};
 const api={
  state:async()=>state,
  capture:async()=>{},
  call:async(method,args=[])=>{calls.push({method,args:structuredClone(args)});return {ok:true};},
  confirmFirstUpload:async accept=>{calls.push({confirm:accept});},
  listen:()=>({}),stopListening:()=>{},
 };
 let Element;
 class Lit {
  constructor(){this.isConnected=true;this.hasUpdated=true;this.updateComplete=Promise.resolve();
   const dialog={open:false,showModal(){this.open=true;},close(){this.open=false;}};
   this.shadowRoot={querySelector:()=>dialog};
  }
  connectedCallback(){} disconnectedCallback(){} toggleAttribute(){}
 }
 const text=(name,values={})=>{
  assert.ok(strings.has(name),`missing string ${name}`);
  return strings.get(name).replace(/\{(\w+)\}/g,(_,k)=>values[k]??'');
 };
 const code=ts.transpileModule(ui,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 const context={exports:{},document:{visibilityState:'visible',removeEventListener(){}},
  window:{clearInterval(){}},customElements:{define:(_name,ctor)=>{Element=ctor;}},
  require:id=>id.includes('lit.rollup')?{CrLitElement:Lit}:
   id.endsWith('blanc_settings_proxy.js')?{blancSync:api,blancString:text}:
   id.endsWith('/pairing_model.js')?{pairing_model:require('../../src/renderer/pages/settings-sync-pairing-model.js')}:
   id.endsWith('/qr_code.js')?{qr_code:require('../../src/renderer/pages/qr-code.js')}:
   {getCss:()=>'',getHtml:()=>''},
 };
 vm.runInNewContext(code,context);
 const el=new Element();el.$=Object.fromEntries(['syncCode','syncHandle','syncPassphrase'].map(id=>[id,{value:'',focus(){}}]));
 el.state_=state;
 return {el,api,calls,state,off};
}
const settle=async el=>{for(let n=0;n<100&&el.busy_;n++)await new Promise(resolve=>setImmediate(resolve));assert.equal(el.busy_,false);};

test('native bridge rejects arbitrary runner exports and malformed argument shapes',()=>{
 const validator=native.slice(native.indexOf('static bool ValidSyncCall'),native.indexOf('void HandleSyncCall'));
 const methods=[...new Set([...validator.matchAll(/method [!=]= "([^"]+)"/g)].map(m=>m[1]))].sort();
 assert.deepEqual(methods,['desktop.spaces.acknowledge','desktop.spaces.apply','desktop.spaces.armPairing','desktop.spaces.preview','desktop.spaces.status','sync.beginPairing','sync.cancelPairing','sync.disable','sync.enable','sync.joinWithCode','sync.pairingState','sync.preflight','sync.setPairingWatch','sync.setSyncTabs','sync.setThisDeviceName','sync.startNew','sync.status','sync.syncNow']);
 assert.match(validator,/value\.size\(\) == 2/);
 assert.match(validator,/selections->size\(\) > 25/);
 assert.match(validator,/\*mode != "copy" && \*mode != "rejoin"/);
 assert.ok(!methods.some(method=>/push|rowDone|hold|sharedContext/.test(method)));
 assert.match(validator,/sync\.pairingState"\) return args\.empty\(\)/);
 assert.match(validator,/method == "sync\.disable" \? "wipeRemote" : "local"/);
 assert.match(validator,/args\.size\(\) == 1 && args\[0\]\.is_dict\(\) && args\[0\]\.GetDict\(\)\.size\(\) == 1/);
 assert.match(validator,/FindBool\(key\)\.has_value\(\)/);
 assert.match(validator,/sync\.setSyncTabs"\) return args\.size\(\) == 1 && args\[0\]\.is_bool\(\)/);
 assert.match(validator,/sync\.setPairingWatch"\) return args\.size\(\) == 1 && args\[0\]\.is_bool\(\)/);
 assert.match(validator,/sync\.setThisDeviceName"\) return args\.size\(\) == 1 && args\[0\]\.is_string\(\)/);
 assert.match(validator,/UTF8ToUTF16\(args\[0\]\.GetString\(\)\)\.size\(\) <= 80/);
 assert.match(native,/args\[1\]\.is_bool\(\)/);
 assert.ok(native.includes('DesktopSyncService::ForProfile(SyncProfile())'));
 assert.ok(native.includes('return owner->browser->GetProfile();'));
 assert.match(native,/weak_factory_\.InvalidateWeakPtrs\(\)/);
 assert.match(native,/ChromiumSettingsHandler::~ChromiumSettingsHandler\(\) \{ StopSyncObservation\(\); \}/);
 assert.match(native, /Set\("status", base::Value\(\)\)/);
});

test('Sync routes, menu, template resources and strings are wired in reconstructed patches',()=>{
 assert.match(read(path.join(web,'route.ts')),/r\.BLANC_SYNC = r\.BASIC\.createSection\(\s*'\/sync', 'blancSync'/);
 assert.match(read(path.join(web,'settings_main/settings_main.html')),/settings-blanc-sync-page/);
 assert.match(read(path.join(web,'settings_menu/settings_menu.html')), /id="blancSync" href="\/sync"/);
 const build=read(path.join(web,'BUILD.gn'));
 for(const file of ['blanc_sync_page.ts','blanc_sync_page.css'])assert.ok(build.includes(`"blanc_sync_page/${file}"`));
 const html=read(path.join(web,'blanc_sync_page/blanc_sync_page.html'));
 for(const match of html.matchAll(/\$i18n\{(blancSync\w+)\}/g))assert.ok(strings.has(match[1]),match[1]);
 assert.doesNotMatch(ui,/querySelector\(['"]#/);
 assert.match(html,/syncFirstUploadContinue/);assert.match(html,/syncFirstUploadNotNow/);
 const startup=read(path.join(root,'chromium/blanc/browser/ui/blanc_prototype_ui.cc'));
 assert.match(startup,/DesktopSyncService::ForProfile\(browser->GetProfile\(\)\)/);
 assert.ok(startup.includes('{"sync", "sync"}'));
});

test('invalid code blocks submission and reports shipping copy; valid code clears it',{skip:!ts},()=>{
 const {el}=harness();el.$.syncCode.value='K7MR-4PX';el.onCodeInput_();
 assert.equal(el.codeValid_,false);assert.equal(el.notice_,'That doesn’t look like a code. Check it and try again.');
 el.$.syncCode.value='K7MR-4PX2';el.onCodeInput_();assert.equal(el.codeValid_,true);assert.equal(el.notice_,'');
});

test('Turn on Sync submits only the default name and no passphrase, once',{skip:!ts},async()=>{
 const {el,calls,api,state,off}=harness();
 api.call=async(method,args)=>{calls.push({method,args});return {ok:true,status:{...off,enabled:true,handle:'My Blanc',origin:'generated'}};};
 api.state=async()=>({...state,status:{...off,enabled:true,handle:'My Blanc',origin:'generated'}});
 el.onTurnOnClick_();el.onTurnOnClick_();await settle(el);
 assert.equal(calls.length,1);assert.equal(calls[0].method,'sync.startNew');
 assert.equal(JSON.stringify(calls[0].args),'[{"handle":"My Blanc"}]');
 assert.equal(el.state_.status.enabled,true);
});

test('passphrase sign-in refuses notFound without enabling or creating an account',{skip:!ts},async()=>{
 const {el,calls,api}=harness();el.path_='passphrase';el.$.syncHandle.value='Existing';el.$.syncPassphrase.value='a long passphrase';el.onCredentialsInput_();
 api.call=async(method,args)=>{calls.push({method,args:structuredClone(args)});return {ok:true,outcome:'notFound'};};
 el.onSetupSubmit_({preventDefault(){}});await settle(el);
 assert.equal(calls.length,1);assert.equal(calls[0].method,'sync.preflight');
 assert.match(el.notice_,/Nothing was found/);assert.equal(el.$.syncPassphrase.value,'');
});

test('found passphrase sign-in enables; closing Settings during preflight prevents enable',{skip:!ts},async()=>{
 for(const close of [false,true]){
  const {el,calls,api}=harness();el.path_='passphrase';el.$.syncHandle.value='Existing';el.$.syncPassphrase.value='a long passphrase';el.onCredentialsInput_();
  let finish;api.call=async(method)=>{calls.push(method);return method==='sync.preflight'?await new Promise(r=>{finish=r;}):{ok:true};};
  el.onSetupSubmit_({preventDefault(){}});
  if(close){el.isConnected=false;el.disconnectedCallback();}
  finish({ok:true,outcome:'found'});
  if(close)await new Promise(resolve=>setImmediate(resolve));else await settle(el);
  assert.deepEqual(calls,close?['sync.preflight','sync.setPairingWatch']:['sync.preflight','sync.enable']);
 }
});

test('unknown status does not act; first-upload accept and decline wait for service inventory',{skip:!ts},async()=>{
 const {el,calls,state}=harness();el.state_={...state,status:null};el.onTurnOnClick_();assert.equal(calls.length,0);
 el.state_={...state,status:{...state.status,enabled:true},pendingFirstUpload:3};
 assert.match(el.firstUploadText_(),/^3 favorites/);
 el.onAcceptUploadClick_();el.onDeclineUploadClick_();await new Promise(r=>setImmediate(r));
 assert.deepEqual(calls,[{confirm:true}]);assert.equal(el.confirming_,true);
 el.onSyncChanged_({event:'first-upload',value:{count:4},pendingFirstUpload:4});
 assert.equal(el.confirming_,false);el.onDeclineUploadClick_();await new Promise(r=>setImmediate(r));
 assert.deepEqual(calls,[{confirm:true},{confirm:false}]);
 el.onSyncChanged_({event:'first-upload',value:{count:0},pendingFirstUpload:0});assert.equal(el.state_.pendingFirstUpload,0);
});

// beta.2: a runner timeout reported before the first status read left status unknown, and the
// page said "Could not check sync" twice (status line and notice). An event with no status reads
// it; a notice that only repeats the status line is not shown again.
test('an error before any status reads the status instead of showing it unknown',{skip:!ts},async()=>{
 const {el,state}=harness();el.state_=null;
 state.status={...state.status,enabled:true,lastSyncedAt:1};
 el.onSyncChanged_({event:'desktop-error',value:'runner-timeout',pendingFirstUpload:0});
 for(let n=0;n<20&&!el.state_?.status;n++)await new Promise(resolve=>setImmediate(resolve));
 assert.equal(el.state_?.status?.enabled,true,'status read after the error event');
 assert.equal(el.notice_,strings.get('blancSyncCheckFailed'));
});
// beta.3's real-iPhone pass: after joining with a code nothing said what happened. Shipping
// says "Connected to “{name}”. Pulling your favorites and settings now." (settings.sync.connectedTo).
test('joining with a code says which sync it connected to, as shipping does',{skip:!ts},async()=>{
 const {el,api,calls}=harness();
 api.call=async(method,args=[])=>{calls.push({method,args});return {ok:true,status:{enabled:true,handle:'Family',lastSyncedAt:0,lastError:null}};};
 el.path_='code';el.codeValid_=true;el.$.syncCode.value=' 123-456 ';
 el.onSetupSubmit_({preventDefault(){}});await settle(el);
 assert.deepEqual(calls.map(c=>c.method),['sync.joinWithCode']);
 assert.equal(el.joined_,'Connected to “Family”. Pulling your favorites and settings now.');
 const html=read(path.join(web,'blanc_sync_page/blanc_sync_page.html'));
 assert.match(html,/<p id="syncJoined" role="status" \?hidden="\$\{!this\.joined_\}">\$\{this\.joined_\}<\/p>/);
 api.call=async()=>({ok:false,error:'offline'});el.path_='code';el.codeValid_=true;el.$.syncCode.value='123-456';
 el.onSetupSubmit_({preventDefault(){}});await settle(el);
 assert.equal(el.joined_,'','a later failed attempt clears the note');
});
test('the status line and the notice never say the same thing twice',()=>{
 const html=read(path.join(web,'blanc_sync_page/blanc_sync_page.html'));
 assert.match(html,/id="syncError"[^>]*\?hidden="\$\{!this\.notice_ \|\| this\.notice_ === this\.statusText_\(\)\}"/);
});
test('all target Gherkin steps resolve without launching the runner',async()=>{
 const {matchStep}=await import('../tests/steps.mjs');
 const {missingAdapters}=await import('../tests/world.mjs');
 const inventory=JSON.parse(read(path.join(root,'chromium/scenarios/inventory.json')));
 for(const line of [26,38,49,56,73,150,181,199,210]){
  const scenario=inventory.scenarios.find(s=>s.id===`spec/acceptance/sync.feature:${line}`);
  assert.ok(scenario);
  for(const c of scenario.cases)for(const step of c.steps){
   const match=matchStep(step.text);assert.ok(match,step.text);
   assert.deepEqual(missingAdapters(match.definition),[],step.text);
  }
 }
});

test('runner code rejection remains visible without changing account state',{skip:!ts},async()=>{
 const {el,api,off}=harness();el.path_='code';el.$.syncCode.value='K7MR-4PX2';el.onCodeInput_();
 api.call=async()=>({ok:false,error:'pair-not-found',status:off});
 el.onSetupSubmit_({preventDefault(){}});await settle(el);
 assert.equal(el.state_.status.enabled,false);
 assert.equal(el.notice_,'That code isn’t valid any more. Make a new one on your other device.');
});


test('explicit passphrase start enables while join still requires a found preflight',{skip:!ts},async()=>{
 const {el,calls,api}=harness();
 el.onChooseStartClick_();
 el.$.syncHandle.value='New account';el.$.syncPassphrase.value='a long passphrase';
 el.onCredentialsInput_();
 api.call=async(method)=>{calls.push(method);return {ok:true};};
 el.onSetupSubmit_({preventDefault(){}});await settle(el);
 assert.deepEqual(calls,['sync.enable']);
});

test('Shared Spaces opens local choices while checking and Cancel does not consent', {skip:!ts}, async()=>{
 const {el,api,calls}=harness();let answer;
 const choice={id:'work',name:'Work',checked:true,shared:false,mode:'copy',tabCount:2};
 api.call=async(method,args=[])=>{
  calls.push({method,args});
  if(method==='desktop.spaces.preview')return args[0]?.local?{ok:true,choices:[choice]}:new Promise(resolve=>{answer=resolve;});
  return {ok:true};
 };
 await el.onSpacesChooseClick_();
 assert.equal(el.spacesOpen_,true);assert.equal(el.spacesChecking_,true);assert.equal(el.choices_[0].checked,true);
 el.onSpacesCancelClick_();answer({ok:true,choices:[choice]});await el.spacesCheck_;
 assert.equal(el.spacesOpen_,false);assert.equal(calls.some(c=>c.method==='desktop.spaces.apply'),false);
});
test('cancelling a requested Shared Spaces save dismisses UI while the save continues', {skip:!ts}, async()=>{
 const {el,api,calls}=harness();let answer;
 const choice={id:'work',name:'Work',checked:true,shared:false,mode:'copy',tabCount:2};
 api.call=async(method,args=[])=>{
  calls.push({method,args});
  if(method==='desktop.spaces.preview')return args[0]?.local?{ok:true,choices:[choice]}:new Promise(resolve=>{answer=resolve;});
  if(method==='desktop.spaces.status')return {enabled:true};
  return {ok:true};
 };
 await el.onSpacesChooseClick_();const saving=el.onSpacesShareClick_();el.onSpacesCancelClick_();
 assert.equal(el.spacesOpen_,false);assert.match(el.notice_,/Uploading/);
 answer({ok:true,choices:[choice]});await saving;
 const apply=calls.filter(c=>c.method==='desktop.spaces.apply');assert.equal(apply.length,1);
 assert.equal(apply[0].args[0].selections[0].id,'work');assert.equal(el.spacesSaving_,false);
});
test('a changed remote choice requires renewed consent before a Shared Spaces save', {skip:!ts}, async()=>{
 const {el,api,calls}=harness();let answer;
 const choice={id:'work',name:'Work',checked:true,shared:false,mode:'copy',tabCount:2};
 api.call=async(method,args=[])=>{
  calls.push({method,args});
  if(method==='desktop.spaces.preview')return args[0]?.local?{ok:true,choices:[choice]}:new Promise(resolve=>{answer=resolve;});
  return {ok:true};
 };
 await el.onSpacesChooseClick_();const saving=el.onSpacesShareClick_();
 answer({ok:true,choices:[{...choice,mode:'rejoin'}]});await saving;
 assert.match(el.spacesError_,/confirm again/);assert.equal(calls.some(c=>c.method==='desktop.spaces.apply'),false);
});
