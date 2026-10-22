#ifndef CHROME_SERVICES_BLANC_BLOCKER_PROXY_H_
#define CHROME_SERVICES_BLANC_BLOCKER_PROXY_H_
#include "chrome/services/blanc_blocker/blocker.mojom.h"
#include "content/public/browser/content_browser_client.h"
namespace content { class NavigationThrottleRegistry; class MojoBinderPolicyMap; class BrowserContext; class RenderFrameHost; }
namespace network { class URLLoaderFactoryBuilder; }
namespace net { class IsolationInfo; }
namespace blanc {
void AddNavigationResponseGate(content::NavigationThrottleRegistry& registry);
content::ContentBrowserClient::WebSocketFactory WrapWebSocketFactory(
    int process_id, int frame_routing_id, const url::Origin& initiator_origin,
    content::ContentBrowserClient::WebSocketFactory factory);
content::ContentBrowserClient::WillCreateWebTransportCallback WrapWebTransportCallback(
    int process_id, int frame_routing_id, const GURL& url,
    const url::Origin& initiator_origin,
    content::ContentBrowserClient::WillCreateWebTransportCallback callback);
void SetDocumentStartPrerenderPolicy(content::MojoBinderPolicyMap& policy_map);
void BindDocumentStart(content::RenderFrameHost* frame, mojo::PendingReceiver<mojom::DocumentStart> receiver);
// Opt-in experimental browser hook; no interception when the asset flag is absent.
void MaybeProxy(content::BrowserContext* context, content::RenderFrameHost* frame,
                int factory_type, const net::IsolationInfo& isolation_info,
                network::URLLoaderFactoryBuilder& builder);
}
#endif
