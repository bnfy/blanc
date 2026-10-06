'use strict';

// Which navigation-history entries hold a document loaded past a certificate
// warning (certificate spec §4.5, plan revision 2). Electron exposes no
// stable entry id, so this mirrors the entry list by position. Every case it
// cannot resolve keeps the mark: it fails toward "Not secure". Pure.
const { originKey } = require('./certificate-exceptions');

function emptyEntryMarks() {
  return { urls: [], marks: [], index: -1 };
}

function cloneEntryMarks(state) {
  if (!state || !Array.isArray(state.urls)) return emptyEntryMarks();
  return { urls: [...state.urls], marks: [...state.marks], index: state.index };
}

function freshCertificateRecord({ committedUrl, pending, stored }) {
  const origin = originKey(committedUrl);
  if (!origin) return null;
  if (pending && originKey(pending.url) === origin) return { origin, certificate: pending.certificate };
  if (stored) return { origin, certificate: stored.certificate };
  return null;
}

// Chromium's per-tab navigation entry cap (content::kMaxSessionHistoryEntries).
const MAX_ENTRIES = 50;

// Chromium never rewrites entries below the lower of the old and new active
// index, except when it prunes one entry from the front at its entry cap.
// Returns the prior mirror in new coordinates, or null when unresolvable.
function alignPrior(prior, entryUrls, activeIndex) {
  if (!prior || prior.index < 0) return emptyEntryMarks();
  for (const shift of [0, 1]) {
    const atCap = entryUrls.length === prior.urls.length && entryUrls.length >= MAX_ENTRIES;
    if (shift === 1 && !atCap) continue;
    const stable = Math.min(prior.index - shift, activeIndex);
    let aligned = true;
    for (let j = 0; j < stable; j++) {
      if (prior.urls[j + shift] !== entryUrls[j]) { aligned = false; break; }
    }
    if (aligned) {
      return { urls: prior.urls.slice(shift), marks: prior.marks.slice(shift), index: prior.index - shift };
    }
  }
  return null;
}

function commitEntryMarks(prior, { entryUrls, activeIndex, committedUrl, freshRecord }) {
  const urls = [...entryUrls];
  const aligned = alignPrior(prior, urls, activeIndex);
  if (!aligned) {
    const byOrigin = new Map();
    for (const mark of prior?.marks ?? []) if (mark) byOrigin.set(mark.origin, mark);
    const marks = urls.map((url) => byOrigin.get(originKey(url)) ?? null);
    if (freshRecord) marks[activeIndex] = freshRecord;
    return { state: { urls, marks, index: activeIndex }, record: marks[activeIndex] ?? null };
  }
  const traversal = aligned.index !== activeIndex &&
    aligned.urls.length === urls.length &&
    aligned.urls[activeIndex] === committedUrl;
  const record = freshRecord ?? (traversal ? aligned.marks[activeIndex] ?? null : null);
  const marks = urls.map((url, j) => {
    if (j === activeIndex) return record;
    return aligned.urls[j] === url ? aligned.marks[j] ?? null : null;
  });
  return { state: { urls, marks, index: activeIndex }, record };
}

module.exports = { emptyEntryMarks, cloneEntryMarks, freshCertificateRecord, commitEntryMarks };
