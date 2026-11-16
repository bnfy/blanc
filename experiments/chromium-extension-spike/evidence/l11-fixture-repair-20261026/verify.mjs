import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {pathToFileURL,fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const require=createRequire(root+'/package.json');
const {parse}=require('acorn');
const {callFunction}=await import(pathToFileURL(root+'/experiments/chromium-extension-spike/cdp-function.mjs'));
const rows=JSON.parse(fs.readFileSync(new URL('./changes.json',import.meta.url)));
const report={passed:[],scriptCount:rows.length};
const hostile='https://fixture.invalid/\"); globalThis.compromised=true; //\u2028</script>';
for(const row of rows){
 const file=root+'/experiments/chromium-extension-spike/'+row.path, source=fs.readFileSync(file,'utf8');
 const tree=parse(source,{ecmaVersion:'latest',sourceType:'module'});const calls=[];
 function walk(node){if(!node||typeof node!=='object')return;if(node.type==='CallExpression'&&node.callee.name==='callFunction')calls.push(node);for(const value of Object.values(node)){if(Array.isArray(value))value.forEach(walk);else if(value&&typeof value==='object')walk(value);}}
 walk(tree);assert.equal(calls.length,row.replacedCalls);
 const imported=tree.body.find(n=>n.type==='ImportDeclaration'&&n.specifiers.some(s=>s.imported?.name==='callFunction'));assert(fs.existsSync(path.resolve(path.dirname(file),imported.source.value)));
 for(const [index,node] of calls.entries())for(const refuse of [false,true]){
  assert.equal(node.arguments[1].type,'ArrowFunctionExpression');
  const declaration=source.slice(node.arguments[1].start,node.arguments[1].end);const parameters=node.arguments[1].params.map(p=>p.name);
  const values=parameters[0]==='urls'?[[hostile,hostile+'/second']]:parameters.length===2?[hostile,'body '+hostile]:[hostile];
  const fetched=[],protocol=[];const context=vm.createContext({location:{href:refuse?'different':hostile},fetch:async(url,options)=>{fetched.push({url,options});if(refuse)throw new TypeError('refused');return {ok:true,status:200,json:async()=>({echo:url})}}});
  const client={async send(method,params){protocol.push({method,params});if(method==='Runtime.evaluate'){assert.equal(params.expression,'globalThis');return {result:{objectId:'fixture-global'}};}if(method==='Runtime.callFunctionOn'){assert(!params.functionDeclaration.includes(hostile));const fn=vm.runInContext('('+params.functionDeclaration+')',context);return {result:{value:await fn(...params.arguments.map(x=>x.value))}};}return {};}};
  const fn=vm.runInNewContext('('+declaration+')');const result=await callFunction(client,fn,values);assert.equal(context.compromised,undefined);assert.equal(protocol.at(-1).method,'Runtime.releaseObject');
  if(declaration.includes('location.href'))assert.equal(result,!refuse);
  else{
   assert.deepEqual(fetched.map(x=>x.url),parameters[0]==='urls'?values[0]:[hostile]);
   if(parameters.length===2){assert.equal(fetched[0].options.method,'POST');assert.equal(fetched[0].options.body,values[1]);assert.equal(fetched[0].options.headers['Content-Type'],'text/plain');}
   if(declaration.includes('X-Keep')){assert.equal(fetched[0].options.headers['X-Keep'],'original-keep');assert.equal(fetched[0].options.headers['X-Remove'],'original-remove');}
   if(Array.isArray(result))assert(result.every(x=>x.ok===!refuse));else if(typeof result==='boolean')assert.equal(result,!refuse);else{assert.equal(result.ok,!refuse);if(refuse)assert.equal(result.error,'TypeError');else assert.equal(result.data.echo,hostile);}
  }
  report.passed.push({path:row.path,call:index,refuse});
 }
}
fs.writeFileSync(new URL('./validation.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({scripts:rows.length,argumentBoundaryChecks:report.passed.length,passed:true}));
