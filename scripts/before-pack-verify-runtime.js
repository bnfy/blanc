'use strict';
const { verifyElectronRuntime } = require('./preflight-electron-runtime');
module.exports = async context => {
  const verified = verifyElectronRuntime({ root: context.packager.projectDir });
  if (context.packager.info.framework.version !== verified.locked) {
    throw new Error(`Packaging Electron ${context.packager.info.framework.version} differs from locked ${verified.locked}`);
  }
};
