import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {Locator} from '../tests/lib/page-shim.mjs';
test('nested locators stay inside the selected first row instead of finding a later row',async()=>{
 const name={textContent:'Later row'};
 const rows=[{querySelectorAll:()=>[]},{querySelectorAll:()=>[name]}];
 const page={evalExpression:code=>vm.runInNewContext(code,{document:{querySelectorAll:()=>rows}})};
 const all=new Locator(page,['.row']);
 assert.equal(await all.first().locator('.name').count(),0);
 assert.equal(await all.nth(1).locator('.name').textContent(),'Later row');
 assert.equal(await all.last().locator('.name').textContent(),'Later row');
});

test('button role uses accessible names and excludes hidden controls',async()=>{
 const button=(text,attrs={},hidden=false)=>({textContent:text,tagName:'BUTTON',
  getAttribute:key=>attrs[key]??null,closest:()=>hidden?{}:null,getClientRects:()=>[{}]});
 const rows=[button('Visible text',{'aria-label':'Save'}),button('Save',{},true),
  button('Ignored text',{'aria-labelledby':'first second'}),button('Save another')];
 const context={document:{querySelectorAll:()=>rows,getElementById:id=>({textContent:{first:'Save',second:'choice'}[id]})},getComputedStyle:()=>({visibility:'visible'})};
 const page={evalExpression:code=>vm.runInNewContext(code,context)};
 const root=new Locator(page,[]);
 assert.equal(await root.getByRole('button',{name:'Save',exact:true}).count(),1);
 assert.equal(await root.getByRole('button',{name:/^Save choice$/}).count(),1);
 assert.equal(await root.getByRole('button',{name:'save'}).count(),3);
 assert.equal(await root.getByRole('button',{name:'Save',exact:true,includeHidden:true}).count(),2);
 assert.throws(()=>root.getByRole('textbox'),/Unsupported role/);
});

function pointerFixture(height){
 const events=[],hits=[];
 const element={getBoundingClientRect:()=>({x:20,y:30,width:100,height}),scrollIntoView(){},contains:hit=>hit===element};
 const context={document:{querySelectorAll:()=>[element],elementFromPoint:(x,y)=>{hits.push([x,y]);return element;}},
  getComputedStyle:()=>({visibility:'visible',display:'block'}),requestAnimationFrame:fn=>fn(),setTimeout:()=>{}};
 const page={evalExpression:code=>vm.runInNewContext(code,context),
  keyboard:{down:async()=>{},up:async()=>{}},
  mouse:{move:async(x,y)=>events.push(['move',x,y]),down:async()=>events.push(['down']),up:async()=>events.push(['up'])}};
 return {locator:new Locator(page,['#target']),events,hits};
}
test('an explicit-position click refuses a zero-height target without clicking its backdrop',async()=>{
 const {locator,events}=pointerFixture(0);
 await assert.rejects(locator.click({position:{x:5,y:5},timeout:1}),/Timeout waiting.*visible/);
 assert.deepEqual(events,[]);
});
test('an explicit-position click hit-tests and dispatches the requested point after stability',async()=>{
 const {locator,events,hits}=pointerFixture(40);
 await locator.click({position:{x:5,y:5}});
 assert.ok(hits.length>=2);
 assert.ok(hits.every(([x,y])=>x===25&&y===35));
 assert.deepEqual(events,[['move',25,35],['down'],['up']]);
});
