// The Chrome Web Store's prompts to switch to Chrome are hidden in Blanc
// (blanc_webstore_promotion.h), nothing else: the "Switch to Chrome?" card
// (heading, one sentence, No thanks / Yes) goes, also when it arrives late;
// the listing stays and its install button reads "Add to Blanc"; a box with
// the same words but any other control is left alone. The rule only runs on
// chromewebstore.google.com, so this runs its script, with only that origin
// check removed, on the fixture's local page over Store-shaped markup.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {NativeFixture} from './lib/fixture.mjs';
import {installDriver} from './lib/test-driver.mjs';
import {assertRendering,assertNodeRuntime} from './lib/render-guard.mjs';
import {createWorld} from './world.mjs';
import {jsLiteral} from './lib/js-literal.mjs';
const [configFile,out]=process.argv.slice(2),config=JSON.parse(fs.readFileSync(configFile));
assertNodeRuntime();assert.equal(fs.existsSync(out),false);fs.mkdirSync(out,{recursive:true});
const here=path.dirname(fileURLToPath(import.meta.url));
const header=fs.readFileSync(path.join(here,'..','blanc','browser','ui','blanc_webstore_promotion.h'),'utf8');
let rule=header.slice(header.indexOf('uR"BLANC(')+'uR"BLANC('.length,header.indexOf(')BLANC"'));
const originCheck="location.origin !== 'https://chromewebstore.google.com' || ";
assert.equal(rule.split(originCheck).length,2,'the rule checks the Store origin once');
rule=rule.replace(originCheck,'');
const f=new NativeFixture(),w=createWorld(f),result={candidate:config.candidate,checks:[]};
const parent=fs.mkdtempSync(path.join(os.tmpdir(),'blanc-store-promo-'));
const CARD=`<div role="dialog" class="shell"><div class="card"><img alt="" src="data:,"><div><h2>Switch to Chrome?</h2>
 <p>Google recommends using Chrome when using extensions and themes.</p><div><button>No thanks</button> <a href="https://www.google.com/chrome/">Yes</a></div></div></div></div>`;
try{
 await f.launch(config,path.join(parent,'fixture'),{testHooks:true,diskAssets:process.env.DISK_ASSETS==="1"});
 await installDriver(f.host);await assertRendering(e=>f.host.eval(e));await w.reset();
 await w.native('createTab',[f.base+'/store']);
 const target=await w.waitFor(async()=>(await f.targets()).find(t=>t.type==='page'&&t.url.startsWith(f.base)),Boolean,'the local page',10000);
 const page=await f.connectTarget(target);
 await w.waitFor(()=>page.eval(`document.readyState==='complete'&&!!document.body&&!!document.documentElement`).catch(()=>false),Boolean,'the local page loaded',10000);
 await page.eval(`(()=>{document.body.innerHTML=${jsLiteral(`<main id="listing"><h1>Bookmark Sidebar</h1><button id="install"><span>Add to Chrome</span></button></main>
  <div id="first">${CARD}</div>
  <div id="mixed"><h2>Switch to Chrome?</h2><p>Google recommends using Chrome when using extensions and themes.</p><button>No thanks</button><button>Yes</button><input aria-label="Search"></div>`)};return 1;})()`);
 await page.eval(`(()=>{${rule};return 1;})()`);
 const shown=sel=>page.eval(`(()=>{const e=document.querySelector(${jsLiteral(sel)});return !!e&&getComputedStyle(e).display!=='none'&&e.getBoundingClientRect().height>0;})()`);
 await w.waitFor(()=>shown('#first .shell'),v=>v===false,'the card hidden',3000);
 assert.equal(await shown('#first .card'),false,'the card is hidden (with its dialog shell)');
 assert.equal(await shown('#listing'),true,'the listing stays');
 assert.equal(await page.eval(`document.getElementById('install').textContent.trim()`),'Add to Blanc','the install button reads Add to Blanc');
 assert.equal(await page.eval(`document.getElementById('install').getAttribute('aria-label')`),'Add to Blanc');
 result.checks.push('the Switch to Chrome? card is hidden; the listing stays and its button reads Add to Blanc');
 assert.equal(await shown('#mixed'),true,'a box with any other control is left alone');
 result.checks.push('a box with the same words but another control is left alone');
 await page.eval(`(()=>{const late=document.createElement('div');late.id='late';late.innerHTML=${jsLiteral(CARD)};document.body.append(late);return 1;})()`);
 await w.waitFor(()=>shown('#late .card'),v=>v===false,'the late card hidden',3000);
 result.checks.push('a card that arrives later is hidden too');
 fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,1));console.log(JSON.stringify(result));
}catch(e){result.error=String(e.stack||e);fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,1));console.log(JSON.stringify(result));process.exitCode=1;}
finally{await f.close();fs.rmSync(parent,{recursive:true,force:true});}
