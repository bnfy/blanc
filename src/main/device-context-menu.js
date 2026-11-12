// src/main/device-context-menu.js
// Electron glue for a device header's right-click menu. Mirrors
// workspace-context-menu.js: the overlay records the header it was invoked on
// (window.__blancCtxDeviceId) at contextmenu time, and main reads and clears
// it, then re-validates the id against the devices it lists.

const { Menu } = require('electron');
const { buildDeviceContextMenu } = require('./device-context-menu-model');

async function readHeaderDeviceId(wc) {
  return wc.executeJavaScript(`(() => {
    const id = window.__blancCtxDeviceId ?? null;
    window.__blancCtxDeviceId = null;
    return id;
  })()`);
}

// deps: { isLive(), resolveDevice(rawId): device|null, getWindow(), getOffset(): {x, y},
//         acquireMenuGuard?(), releaseMenuGuard?(ticket), actions: { rename }, t }
function attachDeviceHeaderMenu(wc, deps) {
  wc.on('context-menu', async (_event, params) => {
    if (params.isEditable) return; // the address menu owns editable targets
    let rawId;
    try { rawId = await readHeaderDeviceId(wc); } catch { return; }
    if (rawId == null || !deps.isLive()) return;
    const device = deps.resolveDevice(rawId);
    if (!device) return;
    const template = buildDeviceContextMenu(deps.t).map((item) => ({
      label: item.label,
      click: () => deps.actions[item.id]?.(device.deviceId),
    }));
    const menu = Menu.buildFromTemplate(template);
    const offset = deps.getOffset();
    const ticket = deps.acquireMenuGuard?.();
    try {
      menu.popup({
        window: deps.getWindow(),
        x: Math.round(offset.x + params.x),
        y: Math.round(offset.y + params.y),
        sourceType: params.menuSourceType,
        callback: () => deps.releaseMenuGuard?.(ticket),
      });
    } catch { deps.releaseMenuGuard?.(ticket); }
  });
}

module.exports = { attachDeviceHeaderMenu };
