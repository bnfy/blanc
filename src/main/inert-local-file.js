'use strict';
// A local HTML tab restored on a DRM (ECS) build. Those builds never load
// local files, so the tab keeps its saved file URL and metadata as a record
// and shows Blanc's own error page as an inert placeholder: nothing is
// loaded, the file is never opened or checked, and every later save writes
// the original file URL back (session-snapshot's persistableUrl unwraps the
// placeholder). A missing or changed file therefore never deletes the record.
const { isSupportedLocalHtmlUrl } = require('./local-html-files');
const { isInertPageUrl } = require('./document-policy');

const PLACEHOLDER_CODE = 'local-file';

function placeholderUrl(fileUrl) {
  return `blanc://error/?${new URLSearchParams({ url: fileUrl, code: PLACEHOLDER_CODE })}`;
}

/** The file URL behind Blanc's own local-file placeholder, else null. */
function placeholderTarget(url) {
  if (typeof url !== 'string' || !url.startsWith('blanc://error')) return null;
  try {
    const parsed = new URL(url);
    if (parsed.searchParams.get('code') !== PLACEHOLDER_CODE) return null;
    const target = parsed.searchParams.get('url');
    return isSupportedLocalHtmlUrl(target) ? new URL(target).href : null;
  } catch {
    return null;
  }
}

/**
 * What createTab does with a URL and its trusted local-file grant.
 * - Official build: a granted, supported local HTML URL is admitted (loaded).
 * - DRM build: a granted local-file record (the file URL itself, or a closed
 *   tab's placeholder) becomes an inert placeholder that keeps the record.
 * Never admits anything without the main-process grant, and a DRM build
 * never admits a local file for loading.
 */
function localFileTabPlan(url, { drm = false, allowLocalFile = false } = {}) {
  if (drm && allowLocalFile === true) {
    const target = placeholderTarget(url) ?? (isSupportedLocalHtmlUrl(url) ? new URL(url).href : null);
    if (target) {
      return { url: placeholderUrl(target), localFile: true, inertLocalFileUrl: target, localFileUrl: target, admitted: false };
    }
  }
  const admitted = !drm && allowLocalFile === true && isSupportedLocalHtmlUrl(url);
  return { url, localFile: admitted, inertLocalFileUrl: null, localFileUrl: admitted ? new URL(url).href : null, admitted };
}

/** The address a document-policy explanation page (document-policy.js) stands
 * for, or null when the URL is not exactly that page. */
function inertPageTarget(url) {
  if (!isInertPageUrl(url)) return null;
  try { return new URL(new URL(url).searchParams.get('url') || '').href; } catch { return null; }
}

/**
 * Whether a main-frame commit keeps the tab's local-file record: a local HTML
 * document, or Blanc's own placeholder for the very file the grant names —
 * this module's DRM placeholder or document-policy's explanation page for a
 * page-opened tab. `localFileUrl` is the granted file, set only by createTab.
 */
function keepsLocalFile(tab, committedUrl) {
  if (isSupportedLocalHtmlUrl(committedUrl)) return true;
  const file = typeof tab?.localFileUrl === 'string' ? tab.localFileUrl
    : typeof tab?.inertLocalFileUrl === 'string' ? tab.inertLocalFileUrl : null;
  if (!file) return false;
  return placeholderTarget(committedUrl) === file || inertPageTarget(committedUrl) === file;
}

/** Is this tab a DRM build's inert local-file record? */
function isInertRecord(tab) {
  return typeof tab?.inertLocalFileUrl === 'string' && tab.inertLocalFileUrl !== '';
}

/** The title to show and save: an inert record keeps the title it was
 * restored with, never the placeholder page's own. */
function recordTitle(tab, fallback) {
  if (isInertRecord(tab) && typeof tab.inertLocalFileTitle === 'string' && tab.inertLocalFileTitle) {
    return tab.inertLocalFileTitle;
  }
  return fallback;
}

module.exports = {
  PLACEHOLDER_CODE,
  placeholderUrl,
  placeholderTarget,
  localFileTabPlan,
  keepsLocalFile,
  isInertRecord,
  recordTitle,
};
