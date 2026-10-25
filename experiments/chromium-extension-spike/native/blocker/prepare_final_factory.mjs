import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {writeIfChanged as write} from './write-file.mjs';
export function prepareFinalFactory(src) {
  const here=path.dirname(fileURLToPath(import.meta.url));
  write(path.join(src,'content/public/browser/blanc_url_loader_gate.h'),fs.readFileSync(path.join(here,'blanc_url_loader_gate.h')));
  function patch(file,marker,before,after) {
    const p=path.join(src,file),s=fs.readFileSync(p,'utf8');
    if(s.includes(marker))return;
    if(s.split(before).length!==2)throw Error('final factory anchor mismatch '+file+' '+marker);
    write(p,s.replace(before,after));
  }
  const client=path.join(src,'chrome/browser/chrome_content_browser_client.cc');
  let source=fs.readFileSync(client,'utf8');
  const old='  // Blanc network factories only; WebUI/data/file loaders keep their own protocol.\n  if (is_for_network_service)\n    blanc::MaybeProxy(browser_context, frame, static_cast<int>(type), isolation_info, factory_builder);\n\n';
  if(source.includes(old))write(client,source.replace(old,''));
  else if(source.includes('blanc::MaybeProxy('))throw Error('unexpected legacy Blanc factory hook');
  patch('chrome/browser/chrome_content_browser_client.cc','content/public/browser/blanc_url_loader_gate.h',
    '#include "chrome/services/blanc_blocker/blocker_proxy.h"',
    '#include "chrome/services/blanc_blocker/blocker_proxy.h"\n#include "content/public/browser/blanc_url_loader_gate.h"');
  patch('chrome/browser/chrome_content_browser_client.cc','SetBlancURLLoaderWrapper',
    'ChromeContentBrowserClient::ChromeContentBrowserClient() {',
    'ChromeContentBrowserClient::ChromeContentBrowserClient() {\n  content::SetBlancURLLoaderWrapper(&blanc::MaybeProxy);');
  patch('content/browser/loader/url_loader_factory_utils.h','void FinalizeBlancFactory(',
    ' private:\n  raw_ptr<BrowserContext> browser_context_;',
    '  // Append the blocker after request-mutating proxies, including overrides.\n  void FinalizeBlancFactory(network::URLLoaderFactoryBuilder& factory_builder,\n      network::mojom::URLLoaderFactoryOverridePtr* factory_override,\n      ContentBrowserClient::URLLoaderFactoryType type);\n\n private:\n  raw_ptr<BrowserContext> browser_context_;');
  patch('content/browser/loader/url_loader_factory_utils.cc','content/public/browser/blanc_url_loader_gate.h',
    '#include "content/browser/loader/url_loader_factory_utils.h"',
    '#include "content/browser/loader/url_loader_factory_utils.h"\n#include "content/public/browser/blanc_url_loader_gate.h"\n#include "mojo/public/cpp/bindings/remote.h"');
  patch('content/browser/loader/url_loader_factory_utils.cc','void SetBlancURLLoaderWrapper(',
    'namespace content {\nnamespace url_loader_factory {',
    'namespace content {\nnamespace { BlancURLLoaderWrapper g_blanc_url_loader_wrapper = nullptr; }\nvoid SetBlancURLLoaderWrapper(BlancURLLoaderWrapper wrapper) {\n  g_blanc_url_loader_wrapper = wrapper;\n}\nnamespace url_loader_factory {');
  patch('content/browser/loader/url_loader_factory_utils.cc','void ContentClientParams::FinalizeBlancFactory(',
    'ContentClientParams::~ContentClientParams() = default;',
`ContentClientParams::~ContentClientParams() = default;

void ContentClientParams::FinalizeBlancFactory(
    network::URLLoaderFactoryBuilder& factory_builder,
    network::mojom::URLLoaderFactoryOverridePtr* factory_override,
    ContentBrowserClient::URLLoaderFactoryType type) {
  if (!g_blanc_url_loader_wrapper) return;
  if (factory_override && *factory_override) {
    // DevTools restarts modified requests using this inner target. An outer
    // builder entry cannot see those requests. Preserve the override and all
    // its CORS settings, inserting only at its downstream receiver.
    network::URLLoaderFactoryBuilder inner;
    if (!g_blanc_url_loader_wrapper(browser_context_.get(), frame_.get(),
          static_cast<int>(type), isolation_info_.get(), inner)) return;
    mojo::PendingRemote<network::mojom::URLLoaderFactory> target;
    auto receiver = target.InitWithNewPipeAndPassReceiver();
    auto proxy = std::move(inner)
        .Finish<mojo::PendingRemote<network::mojom::URLLoaderFactory>>(std::move(target));
    mojo::FusePipes(std::move((*factory_override)->overridden_factory_receiver),
                    std::move(proxy));
    (*factory_override)->overridden_factory_receiver = std::move(receiver);
  } else {
    g_blanc_url_loader_wrapper(browser_context_.get(), frame_.get(),
        static_cast<int>(type), isolation_info_.get(), factory_builder);
  }
}`);
  patch('content/browser/loader/url_loader_factory_utils.cc','content_client_params->FinalizeBlancFactory(',
    '  if (auto terminal_url_loader_factory =\n          terminal_params.TakeURLLoaderFactory()) {',
    '  if (content_client_params && terminal_params.is_for_network_service()) {\n    content_client_params->FinalizeBlancFactory(factory_builder, factory_override_ptr, type);\n  }\n\n  if (auto terminal_url_loader_factory =\n          terminal_params.TakeURLLoaderFactory()) {');
}
