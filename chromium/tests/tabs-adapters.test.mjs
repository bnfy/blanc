import test from 'node:test';
import assert from 'node:assert/strict';
import {blockableHostname,closedSummary,runtimeRecord,MENU_KEYS,strict} from './adapters/tabs.mjs';
import {UndefinedNativeAdapterError} from './lib/adapters.mjs';
test('exception hostnames follow shipping blockableHostname',()=>{
 assert.equal(blockableHostname('https://WWW.Example.com/x'),'example.com');
 assert.equal(blockableHostname('http://127.0.0.1:9/site/a'),'127.0.0.1');
 assert.equal(blockableHostname('chrome://newtab/'),null);
 assert.equal(blockableHostname('not a url'),null);
});
test('closed summaries keep only what TabRestoreService reports',()=>{
 const s=strict(closedSummary({id:4,title:'t',url:'',tabCount:3}),'closedEntry');
 assert.deepEqual({...s},{id:'4',url:null,tabCount:3});
 assert.throws(()=>s.held,UndefinedNativeAdapterError);
 assert.throws(()=>s.kind,UndefinedNativeAdapterError);
});
test('window runtimes project one native snapshot without guessed fields',()=>{
 const r=strict(runtimeRecord('primary',{tabs:[{id:1,url:'chrome://newtab/',private:false}],activeTabId:1,glanceTabId:null,groups:[{id:'g',name:'Work',collapsed:false,color:''}]}),'windowRuntime');
 assert.deepEqual(r.tabOrder,['1']);assert.equal(r.activeTabId,'1');assert.equal(r.tabs[0].url,'blanc://newtab/');
 assert.equal(r.groups[0].color,null);
 assert.throws(()=>r.closedEntryCount,UndefinedNativeAdapterError);
});
test('tab-menu ids map to i18n keys only',()=>{
 for(const keys of Object.values(MENU_KEYS))assert.ok(keys.every(k=>/^[a-zA-Z]+\.[a-zA-Z]+$/.test(k)));
});
