from pathlib import Path
import hashlib
root=Path(__file__).resolve().parent.parent
out=Path(__file__).resolve().parent
inputs={
 'host-groups':(root/'start-page/groups-projection-draft/assets-visible-v2/host.js','e14ec051f395e3f1189ab8a637d01988b90fb88260cb7e6f8593091d734a167e'),
 'host-combined':(root/'start-page/groups-projection-draft/selective-integration/combined-assets-v2/host.js','2784e75937f68dced605bb35e684d27c79fa5b1f80c45649e10924618c56d9e6'),
}
for name,(source,want) in inputs.items():
 raw=source.read_bytes()
 if hashlib.sha256(raw).hexdigest()!=want: raise SystemExit('source mismatch: '+name)
 s=raw.decode()
 def change(old,new):
  global s
  if s.count(old)!=1: raise SystemExit('pattern mismatch '+name+' '+old[:40])
  s=s.replace(old,new,1)
 change("  let findTabId = null;\n", "  let findTabId = null;\n  let findShowEpoch = 0;\n  let pendingFindShow = null;\n")
 change("    subscribers.get(event).add(callback);\n    if (event === 'onSplitLayout')", "    subscribers.get(event).add(callback);\n    // The renderer can subscribe after a Find request was opened. Deliver the\n    // pending handoff once its handler has finished registering.\n    if (event === 'onOverlayShow' && pendingFindShow) {\n      const epoch = pendingFindShow.epoch;\n      queueMicrotask(() => deliverFindShow(epoch));\n    }\n    if (event === 'onSplitLayout')")
 marker="  async function openFindBar() {\n    await refresh();\n    if (!snapshot?.activeTabId) return;"
 change(marker,"""  // A backgrounded host can stop receiving animation frames. The timer also
  // attempts the handoff, while a late listener retries it at registration.
  // Epochs prevent a delayed callback from reopening a closed/replaced view.
  function invalidateFindShow() {
    ++findShowEpoch;
    pendingFindShow = null;
  }

  function deliverFindShow(epoch) {
    const pending = pendingFindShow;
    if (!pending || pending.epoch !== epoch || epoch !== findShowEpoch ||
        !opened || overlayMode !== 'find' || findTabId !== pending.tabId ||
        !subscribers.get('onOverlayShow')?.size) return;
    pendingFindShow = null;
    emit('onOverlayShow', { mode: 'find', purpose: { findTabId: pending.tabId } });
    // A callback may synchronously close or replace the overlay.
    if (epoch !== findShowEpoch || !opened || overlayMode !== 'find') return;
    overlay.contentWindow.focus();
    reportGeometry();
  }

  async function openFindBar() {
    invalidateFindShow();
    const epoch = findShowEpoch;
    await refresh();
    if (epoch !== findShowEpoch || !snapshot?.activeTabId) return;""")
 change("    await request('height', [228]);\n    opened = true;", "    await request('height', [228]);\n    if (epoch !== findShowEpoch) return;\n    opened = true;")
 change("""    requestAnimationFrame(() => {
      emit('onOverlayShow', { mode: 'find', purpose: { findTabId } });
      overlay.contentWindow.focus();
      reportGeometry();
    });""","""    pendingFindShow = { epoch, tabId: findTabId };
    requestAnimationFrame(() => deliverFindShow(epoch));
    setTimeout(() => deliverFindShow(epoch), 250);""")
 change("  async function show(prefill, mode = 'panel') {\n", "  async function show(prefill, mode = 'panel') {\n    invalidateFindShow();\n")
 change("  async function close(focus = true) {\n", "  async function close(focus = true) {\n    invalidateFindShow();\n")
 path=out/(name+'-candidate.js')
 if path.exists(): raise SystemExit('candidate already exists')
 path.write_text(s)
 print(name,hashlib.sha256(s.encode()).hexdigest())
