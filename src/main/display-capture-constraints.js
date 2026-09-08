'use strict';

function parseDisplayMediaOptions(options) {
  const record = options && typeof options === 'object' ? options : {};
  const video = options === undefined || options === null ? undefined : record.video;
  if (video === false || (video !== undefined && video !== true && (typeof video !== 'object' || video === null))) {
    return { ok: false, errorName: 'TypeError', videoRequired: false, audioRequested: false, videoConstraints: null };
  }
  const audio = record.audio;
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
