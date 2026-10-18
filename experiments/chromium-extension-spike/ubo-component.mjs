// Offline admission probe only. No provider readiness/reload protection claim.
import { wrapMainWorld } from './scriptlet-once.mjs';
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import assert from 'node:assert/strict';import {fileURLToPath} from 'node:url';
export const componentId='oddhmofgkplblkmckempfepikkophank';
export const componentKey='MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAgmQ2nqsfUeKcq4+s+lUz53iaJ97Kay2Jxn0wR+ihw4xt0cDc+bC6DhN+4AgtpI2+5HqBsM9DX3d3IFe2umzq8f6tCxT/hsEHjifB1ZemwH22QEFSVBQb6M8XDYYjQ1Sjs4dbQHiC3uQE1GXaRNm6nbtgfWsHDkS66MffjZNQlr6Mwqm2FH1sdJPn/vcNZDg50wwi+Hy9/nU2lRUnNkd3zXtPJ2+2tffD3oC9nW5XVjqSGCgD0R54VhHUInJzYgsBkkgFyhLjNsJzBV0j7YKrmisdlBR2kB6WwFmDLg4Y1J9y3mwdH2u+5CEl9NZdvPA4w2YVBujvFoFDszZugp7fkQIDAQAB';
export function prepareComponent(edit){
 edit('chrome/browser/extensions/component_extensions_allowlist/allowlist.cc',[
  {anchor:'#include "base/logging.h"',replacement:'#include "base/logging.h"\n#include "base/command_line.h"',present:'#include "base/command_line.h"'},
  {anchor:'bool IsComponentExtensionAllowlisted(const std::string& extension_id) {',replacement:`bool IsComponentExtensionAllowlisted(const std::string& extension_id) {
  // Blanc offline component admission probe; not an MV2 core override.
  if (extension_id == "${componentId}" &&
      base::CommandLine::ForCurrentProcess()->HasSwitch("blanc-ubo-component-probe"))
    return true;`,present:'// Blanc offline component admission probe;'}]);
 edit('chrome/browser/extensions/component_loader.cc',[
  {anchor:'void ComponentLoader::AddDefaultComponentExtensionsWithBackgroundPages(\n    bool skip_session_components) {',replacement:`void ComponentLoader::AddDefaultComponentExtensionsWithBackgroundPages(
    bool skip_session_components) {
  // Blanc admission-only probe: explicit disposable/offline launcher required.
  const auto* probe_command = base::CommandLine::ForCurrentProcess();
  if (probe_command->HasSwitch("blanc-ubo-component-probe") &&
      !profile_->IsOffTheRecord()) {
    CHECK(probe_command->HasSwitch("blanc-ubo-offline-probe"));
    CHECK(probe_command->HasSwitch("user-data-dir"));
    CHECK(probe_command->HasSwitch("proxy-server"));
    CHECK(probe_command->HasSwitch("host-resolver-rules"));
    const auto root = probe_command->GetSwitchValuePath("blanc-ubo-component-probe");
    const std::string manifest = probe_command->GetSwitchValueASCII(
        "blanc-ubo-component-manifest");
    CHECK(!manifest.empty());
    CHECK_EQ(Add(manifest, root), "${componentId}");
  }`,present:'// Blanc admission-only probe:'}]);
}
export function generateComponent(output, reloadGuard=false, observe=false, documentStart=false){
 const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),pin=JSON.parse(fs.readFileSync(path.join(repo,'ublock/pinned.json')));
 const files=pin.files.map(file=>{assert(!path.isAbsolute(file.path)&&!file.path.split('/').includes('..'));const bytes=fs.readFileSync(path.join(repo,'ublock/upstream',file.path));assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),file.sha256);return {file,bytes};});
 fs.mkdirSync(output);for(const {file,bytes} of files){const target=path.join(output,file.path);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,bytes);}
 const manifest=JSON.parse(fs.readFileSync(path.join(output,'manifest.json')));manifest.key=componentKey;manifest.incognito='not_allowed';fs.writeFileSync(path.join(output,'manifest.json'),JSON.stringify(manifest,null,2));
 const changes=['manifest.key','manifest.incognito=not_allowed'];
 if(reloadGuard){
  const replace=(file,from,to)=>{const target=path.join(output,file),text=fs.readFileSync(target,'utf8');assert.equal(text.split(from).length,2,'unique payload anchor '+file);fs.writeFileSync(target,text.replace(from,to));};
  fs.copyFileSync(new URL('./ubo-static-delivery.mjs',import.meta.url),path.join(output,'js/blanc-static-delivery.js'));
  fs.copyFileSync(new URL('./ubo-reload-guard.js',import.meta.url),path.join(output,'js/blanc-reload-guard.js'));
  replace('js/storage.js',"import * as sfp from './static-filtering-parser.js';","import * as sfp from './static-filtering-parser.js';\nimport * as blancGuard from './blanc-reload-guard.js';");
  replace('js/storage.js','loadingPromise = this.loadRedirectResources().then(( ) => {','let blancEpoch; loadingPromise = blancGuard.begin().then(epoch => { blancEpoch = epoch; return this.loadRedirectResources(); }).then(( ) => {');
  replace('js/storage.js','            onDone();\n        });','            onDone();\n            return blancGuard.complete(blancEpoch);\n        }).finally(() => { loadingPromise = undefined; });');
  replace('js/storage.js','        loadingPromise = undefined;','        // Shared load remains pending through native readiness acknowledgement.');
  replace('js/start.js',"import './vapi-common.js';","import * as blancGuard from './blanc-reload-guard.js';\nimport './vapi-common.js';");
  replace('js/start.js','webRequest.start();','webRequest.start();\nawait blancGuard.activate(selfieIsValid);\nglobalThis.__blancUboProbe = { reload: () => µb.loadFilterLists(), begin: blancGuard.begin, complete: blancGuard.complete, state: () => ({readyToFilter: µb.readyToFilter}), setFilters: text => { µb.inMemoryFilters = text.split("\\n"); µb.inMemoryFiltersCompiled = ""; } };');
  changes.push('js/storage.js: acknowledged begin before reset, complete after freeze','js/start.js: release after observers start','js/blanc-reload-guard.js');
 }
 if(documentStart){
  assert(reloadGuard,'document gate requires reload guard');
  const replace=(file,from,to)=>{const target=path.join(output,file),text=fs.readFileSync(target,'utf8');assert.equal(text.split(from).length,2,'document-start anchor '+file);fs.writeFileSync(target,text.replace(from,to));};
  replace('js/blanc-reload-guard.js','let earlyEnabled = false;','let earlyEnabled = true;');
  fs.copyFileSync(new URL('./ubo-upstream-delivery.js',import.meta.url),path.join(output,'js/blanc-upstream-delivery.js'));
  replace('js/scriptlet-filtering.js',"import µb from './background.js';", "import µb from './background.js';\nimport { executeScript as blancExecuteScript } from './blanc-upstream-delivery.js';");
  replace('js/scriptlet-filtering.js','vAPI.tabs.executeScript(details.tabId, {','blancExecuteScript(details.tabId, {');
  replace('js/scriptlet-filtering.js','vAPI.tabs.executeScript(tab.id, {','blancExecuteScript(tab.id, {');
  replace('js/start.js','await blancGuard.activate(selfieIsValid);','blancGuard.enableEarlyDrain();\nawait blancGuard.activate(selfieIsValid);');
  const onceKey = '__blancUboOnce_' + crypto.randomBytes(16).toString('hex');
  const wrapperSource = wrapMainWorld.toString();
  replace('js/scriptlet-filtering.js','        const contentScript = [];', `        if (scriptletDetails.mainWorld) scriptletDetails.mainWorld = (${wrapperSource})(scriptletDetails.mainWorld, ${JSON.stringify(onceKey)}, ${JSON.stringify(observe)});\n        const contentScript = [];`);
  changes.push('shared native/extension main-world per-document once marker; observe-only counters');
  fs.copyFileSync(new URL('./ubo-document-start.js',import.meta.url),path.join(output,'js/blanc-document-start.js'));
  fs.copyFileSync(new URL('./ubo-static-content.js',import.meta.url),path.join(output,'js/blanc-static-content.js'));
  manifest.content_scripts.push({ matches: ['http://*/*','https://*/*'], js: ['js/blanc-static-content.js'], all_frames: true, run_at: 'document_idle', match_origin_as_fallback: true });
  fs.writeFileSync(path.join(output,'manifest.json'),JSON.stringify(manifest,null,2));
  changes.push('static origin-fallback isolated receiver; browser-owned live context and generation revalidation');
  replace('js/scriptlet-filtering.js','let scriptletDetails = this.scriptletCache.lookup(hostname);','let scriptletDetails = request.nocache === true ? undefined : this.scriptletCache.lookup(hostname);');
  replace('js/scriptlet-filtering.js','            bcSecret,','            bcSecret,\n            mainWorld: scriptletDetails.mainWorld || "",\n            isolatedCode: scriptletDetails.isolatedWorld ? isolatedWorldInjector.assemble(hostname, scriptletDetails) : "",');
  replace('js/scriptlet-filtering.js','const contentScript = [ scriptletDetails.code ];','const contentScript = [ /^https?:/.test(details.url) ? scriptletDetails.isolatedCode : scriptletDetails.code ];');
  replace('js/start.js','await blancGuard.activate(selfieIsValid);',"await blancGuard.activate(selfieIsValid);\n(await import('./blanc-document-start.js')).start();");
  if (observe) replace('js/start.js',"(await import('./blanc-document-start.js')).start();","(await import('./blanc-document-start.js')).start(true);\nglobalThis.__blancScriptletEngine = (await import('./scriptlet-filtering.js')).default;");
  changes.push('HTTP(S) frame main-world document-bound synchronous gate; ancestor-aware uncached selection; isolated/non-HTTP retain upstream path','js/blanc-document-start.js');
 }
 if(observe){
  assert(reloadGuard,'observer requires readiness guard');
  const target=path.join(output,'js/traffic.js'),text=fs.readFileSync(target,'utf8'),anchor='vAPI.net.setSuspendableListener(onBeforeRequest);';assert.equal(text.split(anchor).length,2);
  fs.writeFileSync(target,text.replace(anchor,`globalThis.__blancUboParityRows = [];
            vAPI.net.setSuspendableListener(details => {
                const input = JSON.parse(JSON.stringify(details));
                const result = onBeforeRequest(details);
                globalThis.__blancUboParityRows.push({input, result: result || {}});
                return result;
            });`));
  changes.push('js/traffic.js: observer returns original listener decision unchanged');
 }
 return {componentId,version:pin.version,verifiedFiles:files.length,changes,scope:reloadGuard?'offline reload-protection prototype; acceptance pending':'offline component admission only; no reload hold or provider acceptance'};
}
if(process.argv[1]===fileURLToPath(import.meta.url))console.log(JSON.stringify(generateComponent(process.argv[2],process.argv.includes('--reload-guard'),process.argv.includes('--observe'),process.argv.includes('--document-start')),null,2));
