// Authored outcome probes; no real-page data or expected-decision injection.
export const top='https://page.blanc-fixture.test',child='https://child.blanc-control.test',blocked='https://000491b06a.com';
export const cases=[
 {name:'http',mode:'http',origin:child,script:true},
 {name:'sandbox-http',mode:'http',sandbox:'allow-scripts',origin:'null',script:true},
 {name:'sandbox-no-scripts',mode:'http',sandbox:'',origin:'null',script:false},
 {name:'srcdoc-inherited',mode:'srcdoc',origin:top,script:true},
 {name:'srcdoc-opaque',mode:'srcdoc',sandbox:'allow-scripts',origin:'null',script:true},
 {name:'data-opaque',mode:'data',origin:'null',script:true},
 {name:'blank-inherited',mode:'blank',origin:top,script:true},
];
export const filters=['page.blanc-fixture.test','child.blanc-control.test'].flatMap(h=>[`${h}##+js(set-constant, opaqueFlag, true)`,`${h}##+js(no-fetch-if, /opaque-hit/)`]).join('\n');
export function html(name){return `<!doctype html><meta charset="utf-8"><script>
window.first={ran:true,origin:window.origin,flag:window.opaqueFlag===true,getter:!!Object.getOwnPropertyDescriptor(window,'opaqueFlag')?.get};
window.requests=Promise.all([fetch(${JSON.stringify(child+'/opaque-hit/'+name)},{mode:'no-cors'}).then(r=>({result:'resolved',type:r.type})).catch(e=>({result:'rejected',name:e.name})),fetch(${JSON.stringify(blocked+'/blanc-fixture/opaque/'+name)},{mode:'no-cors'}).then(r=>({result:'resolved',type:r.type})).catch(e=>({result:'rejected',name:e.name}))]);
</script><div id="fixture-ready">authored fixture ${name}</div>`;}
export function fixtures(){const f=new Map([[top+'/root',{status:200,contentType:'text/html',body:'<!doctype html><link rel="icon" href="data:,"><title>Opaque frame parent</title>'}]]);
 for(const c of cases){f.set(child+'/frame/'+c.name,{status:200,contentType:'text/html',body:html(c.name)});f.set(child+'/opaque-hit/'+c.name,{status:200,contentType:'text/plain',body:'authored allowed probe'});f.set(blocked+'/blanc-fixture/opaque/'+c.name,{status:200,contentType:'text/plain',body:'authored blocked probe'});}
 for(const h of [top,child])f.set(h+'/favicon.ico',{status:204,contentType:'image/x-icon',body:''});return f;}
