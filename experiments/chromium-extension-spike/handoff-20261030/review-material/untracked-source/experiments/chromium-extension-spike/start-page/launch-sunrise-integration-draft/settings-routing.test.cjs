const fs=require('node:fs'), vm=require('node:vm'), assert=require('node:assert/strict'), path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'host-candidate.js'),'utf8');
const begin=source.indexOf('    openPage: async (name, section) => {');
const end=source.indexOf('    // Favorites and history',begin);
assert(begin>=0&&end>begin);
const body=source.slice(begin,end).replace(/^\s*openPage: /,'').replace(/,\s*$/,'');
let calls=[];const context={request:async(...v)=>{calls.push(v)},close:async()=>calls.push(['close']),refresh:async()=>calls.push(['refresh'])};
const fn=vm.runInNewContext('('+body+')',context);
(async()=>{
  for(const [section,want] of [[undefined,'chrome://blanc-prototype/settings-home.html'],['general','chrome://blanc-prototype/settings-home.html'],['appearance','chrome://blanc-prototype/appearance-settings.html'],['blocking','chrome://blanc-prototype/blocking-settings.html']]){
    calls=[];await fn('settings',section);assert.equal(calls[0][0],'createTab');assert.equal(calls[0][1][0],want);assert.equal(calls[1][0],'close');assert.equal(calls[2][0],'refresh');
  }
  calls=[];await assert.rejects(fn('settings','sync'));assert.equal(calls.length,0);
  const html=fs.readFileSync(path.join(__dirname,'settings-home.html'),'utf8');
  for(const href of ['chrome://blanc-prototype/appearance-settings.html','chrome://blanc-prototype/blocking-settings.html','chrome://settings/'])assert(html.includes(`href="${href}"`));
  console.log('PASS general Settings opens the hub; Appearance, Blocking and full Chromium Settings remain reachable; unsupported sections fail closed');
})().catch(e=>{console.error(e);process.exitCode=1;});
