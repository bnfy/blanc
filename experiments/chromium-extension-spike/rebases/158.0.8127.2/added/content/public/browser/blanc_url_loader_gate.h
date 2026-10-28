#ifndef CONTENT_PUBLIC_BROWSER_BLANC_URL_LOADER_GATE_H_
#define CONTENT_PUBLIC_BROWSER_BLANC_URL_LOADER_GATE_H_
#include "content/common/content_export.h"
namespace net { class IsolationInfo; }
namespace network { class URLLoaderFactoryBuilder; }
namespace content {
class BrowserContext;
class RenderFrameHost;
// Registered on the UI thread. Returns whether it appended a factory.
using BlancURLLoaderWrapper = bool (*)(BrowserContext*, RenderFrameHost*, int,
    const net::IsolationInfo&, network::URLLoaderFactoryBuilder&);
CONTENT_EXPORT void SetBlancURLLoaderWrapper(BlancURLLoaderWrapper wrapper);
}
#endif
