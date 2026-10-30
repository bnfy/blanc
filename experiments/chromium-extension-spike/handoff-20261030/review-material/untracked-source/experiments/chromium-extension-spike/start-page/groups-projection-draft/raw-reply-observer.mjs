// A fixture-only passive wrapper. It observes the real request/reply; it does
// not issue requests or change their arguments, response, or authority.
export function installRawReplyObserver() {
  const originalSend=chrome.send, originalReply=window.blancNewTabReply;
  if(typeof originalSend!=='function'||typeof originalReply!=='function')throw Error('native bridge unavailable');
  const focusIds=new Set();
  window.__focusRawRequests=[];window.__focusRawReplies=[];
  const wrappedSend=function(name,args) {
    if(name==='blancNewTab'&&Array.isArray(args)&&args[1]==='focusGroup') {
      const id=args[0];focusIds.add(id);
      window.__focusRawRequests.push({id,groupId:args[2]?.[0],timeMs:performance.now()});
    }
    return originalSend.apply(this,arguments);
  };
  const wrappedReply=function(id,success,value) {
    if(focusIds.has(id))window.__focusRawReplies.push({id,success,value,timeMs:performance.now()});
    return originalReply.apply(this,arguments);
  };
  chrome.send=wrappedSend;window.blancNewTabReply=wrappedReply;
  if(chrome.send!==wrappedSend||window.blancNewTabReply!==wrappedReply)throw Error('native bridge cannot be observed');
}
