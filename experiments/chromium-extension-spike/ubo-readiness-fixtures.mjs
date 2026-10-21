// Exact origins for the offline readiness harness, never remote destinations.
export const readinessHosts = ['page.blanc-fixture.test','allowed.blanc-fixture.test','blocked.blanc-fixture.test','securepubads.g.doubleclick.net'];
export function parseReadinessUrl(value) {
 const url = new URL(value);
 if (url.protocol !== 'https:' || url.port || url.username || url.password || !readinessHosts.includes(url.hostname)) throw Error('Unexpected readiness fixture URL');
 return url;
}
export function isBlockedReadinessUrl(value) {
 const {hostname} = parseReadinessUrl(value);
 return hostname === 'blocked.blanc-fixture.test' || hostname === 'securepubads.g.doubleclick.net';
}
