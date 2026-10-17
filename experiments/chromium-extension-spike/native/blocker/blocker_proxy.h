#ifndef CHROME_SERVICES_BLANC_BLOCKER_PROXY_H_
#define CHROME_SERVICES_BLANC_BLOCKER_PROXY_H_
namespace content { class BrowserContext; class RenderFrameHost; }
namespace network { class URLLoaderFactoryBuilder; }
namespace net { class IsolationInfo; }
namespace blanc {
// Opt-in experimental browser hook; no interception when the asset flag is absent.
void MaybeProxy(content::BrowserContext* context, content::RenderFrameHost* frame,
                int factory_type, const net::IsolationInfo& isolation_info,
                network::URLLoaderFactoryBuilder& builder);
}
#endif
