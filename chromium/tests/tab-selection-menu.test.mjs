import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../blanc/island/adapter.js',import.meta.url),'utf8');
function fixture({selected=['a','b','c'],target='a',pill=false}={}) {
 class Element {
  constructor(tag){this.tag=tag;this.children=[];this.dataset={};this.style={};this.attrs={};this.listeners={};this.offsetWidth=200;this.offsetHeight=300;}
  setAttribute(key,value){this.attrs[key]=value;}
  addEventListener(name,fn){this.listeners[name]=fn;}
  append(...children){this.children.push(...children);}
  replaceChildren(...children){this.children=children;}
  remove(){this.removed=true;}
  focus(){}
  querySelectorAll(){return this.children.filter(el=>el.tag==='button'&&!el.disabled);}
  querySelector(){return this.querySelectorAll()[0];}
 }
 const listeners={},body=new Element('body'),calls=[];
 const state={tabs:['a','b','c'].map(id=>({id,title:id,url:'https://example.test/'+id})),groups:[],splits:[],activeTabId:'c',selectedTabIds:selected};
 const api={getAllTabs:async()=>state,onOverlayHide:()=>{},
  selectedTabsMenuState:async()=>({canPlace:true,canGroup:true,canQuiet:false,canReload:true,canCopy:true}),
  listWorkspaces:async()=>({items:[{id:'one',name:'One',active:true},{id:'reading',name:'Reading'}]}),
  prepareTabMenu:async id=>calls.push(['prepare',id]),
  runSelectedTabsAction:async(...args)=>calls.push(args)};
 const document={body,activeElement:null,createElement:tag=>new Element(tag),addEventListener:(name,fn)=>{listeners[name]=fn;}};
 const parent={BlancPrototypeHost:{apiForDocument:()=>api,notice:message=>{throw Error(message);}}};
 const window={addEventListener:()=>{},blancI18n:{t:(key,values)=>key==='tabsMenu.header'?`${values.count} tabs`:key}};
 vm.runInNewContext(source,{window,parent,document,location:{origin:'chrome://blanc-prototype',pathname:'/overlay.html'},innerWidth:1000,innerHeight:800,Promise,setTimeout});
 const row={dataset:{tabId:target},closest:selector=>selector.includes('.tab-row')?row:null};
 const event={preventDefault(){},clientX:20,clientY:30,target:{closest:selector=>selector==='[data-tab-id]'?(pill?null:row):selector==='#islandPill'&&pill?{}:null}};
 return {open:()=>listeners.contextmenu(event),body,calls};
}
test('right-clicking a selected row builds only the several-tab menu',async()=>{
 const f=fixture();await f.open();const menu=f.body.children.at(-1);
 assert.equal(menu.attrs['aria-label'],'3 tabs');
 assert.equal(menu.children[0].textContent,'3 tabs');
 assert.ok(menu.children.some(b=>b.dataset.action==='batch-pin'));
 assert.equal(menu.children.find(b=>b.dataset.action==='batch-quiet').disabled,true);
 assert.equal(menu.children.find(b=>b.dataset.action==='batch-close').disabled,true);
 assert.ok(!menu.children.some(b=>/Duplicate|Rename/.test(b.textContent)));
 menu.children.find(b=>b.dataset.action==='batch-pin').listeners.click();
 await Promise.resolve();assert.deepEqual(f.calls,[['batch-pin',undefined]]);
});
test('the Space submenu disables the current Space and sends its target id',async()=>{
 const f=fixture();await f.open();const menu=f.body.children.at(-1);
 menu.children.find(b=>b.dataset.action==='batch-space').listeners.click();
 assert.equal(menu.children.find(b=>b.textContent==='One').disabled,true);
 menu.children.find(b=>b.textContent==='Reading').listeners.click();
 await Promise.resolve();
 assert.deepEqual(JSON.parse(JSON.stringify(f.calls)),[['batch-space-move',{workspaceId:'reading'}]]);
});
test('an unselected row replaces selection and opens the ordinary menu',async()=>{
 const f=fixture({selected:['b','c']});await f.open();
 assert.deepEqual(f.calls,[['prepare','a']]);
 const menu=f.body.children.at(-1);
 assert.ok(menu.children.some(b=>b.textContent==='Duplicate'));
 assert.ok(!menu.children.some(b=>b.dataset.action==='batch-pin'));
});
test('the resting pill always keeps its ordinary one-tab menu',async()=>{
 const f=fixture({pill:true});await f.open();
 assert.deepEqual(f.calls,[]);
 assert.ok(f.body.children.at(-1).children.some(b=>b.textContent==='Duplicate'));
});
