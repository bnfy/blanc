/* global chrome */
'use strict';
// A small first-party MV3 API host supplies native USER-origin CSS. It has
// no filtering engine, subscriptions, background worker, or public page API.
const operations = new Map();
window.blancUboBridge.listen(async message => {
  try {
    if (message.kind === 'css-apply') {
      const operation = operations.get(message.id); if (!operation) return;
      operations.delete(message.id); clearTimeout(operation.timer);
      if (message.allowed !== true) throw new Error('ubo-document-stale');
      await chrome.scripting.insertCSS(operation.options);
      window.blancUboBridge.send({ kind: 'css-result', id: message.id, target: operation.options.target });
      return;
    }
    if (message.kind !== 'css' || !['insertCSS', 'removeCSS'].includes(message.method)) return;
    if (message.method === 'removeCSS') {
      await chrome.scripting.removeCSS(message.options);
      window.blancUboBridge.send({ kind: 'css-result', id: message.id });
      return;
    }
    if (operations.size >= 256) throw new Error('ubo-css-capacity');
    // Fixed probe only. Native documentIds scope the following insertion to
    // these exact documents, even if their frame IDs navigate in the meantime.
    const results = await chrome.scripting.executeScript({ target: message.options.target, func: () => 0 });
    const documentIds = results.map(result => result.documentId);
    if (!documentIds.length || documentIds.some(id => typeof id !== 'string')) throw new Error('ubo-document-unavailable');
    const target = { tabId: message.options.target.tabId, documentIds };
    const timer = setTimeout(() => operations.delete(message.id), 2000);
    operations.set(message.id, { options: { ...message.options, target }, timer });
    window.blancUboBridge.send({ kind: 'css-target', id: message.id });
  } catch {
    window.blancUboBridge.send({ kind: 'css-result', id: message.id, error: 'ubo-css-failed' });
  }
});
window.blancUboBridge.send({ kind: 'css-ready' });
