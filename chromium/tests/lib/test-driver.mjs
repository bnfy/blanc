// Installed only into the exact native Island of an isolated fixture.
export async function installDriver(host){
  const url=await host.eval('location.href');
  if(url!=='chrome://blanc-prototype/host.html')throw Error('Test driver requires the native Island');
  const bootstrap=function(){
    let next=0;const pending=new Map();
    window.blancTestReply=(id,success,value)=>{
      const call=pending.get(id);if(!call)return;
      clearTimeout(call.timer);pending.delete(id);success?call.resolve(value):call.reject(Error(value));
    };
    window.__blancNativeCall=(method,args=[],id=String(++next),timeout=15000)=>{
      next=Math.max(next,Number(id));
      if(pending.has(id))throw Error('Request is already pending');
      return new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>{pending.delete(id);reject(Error('Native test operation timed out: '+method));},timeout);
        pending.set(id,{resolve,reject,timer});chrome.send('blancTest',[id,method,args]);
      });
    };
  };
  await host.eval('('+bootstrap.toString()+')()');
}
export function nativeCall(host,method,args=[],id=null,timeout=15000){
  return host.eval(`window.__blancNativeCall(${JSON.stringify(method)},${JSON.stringify(args)},${id?JSON.stringify(String(id)):'undefined'},${timeout})`);
}
