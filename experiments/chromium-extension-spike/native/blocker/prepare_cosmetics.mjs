// Build both authenticated cosmetic assets before touching the native checkout.
import {prepareCosmeticSources} from './prepare_cosmetic_sources.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const [src, modules, asar, asarModule, output] = process.argv.slice(2);
if (!output) throw Error('usage: prepare_cosmetics.mjs DURABLE_SRC NODE_MODULES AUTHENTICATED_APP_ASAR ASAR_MODULE NEW_ASSETS');
if (fs.existsSync(output)) throw Error('new assets directory required');
const here=path.dirname(fileURLToPath(import.meta.url));
function run(script, destination) {
 const result=spawnSync(process.execPath,[path.join(here,script),modules,asar,asarModule,destination],{stdio:'inherit'});
 if(result.error) throw result.error;
 if(result.status!==0) throw Error(script+' failed; incomplete assets retained, native checkout not staged');
}
run('bundle.mjs',output);
const renderer=path.join(output,'renderer-provenance');
run('bundle_procedural.mjs',renderer);
const manifest=JSON.parse(fs.readFileSync(path.join(output,'manifest.json')));
manifest.proceduralRenderer=JSON.parse(fs.readFileSync(path.join(renderer,'manifest.json')));
fs.copyFileSync(path.join(renderer,'procedural.js'),path.join(output,'procedural.js'));
fs.copyFileSync(path.join(renderer,'LICENSE-MPL-2.0'),path.join(output,'licenses','procedural-renderer-LICENSE-MPL-2.0'));
fs.writeFileSync(path.join(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
prepareCosmeticSources(src,output);
console.log(JSON.stringify({bundle:manifest.bundleSha256,renderer:manifest.proceduralRenderer.bundleSha256}));
