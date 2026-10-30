// Installed in a disposable fixture page. Observes only real handler calls.
export function installFocusObserver() {
  const api=window.bowserPages.start, original=api.focusGroup;
  window.__focusFixtureCalls=[]; window.__focusFixtureClicks=[];
  api.focusGroup=function(...args) {
    const item={args,atCall:{focus:document.hasFocus(),visibility:document.visibilityState},finished:false};
    window.__focusFixtureCalls.push(item);
    let result;
    try { result=original.apply(this,args); }
    catch(error) { item.finished=true;item.error=String(error);throw error; }
    return Promise.resolve(result).then(value=>{
      item.finished=true;item.result=value;item.atReply={focus:document.hasFocus(),visibility:document.visibilityState};return value;
    },error=>{
      item.finished=true;item.error=String(error);item.atReply={focus:document.hasFocus(),visibility:document.visibilityState};throw error;
    });
  };
  document.addEventListener('click',event=>{
    const target=event.target?.closest?.('[data-group-id]');
    if(target)window.__focusFixtureClicks.push({id:target.dataset.groupId,trusted:event.isTrusted,x:event.clientX,y:event.clientY});
  },{capture:true});
}
