/* global vAPI */
// GPL-3.0-or-later with the generated pinned uBO payload.
import { upstreamDeliveries } from './blanc-static-delivery.js';
import { current } from './blanc-reload-guard.js';
// No await separates readiness, lease acquisition and the actual API dispatch.
// The pinned API settles after execution replies, refusal, or target destruction.
// It does not identify the exact document or cover asynchronous scriptlet effects.
export function executeScript(tabId, options) {
    if ( !current().ready ) { return; }
    const sender = {id:'upstream-api', tab:{id:tabId}, frameId:options.frameId};
    const token = upstreamDeliveries.acquire(sender);
    if ( !token ) { return; }
    try {
        Promise.resolve(vAPI.tabs.executeScript(tabId, options)).finally(() => {
            upstreamDeliveries.acknowledge(token, sender);
        }).catch(() => {});
    } catch {
        // A synchronous throw has not queued a browser API invocation.
        upstreamDeliveries.acknowledge(token, sender);
    }
}
