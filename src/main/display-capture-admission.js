'use strict';

const ADMISSION_ORDER = [
  ['frameAlive', 'frame'],
  ['userActivationActive', 'activation'],
  ['displayCaptureAllowed', 'policy'],
  ['documentFocused', 'focus'],
  ['documentVisible', 'visible'],
];

function evaluateAdmission(facts) {
  const record = facts && typeof facts === 'object' ? facts : {};
  for (const [key, reason] of ADMISSION_ORDER) {
    if (record[key] !== true) return { ok: false, reason };
  }
  return { ok: true, reason: null };
}

/** Map trusted window/tab/frame facts to the documentVisible admission bit.
 *  WebContents has no isVisible(); callers must use the owning window plus
 *  attachment. frameVisible must be strictly true (probe-verified). */
function evaluateDocumentVisible({
  windowVisible,
  windowMinimized,
  tabAttached,
  frameVisible,
} = {}) {
  return windowVisible === true
    && windowMinimized === false
    && tabAttached === true
    && frameVisible === true;
}

module.exports = { evaluateAdmission, evaluateDocumentVisible };
