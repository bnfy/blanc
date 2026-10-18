// Separate, explicit opt-in to the experimental blocker in the preserved 157 output.
import fs from 'node:fs';
import {writeIfChanged as write} from './write-file.mjs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const [src,assets]=process.argv.slice(2), here=path.dirname(fileURLToPath(import.meta.url));
if(!src||!assets)throw Error('usage: prepare.mjs CHROMIUM_SRC AUTHENTICATED_ENGINE_ASSETS');
const version=Object.fromEntries(fs.readFileSync(path.join(src,'chrome/VERSION'),'utf8').trim().split('\n').map(line=>line.split('=')));
if(['MAJOR','MINOR','BUILD','PATCH'].map(k=>version[k]).join('.')!=='157.0.8103.6')throw Error('exact approved 157 pin required');
for(const name of ['BUILD.gn','blocker.mojom','blocker_service.cc','blocker_service.h','blocker_proxy.cc','blocker_proxy.h','document_start.inc','document_start_renderer.inc','update_identity.inc'])write(path.join(src,'chrome/services/blanc_blocker',name),fs.readFileSync(path.join(here,name)));
write(path.join(src,'chrome/services/blanc_blocker/bundle_hash.h'),fs.readFileSync(path.join(assets,'bundle_hash.h')));
function patch(relative,marker,before,after){const file=path.join(src,relative),text=fs.readFileSync(file,'utf8');if(text.includes(marker))return;if(text.split(before).length!==2)throw Error('anchor mismatch '+relative+' '+marker);write(file,text.replace(before,after));}
patch('chrome/utility/services.cc','blanc_blocker/blocker_service.h','#include "chrome/utility/services.h"','#include "chrome/utility/services.h"\n#include "chrome/services/blanc_blocker/blocker_service.h"');
patch('chrome/utility/services.cc','services.Add(RunBlancBlocker);','void RegisterMainThreadServices(mojo::ServiceFactory& services) {',`auto RunBlancBlocker(mojo::PendingReceiver<blanc::mojom::Blocker> receiver) {
  return std::make_unique<blanc::BlockerService>(std::move(receiver));
}

void RegisterMainThreadServices(mojo::ServiceFactory& services) {
  services.Add(RunBlancBlocker);`);
patch('chrome/utility/BUILD.gn','"//chrome/services/blanc_blocker:service"','  public_deps = []\n  deps = [','  public_deps = []\n  deps = [\n    "//chrome/services/blanc_blocker:service",');
patch('chrome/browser/chrome_content_browser_client.cc','blanc_blocker/blocker_proxy.h','#include "chrome/browser/chrome_content_browser_client.h"','#include "chrome/browser/chrome_content_browser_client.h"\n#include "chrome/services/blanc_blocker/blocker_proxy.h"');
const browserClient=path.join(src,'chrome/browser/chrome_content_browser_client.cc');
const previous='  blanc::MaybeProxy(browser_context, frame, static_cast<int>(type), factory_builder);\n\n';
const previousText=fs.readFileSync(browserClient,'utf8');
if(!previousText.includes('// Blanc network factories only')&&previousText.includes(previous))write(browserClient,previousText.replace(previous,''));
const oldCall='blanc::MaybeProxy(browser_context, frame, static_cast<int>(type), factory_builder);';
const newCall='blanc::MaybeProxy(browser_context, frame, static_cast<int>(type), isolation_info, factory_builder);';
const current=fs.readFileSync(browserClient,'utf8');
if(current.includes(oldCall)){
 if(current.split(oldCall).length!==2)throw Error('ambiguous Blanc factory call');
 write(browserClient,current.replace(oldCall,newCall));
}
patch('chrome/browser/chrome_content_browser_client.cc','// Blanc network factories only','  // Install the HTTP Header Injection proxying factory.',`  // Blanc network factories only; WebUI/data/file loaders keep their own protocol.
  if (is_for_network_service)
    ${newCall}

  // Install the HTTP Header Injection proxying factory.`);
