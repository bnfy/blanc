from pathlib import Path
import hashlib,subprocess,tempfile
p=Path(__file__).resolve().parent
root=p.parent
notice=root/'prototype/host.js'
def sha(b):return hashlib.sha256(b).hexdigest()
if sha(notice.read_bytes())!='03cd873bc28d791aef3028adecdfb29ca0292b334c53dc27855f4f1fce414537':raise SystemExit('notice host changed')
with tempfile.TemporaryDirectory(prefix='find-v3-',dir=p) as td:
 temp=Path(td)/'host.js';temp.write_bytes(notice.read_bytes())
 subprocess.run(['/usr/bin/patch','--batch','--forward','-p1','-i',str((p/'host-groups-v2.patch').resolve())],cwd=td,check=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
 sources={'groups':temp.read_bytes(),'combined':(p/'host-combined-candidate-v2.js').read_bytes()}
 if sha(sources['combined'])!='c30e022cf7ca23214dad84be32ed20232f3f47ce8d4342b7c70a4e2d02fae220':raise SystemExit('combined v2 changed')
 for name,raw in sources.items():
  s=raw.decode()
  def change(old,new):
   global s
   if s.count(old)!=1:raise SystemExit('pattern mismatch '+name+' '+old[:55])
   s=s.replace(old,new,1)
  change("  function subscribe(event, callback) {\n", "  function subscribe(event, callback, ownerDocument = overlay.contentDocument) {\n")
  change("    if (event === 'onOverlayShow') {\n      pruneOverlayShowSubscribers();\n      overlayShowDocuments.set(callback, overlay.contentDocument);", "    if (event === 'onOverlayShow') {\n      if (!ownerDocument || ownerDocument !== overlay.contentDocument) return () => {};\n      pruneOverlayShowSubscribers();\n      overlayShowDocuments.set(callback, ownerDocument);")
  change("  async function show(prefill, mode = 'panel') {\n    invalidateFindShow();\n", "  async function show(prefill, mode = 'panel') {\n    invalidateFindShow();\n    const epoch = findShowEpoch;\n")
  change("    await refresh();\n    await request('height', [mode === 'palette' ? 10000 : mode === 'shield' ? 648 : 640]);\n    overlayMode = mode;", "    await refresh();\n    if (epoch !== findShowEpoch) return;\n    await request('height', [mode === 'palette' ? 10000 : mode === 'shield' ? 648 : 640]);\n    if (epoch !== findShowEpoch) return;\n    overlayMode = mode;")
  change("    requestAnimationFrame(() => {\n      emit('onOverlayShow', { mode, prefill, pillRect });", "    requestAnimationFrame(() => {\n      if (epoch !== findShowEpoch || !opened || overlayMode !== mode) return;\n      emit('onOverlayShow', { mode, prefill, pillRect });")
  change("  async function close(focus = true) {\n    invalidateFindShow();\n    await dismissPaneMenu();", "  async function close(focus = true) {\n    invalidateFindShow();\n    const epoch = findShowEpoch;\n    await dismissPaneMenu();\n    if (epoch !== findShowEpoch) return;")
  change("    await request('height', [68]);\n    // Escape and outside clicks", "    await request('height', [68]);\n    if (epoch !== findShowEpoch) return;\n    // Escape and outside clicks")
  change("    if (focus) await request('focusPage');\n    reportGeometry();", "    if (focus) await request('focusPage');\n    if (epoch !== findShowEpoch) return;\n    reportGeometry();")
  change("  async function showExtensions() {\n    invalidateFindShow();\n    if (extensionsOpened) return close();", "  async function showExtensions() {\n    invalidateFindShow();\n    const epoch = findShowEpoch;\n    if (extensionsOpened) return close();")
  change("    await request('height', [640]);\n    await extensionsPanel.show();\n    reportGeometry();", "    await request('height', [640]);\n    if (epoch !== findShowEpoch) return;\n    await extensionsPanel.show();\n    if (epoch !== findShowEpoch) return;\n    reportGeometry();")
  change("  window.BlancPrototypeHost = {\n    api,", """  // Capture the iframe Document when its adapter starts. A callback from an
  // obsolete realm must not register itself as the new overlay document.
  function apiForDocument(ownerDocument) {
    return new Proxy(api, {
      get(target, property) {
        if (property === 'onOverlayShow')
          return callback => subscribe(property, callback, ownerDocument);
        return target[property];
      },
    });
  }

  window.BlancPrototypeHost = {
    api,
    apiForDocument,""")
  out=p/f'host-{name}-candidate-v3.js'
  if out.exists():raise SystemExit('v3 exists')
  out.write_text(s);print(name,sha(s.encode()))
 adapter=root/'start-page/groups-projection-draft/assets-visible-v2/adapter.js';raw=adapter.read_bytes()
 if sha(raw)!='0fd4bbd439842e8b85d5865c771e81dd42d402ba85fedf8d6157a2e99058a8a4':raise SystemExit('adapter changed')
 a=raw.decode();old='  window.browserAPI = parent.BlancPrototypeHost.api;';assert a.count(old)==1;a=a.replace(old,'  window.browserAPI = parent.BlancPrototypeHost.apiForDocument(document);')
 out=p/'adapter-candidate-v3.js'
 if out.exists():raise SystemExit('adapter exists')
 out.write_text(a);print('adapter',sha(a.encode()))
