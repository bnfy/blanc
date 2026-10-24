from pathlib import Path
for p in [Path('/private/tmp/blanc-chromium157-work/experiments/chromium-extension-spike/session-recovery.mjs'),Path('/Users/anthonyjloria/Projects/BlancChromium157/src/chrome/browser/sessions/session_restore.cc')]:
 s=p.read_text().replace('if (blanc_prototype::IsEnabled() && browser_shutdown::IsTryingToQuit()) {','if (blanc_prototype::IsEnabled() && browser_shutdown::IsTryingToQuit() &&\n          GlobalBrowserCollection::GetInstance()->GetSize() == 0) {')
 # The literal present check in JavaScript should remain a valid single-line string.
 if p.suffix=='.mjs':s=s.replace("present:'      if (blanc_prototype::IsEnabled() && browser_shutdown::IsTryingToQuit() &&\n          GlobalBrowserCollection::GetInstance()->GetSize() == 0) {\\n'", "present:'      if (blanc_prototype::IsEnabled() && browser_shutdown::IsTryingToQuit() &&\\n'")
 p.write_text(s)
