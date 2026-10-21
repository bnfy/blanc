/* global vAPI, chrome */
// GPL-3.0-or-later with the generated pinned uBO payload.
import { upstreamDeliveries } from './blanc-static-delivery.js';
import { current } from './blanc-reload-guard.js';
export function executeScript(tabId, options) {
    const generation = current().generation;
    if ( !current().ready || (options.allFrames === true && options.frameId !== undefined) ) { return Promise.resolve([]); }
    const sender = {id:'upstream-api', tab:{id:tabId}, frameId:options.frameId ?? 0};
    const token = upstreamDeliveries.acquire(sender);
    if ( !token ) { return Promise.resolve([]); }
    // Hold before the browser snapshot; a reload cannot overtake this lookup.
    // The native API rechecks this exact document after loading the helper file.
    return Promise.resolve().then(() => options.allFrames === true
        ? chrome.webNavigation.getAllFrames({tabId})
        : chrome.webNavigation.getFrame({tabId, frameId:sender.frameId}).then(frame => frame ? [{...frame, frameId:sender.frameId}] : [])
    ).then(frames => {
        if ( !Array.isArray(frames) || frames.length === 0 || frames.length > 64 ) { return []; }
        const dispatch = frame => {
        if ( !frame || !Number.isInteger(frame.frameId) || frame.frameId < 0 || typeof frame.documentId !== 'string' || !frame.documentId ||
             !current().ready || current().generation !== generation ) { return []; }
        return vAPI.tabs.executeScript(tabId, {...options, allFrames:false, frameId:frame.frameId, blancDocumentId:frame.documentId});
        };
        return frames.length === 1 ? dispatch(frames[0]) : Promise.all(frames.map(frame => Promise.resolve().then(() => dispatch(frame)).catch(() => []))).then(results => results.flat());
    }).finally(() => {
        upstreamDeliveries.acknowledge(token, sender);
    }).catch(() => []);
}
