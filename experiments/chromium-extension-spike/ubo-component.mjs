// Offline admission probe only. No provider readiness/reload protection claim.
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
export function generateComponent(output){
 const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),pin=JSON.parse(fs.readFileSync(path.join(repo,'ublock/pinned.json')));
 const files=pin.files.map(file=>{assert(!path.isAbsolute(file.path)&&!file.path.split('/').includes('..'));const bytes=fs.readFileSync(path.join(repo,'ublock/upstream',file.path));assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),file.sha256);return {file,bytes};});
 fs.mkdirSync(output);for(const {file,bytes} of files){const target=path.join(output,file.path);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,bytes);}
 const manifest=JSON.parse(fs.readFileSync(path.join(output,'manifest.json')));manifest.key=componentKey;manifest.incognito='not_allowed';fs.writeFileSync(path.join(output,'manifest.json'),JSON.stringify(manifest,null,2));
 return {componentId,version:pin.version,verifiedFiles:files.length,changes:['manifest.key','manifest.incognito=not_allowed'],scope:'offline component admission only; no reload hold or provider acceptance'};
}
if(process.argv[1]===fileURLToPath(import.meta.url))console.log(JSON.stringify(generateComponent(process.argv[2]),null,2));
