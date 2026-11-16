// Clones an observed generated payload for a fixture-scoped manifest experiment.
// Existing native/provider payloads are never edited by this helper.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {fileURLToPath} from 'node:url';
export function diagnosticEntry(mode){assert(['about','origin'].includes(mode));return {matches:['https://page.blanc-fixture.test/*','https://child.blanc-control.test/*'],js:['js/blanc-fallback-diagnostic.js'],all_frames:true,run_at:'document_idle',...(mode==='origin'?{match_origin_as_fallback:true}:{match_about_blank:true})};}
export function createFallbackPayload(source,output,mode){
 const entry=diagnosticEntry(mode);assert(!fs.existsSync(output));const original=JSON.parse(fs.readFileSync(path.join(source,'manifest.json')));
 assert.equal(original.manifest_version,2);assert.equal(original.incognito,'not_allowed');assert(fs.readFileSync(path.join(source,'js/start.js'),'utf8').includes('__blancScriptletEngine'));
 fs.cpSync(source,output,{recursive:true,errorOnExist:true,force:false});
 fs.copyFileSync(new URL('./origin-fallback-content.js',import.meta.url),path.join(output,'js/blanc-fallback-diagnostic.js'));
 const manifest={...original,content_scripts:[...original.content_scripts,entry]};fs.writeFileSync(path.join(output,'manifest.json'),JSON.stringify(manifest,null,2));
 return {mode,entry,permissionsUnchanged:JSON.stringify(original.permissions)===JSON.stringify(manifest.permissions),scope:'diagnostic-only; fixed fixture hosts; no production late delivery claim'};
}
if(process.argv[1]===fileURLToPath(import.meta.url))console.log(JSON.stringify(createFallbackPayload(...process.argv.slice(2)),null,2));
