import fs from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
export function prepareCosmeticSources(src,output) {
// Validate the complete asset pair before any source or header mutation.
const manifest=JSON.parse(fs.readFileSync(path.join(output,'manifest.json')));
const digest=data=>createHash('sha256').update(data).digest('hex');
const engine=fs.readFileSync(path.join(output,'engine.js'));
const renderer=fs.readFileSync(path.join(output,'procedural.js'));
if(digest(engine)!==manifest.bundleSha256 ||
   digest(renderer)!==manifest.proceduralRenderer?.bundleSha256)
 throw Error('cosmetic engine/renderer provenance mismatch');
const expectedHeader=fs.readFileSync(path.join(output,'bundle_hash.h'),'utf8');
if(!expectedHeader.includes('"'+manifest.bundleSha256+'"'))
 throw Error('cosmetic bundle header mismatch');
const write=(file,data)=>{if(!fs.existsSync(file)||!fs.readFileSync(file).equals(Buffer.from(data)))fs.writeFileSync(file,data)};
for(const name of ['blocker.mojom','blocker_service.h','blocker_service.cc','blocker_proxy.h','blocker_proxy.cc','cosmetic_document.inc','cosmetic_renderer.inc'])write(path.join(src,'chrome/services/blanc_blocker',name),fs.readFileSync(path.join(here,name)));
write(path.join(src,'chrome/services/blanc_blocker/bundle_hash.h'),fs.readFileSync(path.join(output,'bundle_hash.h')));
const procedural=fs.readFileSync(path.join(output,'procedural.js'),'utf8');
write(path.join(src,'chrome/services/blanc_blocker/procedural_renderer.h'),`inline constexpr char kBlancProceduralRenderer[] = ${JSON.stringify(procedural)};\n`);
const collector=fs.readFileSync(path.join(here,'cosmetic_collector.js'),'utf8');
write(path.join(src,'chrome/services/blanc_blocker/cosmetic_collector.h'),`inline constexpr char kBlancCosmeticCollector[] = ${JSON.stringify(collector)};\n`);
function patch(file,marker,before,after){const p=path.join(src,file),s=fs.readFileSync(p,'utf8');if(s.includes(marker))return;if(s.split(before).length!==2)throw Error('anchor '+file);write(p,s.replace(before,after))}
{
  const file = path.join(src, 'chrome/browser/chrome_content_browser_client_receiver_bindings.cc');
  let source = fs.readFileSync(file, 'utf8');
  source = source.replace('  map->Add<blanc::mojom::Cosmetics>(&blanc::BindCosmetics);\n', '');
  const anchor = '#if BLANC_RESEARCH_HOOKS\n  map->Add<blanc::mojom::DocumentStart>';
  if (source.split(anchor).length !== 2) throw Error('production cosmetic binder anchor');
  write(file, source.replace(anchor, '  map->Add<blanc::mojom::Cosmetics>(&blanc::BindCosmetics);\n' + anchor));
}
patch('chrome/common/chrome_isolated_world_ids.h','ISOLATED_WORLD_ID_BLANC_COSMETICS', '  ISOLATED_WORLD_ID_EXTENSIONS','  ISOLATED_WORLD_ID_BLANC_COSMETICS,\n  ISOLATED_WORLD_ID_EXTENSIONS');
patch('chrome/android/java/src/org/chromium/chrome/browser/common/ChromeIsolatedWorldIds.java','int ISOLATED_WORLD_ID_BLANC_COSMETICS', '    int ISOLATED_WORLD_ID_UNUSED_EXTENSIONS = IsolatedWorldIds.ISOLATED_WORLD_ID_CONTENT_END + 5;', '    int ISOLATED_WORLD_ID_BLANC_COSMETICS = IsolatedWorldIds.ISOLATED_WORLD_ID_CONTENT_END + 5;\n    int ISOLATED_WORLD_ID_UNUSED_EXTENSIONS = IsolatedWorldIds.ISOLATED_WORLD_ID_CONTENT_END + 6;');
patch('chrome/android/java/src/org/chromium/chrome/browser/common/ChromeIsolatedWorldIds.java','    ChromeIsolatedWorldIds.ISOLATED_WORLD_ID_BLANC_COSMETICS,', '    ChromeIsolatedWorldIds.ISOLATED_WORLD_ID_UNUSED_EXTENSIONS', '    ChromeIsolatedWorldIds.ISOLATED_WORLD_ID_BLANC_COSMETICS,\n    ChromeIsolatedWorldIds.ISOLATED_WORLD_ID_UNUSED_EXTENSIONS');
patch('chrome/renderer/chrome_content_renderer_client.cc','blanc_blocker/cosmetic_renderer.inc', '#include "chrome/services/blanc_blocker/document_start_renderer.inc"', '#include "chrome/services/blanc_blocker/document_start_renderer.inc"\n#include "chrome/services/blanc_blocker/cosmetic_renderer.inc"');
patch('chrome/renderer/chrome_content_renderer_client.cc','if (!BlancProductionDocumentStart', '  if (!BlancDocumentStart(render_frame)) return;', '  if (!BlancProductionDocumentStart(render_frame)) return;\n  if (!BlancDocumentStart(render_frame)) return;');
}
