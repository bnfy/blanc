'use strict';
const path = require('node:path');
function requireNativeLinuxProfile({ platform = process.platform, profile, switchProfile, nativeProfile }) {
  if (platform !== 'linux') return;
  if (![profile, switchProfile, nativeProfile].every(value => typeof value === 'string' && path.isAbsolute(value))
    || path.resolve(profile) !== path.resolve(switchProfile) || path.resolve(profile) !== path.resolve(nativeProfile)) {
    throw Error('Linux ECS requires --user-data-dir matching the isolated profile before native startup');
  }
}
module.exports = { requireNativeLinuxProfile };
