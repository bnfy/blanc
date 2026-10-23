'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

// One CDM selector: the packaged native launcher owns parsing, validation and
// fallback. Never recreate its policy in JS or inject preload into a browser.
function queryLinuxCdm(appDir, profile) {
  const launcher = path.join(appDir, 'blanc-ecs-launcher');
  if (!fs.existsSync(launcher)) throw Error('Rebuild this candidate with the self-contained Linux launcher');
  const result = execFileSync(launcher, ['--ecs-query-cdm'], {
    encoding: 'utf8', env: { ...process.env, LD_PRELOAD: '', BLANC_ECS_FULL_PROFILE: profile },
  });
  if (!result.endsWith('\n')) throw Error('Invalid native CDM selection response');
  return result.slice(0, -1);
}
function linuxPreloadEnv(appDir) {
  // This is a legacy-launch admission guard, not a discarded CDM query.
  if (fs.existsSync(path.join(appDir, 'blanc-cdm-preload.so'))
    && !fs.existsSync(path.join(appDir, 'blanc-ecs-launcher'))) {
    throw Error('Rebuild this candidate with the self-contained Linux launcher');
  }
  return {};
}
module.exports = { linuxPreloadEnv, queryLinuxCdm };
