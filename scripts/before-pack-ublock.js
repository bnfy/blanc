'use strict';
// Local owner validation may package the candidate for inspection. All public
// release paths must clear the legal gate; there is no unsigned fallback.
module.exports = function beforePackUblock(context) {
  require('./check-ublock-package.cjs');
  require('./build-ublock-adaptation.cjs');
  const internal = process.env.BLANC_UBLOCK_INTERNAL_BUILD === '1';
  const metadata = context.packager.config.extraMetadata || {};
  if ((metadata.blancUblockInternalValidation || context.packager.info.metadata.blancUblockInternalValidation) && !internal) throw new Error('uBlock internal validation marker forbidden in public build');
  // extraMetadata is embedded in app.asar and covered by executable integrity.
  // A process environment flag cannot activate uBO in a public installed app.
  if (internal) {
    context.packager.config.extraMetadata = { ...metadata, blancUblockInternalValidation: true };
    context.packager.info.metadata.blancUblockInternalValidation = true;
  }
  const gate = require('../ublock/distribution.json');
  if ((!gate.cleared || !gate.assessment || !gate.correspondingSource || !gate.noticeReview)
    && process.env.BLANC_UBLOCK_INTERNAL_BUILD !== '1') {
    throw new Error('uBlock distribution blocked; see docs/ublock-origin-distribution.md');
  }
};
