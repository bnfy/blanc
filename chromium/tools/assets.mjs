// Island assets in blanc/island/: fork files plus byte-identical copies of
// shipping files at the pinned commit, checked against the recorded manifest.
//   node chromium/tools/assets.mjs --check          verify, write nothing
//   node chromium/tools/assets.mjs --out=/durable    assemble a served folder
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const sha=data=>crypto.createHash('sha256').update(data).digest('hex');
// The browser's single allowlist, read by GN and by the native fallback.
export const served=()=>fs.readFileSync(path.join(root,'blanc/island_resources/served.txt'),'utf8').split('\n').filter(Boolean);
export function islandFiles(spec=JSON.parse(fs.readFileSync(path.join(root,'blanc/island-assets.json')))){
 const files=new Map();
 const walk=dir=>{for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);
  if(e.isDirectory())walk(p);else files.set(path.relative(path.join(root,'blanc/island'),p).split(path.sep).join('/'),fs.readFileSync(p));}};
 walk(path.join(root,'blanc/island'));
 // Shipping files are copies; prove each is byte-identical to its source.
 const problems=[];
 for(const [served,source] of Object.entries(spec.shippingFiles)){
  const shipped=execFileSync('git',['show',`${spec.shipping}:${source}`],{cwd:root,maxBuffer:64*1024*1024});
  if(!files.has(served))problems.push('missing shipping copy '+served);
  else if(!files.get(served).equals(shipped))problems.push('shipping copy differs '+served);
 }
 for(const [p,data] of files)if(spec.manifest[p]!==sha(data))problems.push((spec.manifest[p]?'changed ':'unlisted ')+p);
 for(const p of Object.keys(spec.manifest))if(!files.has(p))problems.push('missing '+p);
 for(const p of served())if(!spec.manifest[p])problems.push('served but unlisted '+p);
 return {files,problems};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const out=process.argv.find(a=>a.startsWith('--out='))?.slice(6);
 if(!out&&!process.argv.includes('--check'))throw Error('Usage: assets.mjs --check | --out=DIR');
 const {files,problems}=islandFiles();
 if(problems.length)throw Error('Island assets differ from the manifest:\n'+problems.join('\n'));
 if(out){
  if(fs.existsSync(out))throw Error('Refusing to overwrite '+out);
  for(const [p,data] of files){const d=path.join(out,p);fs.mkdirSync(path.dirname(d),{recursive:true});fs.writeFileSync(d,data);}
 }
 console.log(`${files.size} island assets match the manifest`+(out?`; assembled in ${out}`:''));
}
