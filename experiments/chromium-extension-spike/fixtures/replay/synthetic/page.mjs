import {authoredResponse,sha} from './generate.mjs';
export const pageUrl='https://page.blanc-fixture.test/blanc-fixture/index.html';
export function coverageControls(){
  return ['script','xhr','image','stylesheet'].map(resourceType=>{
    const id='context-'+resourceType;
    const c={id,resourceType,kind:'coverage-control',sourceHost:'page.blanc-fixture.test',party:'first-party',
      url:new URL('/blanc-fixture/context/'+resourceType,new URL(pageUrl)).href,
      descendantUrl:resourceType==='script'?new URL('/blanc-fixture/context/script-child',pageUrl).href:null};
    c.response=authoredResponse(c);c.response.sha256=sha(c.response.body);
    if(c.descendantUrl)c.descendantResponse={status:200,contentType:'application/json',body:'{"fixture":"context-child"}'};
    return c;
  });
}
export function pageResponse(selected,{noReferrer=false,concurrency=8}={}){
  if(!Number.isInteger(concurrency)||concurrency<1||concurrency>16)throw new Error('Invalid concurrency');
  const scripts=selected.map(c=>({id:c.id,url:c.url,type:c.resourceType}));
  const icon='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="red"/></svg>');
  const body=`<!doctype html><meta charset="utf-8">${noReferrer?'<meta name="referrer" content="no-referrer">':''}<link rel="icon" href="${icon}"><title>Blanc synthetic replay</title>
<script>window.pilot={done:false,loads:[]};(async()=>{
const queue=${JSON.stringify(scripts).replaceAll('<','\\u003c')};let index=0;
async function worker(){while(index<queue.length){const c=queue[index++];
await new Promise(resolve=>{
let completed=false;const finish=event=>{if(completed)return;completed=true;clearTimeout(timer);pilot.loads.push({id:c.id,event});resolve();};
const timer=setTimeout(()=>finish('timeout'),30000);
if(c.type==='xhr'){fetch(c.url,{credentials:'omit'}).then(r=>r.text()).then(()=>finish('load'),()=>finish('error'));return;}
const s=document.createElement(c.type==='script'?'script':c.type==='image'?'img':'link');
if(c.type==='stylesheet'){s.rel='stylesheet';s.href=c.url;}else s.src=c.url;
s.onload=()=>finish('load');s.onerror=()=>finish('error');document.head.append(s);
});}}
await Promise.all(Array.from({length:${concurrency}},worker));pilot.done=true;})();</script>`;
  return {status:200,contentType:'text/html',body};
}
