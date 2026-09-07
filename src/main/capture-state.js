// Pure per-surface capture truth (spec §3.2): grant anchors from the
// main-process permission handler are the ONLY way capture turns on;
// renderer settlements/reports may only refine toward off. No electron
// import — requireable from `node --test` (precedent: permission-decisions).
const normalizedMediaTypes = (scopes) => [...new Set((Array.isArray(scopes) ? scopes : [])
  .filter((scope) => ['audio', 'video', 'display', 'systemAudio'].includes(scope)))].sort();

// Display consent may omit requested audio. One display request per native
// frame is allowed by the controller; its settlement matches the display API,
// then actual track counts establish whether computer audio was included.
const scopeKey = (scopes) => normalizedMediaTypes(scopes).includes('display')
  ? 'display' : normalizedMediaTypes(scopes).join('+');

function createCaptureRecord() {
  // generation is the Stop-timeout token: a pending "reload if still lit"
  // decision is only honored while the generation it was made against still
  // stands. A new grant (new call) or a clear invalidates it.
  return { anchors: [], frames: new Map(), generation: 0 };
}

function applyGrant(record, { scopes, origin, isMainFrame }) {
  // One anchor PER grant — never merged. Concurrent getUserMedia calls each
  // carry their own; a settlement consumes exactly one.
  record.stopFailed = false;
  record.anchors.push({
    scopes: normalizedMediaTypes(scopes),
    origin,
    isMainFrame: isMainFrame !== false,
    confirmed: false,
  });
  record.generation += 1;
}

function clearRecord(record) {
  record.stopFailed = false;
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

function applyFrameReport(record, frameKey, { origin, isMainFrame, audioLive, videoLive, displayLive, systemAudioLive }) {
  const authorized = (scope) => record.anchors.some((anchor) => anchor.origin === origin
    && anchor.isMainFrame === (isMainFrame !== false) && anchor.scopes.includes(scope));
  const audio = authorized('audio') ? Math.max(0, audioLive | 0) : 0;
  const video = authorized('video') ? Math.max(0, videoLive | 0) : 0;
  const display = authorized('display') ? Math.max(0, displayLive | 0) : 0;
  const systemAudio = authorized('systemAudio') ? Math.max(0, systemAudioLive | 0) : 0;
  if (audio === 0 && video === 0 && display === 0 && systemAudio === 0) record.frames.delete(frameKey);
  else record.frames.set(frameKey, {
    origin, isMainFrame: isMainFrame !== false, audioLive: audio, videoLive: video,
    displayLive: display, systemAudioLive: systemAudio,
  });
}

function projection(record) {
  let audio = false;
  let video = false;
  let display = false;
  let systemAudio = false;
  for (const a of record.anchors) {
    if (a.confirmed) continue; // a confirmed anchor's truth is the counts
    if (a.scopes.includes('audio')) audio = true;
    if (a.scopes.includes('video')) video = true;
    if (a.scopes.includes('display')) display = true;
    if (a.scopes.includes('systemAudio')) systemAudio = true;
  }
  for (const f of record.frames.values()) {
    if (f.audioLive > 0) audio = true;
    if (f.videoLive > 0) video = true;
    if (f.displayLive > 0) display = true;
    if (f.systemAudioLive > 0) systemAudio = true;
  }
  const hasDisplayGrant = record.anchors.some((a) => a.scopes.includes('display'));
  return { audio, video, ...(hasDisplayGrant || display || systemAudio ? { display, systemAudio } : {}) };
}

module.exports = {
  createCaptureRecord, applyGrant, applySettlement, applyFrameReport, projection, clearRecord,
};
