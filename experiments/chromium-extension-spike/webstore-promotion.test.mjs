import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const script = fs.readFileSync(new URL('./native/webstore-promotion.js', import.meta.url), 'utf8');
function run({origin='https://chromewebstore.google.com',href='https://www.google.com/chrome/?utm_medium=material-callout&utm_campaign=cws',input=false,links=1,frame=false}={}) {
  const writes=[];
  const body={};
  const box={parentElement:body,textContent:'Switch to Chrome? No thanks Yes',style:{setProperty:(...v)=>writes.push(v)},querySelector:s=>s==='input,select,textarea'?input:true,querySelectorAll:()=>Array(links)};
  const link={href,parentElement:box};
  const window={};
  const context={location:{origin},window,top:frame?{}:window,URL,document:{body,documentElement:{},querySelectorAll:()=>[link]},MutationObserver:class{observe(){}}};
  vm.runInNewContext(script,context);
  return writes;
}
test('suppresses only the exact Chrome Store download campaign',()=>assert.equal(run().length,1));
test('does not run on other origins or child frames',()=>{
  assert.equal(run({origin:'https://chromewebstore.google.com.evil.test'}).length,0);
  assert.equal(run({frame:true}).length,0);
});
test('leaves ordinary download links and installation forms alone',()=>{
  assert.equal(run({href:'https://www.google.com/chrome/'}).length,0);
  assert.equal(run({input:true}).length,0);
  assert.equal(run({links:2}).length,0);
  assert.equal(run({href:'https://evil.test/chrome/?utm_medium=material-callout&utm_campaign=cws'}).length,0);
});
