'use strict';
// Ordinary Blanc builds exclude the optional upstream payload until its concrete
// distribution assessment clears. Internal candidates may include it for review.
module.exports = function beforePackUblock(context) {
  const internal = process.env.BLANC_UBLOCK_INTERNAL_BUILD === '1';
  const metadata = context.packager.config.extraMetadata || {};
  if ((metadata.blancUblockInternalValidation || context.packager.info.metadata.blancUblockInternalValidation) && !internal) throw new Error('uBlock internal validation marker forbidden in public build');
  const gate = require('../ublock/distribution.json');
  const cleared = gate.cleared && gate.assessment && gate.correspondingSource && gate.noticeReview;
  const bundled = internal || !!cleared;
  context.packager.config.extraMetadata = { ...metadata, blancUblockBundled: bundled, ...(internal ? { blancUblockInternalValidation: true } : {}) };
  Object.assign(context.packager.info.metadata, context.packager.config.extraMetadata);
  if (bundled) {
    require('./check-ublock-package.cjs');
    require('./build-ublock-adaptation.cjs');
  } else {
    const excluded = ['!ublock{,/**/*}', '!scripts/check-ublock-package.cjs', '!scripts/build-ublock-adaptation.cjs'];
    // Electron-builder normalizes string patterns into FileSets before this
    // hook. Apply exclusions to every set; a separate matcher is a union and
    // cannot cancel an inclusion from another set.
    context.packager.config.files = (context.packager.config.files || ['**/*']).map(item =>
      typeof item === 'string' ? item : { ...item, filter: [...(item.filter || ['**/*']), ...excluded] });
    context.packager.config.files.push(...excluded);
  }
};
