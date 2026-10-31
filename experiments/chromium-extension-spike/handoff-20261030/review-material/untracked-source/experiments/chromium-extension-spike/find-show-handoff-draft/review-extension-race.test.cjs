'use strict';
// Review-only reproduction of a frozen candidate; does not launch a browser.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
for (const name of ['host-groups', 'host-combined']) {
  const s = fs.readFileSync(path.join(__dirname, name + '-candidate.js'), 'utf8');
  const slice = (a, b) => { const i = s.indexOf(a), j = s.indexOf(b, i); assert(i >= 0 && j > i); return s.slice(i, j); };
  const subs = slice('  function subscribe(event, callback) {', '  function request(method, args = []) {');
  const find = slice('  function invalidateFindShow() {', '  async function close(focus = true) {');
  const ext = slice('  async function showExtensions() {', "  document.addEventListener('pointerdown'");
  test(`${name}: extensions interrupts pending Find height`, async () => {
    let resolveFind;
    const c = { console, events: [], frames: [], timers: [],
      refresh: async () => {},
      request: (method, args) => method === 'height' && args[0] === 228 ? new Promise(resolve => { resolveFind = resolve; }) : Promise.resolve(),
      notice: e => { throw Error(e); },
      queueMicrotask, requestAnimationFrame: f => c.frames.push(f), setTimeout: f => c.timers.push(f),
      snapshot: { activeTabId: 'a', focusedTabId: 'a', tabs: [{ id: 'a', private: false }] },
      strip: { style: {} }, extensionsPanel: { hide() {}, async show() {} },
      overlay: { dataset: {}, hidden: true, contentDocument: { documentElement: { dataset: {} } }, contentWindow: { focus() {} } },
      currentSplitLayout: () => null, reportGeometry() {}, close: async () => {} };
    c.globalThis = c; vm.createContext(c);
    vm.runInContext(`let findShowEpoch=0,pendingFindShow=null,opened=false,overlayMode=null,findTabId=null,extensionsOpened=false; const subscribers=new Map();\n${subs}\n${find}\n${ext}\nglobalThis.api={subscribe,openFindBar,showExtensions,get:()=>({opened,overlayMode,findTabId,extensionsOpened})};`, c);
    c.api.subscribe('onOverlayShow', e => c.events.push(e));
    const opening = c.api.openFindBar();
    // Wait for the cross-realm async refresh continuation before switching.
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(typeof resolveFind, 'function');
    await c.api.showExtensions();
    resolveFind(); await opening;
    c.timers[0]();
    const state = c.api.get();
    assert.equal(state.extensionsOpened, true);
    assert.equal(state.opened, true);
    assert.equal(state.overlayMode, null);
    assert.equal(c.overlay.hidden, false);
    // The stale Find operation re-shows the overlay, but its handoff guard
    // suppresses initialization because Extensions cleared overlayMode.
    assert.equal(c.events.length, 0);
  });
}
