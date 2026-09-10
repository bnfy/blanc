'use strict';

function parseDisplayMediaOptions(options) {
  const record = options && typeof options === 'object' ? options : {};
  const video = options === undefined || options === null ? undefined : record.video;
  if (video === false || (video !== undefined && video !== true && (typeof video !== 'object' || video === null))) {
    return { ok: false, errorName: 'TypeError', videoRequired: false, audioRequested: false, videoConstraints: null };
  }
  const audio = record.audio;
  // getDisplayMedia forbids advanced/min/exact constraints before consent.
  // Max/ideal constraints are evaluated against the chosen source afterward.
  for (const constraints of [video, audio]) {
    if (!constraints || typeof constraints !== 'object') continue;
    if ('advanced' in constraints || Object.values(constraints).some((value) => (
      value && typeof value === 'object' && ('min' in value || 'exact' in value)
    ))) return { ok: false, errorName: 'TypeError' };
  }
  const audioRequested = audio === true || (typeof audio === 'object' && audio !== null);
  const videoConstraints = typeof video === 'object' && video !== null ? video : null;
  return {
    ok: true,
    errorName: null,
    videoRequired: true,
    audioRequested,
    videoConstraints,
  };
}

module.exports = { parseDisplayMediaOptions };
