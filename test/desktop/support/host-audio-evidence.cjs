'use strict';
const {execFileSync} = require('node:child_process');
// Read-only, disposable-runner diagnostics. Never restart coreaudiod, alter
// TCC, install a HAL driver, or weaken a signed application's policy here.
function hostAudioEvidence(exec = execFileSync) {
  const run=(file,args,limit=12000)=>{
    try {
      const output=exec(file,args,{encoding:'utf8',timeout:15000,maxBuffer:2*1024*1024});
      if(file==='/usr/bin/sudo'&&output.length>limit)return output.slice(0,limit-4000)+'\n[truncated]\n'+output.slice(-4000);
      return output.slice(-limit);
    }
    catch(error){return {code:error.code??null,status:error.status??null,signal:error.signal??null};}
  };
  const processes=run('/bin/ps',['-axo','pid=,comm='],512000);
  const audioRows=typeof processes==='string'?processes.split('\n').filter(row=>row.trim().endsWith('/coreaudiod')):[];
  const stacks=[];
  for(const row of audioRows.slice(0,2)){
    const pid=row.trim().split(/\s+/)[0];
    if(!/^\d+$/.test(pid))continue;
    stacks.push({pid:Number(pid),sample:run('/usr/bin/sudo',['-n','/usr/bin/sample',pid,'2','1','-file','/dev/stdout'],48000)});
  }
  return {
    devices:run('/usr/sbin/system_profiler',['SPAudioDataType','-json']),
    stacks,
    events:run('/usr/bin/log',['show','--last','8m','--style','compact','--predicate',
      'process == "coreaudiod" OR eventMessage CONTAINS[c] "library validation"'],24000),
  };
}
module.exports={hostAudioEvidence};
