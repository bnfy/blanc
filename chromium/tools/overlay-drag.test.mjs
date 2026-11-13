import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../blanc/island/host.js',import.meta.url),'utf8');
const fn=source.match(/  function acceptOverlayDragState\(ownerDocument, value\) \{[\s\S]*?\n  \}/)[0];
function guard(){
 const doc={},context=vm.createContext({overlay:{contentDocument:doc},opened:true,overlayMode:'panel',overlayDragging:false});
 const accept=vm.runInContext(fn+';acceptOverlayDragState',context);return {doc,context,accept};
}
test('only the live overlay document can change drag ownership',()=>{
 const {doc,context,accept}=guard();
 assert.equal(accept(doc,true),true);assert.equal(context.overlayDragging,true);
 assert.equal(accept({},false),false);assert.equal(context.overlayDragging,true);
 context.overlay.contentDocument={};assert.equal(accept(doc,false),false);
 assert.equal(accept(context.overlay.contentDocument,false),true);assert.equal(context.overlayDragging,false);
});
test('drag starts only in an open tab-list surface and accepts booleans',()=>{
 const {doc,context,accept}=guard();
 for(const mode of ['find','glance','spaces',null]){context.overlayMode=mode;assert.equal(accept(doc,true),false);}
 context.overlayMode='palette';context.opened=false;assert.equal(accept(doc,true),false);
 context.opened=true;for(const invalid of [1,'true',null,{}])assert.equal(accept(doc,invalid),false);
 assert.equal(accept(doc,true),true);context.overlayMode='find';assert.equal(accept(doc,false),true);
});
