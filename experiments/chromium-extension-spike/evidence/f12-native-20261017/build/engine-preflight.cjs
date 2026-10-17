const fs=require('fs'),vm=require('vm');
const c=vm.createContext({blancEncode:s=>new TextEncoder().encode(s),blancDecode:b=>new TextDecoder('utf8',{ignoreBOM:true}).decode(b)});
vm.runInContext(fs.readFileSync('/private/tmp/blanc-f12-native-assets/engine.js','utf8'),c,{timeout:30000});
let checked=0,diffs=[];
for(const dir of ['09','10'])for(const kind of ['regular','private']){
 const run=JSON.parse(fs.readFileSync(`/private/tmp/blanc-f12-expanded-${dir}/${kind}-a-run.json`));
 for(const r of run.records){const result=c.blancDecide(r.url,r.resourceType,r.referrer),expected=r.result.cancel?1:r.result.redirectURL?2:0;checked++;if(result!==expected)diffs.push({url:r.url,result,expected});}
}
console.log(JSON.stringify({scope:'utility bundle preflight in bare Node VM, not native acceptance',checked,diffs}));if(diffs.length)process.exitCode=1;
