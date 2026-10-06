'use strict';
// electron-builder runs one beforePack hook. Verify the locked Electron
// runtime first, then apply the uBO distribution gate.
const verifyRuntime = require('./before-pack-verify-runtime');
const ublockGate = require('./before-pack-ublock');

module.exports = async function beforePack(context) {
  await verifyRuntime(context);
  return ublockGate(context);
};
