import {assert,record,native,key,text,until,pause,favorites,evaluate,goto,click,targets,connect,active,snapshot} from './lib.mjs';
const CMD=1048576,url='http://127.0.0.1:8786/NativeKeys';
try {
 native('key',53); await goto(url); await until(async()=>(await active()).url===url,'native navigation');
 key(37,CMD); await pause(400); assert.equal(await evaluate('document.getElementById("overlay").contentDocument.activeElement.id'),'addressInput');
 const saved=(await favorites()).some(t=>t.url===url); key(2,CMD); await until(async()=>(await favorites()).some(t=>t.url===url)!==saved,'Cmd-D input focus');
 key(53); key(37,CMD); await pause(350); assert.equal(await evaluate('document.getElementById("overlay").contentDocument.activeElement.id'),'addressInput');
 key(15,CMD); await pause(700); assert.equal((await active()).url,url);
 key(53); await pause(400); const c=await connect((await targets()).find(t=>t.url===url));
 await until(async()=>{const b=(await c.send('Browser.getWindowForTarget')).bounds;const r=await c.eval('(()=>{const r=document.querySelector("#typing").getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()');native('click',b.left+r.x,b.top+r.y);await pause(350);return await c.eval('document.activeElement.id==="typing"')},'physical input focus');
 text('before'); await until(async()=>await c.eval('document.querySelector("#typing").value')==='before','typed before');
 key(37,CMD);await pause(300);key(53);text('after');await pause(250);
 assert.equal(await c.eval('document.querySelector("#typing").value'),'beforeafter');c.close();
 const count=(await snapshot()).tabs.length; key(17,CMD);await until(async()=>(await snapshot()).tabs.length===count+1,'Cmd-T');
 await goto('http://127.0.0.1:8786/NativeSecond');await goto('http://127.0.0.1:8786/NativeThird');
 key(37,CMD);await pause(300);key(33,CMD);await until(async()=>(await active()).url.endsWith('/NativeSecond'),'Cmd-[ from Island');key(53);
 record('native-keyboard-pass',{checks:['Cmd-L address focus','Cmd-A replace and Enter navigation','Cmd-D with Island input focus','Escape then Cmd-L','Cmd-R from Island','Escape returns page typing','Cmd-T','Cmd-[ from Island']});
}catch(e){record('native-keyboard-failure',{error:e.stack});throw e;}
