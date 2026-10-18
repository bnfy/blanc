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
        if ( typeof job.token !== 'string' || !Number.isInteger(job.tabId) || !Number.isInteger(job.frameId) ||
             !Array.isArray(job.ancestors) || job.ancestors.some(url => typeof url !== 'string') ||
             typeof job.url !== 'string' || !/^https?:\/\//.test(job.url) ) { throw Error('Invalid document job'); }
        const store = µb.pageStoreFromTabId(job.tabId);
        // A missing page store is not an exemption. The browser gate times out.
        if ( !store ) { continue; }
        const hostname = hostnameFromURI(job.url);
        const details = store.getNetFilteringSwitch() ? scriptletFilteringEngine.retrieve({
            tabId: job.tabId, frameId: job.frameId, nocache: true, url: job.url, hostname,
            domain: domainFromHostname(hostname), ancestors: job.ancestors.map(url => {
                const hostname = hostnameFromURI(url);
                return { hostname, domain: domainFromHostname(hostname) };
            }),
        }) : undefined;
        const now = current();
        if ( !now.ready || now.generation !== state.generation ) { return; }
        await fetch(`${endpoint}script?${state.generation}`, { method: 'POST', cache: 'no-store',
            body: JSON.stringify({token: job.token, code: details?.mainWorld || ''}),
        });
    }
}
// Late static receivers use the browser's live document context twice, around
// engine selection. A navigation destroys the response channel; generation
// changes deny the response. In-flight delivery/reload atomicity remains a gap.
export async function lateScript(message, sender, audit = () => {}) {
    if ( message?.type !== 'blanc-static-script' || sender.id !== chrome.runtime.id ||
         !sender.tab || sender.tab.incognito || !Number.isInteger(sender.tab.id) ||
         !Number.isInteger(sender.frameId) || typeof sender.documentId !== 'string' ||
         typeof sender.url !== 'string' || typeof sender.origin !== 'string' ||
         !/^(about:|data:|blob:)/.test(sender.url) ) { return; }
    const state = current();
    if ( !state.ready ) { return; }
    const identity = {documentId: sender.documentId, tabId: sender.tab.id,
        frameId: sender.frameId, url: sender.url, origin: sender.origin};
    const options = { method: 'POST', cache: 'no-store', body: JSON.stringify(identity) };
    const context = await fetch(`${endpoint}late-context?${state.generation}`, options);
    if ( context.status !== 200 ) { return; }
    const job = await context.json();
    audit({stage: 'browser-context', job, generation: state.generation});
    if ( job.documentId !== identity.documentId || job.tabId !== identity.tabId || job.frameId !== identity.frameId ||
         typeof job.url !== 'string' || !/^https?:\/\//.test(job.url) || !Array.isArray(job.ancestors) ||
         job.ancestors.some(url => typeof url !== 'string') ) { return; }
    const store = µb.pageStoreFromTabId(job.tabId);
    if ( !store ) { return; }
    const hostname = hostnameFromURI(job.url);
    const details = store.getNetFilteringSwitch() ? scriptletFilteringEngine.retrieve({
        tabId: job.tabId, frameId: job.frameId, nocache: true, url: job.url, hostname,
        domain: domainFromHostname(hostname), ancestors: job.ancestors.map(url => {
            const hostname = hostnameFromURI(url);
            return {hostname, domain: domainFromHostname(hostname)};
        }),
    }) : undefined;
    const confirmed = await fetch(`${endpoint}late-context?${state.generation}`, options);
    const now = current();
    if ( confirmed.status !== 200 || !now.ready || now.generation !== state.generation ) { return; }
    const fresh = await confirmed.json();
    if ( JSON.stringify(job) !== JSON.stringify(fresh) || !current().ready || current().generation !== state.generation ) { return; }
    audit({stage: 'confirmed', job, generation: state.generation, bytes: (details?.mainWorld || '').length});
    return { code: details?.mainWorld || '', generation: state.generation };
}
// No fixture URLs, rule substitutes or preinstalled scriptlets. The active
// engine computes each exact committed document's payload, including exceptions.
export function start(observe = false) {
    const rows = observe ? (globalThis.__blancStaticRows = []) : null;
    chrome.runtime.onMessage.addListener((message, sender, reply) => {
        if ( message?.type !== 'blanc-static-script' ) { return; }
        const row = rows ? {sender: {id: sender.id, tabId: sender.tab?.id, frameId: sender.frameId, documentId: sender.documentId, url: sender.url, origin: sender.origin}, stages: []} : null;
        if ( row ) { rows.push(row); if ( rows.length > 256 ) { rows.shift(); } }
        void lateScript(message, sender, event => row?.stages.push(event)).then(result => {
            if ( row ) { row.replied = !!result; }
            reply(result);
        }, () => reply());
        return true;
    });
    const next = async () => { try { await poll(); } catch { /* browser gate stays closed */ } finally { setTimeout(next, 20); } };
    void next();
}
