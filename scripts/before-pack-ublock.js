'use strict';
// Ordinary Blanc builds exclude the optional upstream payload until its concrete
// distribution assessment clears. Internal candidates may include it for review.
module.exports = function beforePackUblock(context) {
  require('./check-capture-preloads.cjs');
  const internal = process.env.BLANC_UBLOCK_INTERNAL_BUILD === '1';
  const metadata = context.packager.config.extraMetadata || {};
  if ((metadata.blancUblockInternalValidation || context.packager.info.metadata.blancUblockInternalValidation) && !internal) throw new Error('uBlock internal validation marker forbidden in public build');
  const gate = require('../ublock/distribution.json');
  const cleared = gate.cleared && gate.assessment && gate.correspondingSource && gate.noticeReview;
  const bundled = internal || !!cleared;
  context.packager.config.extraMetadata = { ...metadata, blancUblockBundled: bundled, ...(internal ? { blancUblockInternalValidation: true } : {}) };
  Object.assign(context.packager.info.metadata, context.packager.config.extraMetadata);
  if (bundled) {
    require('./check-ublock-runtime.cjs').checkRuntime(context.packager.info.framework?.version);
    require('./check-ublock-package.cjs');
    require('./build-ublock-adaptation.cjs');
  } else {
    const excluded = ['!ublock{,/**/*}', '!scripts/check-ublock-package.cjs', '!scripts/build-ublock-adaptation.cjs'];
    // Normalize with the builder itself, then put exclusions inside each
    // existing FileSet. A separate exclusion-only matcher implicitly includes
    // **/* and is unioned with the allowlist, shipping the entire repository.
    const { doMergeConfigs } = require('app-builder-lib/out/util/config/config');
    const sets = doMergeConfigs([{ files: context.packager.config.files }]).files;
    if (!sets.length || sets.some(item => !item.filter?.some(pattern => !pattern.startsWith('!')))) {
      throw new Error('Blanc packaging requires an explicit file allowlist');
    }
    context.packager.config.files = sets.map(item => ({ ...item, filter: [...item.filter, ...excluded] }));
  }
};
