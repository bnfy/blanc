// Generate a separate review-only candidate. No source checkout is modified.
import fs from 'node:fs'; import path from 'node:path'; import crypto from 'node:crypto';
const src='<local-home>/Projects/BlancChromium158/src';
const out='<local-home>/Documents/ChatGPT/Blanc Browser/Chromium Preview/evidence/blocker-navigation-id-20261029-v2';
if(fs.existsSync(out))throw new Error('refusing to overwrite evidence');fs.mkdirSync(out,{recursive:true});
const paths=['content/public/browser/blanc_url_loader_gate.h','content/browser/loader/url_loader_factory_utils.cc','content/browser/loader/navigation_url_loader_impl.cc','chrome/services/blanc_blocker/blocker_proxy.h','chrome/services/blanc_blocker/blocker_proxy.cc'];
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');let report={sourceRoot:src,files:{},shippingRelease:'v1.45.0',shippingSource:'6f1bc523d2f0d432d5c4119b9f7ec22a324dbd2d'};
for(const name of paths){const original=fs.readFileSync(path.join(src,name),'utf8');let text=original;const once=(a,b)=>{if(text.split(a).length!==2)throw new Error('anchor mismatch '+name+' '+a);text=text.replace(a,b)};
 if(name.endsWith('blanc_url_loader_gate.h')){
  once('#include "content/common/content_export.h"','#include <cstdint>\n#include <optional>\n#include "content/common/content_export.h"');
  once('const net::IsolationInfo&, network::URLLoaderFactoryBuilder&);','const net::IsolationInfo&, std::optional<int64_t>, network::URLLoaderFactoryBuilder&);');
 }
 if(name.endsWith('url_loader_factory_utils.cc')){
  once('static_cast<int>(type), isolation_info_.get(), inner)', 'static_cast<int>(type), isolation_info_.get(), navigation_id_, inner)');
  once('static_cast<int>(type), isolation_info_.get(), factory_builder)', 'static_cast<int>(type), isolation_info_.get(), navigation_id_, factory_builder)');
  once('std::move(navigation_id_), std::move(ukm_source_id_), factory_builder,','navigation_id_, std::move(ukm_source_id_), factory_builder,');
 }
 if(name.endsWith('navigation_url_loader_impl.cc')){
  once('  GetContentClient()->browser()->WillCreateURLLoaderFactory(\n      browser_context, frame_tree_node->current_frame_host(),', '  const int64_t blanc_navigation_id = frame_tree_node->navigation_request()->GetNavigationId();\n  GetContentClient()->browser()->WillCreateURLLoaderFactory(\n      browser_context, frame_tree_node->current_frame_host(),');
  once('      frame_tree_node->navigation_request()->GetNavigationId(), ukm_id,\n      factory_builder, &header_client, bypass_redirect_checks,', '      blanc_navigation_id, ukm_id,\n      factory_builder, &header_client, bypass_redirect_checks,');
  once('      url::Origin(), net::IsolationInfo(), ukm_id)\n      .FinalizeBlancFactory', '      url::Origin(), net::IsolationInfo(), ukm_id,\n      /*bypass_redirect_checks=*/nullptr, blanc_navigation_id)\n      .FinalizeBlancFactory');
 }
 if(name.endsWith('blocker_proxy.h')){
  once('#include <string>','#include <cstdint>\n#include <optional>\n#include <string>');
  once('int factory_type, const net::IsolationInfo& isolation_info,\n                network::URLLoaderFactoryBuilder& builder);','int factory_type, const net::IsolationInfo& isolation_info,\n                std::optional<int64_t> navigation_id,\n                network::URLLoaderFactoryBuilder& builder);');
 }
 if(name.endsWith('blocker_proxy.cc')){
  once('  net::IsolationInfo isolation_info;\n};','  net::IsolationInfo isolation_info;\n  // Browser-supplied only; present for navigation factories, never a URL or renderer ID.\n  std::optional<int64_t> navigation_id;\n};');
  once('int factory_type, const net::IsolationInfo& isolation_info,\n                network::URLLoaderFactoryBuilder& builder) {','int factory_type, const net::IsolationInfo& isolation_info,\n                std::optional<int64_t> navigation_id,\n                network::URLLoaderFactoryBuilder& builder) {');
  once('  auto [receiver, remote] = builder.Append();\n  base::MakeSelfDeleting<Factory>','  if (factory_type != static_cast<int>(content::ContentBrowserClient::URLLoaderFactoryType::kNavigation))\n    navigation_id.reset();\n  auto [receiver, remote] = builder.Append();\n  base::MakeSelfDeleting<Factory>');
  once('context->IsOffTheRecord(), frame ? frame->GetGlobalId() : content::GlobalRenderFrameHostId(), factory_type, isolation_info});','context->IsOffTheRecord(), frame ? frame->GetGlobalId() : content::GlobalRenderFrameHostId(), factory_type, isolation_info, navigation_id});');
 }
 const dst=path.join(out,'candidate',name);fs.mkdirSync(path.dirname(dst),{recursive:true});fs.writeFileSync(dst,text);report.files[name]={original:sha(original),candidate:sha(text)};
}
fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(report,null,2)+'\n');console.log('Five-file isolated candidate created; navigation ID is carried but not used, persisted or logged.');