patch('chrome/browser/BUILD.gn','"//chrome/services/blanc_blocker:browser"','    ":universal_web_contents_observers",','    ":universal_web_contents_observers",\n    "//chrome/services/blanc_blocker:browser",');
console.log('Blanc blocker sources prepared; run unchanged-args GN then the normal build guard.');

patch('chrome/browser/chrome_content_browser_client_receiver_bindings.cc','blanc_blocker/blocker_proxy.h','#include "chrome/browser/chrome_content_browser_client.h"','#include "chrome/browser/chrome_content_browser_client.h"\n#include "chrome/services/blanc_blocker/blocker_proxy.h"');
patch('chrome/browser/chrome_content_browser_client_receiver_bindings.cc','map->Add<blanc::mojom::DocumentStart>','  chrome::internal::PopulateChromeFrameBinders(map, render_frame_host);','  map->Add<blanc::mojom::DocumentStart>(&blanc::BindDocumentStart);\n  chrome::internal::PopulateChromeFrameBinders(map, render_frame_host);');
patch('chrome/browser/chrome_content_browser_client.cc','"blanc-ubo-document-start",','        autofill::switches::kIgnoreAutocompleteOffForAutofill,','        "blanc-ubo-document-start",\n        autofill::switches::kIgnoreAutocompleteOffForAutofill,');
patch('chrome/renderer/chrome_content_renderer_client.cc','blanc_blocker/blocker.mojom.h','#include "chrome/renderer/chrome_content_renderer_client.h"',`#include "chrome/renderer/chrome_content_renderer_client.h"
#include "chrome/services/blanc_blocker/blocker.mojom.h"
#include "content/public/renderer/render_frame_observer.h"
#include "third_party/blink/public/platform/browser_interface_broker_proxy.h"
#include "third_party/blink/public/web/web_script_source.h"`);
patch('chrome/renderer/chrome_content_renderer_client.cc','blanc_blocker/document_start_renderer.inc','void ChromeContentRendererClient::RunScriptsAtDocumentStart(',`#include "chrome/services/blanc_blocker/document_start_renderer.inc"

void ChromeContentRendererClient::RunScriptsAtDocumentStart(`);
patch('chrome/renderer/chrome_content_renderer_client.cc','if (!BlancDocumentStart(render_frame)) return;','void ChromeContentRendererClient::RunScriptsAtDocumentStart(\n    content::RenderFrame* render_frame) {','void ChromeContentRendererClient::RunScriptsAtDocumentStart(\n    content::RenderFrame* render_frame) {\n  if (!BlancDocumentStart(render_frame)) return;');
patch('chrome/renderer/BUILD.gn','"//chrome/services/blanc_blocker:mojom"','    ":process_state",','    ":process_state",\n    "//chrome/services/blanc_blocker:mojom",');
// Identity wrapper captures actual registration/version without a public-header edit.
patch('content/browser/service_worker/service_worker_update_checker.cc','blanc_update_identity.inc','#include "content/browser/service_worker/service_worker_update_checker.h"','#include "content/browser/service_worker/service_worker_update_checker.h"\n#include "content/browser/service_worker/blanc_update_identity.inc"');
patch('content/browser/service_worker/service_worker_update_checker.cc','BlancUpdateFactory(loader_factory_','      context_->wrapper()->browser_context(), loader_factory_,','      context_->wrapper()->browser_context(),\n      BlancUpdateFactory(loader_factory_, version_to_update_->registration_id(),\n          version_to_update_->version_id(), version_to_update_->scope(),\n          version_to_update_->key(), context_->wrapper()->browser_context()->IsOffTheRecord(), is_main_script),');
write(path.join(src,'content/browser/service_worker/blanc_update_identity.inc'),fs.readFileSync(path.join(here,'update_identity.inc')));
