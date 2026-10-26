import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {prepareFinalFactory} from './prepare_final_factory.mjs';
function fixture(t,legacy='') {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'blanc-final-factory-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const sources={
    'chrome/browser/chrome_content_browser_client.cc':'#include "chrome/services/blanc_blocker/blocker_proxy.h"\nChromeContentBrowserClient::ChromeContentBrowserClient() {\n}\n'+legacy,
    'content/browser/loader/navigation_url_loader_impl.cc':'void CreateNetworkLoaderFactory() {\n  devtools_params.Run();\n  net::CookieSettingOverrides devtools_cookie_overrides;\n}\n',
    'content/browser/loader/url_loader_factory_utils.h':'class ContentClientParams {\n private:\n  raw_ptr<BrowserContext> browser_context_;\n};\n',
    'content/browser/loader/url_loader_factory_utils.cc':'#include "content/browser/loader/url_loader_factory_utils.h"\nnamespace content {\nnamespace url_loader_factory {\nContentClientParams::~ContentClientParams() = default;\nvoid Create() {\n  if (auto terminal_url_loader_factory =\n          terminal_params.TakeURLLoaderFactory()) {\n  }\n}\n}\n}\n'
  };
  for(const [name,text] of Object.entries(sources)){fs.mkdirSync(path.dirname(path.join(root,name)),{recursive:true});fs.writeFileSync(path.join(root,name),text);}
  return {root,read:name=>fs.readFileSync(path.join(root,name),'utf8'),names:[...Object.keys(sources),'content/public/browser/blanc_url_loader_gate.h']};
}
test('fresh preparation places one gate inside overrides and is idempotent',t=>{
  const f=fixture(t);prepareFinalFactory(f.root);
  const source=f.read('content/browser/loader/url_loader_factory_utils.cc');
  assert.match(source,/factory_override && \*factory_override/);
  assert.match(source,/overridden_factory_receiver = std::move\(receiver\)/);
  assert.match(source,/content_client_params && terminal_params.is_for_network_service\(\)/);
  const navigation=f.read('content/browser/loader/navigation_url_loader_impl.cc');
  assert(navigation.indexOf('devtools_params.Run()') < navigation.indexOf('.FinalizeBlancFactory('));
  assert(navigation.indexOf('.FinalizeBlancFactory(') < navigation.indexOf('net::CookieSettingOverrides devtools_cookie_overrides;'));
  const before=f.names.map(f.read);prepareFinalFactory(f.root);assert.deepEqual(f.names.map(f.read),before);
});
test('migration removes the old outer gate instead of duplicating it',t=>{
  const f=fixture(t,'  // Blanc network factories only; WebUI/data/file loaders keep their own protocol.\n  if (is_for_network_service)\n    blanc::MaybeProxy(browser_context, frame, static_cast<int>(type), isolation_info, factory_builder);\n\n');
  prepareFinalFactory(f.root);assert.doesNotMatch(f.read('chrome/browser/chrome_content_browser_client.cc'),/if \(is_for_network_service\)/);
  assert.match(f.read('chrome/browser/chrome_content_browser_client.cc'),/SetBlancURLLoaderWrapper\(&blanc::MaybeProxy\)/);
});
test('unknown old hook is rejected instead of retaining an extra gate',t=>{
  const f=fixture(t,'void Legacy() { blanc::MaybeProxy(unknown); }\n');
  assert.throws(()=>prepareFinalFactory(f.root),/unexpected legacy Blanc factory hook/);
});

test('a changed navigation assembly anchor fails closed',t=>{
  const f=fixture(t);
  fs.writeFileSync(path.join(f.root,'content/browser/loader/navigation_url_loader_impl.cc'),'void UnknownNavigationAssembly() {}\n');
  assert.throws(()=>prepareFinalFactory(f.root),/final factory anchor mismatch content\/browser\/loader\/navigation_url_loader_impl.cc/);
});
