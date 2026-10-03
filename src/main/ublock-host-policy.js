'use strict';

function validBridgeSender(event, wc, session, url) {
  return !!wc && !wc.isDestroyed() && event.sender === wc
    && event.senderFrame === wc.mainFrame && wc.session === session
    && wc.getURL() === url;
}

function matchesPattern(pattern, value) {
  if (pattern === 'abp:*') return /^abp:/.test(value || '');
  if (pattern === '<all_urls>') return /^(https?|file|ftp):/.test(value || '');
  const parsed = /^(\*|https?|file|ftp):\/\/([^/]*)(\/.*)$/.exec(pattern);
  if (!parsed) return false;
  let url;
  try { url = new URL(value); } catch { return false; }
  if (parsed[1] === '*' ? !['http:', 'https:'].includes(url.protocol) : `${parsed[1]}:` !== url.protocol) return false;
  const host = parsed[2];
  if (host !== '*' && host !== url.hostname
    && !(host.startsWith('*.') && (url.hostname === host.slice(2) || url.hostname.endsWith(host.slice(1))))) return false;
  const expression = parsed[3].split('*').map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*');
  return new RegExp(`^${expression}$`).test(url.pathname + url.search);
}

function contextMenuMatches(item, params) {
  if (item.enabled === false || item.visible === false || !item.title) return false;
  const contexts = new Set(['page']);
  if (params.frameURL && params.frameURL !== params.pageURL) contexts.add('frame');
  if (params.linkURL) contexts.add('link');
  if (params.selectionText) contexts.add('selection');
  if (params.isEditable) contexts.add('editable');
  if (['image', 'audio', 'video'].includes(params.mediaType)) contexts.add(params.mediaType);
  if (!(item.contexts || ['page']).some(value => value === 'all' || contexts.has(value))) return false;
  if (item.documentUrlPatterns && !item.documentUrlPatterns.some(pattern => matchesPattern(pattern, params.frameURL || params.pageURL))) return false;
  if (item.targetUrlPatterns && !item.targetUrlPatterns.some(pattern => matchesPattern(pattern, params.linkURL || params.srcURL))) return false;
  return true;
}

module.exports = { validBridgeSender, matchesPattern, contextMenuMatches };
