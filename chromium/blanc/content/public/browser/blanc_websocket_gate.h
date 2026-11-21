// Blanc prototype socket gate. UI-thread registration; no bound owner state.
#ifndef CONTENT_PUBLIC_BROWSER_BLANC_WEBSOCKET_GATE_H_
#define CONTENT_PUBLIC_BROWSER_BLANC_WEBSOCKET_GATE_H_
#include "content/public/browser/content_browser_client.h"
namespace content {
using BlancWebSocketWrapper = ContentBrowserClient::WebSocketFactory (*)(
    int, int, const url::Origin&, ContentBrowserClient::WebSocketFactory);
CONTENT_EXPORT void SetBlancWebSocketWrapper(BlancWebSocketWrapper wrapper);
}
#endif
