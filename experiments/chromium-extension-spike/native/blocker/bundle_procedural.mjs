// Bundle unchanged, authenticated MPL-2.0 evaluator modules for an isolated world.
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
const [modules,asarPath,asarModule,out]=process.argv.slice(2);
if(!out||fs.existsSync(out))throw Error('New durable output directory required');
const sha=b=>createHash('sha256').update(b).digest('hex');
if(sha(fs.readFileSync(asarPath))!=='5b4b78c8790c3af193a2c893564c674f2b05c75481d1b5673c0428dde60203ab')throw Error('Reference identity');
const asar=createRequire(import.meta.url)(asarModule),base=fs.realpathSync(modules),factories=[],records=[],seen=new Map();
function add(file){
 file=fs.realpathSync(file);if(!file.startsWith(base+'/'))throw Error('External dependency');
 if(seen.has(file))return seen.get(file);
 const id=factories.length;seen.set(file,id);factories.push(null);
 const bytes=fs.readFileSync(file),relative=path.relative(base,file);
 if(sha(bytes)!==sha(asar.extractFile(asarPath,'node_modules/'+relative)))throw Error('Reference module mismatch '+relative);
 records.push({path:relative,sha256:sha(bytes)});
 const req=createRequire(file),deps={};
 for(const m of bytes.toString().matchAll(/\brequire\(["']([^"']+)["']\)/g))deps[m[1]]=add(req.resolve(m[1]));
 factories[id]=`function(module,exports,load){const deps=${JSON.stringify(deps)};const require=n=>{if(!(n in deps))throw Error('Unbundled dependency');return load(deps[n]);};\n${bytes}\n}`;
 return id;
}
const entry=add(createRequire(path.join(base,'entry.cjs')).resolve('@ghostery/adblocker-extended-selectors'));
const source=fs.readFileSync(new URL('./procedural_renderer.mjs',import.meta.url),'utf8');
const adapter=source.replace("import {querySelectorAll, handlePseudoDirective} from '@ghostery/adblocker-extended-selectors';",`const {querySelectorAll,handlePseudoDirective}=load(${entry});`).replace('export function installProceduralRenderer','function installProceduralRenderer');
if(adapter===source||adapter.includes('export function'))throw Error('Adapter anchor');
const script=`(()=>{if(globalThis.__blancProcedural)return;const factories=[${factories.join(',')}],cache={};function load(id){if(cache[id])return cache[id].exports;const m={exports:{}};cache[id]=m;factories[id](m,m.exports,load);return m.exports;}\n${adapter}\nglobalThis.__blancProcedural=installProceduralRenderer();})()`;
new vm.Script(script);
fs.mkdirSync(out,{recursive:true});
fs.writeFileSync(path.join(out,'procedural.js'),script);
const license=fs.readFileSync(path.join(base,'@ghostery/adblocker-extended-selectors/LICENSE'));
if(sha(license)!==sha(asar.extractFile(asarPath,'node_modules/@ghostery/adblocker-extended-selectors/LICENSE')))throw Error('License mismatch');
fs.writeFileSync(path.join(out,'LICENSE-MPL-2.0'),license);
fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify({bundleSha256:sha(script),adapterSha256:sha(source),modules:records,licenseSha256:sha(license)},null,2)+'\n');
console.log(JSON.stringify({modules:records.length,bytes:Buffer.byteLength(script),sha256:sha(script)}));
