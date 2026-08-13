// Pure per-surface capture truth (spec §3.2): grant anchors from the
// main-process permission handler are the ONLY way capture turns on;
// renderer settlements/reports may only refine toward off. No electron
// import — requireable from `node --test` (precedent: permission-decisions).
const { normalizedMediaTypes } = require('./permission-decisions');

const scopeKey = (scopes) => normalizedMediaTypes(scopes).join('+');

function createCaptureRecord() {
  // generation is the Stop-timeout token: a pending "reload if still lit"
  // decision is only honored while the generation it was made against still
  // stands. A new grant (new call) or a clear invalidates it.
  return { anchors: [], frames: new Map(), generation: 0 };
}

function applyGrant(record, { scopes, origin, isMainFrame }) {
  // One anchor PER grant — never merged. Concurrent getUserMedia calls each
  // carry their own; a settlement consumes exactly one.
  record.anchors.push({
    scopes: normalizedMediaTypes(scopes),
    origin,
    isMainFrame: isMainFrame !== false,
    confirmed: false,
  });
  record.generation += 1;
}

function clearRecord(record) {
  record.anchors.length = 0;
  record.frames.clear();
  record.generation += 1;
}

function applySettlement(record, { origin, isMainFrame, outcome, scopes }) {
  const key = scopeKey(scopes);
  const i = record.anchors.findIndex((a) => !a.confirmed
    && a.origin === origin
    && a.isMainFrame === (isMainFrame !== false)
    && scopeKey(a.scopes) === key);
  if (i === -1) return false;
  if (outcome === 'rejected') record.anchors.splice(i, 1);
  else record.anchors[i].confirmed = true;
  return true;
}

function applyFrameReport(record, frameKey, { origin, isMainFrame, audioLive, videoLive }) {
  const audio = Math.max(0, audioLive | 0);
  const video = Math.max(0, videoLive | 0);
  if (audio === 0 && video === 0) record.frames.delete(frameKey);
  else record.frames.set(frameKey, {
    origin, isMainFrame: isMainFrame !== false, audioLive: audio, videoLive: video,
  });
}

function projection(record) {
  let audio = false;
  let video = false;
  for (const a of record.anchors) {
    if (a.confirmed) continue; // a confirmed anchor's truth is the counts
    if (a.scopes.includes('audio')) audio = true;
    if (a.scopes.includes('video')) video = true;
  }
  for (const f of record.frames.values()) {
    if (f.audioLive > 0) audio = true;
    if (f.videoLive > 0) video = true;
  }
  return { audio, video };
}

module.exports = {
  createCaptureRecord, applyGrant, applySettlement, applyFrameReport, projection, clearRecord,
};
