// Native browser snapshots only: Chromium has already decoded and rasterized
// every admitted icon to 32px PNG. Never fetch or decode a renderer's source in
// this runner. The Android phone.setTabs facade does not load this module.
const model = __require('src/main/tabicons-model.js');
const tabsync = __require('src/main/tabsync.js');
const icons = __require('src/main/tabicons.js');
const sync = __require('src/main/sync.js');
let snapshot = {tabList: [], groups: []};
let trusted = new Set();
const empty = () => ({isEmpty: () => true});
// Shipping's icon-square still enforces its export budget. This narrow adapter
// represents only bytes in the current browser-owned raster snapshot; it is
// neither an image decoder nor a general nativeImage implementation.
__require('shim:electron').nativeImage.createFromBuffer = bytes => {
  const data = `data:image/png;base64,${Buffer.from(bytes).toString('base64')}`;
  if (!trusted.has(data)) return empty();
  const image = {isEmpty: () => false, getSize: () => ({width: 32, height: 32}),
    resize: size => size.width === 32 && size.height === 32 ? image : empty(),
    toPNG: () => Buffer.from(bytes)};
  return image;
};
tabsync.setSnapshotProvider(() => snapshot);
icons.setSnapshotProvider(() => snapshot);
module.exports = (tabs, groups) => {
  if (!Array.isArray(tabs) || !Array.isArray(groups)) throw Error('invalid-desktop-tabs');
  trusted = new Set();
  snapshot = {groups, tabList: tabs.filter(tab => tab && !tab.private && !tab.inheritsDocumentPolicy).map(tab => {
    let favicon = model.validIconData(tab.favicon);
    if (favicon && (Buffer.from(favicon.slice('data:image/png;base64,'.length), 'base64').readUInt32BE(16) !== 32 || trusted.size >= 256)) favicon = null;
    if (favicon) trusted.add(favicon);
    return {...tab, favicon};
  })};
  tabsync.noteTabsChanged();
  sync.setTabStateReady(true);
};
