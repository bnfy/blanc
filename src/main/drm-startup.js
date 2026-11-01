'use strict';

// Candidate only: component installation is optional browser functionality.
// Its bounded, single-flight adapter owns installation; it must never gate UI.
function isWidevineComponentError(error, id) {
  if (!(error instanceof Error) || !id) return false;
  if (error.constructor?.name === 'ComponentError') {
    return error.detail?.id === id && typeof error.detail?.status === 'string';
  }
  return error.constructor?.name === 'ComponentsError'
    && Array.isArray(error.errors) && error.errors.length > 0 && error.errors.length <= 8
    && error.errors.every(item => isWidevineComponentError(item, id));
}

function startCandidateDrm({ drm, update }) {
  update({ drm: { state: 'preparing', playbackVerified: false } });
  return Promise.resolve().then(() => drm.prepare()).then(async result => {
    const component = await drm.inspect();
    update({ drm: result, component });
    return result;
  }).catch(() => {
    const result = { state: 'installation-failed', playbackVerified: false };
    update({ drm: result });
    return result;
  });
}
module.exports = { startCandidateDrm, isWidevineComponentError };
