// The website's former hosts, retired on October 13, 2026
// (docs/superpowers/specs/2026-10-13-blanc-day-domain-design.md, step 5):
// every path redirects to the same path and query on blanc.day. Its routes
// match these hosts exactly, so tabs.blancbrowser.com (the tab relay shipped
// browsers and store extensions call) never reaches it, and the more specific
// /dl/* routes keep counting downloads on the host they arrive at.
const TARGET = 'https://blanc.day';
const HOSTS = new Set(['blancbrowser.com', 'www.blancbrowser.com', 'www.blanc.day']);

export function redirectFor(requestUrl) {
  const url = new URL(requestUrl);
  if (!HOSTS.has(url.hostname)) return null;
  return `${TARGET}${url.pathname}${url.search}`;
}

export default {
  fetch(request) {
    const location = redirectFor(request.url);
    if (!location) return new Response('Not found', { status: 404 });
    // 301 for pages; 308 keeps the method and body of anything else.
    const status = request.method === 'GET' || request.method === 'HEAD' ? 301 : 308;
    return new Response(null, { status, headers: { Location: location } });
  },
};
