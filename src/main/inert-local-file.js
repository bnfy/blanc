'use strict';
// A local HTML tab restored on a DRM (ECS) build. Those builds never load
// local files, so the tab keeps its saved file URL and metadata as a record
// and shows Blanc's own error page as an inert placeholder: nothing is
// loaded, the file is never opened or checked, and every later save writes
// the original file URL back (session-snapshot's persistableUrl unwraps the
// placeholder). A missing or changed file therefore never deletes the record.
const { isSupportedLocalHtmlUrl } = require('./local-html-files');

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
    if (target) return { url: placeholderUrl(target), localFile: true, inertLocalFileUrl: target, admitted: false };
  }
  const admitted = !drm && allowLocalFile === true && isSupportedLocalHtmlUrl(url);
  return { url, localFile: admitted, inertLocalFileUrl: null, admitted };
}

/** Whether a main-frame commit keeps the tab's local-file record. */
function keepsLocalFile(tab, committedUrl) {
  if (isSupportedLocalHtmlUrl(committedUrl)) return true;
  return typeof tab?.inertLocalFileUrl === 'string' && placeholderTarget(committedUrl) === tab.inertLocalFileUrl;
}

module.exports = { PLACEHOLDER_CODE, placeholderUrl, placeholderTarget, localFileTabPlan, keepsLocalFile };
