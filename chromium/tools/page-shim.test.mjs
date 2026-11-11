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
