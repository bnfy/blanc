import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const script = fs.readFileSync(new URL('./native/webstore-promotion.js', import.meta.url), 'utf8');
function run({origin='https://chromewebstore.google.com',href='https://www.google.com/chrome/?utm_medium=material-callout&utm_campaign=cws',input=false,links=1,frame=false,shell=false,extraControl=false}={}) {
  const writes=[];
  const body={getAttribute:()=>null};
  const box={parentElement:body,textContent:'Switch to Chrome? No thanks Yes',style:{setProperty:(...v)=>writes.push(v)},querySelector:s=>s==='input,select,textarea'?input:true,querySelectorAll:()=>Array(links)};
  if(shell) {
    const decoration={nodeType:1,textContent:'',matches:()=>extraControl,querySelector:()=>null};
    box.parentElement={getAttribute:()=> 'dialog',childNodes:[decoration,box],style:{setProperty:(...v)=>writes.push(['shell',...v])}};
  }
  const link={href,parentElement:box};
  const window={};
  const context={location:{origin},window,top:frame?{}:window,URL,document:{body,documentElement:{},querySelectorAll:s=>s==='a[href]'?[link]:[]},MutationObserver:class{observe(){}}};
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

test('removes empty promotion shell without hiding mixed controls',()=>{
  assert.equal(run({shell:true})[0][0],'shell');
  assert.equal(run({shell:true,extraControl:true})[0][0],'display');
});

function inline({extra=false, text='Switch to Chrome to install extensions and themesInstall Chrome', origin='https://chromewebstore.google.com', frame=false}={}) {
  const writes=[]; const button={}; const body={};
  const box={parentElement:body,textContent:text,querySelectorAll:()=>extra?[button,{}]:[button],style:{setProperty:(...v)=>writes.push(v)}};
  button.parentElement=box;
  const window={};
  vm.runInNewContext(script,{location:{origin},window,top:frame?{}:window,URL,document:{body,documentElement:{},querySelectorAll:s=>s.startsWith('button[')?[button]:[]},MutationObserver:class{observe(){}}});
  return writes;
}
test('hides the complete exact inline banner',()=>assert.deepEqual(inline(),[['display','none','important']]));
test('retains mixed installation/search/sign-in containers and changed copy',()=>{
  assert.equal(inline({extra:true}).length,0);
  assert.equal(inline({text:'Switch to Chrome to install extensions and themesInstall ChromeAdd to Chrome'}).length,0);
});
test('inline rule is limited to top-level Store origin',()=>{
  assert.equal(inline({origin:'https://example.com'}).length,0);
  assert.equal(inline({frame:true}).length,0);
});

 test('relabels installation text and accessibility without replacing button',()=>{
 const node={nodeValue:'Add to Chrome'}; const attrs={};
 const button={get textContent(){return node.nodeValue;},setAttribute:(k,v)=>attrs[k]=v,getAttribute:k=>attrs[k]??null,removeAttribute:k=>delete attrs[k],disabled:true};
 const window={}; let callback;
 vm.runInNewContext(script,{location:{origin:'https://chromewebstore.google.com'},window,top:window,URL,NodeFilter:{SHOW_TEXT:4},document:{documentElement:{},querySelectorAll:s=>s==='button'?[button]:[],createTreeWalker:()=>{let read=false;return{nextNode:()=>read?null:(read=true,node)};}},MutationObserver:class{constructor(cb){callback=cb;}observe(){}}});
 assert.equal(node.nodeValue,'Add to Blanc');assert.equal(attrs['aria-label'],'Add to Blanc');assert.equal(button.disabled,true);
 callback();assert.equal(node.nodeValue,'Add to Blanc');
 node.nodeValue='Remove from Chrome';callback();assert.equal(node.nodeValue,'Remove from Blanc');assert.equal(attrs['aria-label'],'Remove from Blanc');
 });
