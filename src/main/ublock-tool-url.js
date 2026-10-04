'use strict';
// Only these original tool documents can be restored from local session state.
// The current owning provider supplies its verified extension identity.
function ublockTool(url, extensionId) {
  if (!extensionId || typeof url !== 'string') return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'chrome-extension:' || parsed.hostname !== extensionId || parsed.username || parsed.password || parsed.port) return null;
    if (parsed.pathname === '/dashboard.html') return 'dashboard';
    if (parsed.pathname === '/logger-ui.html') return 'logger';
  } catch {}
  return null;
}
module.exports = { ublockTool };
