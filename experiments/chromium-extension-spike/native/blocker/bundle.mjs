import {scriptLiteral} from '../../script-literal.mjs';
// Bundle unchanged CommonJS engine modules from the installed, verified reference.
// No Node APIs are exposed to the utility V8 isolate. Source hashes and licences
// are retained; list-derived bytes retain their upstream CC BY-SA terms.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const sha=b=>createHash('sha256').update(b).digest('hex');
const [modules,asarPath,asarModule,out]=process.argv.slice(2);
if(!out)throw Error('usage: bundle.mjs NODE_MODULES APP_ASAR ASAR_MODULE OUTPUT');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../../..');
const asar=createRequire(import.meta.url)(asarModule);
if(sha(fs.readFileSync(asarPath))!=='5b4b78c8790c3af193a2c893564c674f2b05c75481d1b5673c0428dde60203ab')throw Error('reference app changed');
const base=fs.realpathSync(modules), records=[], factories=[];
const seen=new Map();
function add(file){
 file=fs.realpathSync(file);if(!file.startsWith(base+'/'))throw Error('external dependency '+file);
 if(seen.has(file))return seen.get(file);
 const id=factories.length;seen.set(file,id);factories.push(null);
 const bytes=fs.readFileSync(file),relative=path.relative(base,file);
 if(sha(bytes)!==sha(asar.extractFile(asarPath,'node_modules/'+relative)))throw Error('installed module mismatch '+relative);
 records.push({path:relative,sha256:sha(bytes)});
 if(file.endsWith('.json')){factories[id]=`function(module){module.exports=${bytes.toString()};}`;return id;}
 const req=createRequire(file),deps={};
 for(const m of bytes.toString().matchAll(/\brequire\(["']([^"']+)["']\)/g))deps[m[1]]=add(req.resolve(m[1]));
 factories[id]=`function(module,exports,load){const deps=${scriptLiteral(deps)};const require=name=>{if(!(name in deps))throw Error('unbundled dependency');return load(deps[name]);};\n${bytes}\n}`;
 return id;
}
const engineId=add(createRequire(path.join(base,'entry.cjs')).resolve('@ghostery/adblocker'));
const pinned=JSON.parse(fs.readFileSync(path.join(root,'adblock/sources/pinned.json')));
const lists=pinned.lists.map(l=>{const b=fs.readFileSync(path.join(root,'adblock/sources',l.file));if(sha(b)!==l.sha256)throw Error('list hash');return b.toString();});
// Match the reference's newline joining, independently of fixture/oracle files.
const raw=lists.join('\n');if(sha(raw)!==pinned.combinedSha256)throw Error('combined list hash');
const resources=fs.readFileSync(path.join(root,'adblock/sources',pinned.ghosteryResources.file));
if(sha(resources)!==pinned.ghosteryResources.sha256)throw Error('resources hash');
let script=`class TextEncoder{encode(s=''){return blancEncode(String(s));}encodeInto(s,d){let read=0,written=0;for(const c of String(s)){const b=this.encode(c);if(written+b.length>d.length)break;d.set(b,written);written+=b.length;read+=c.length;}return {read,written};}}
class TextDecoder{constructor(label,options){if(label!=='utf8'||!options.ignoreBOM)throw Error('unsupported decoder');}decode(bytes){return blancDecode(bytes);}}
function btoa(s){const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';let out='';for(let i=0;i<s.length;i+=3){const a=s.charCodeAt(i),b=s.charCodeAt(i+1),c=s.charCodeAt(i+2);if(a>255||b>255||c>255)throw Error('non latin1');const n=(a<<16)|((b||0)<<8)|(c||0);out+=alphabet[(n>>>18)&63]+alphabet[(n>>>12)&63]+(i+1<s.length?alphabet[(n>>>6)&63]:'=')+(i+2<s.length?alphabet[n&63]:'=');}return out;}
(()=>{const factories=[${factories.join(',\n')}],cache={};function load(id){if(cache[id])return cache[id].exports;const m={exports:{}};cache[id]=m;factories[id](m,m.exports,load);return m.exports;}\nconst {FiltersEngine,Request}=load(${engineId});const engine=FiltersEngine.parse(${scriptLiteral(raw)});engine.updateResources(${scriptLiteral(resources.toString())},${scriptLiteral(pinned.ghosteryResources.sha256)});\nglobalThis.blancDecide=(url,type,sourceUrl)=>{const r=Request.fromRawDetails({url,type,sourceUrl});if(engine.config.guessRequestTypeFromUrl&&r.type==='other')r.guessTypeOfRequest();if(r.isMainFrame())return 0;const result=engine.match(r);if(result.redirect)return 2;return result.match?1:0;};})();\n`;
const context=vm.createContext({blancEncode:s=>new TextEncoder().encode(s),blancDecode:b=>new TextDecoder('utf8',{ignoreBOM:true}).decode(b)});vm.runInContext(script,context,{timeout:30000});
if(context.blancDecide('https://000491b06a.com/blanc-fixture/resource.js','stylesheet','https://page.blanc-fixture.test/')!==1)throw Error('engine smoke');
fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'engine.js'),script);
const manifest={referenceAppSha256:sha(fs.readFileSync(asarPath)),engineVersion:'2.18.2',bundleSha256:sha(script),filtersSha256:pinned.combinedSha256,resourcesSha256:pinned.ghosteryResources.sha256,modules:records.sort((a,b)=>a.path.localeCompare(b.path)),decisionContract:'0 allow, 1 block, 2 unsupported resource redirect (fail closed); sourceUrl is actual request referrer, separately logged from initiator'};
const packages=[...new Set(records.map(r=>r.path.startsWith('@')?r.path.split('/').slice(0,2).join('/'):r.path.split('/')[0]))];
manifest.packages=[];
for(const name of packages){
 const dir=path.join(base,name),metadata=JSON.parse(fs.readFileSync(path.join(dir,'package.json')));
 const licenses=fs.readdirSync(dir).filter(f=>/^(license|copying|notice)(\.|$)/i.test(f));
 if(!licenses.length)throw Error('missing license '+name);
 for(const file of licenses){const b=fs.readFileSync(path.join(dir,file));if(sha(b)!==sha(asar.extractFile(asarPath,'node_modules/'+name+'/'+file)))throw Error('license mismatch');const dest=path.join(out,'licenses',name.replaceAll('/','_')+'-'+file);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,b);}
 manifest.packages.push({name,version:metadata.version,license:metadata.license,licenseFiles:licenses});
}
fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2));
fs.writeFileSync(path.join(out,'bundle_hash.h'),`// Generated by bundle.mjs; do not edit.\ninline constexpr char kBlancBlockerBundleSha256[] = "${sha(script)}";\n`);
console.log(JSON.stringify({bytes:Buffer.byteLength(script),modules:records.length,sha256:sha(script)}));
