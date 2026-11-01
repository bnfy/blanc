'use strict';

// Link routing (#1199): reports a link the person activated in a tab's
// top-level page, so a link rule may send the new tab it opens to another
// profile or Space (routeInAppLink in main.js). A routed tab is built fresh
// in another session, so it must never come from a document whose sandbox a
// child would inherit:
//   - main frames only (session preloads reach only main frames here, and
//     this checks too), so a sandboxed iframe never reports;
//   - never an opaque-origin document (a sandbox without allow-same-origin);
//   - trusted events only, which a page can't synthesize, and a link's own
//     element: a page calling window.open() or el.click() reports nothing.
// It sends the link's http(s) address and nothing else.

const { ipcRenderer } = require('electron');

const LINK_ROUTE_ACTIVATED_CHANNEL = 'link-route:activated';
const MAX_URL_LENGTH = 8192;

if (process.isMainFrame && /^https?:$/.test(window.location.protocol)) {
  const report = (event) => {
    if (!event.isTrusted || window.origin === 'null') return;
    // A primary click (or Enter on a focused link) or a middle-click.
    if (event.type === 'click' ? event.button !== 0 : event.button !== 1) return;
    const link = event.composedPath().find((node) => node instanceof HTMLAnchorElement || node instanceof HTMLAreaElement);
    const href = link?.href;
    if (typeof href !== 'string' || href.length > MAX_URL_LENGTH || !/^https?:/i.test(href)) return;
    ipcRenderer.send(LINK_ROUTE_ACTIVATED_CHANNEL, href);
  };
  window.addEventListener('click', report, true);
  window.addEventListener('auxclick', report, true);
}
