'use strict';
const fs = require('node:fs');

// Flatpak supplies this read-only marker. An environment variable alone is not
// distribution evidence (and must not accidentally disable AppImage updates).
function detectLinuxDistribution({ platform = process.platform, readFile = fs.readFileSync } = {}) {
  if (platform !== 'linux') return { flatpak: false, appId: null };
  let info;
  try { info = readFile('/.flatpak-info', 'utf8'); }
  catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return { flatpak: false, appId: null };
    // An unreadable sandbox marker must not enable the host-owned updater.
    return { flatpak: true, appId: null };
  }
  const application = String(info).match(/(?:^|\n)\[Application\]\r?\n([\s\S]*?)(?=\n\[|$)/)?.[1];
  const candidate = application?.match(/(?:^|\n)name=([^\r\n]+)\r?(?:\n|$)/)?.[1];
  const appId = candidate && /^[a-zA-Z_][\w]*(?:\.[a-zA-Z_][\w]*){2,}$/.test(candidate)
    ? candidate : null;
  return { flatpak: true, appId };
}
const linuxDistribution = detectLinuxDistribution();
module.exports = { detectLinuxDistribution, linuxDistribution };
