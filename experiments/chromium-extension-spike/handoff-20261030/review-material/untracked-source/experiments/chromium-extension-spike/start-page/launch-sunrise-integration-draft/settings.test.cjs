const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname,'appearance-settings.js'),'utf8');
const flush = async () => { for(let i=0;i<6;i++) await Promise.resolve(); };
function fixture() {
  const messages=[], timers=new Map(); let nextTimer=0, change;
  const toggle={checked:false,disabled:true,addEventListener(name,fn){assert.equal(name,'change');change=fn;}};
  const status={textContent:''}, window={};window.top=window;
  const context={window,location:{origin:'chrome://blanc-prototype',pathname:'/appearance-settings.html'},
    document:{getElementById(id){return id==='launch-sunrise'?toggle:status;}},
    chrome:{send(channel,args){messages.push({channel,args});}},
    setTimeout(fn){const id=++nextTimer;timers.set(id,fn);return id;},
    clearTimeout(id){timers.delete(id);},console};
  vm.runInNewContext(source,context);
  return {toggle,status,messages,timers,window,change:()=>change(),
    reply(index,ok,value){const m=messages[index];window.blancSunriseSettingsReply(m.args[0],ok,value);}};
}
(async()=>{
  let f=fixture();assert.equal(f.messages[0].args[1],'get');assert.equal(f.toggle.disabled,true);
  f.reply(0,true,{enabled:false,modifiable:true,revision:'0'});await flush();
  assert.equal(f.toggle.checked,false);assert.equal(f.toggle.disabled,false);
  f.toggle.checked=true;f.change();assert.equal(f.toggle.disabled,true);assert.equal(f.messages[1].args[1],'set');assert.equal(f.messages[1].args[2][0],true);
  f.window.blancSunriseSettingsChanged('1');f.reply(1,true,{enabled:true,modifiable:true,persisted:true,revision:'1'});await flush();
  assert.equal(f.messages[2].args[1],'get');f.reply(2,true,{enabled:true,modifiable:true,revision:'1'});await flush();
  assert.equal(f.toggle.checked,true);assert.equal(f.toggle.disabled,false);assert.equal(f.status.textContent,'Saved on this device.');
  console.log('PASS confirmed disk readback clears uncertainty, including after notification');

  f=fixture();f.reply(0,true,{enabled:true,modifiable:false,revision:'0'});await flush();
  assert.equal(f.toggle.checked,true);assert.equal(f.toggle.disabled,true);assert.match(f.status.textContent,/managed/);
  console.log('PASS managed preference is disabled');

  f=fixture();f.reply(0,true,{enabled:false,modifiable:true,revision:'0'});await flush();f.toggle.checked=true;f.change();
  f.reply(1,false,'write failed');await flush();assert.equal(f.messages[2].args[1],'get');
  f.reply(2,true,{enabled:false,modifiable:true,revision:'0'});await flush();
  assert.equal(f.toggle.checked,false);assert.match(f.status.textContent,/could not be confirmed/);
  console.log('PASS failed write rereads effective value without claiming persistence');

  f=fixture();f.reply(0,true,{enabled:false,modifiable:true,revision:'0'});await flush();f.toggle.checked=true;f.change();
  assert.equal(f.timers.size,1);[...f.timers.values()][0]();await flush();assert.equal(f.messages[2].args[1],'get');
  f.reply(2,true,{enabled:true,modifiable:true,revision:'0'});await flush();assert.equal(f.toggle.checked,true);assert.match(f.status.textContent,/could not be confirmed/);
  f.reply(1,true,{enabled:false,modifiable:true,revision:'0'});await flush();assert.equal(f.toggle.checked,true);
  console.log('PASS timed-out write rereads and ignores late response');

  const a=fixture(),b=fixture();a.reply(0,true,{enabled:false,modifiable:true,revision:'0'});b.reply(0,true,{enabled:false,modifiable:true,revision:'0'});await flush();
  a.toggle.checked=true;a.change();a.window.blancSunriseSettingsChanged('1');b.window.blancSunriseSettingsChanged('2');
  a.reply(1,true,{enabled:true,modifiable:true,persisted:true,revision:'2'});b.reply(1,true,{enabled:true,modifiable:true,revision:'2'});await flush();
  a.reply(2,true,{enabled:true,modifiable:true,revision:'2'});await flush();assert.equal(a.status.textContent,'Saved on this device.');
  b.toggle.checked=false;b.change();a.window.blancSunriseSettingsChanged('3');b.window.blancSunriseSettingsChanged('4');
  assert.match(a.status.textContent,/could not be confirmed/);a.reply(3,true,{enabled:false,modifiable:true,revision:'4'});
  b.reply(2,false,'write failed');await flush();
  assert.equal(a.toggle.checked,false);assert.match(a.status.textContent,/could not be confirmed/);
  console.log('PASS another window’s pending or failed write invalidates the earlier saved indication');

  f=fixture();f.reply(0,true,{enabled:false,modifiable:true,revision:'0'});await flush();f.toggle.checked=true;f.change();
  f.window.blancSunriseSettingsChanged('1');f.window.blancSunriseSettingsChanged('2');
  f.reply(1,true,{enabled:true,modifiable:true,persisted:true,revision:'1'});await flush();
  assert.notEqual(f.status.textContent,'Saved on this device.');assert.equal(f.messages[2].args[1],'get');
  f.reply(2,true,{enabled:false,modifiable:true,revision:'2'});await flush();
  assert.equal(f.toggle.checked,false);assert.match(f.status.textContent,/could not be confirmed/);
  console.log('PASS concurrent newer revision rejects delayed stale persisted reply');

  f=fixture();f.window.blancSunriseSettingsChanged('1');f.reply(0,true,{enabled:false,modifiable:true,revision:'0'});await flush();
  assert.equal(f.messages[1].args[1],'get');f.reply(1,true,{enabled:true,modifiable:true,revision:'1'});await flush();assert.equal(f.toggle.checked,true);
  console.log('PASS notification outrunning initial read triggers fresh revision');
  console.log('7 isolated settings-controller checks passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
