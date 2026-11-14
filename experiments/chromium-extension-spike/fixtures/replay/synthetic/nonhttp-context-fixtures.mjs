import {top,child,blocked,html,filters as baseFilters} from './opaque-frame-fixtures.mjs';
export {top,child,blocked};
export const filters=baseFilters+'\npage.blanc-fixture.test##+js(set-constant, topSelection, true)\nchild.blanc-control.test##+js(set-constant, childSelection, true)';
export const cases=[
 {name:'data',mode:'data',origin:'null',admitted:true},
 {name:'blob',mode:'blob',origin:top,admitted:true},
 {name:'sandbox-blob',mode:'blob',sandbox:true,origin:'null',admitted:true},
 {name:'nested-srcdoc',mode:'srcdoc',parent:'opaque',origin:'null',admitted:true},
 {name:'nested-data',mode:'data',parent:'opaque',origin:'null',admitted:true},
 {name:'nested-blob',mode:'blob',parent:'opaque',origin:'null',admitted:true},
 {name:'child-origin-blob',mode:'blob',parent:'child',origin:child,admitted:true},
 {name:'cross-owner-blob',mode:'blob',parent:'child',creator:'top',origin:top,admitted:false},
 {name:'mismatched-chain-data',mode:'data',parent:'opaque-child',origin:'null',admitted:false},
];
export function fixtures(){const out=new Map();for(const host of [top,child]){out.set(host+'/nonhttp-root',{status:200,contentType:'text/html',body:'<!doctype html><link rel="icon" href="data:,"><body>Authored non-HTTP parent'});out.set(host+'/favicon.ico',{status:204,contentType:'image/x-icon',body:''});}
 for(const c of cases){out.set(child+'/opaque-hit/'+c.name,{status:200,contentType:'text/plain',body:'authored allowed control'});out.set(blocked+'/blanc-fixture/opaque/'+c.name,{status:200,contentType:'text/plain',body:'authored blocked control'});}return out;}
export const bodyFor=c=>html(c.name).replace('window.first={','window.first={topSelection:window.topSelection===true,childSelection:window.childSelection===true,');
