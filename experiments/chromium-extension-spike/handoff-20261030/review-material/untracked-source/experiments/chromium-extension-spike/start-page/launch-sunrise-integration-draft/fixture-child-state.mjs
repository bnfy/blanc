// An error on an already spawned child (for example failed kill) is not exit.
export function observeChild(child) {
  let error=null,spawnFailed=false,exitObserved=false;
  child.on('error',e=>{error=e;if(!child.pid)spawnFailed=true;});
  child.once('exit',()=>{exitObserved=true;});
  return {
    get error(){return error;},
    exited(){return spawnFailed||exitObserved||typeof child.exitCode==='number'||typeof child.signalCode==='string';},
  };
}
