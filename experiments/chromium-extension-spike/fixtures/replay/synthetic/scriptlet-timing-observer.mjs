// Diagnostic only: preserve the original injection promise and arguments.
export function installTimingObserver(){
const background=globalThis.chrome?.extension?.getBackgroundPage?.()||globalThis;
const vAPI=background.vAPI;
const rows=[];background.__blancInjectionTiming=rows;
const original=vAPI.tabs.executeScript;
vAPI.tabs.executeScript=function(tabId,options){
 const row={tabId,frameId:options.frameId??null,runAt:options.runAt??null,hasConstant:typeof options.code==='string'&&options.code.includes('blancParityFlag'),entered:Date.now()};rows.push(row);
 const result=Reflect.apply(original,this,arguments);
 Promise.resolve(result).then(value=>{row.completed=Date.now();row.resultCount=Array.isArray(value)?value.length:null;},()=>{row.completed=Date.now();row.rejected=true;});return result;
};return true;
}
