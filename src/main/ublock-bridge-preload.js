'use strict';
const { contextBridge, ipcRenderer } = require('electron');
const CHANNEL = 'ublock:bridge';
const OPERATIONS = new Set([
  'tabs.query', 'tabs.get', 'tabs.authorizeMessaging', 'tabs.authorizeInjection', 'tabs.commitInjection',
  'tabs.insertCSS', 'tabs.removeCSS', 'tabs.create', 'tabs.update', 'tabs.remove', 'tabs.reload', 'tabs.move',
  'extension.restart', 'webNavigation.getAllFrames', 'webNavigation.getFrame',
  'windows.get', 'windows.getCurrent', 'windows.getAll', 'windows.update', 'windows.create',
  'contextMenus.create', 'contextMenus.remove', 'contextMenus.removeAll', 'contextMenus.update',
  'browserAction.setBadgeText', 'browserAction.setBadgeBackgroundColor', 'browserAction.setBadgeTextColor',
  'browserAction.setIcon', 'browserAction.setTitle',
]);
const SHAPES = {
  ready: ['node'], 'storage-failed': [], 'host-failed': [], disconnected: [], 'css-ready': [],
  call: ['id', 'method', 'args'], decision: ['id', 'value', 'error'],
  'css-target': ['id'], 'css-result': ['id', 'error', 'target'],
};
const INCOMING = new Set(['reply', 'event', 'mapping', 'request', 'site', 'site-state', 'enabled', 'css', 'css-apply', 'erase-storage']);
function valid(message) {
  if (!message || typeof message !== 'object' || Array.isArray(message) || !Object.hasOwn(SHAPES, message.kind)) return false;
  if (Object.keys(message).some(key => key !== 'kind' && !SHAPES[message.kind].includes(key))) return false;
  if (['call', 'decision', 'css-target', 'css-result'].includes(message.kind)
    && (!Number.isSafeInteger(message.id) || message.id < 1)) return false;
  if (message.kind === 'ready' && typeof message.node !== 'boolean') return false;
  if (message.kind === 'call' && (!OPERATIONS.has(message.method) || !Array.isArray(message.args) || message.args.length > 4)) return false;
  if (message.error !== undefined && (typeof message.error !== 'string' || message.error.length > 80)) return false;
  try { return JSON.stringify(message).length <= 3 * 1024 * 1024; } catch { return false; }
}
let listening = false;
contextBridge.exposeInMainWorld('blancUboBridge', {
  send: message => { if (valid(message)) ipcRenderer.send(CHANNEL, message); },
  listen: callback => {
    if (listening || typeof callback !== 'function') return;
    listening = true;
    ipcRenderer.on(CHANNEL, (_event, message) => { if (message && INCOMING.has(message.kind)) callback(message); });
  },
  disconnected: () => ipcRenderer.send(CHANNEL, { kind: 'disconnected' }),
});
