#ifndef CHROME_SERVICES_BLANC_BLOCKER_PROXY_H_
#define CHROME_SERVICES_BLANC_BLOCKER_PROXY_H_
#include <string>
#include "blanc/services/blocker/blocker.mojom.h"
#include "content/public/browser/commit_deferring_condition.h"
#include "content/public/browser/content_browser_client.h"
namespace content { class NavigationThrottleRegistry; class MojoBinderPolicyMap; class BrowserContext; class RenderFrameHost; class WebContents; }
namespace network { class URLLoaderFactoryBuilder; }
namespace net { class IsolationInfo; }
namespace blanc {
// Read-only process-wide health; never starts or resets the engine.
const char* BlockerHealth();
std::string BlockingHostname(const GURL& url);
bool BlockingEnabled(content::BrowserContext* context);
bool BlockingSiteExcepted(content::BrowserContext* context, const GURL& url);
bool ShouldFilter(content::BrowserContext* context, const GURL& top_url);
bool SetBlockingEnabled(content::BrowserContext* context, bool enabled);
bool SetBlockingSiteException(content::BrowserContext* context,
                              const GURL& url, bool allow);
// Read-only tab-lifetime count; never creates state.
int ShieldBlockedCount(content::WebContents* contents);
void AddNavigationResponseGate(content::NavigationThrottleRegistry& registry);
std::unique_ptr<content::CommitDeferringCondition> MaybeCreateActivationGate(
    content::NavigationHandle& navigation,
    content::CommitDeferringCondition::NavigationType type);
content::ContentBrowserClient::WebSocketFactory WrapWebSocketFactory(
    int process_id, int frame_routing_id, const url::Origin& initiator_origin,
    content::ContentBrowserClient::WebSocketFactory factory);
content::ContentBrowserClient::WillCreateWebTransportCallback WrapWebTransportCallback(
    int process_id, int frame_routing_id, const GURL& url,
    const url::Origin& initiator_origin,
    content::ContentBrowserClient::WillCreateWebTransportCallback callback);
void SetDocumentStartPrerenderPolicy(content::MojoBinderPolicyMap& policy_map);
void BindCosmetics(content::RenderFrameHost* frame, mojo::PendingReceiver<mojom::Cosmetics> receiver);
void BindDocumentStart(content::RenderFrameHost* frame, mojo::PendingReceiver<mojom::DocumentStart> receiver);
// Opt-in experimental browser hook; no interception when the asset flag is absent.
bool MaybeProxy(content::BrowserContext* context, content::RenderFrameHost* frame,
                int factory_type, const net::IsolationInfo& isolation_info,
                network::URLLoaderFactoryBuilder& builder);
}
#endif
