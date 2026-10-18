// Offline generated-payload integration. GPL-3.0-or-later with pinned uBO.
import µb from './background.js';
import scriptletFilteringEngine from './scriptlet-filtering.js';
import { domainFromHostname, hostnameFromURI } from './uri-utils.js';
import { current } from './blanc-reload-guard.js';
const endpoint = 'http://blanc-ubo-control.invalid/';
async function poll() {
    const state = current();
    if ( !state.ready ) { return; }
    const response = await fetch(`${endpoint}work?${state.generation}`, { cache: 'no-store' });
    if ( response.status !== 200 ) { return; }
    const jobs = await response.json();
    if ( !Array.isArray(jobs) || jobs.length > 64 ) { throw Error('Invalid document jobs'); }
    for ( const job of jobs ) {
        if ( typeof job.token !== 'string' || !Number.isInteger(job.tabId) ||
             typeof job.url !== 'string' || !/^https?:\/\//.test(job.url) ) { throw Error('Invalid document job'); }
        const store = µb.pageStoreFromTabId(job.tabId);
        // A missing page store is not an exemption. The browser gate times out.
        if ( !store ) { continue; }
        const hostname = hostnameFromURI(job.url);
        const details = store.getNetFilteringSwitch() ? scriptletFilteringEngine.retrieve({
            tabId: job.tabId, frameId: 0, url: job.url, hostname,
            domain: domainFromHostname(hostname), ancestors: [],
        }) : undefined;
        const now = current();
        if ( !now.ready || now.generation !== state.generation ) { return; }
        await fetch(`${endpoint}script?${state.generation}`, { method: 'POST', cache: 'no-store',
            body: JSON.stringify({token: job.token, code: details?.mainWorld || ''}),
        });
    }
}
// No fixture URLs, rule substitutes or preinstalled scriptlets. The active
// engine computes each exact committed document's payload, including exceptions.
export function start() {
    const next = async () => { try { await poll(); } catch { /* browser gate stays closed */ } finally { setTimeout(next, 20); } };
    void next();
}
