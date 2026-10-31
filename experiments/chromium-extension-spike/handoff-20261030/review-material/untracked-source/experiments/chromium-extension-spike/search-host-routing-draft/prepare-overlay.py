from pathlib import Path
import hashlib,json
root=Path('<local-home>/Documents/ChatGPT/Blanc Browser/Chromium Preview')
ex=root/'repo/experiments/chromium-extension-spike'
here=Path(__file__).resolve().parent
source=root/'evidence/topsites-partial-delete-20261029/assets-v1/overlay.js'
assert hashlib.sha256(source.read_bytes()).hexdigest()=='3f2aa810d475515062e032ccc6b90af23a351c0d84f74c546d79aed5e742ee50', 'overlay changed; review before regenerating'
src=source.read_text()
helper=(here/'overlay-helper-template.js').read_text()
(here/'overlay-submit.inc.js').write_text(helper)
def change(old,new):
 global src
 assert src.count(old)==1, (old[:120],src.count(old))
 src=src.replace(old,new,1)
change("""    if (result.kind === 'bang') {
      if (state.activeTabId) window.browserAPI.navigate(state.activeTabId, result.text);
      window.browserAPI.closeOverlay();
      return;
    }""", """    if (result.kind === 'bang') {
      if (state.activeTabId) void submitAddressAction(() => window.browserAPI.navigate(state.activeTabId, result.text));
      return;
    }""")
change("    else if (result.kind === 'remote') window.browserAPI.createTab(result.url, { focusAddress: false });",
       "    else if (result.kind === 'remote') { void submitAddressAction(() => window.browserAPI.createTab(result.url, { focusAddress: false }), { createsTab: true }); return; }")
change("""    else if (result.kind === 'search' && state.activeTabId) {
      window.browserAPI.search(state.activeTabId, result.query, result.providerId);
    }
    else if (state.activeTabId) window.browserAPI.navigate(state.activeTabId, result.url);
    window.browserAPI.closeOverlay();""", """    else if (result.kind === 'search' && state.activeTabId) {
      void submitAddressAction(() => window.browserAPI.search(state.activeTabId, result.query, result.providerId));
      return;
    }
    else if (state.activeTabId) {
      void submitAddressAction(() => window.browserAPI.navigate(state.activeTabId, result.url));
      return;
    }
    window.browserAPI.closeOverlay();""")
change("""      if (value) window.browserAPI.navigate(state.activeTabId, value);
      window.browserAPI.closeOverlay();""", """      if (value) void submitAddressAction(() => window.browserAPI.navigate(state.activeTabId, value));
      else window.browserAPI.closeOverlay();""")
change('  function pickResult(result) {',helper+'\n  function pickResult(result) {')
for marker in ['  window.browserAPI.onOverlayHide((payload) => {', '  window.browserAPI.onOverlayShow(({ mode: next, prefill, purpose, pillRect }) => {']:
 change(marker,marker+'\n    invalidateAddressSubmission();')
for marker in ['window.browserAPI.onTabsUpdated((payload) => {','window.browserAPI.getAllTabs().then((payload) => {']:
 pos=src.index(marker); idx=src.index('    state = payload;',pos)
 src=src[:idx]+src[idx:].replace('    state = payload;','    setAddressSubmissionState(payload);',1)
(here/'overlay.candidate.js').write_text(src)
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
(here/'overlay-preparation.json').write_text(json.dumps({'source':sha(source),'candidate':sha(here/'overlay.candidate.js'),'helper':sha(here/'overlay-submit.inc.js')},indent=2)+'\n')
print('Prepared isolated overlay error/retry candidate')
