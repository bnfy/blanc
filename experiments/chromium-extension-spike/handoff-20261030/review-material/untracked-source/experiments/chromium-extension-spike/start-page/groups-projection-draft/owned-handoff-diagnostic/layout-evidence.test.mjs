import {test} from 'node:test';import {strict as assert} from 'node:assert';import fs from 'node:fs';
import {remainingLayouts,verifyLayout,verifyBackground,verifyBackgroundBefore} from './layout-evidence.mjs';
const post={status:'window_unique',frontmost:true,owned_matches:1};
const good={groupId:'g',index:0,clickCount:1,callCount:1,click:{id:'g',trusted:true},observation:{args:['g'],result:true},raw:{requests:[{id:'1',groupId:'g'}],replies:[{id:'1',success:true,value:true}]},post,activeTabId:'first',firstId:'first'};
test('remaining layouts exclude already passed ledger',()=>assert.deepEqual(remainingLayouts,[['billboard','bbGroups'],['shelf','shGroups'],['tally','tlGroups']]));
test('layout verification requires trusted click, correlated native true reply and correct active tab',()=>{
 verifyLayout(good);
 for(const x of [{...good,clickCount:2},{...good,callCount:2},{...good,click:{id:'g',trusted:false}},{...good,raw:{requests:[{id:'1',groupId:'g'}],replies:[{id:'1',success:true,value:false}]}},{...good,raw:{requests:[{id:'1',groupId:'g'}],replies:[{id:'2',success:true,value:true}]}},{...good,post:{...post,frontmost:false}},{...good,activeTabId:'other'}])assert.throws(()=>verifyLayout(x));
});
test('background denial preserves the distinct control and the group plus both regular members',()=>{
 const snap={activeTabId:'control',groups:[{id:'g'}],tabs:[{id:'first',groupId:'g',private:false},{id:'second',groupId:'g',private:false}]};
 const b={denied:false,before:snap,after:snap,groupId:'g',controlId:'control',firstId:'first',secondId:'second',post};verifyBackground(b);verifyBackgroundBefore({snapshot:snap,...b});
 for(const x of [{...b,denied:true},{...b,after:{...snap,activeTabId:'first'}},{...b,controlId:'first'},{...b,post:{...post,frontmost:false}},{...b,before:{...snap,groups:[]}},{...b,after:{...snap,groups:[]}},{...b,before:{...snap,tabs:snap.tabs.slice(1)}},{...b,after:{...snap,tabs:[snap.tabs[0],{...snap.tabs[1],groupId:'other'}]}},{...b,after:{...snap,tabs:[snap.tabs[0],{...snap.tabs[1],private:true}]}}])assert.throws(()=>verifyBackground(x));
 assert.throws(()=>verifyBackgroundBefore({snapshot:{...snap,groups:[]},...b}));
});
test('fixture uses guarded interactions and native background call without ledger repetition',()=>{
 const s=fs.readFileSync(new URL('../browser-check-groups-layouts-foreground-diagnostic.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(s,/Page\.bringToFront|handoff:choose_point/);
 assert.match(s,/const layouts=remainingLayouts/);assert.match(s,/events\.clicks\[index\]/);assert.match(s,/events\.calls\[index\]/);assert.match(s,/nativeGroupRequest\(start\.page,'focusGroup',\[groupId\],true\)/);
 assert.match(s,/await guardedApi\('renameGroup',groupId,'renamed'\)/);assert.match(s,/outsideVisiblePair\(background,start\.id,control\.id\)/);assert.match(s,/outsideVisiblePair\(afterDenied,start\.id,control\.id\)/);assert.match(s,/document\.visibilityState!=='hidden'/);
 assert.match(s,/requireOwnedForeground\(navCheck\)/);assert.match(s,/requireOwnedForeground\(keyCheck\)/);assert.match(s,/requireOwnedForeground\(launchCheck,\{requireBirth:true\}\)/);
 assert.match(s,/async function guardedApi\(name,\.\.\.args\).*requireOwnedForeground\(check\);return api\(name,\.\.\.args\)/);
});
