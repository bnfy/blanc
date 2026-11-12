'use strict';
const path = require('node:path');
function clearStartupPreloadEnvironment(env) {
  for (const key of ['LD_PRELOAD', 'BLANC_ECS_CDM_PRELOAD_PATH', 'BLANC_ECS_CDM_EXECUTABLE']) delete env[key];
  return !Object.hasOwn(env, 'LD_PRELOAD') && !Object.hasOwn(env, 'BLANC_ECS_CDM_PRELOAD_PATH') && !Object.hasOwn(env, 'BLANC_ECS_CDM_EXECUTABLE');
}

// The AppImage runtime itself runs before AppRun can repair the environment.
// Do not carry one image's mount/loader/Electron state into its replacement.
function cleanRelaunchEnvironment(source) {
  const mount = source.APPDIR;
  const insideMount = value => typeof mount === 'string' && mount.startsWith('/')
    && (value === mount || value.startsWith(`${mount.replace(/\/+$/, '')}/`));
  const result = {};
  for (const [key, value] of Object.entries(source)) {
    if (/^(?:LD_|ELECTRON_|CHROME_)/.test(key)
      || ['APPDIR', 'APPIMAGE', 'ARGV0', 'OWD', 'GSETTINGS_SCHEMA_DIR', 'BLANC_ECS_CDM_PRELOAD_PATH', 'BLANC_ECS_CDM_EXECUTABLE', 'BLANC_ECS_LAUNCHER_ROOT'].includes(key)) continue;
    if (key === 'PATH' || key === 'XDG_DATA_DIRS') {
      const kept = String(value).split(':').filter(entry => path.posix.isAbsolute(entry) && !insideMount(entry));
      if (kept.length) result[key] = kept.join(':');
    } else result[key] = value;
  }
  if (!result.PATH) result.PATH = '/usr/local/bin:/usr/bin:/bin';
  return result;
}
module.exports = { cleanRelaunchEnvironment, clearStartupPreloadEnvironment };
