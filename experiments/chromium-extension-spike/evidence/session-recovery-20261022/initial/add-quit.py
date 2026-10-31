from pathlib import Path
repo=Path('/private/tmp/blanc-chromium157-work')
p=repo/'experiments/chromium-extension-spike/session-recovery.mjs'
s=p.read_text();s=s.replace("  edit('chrome/browser/sessions/session_restore.cc', [", "  edit('chrome/browser/sessions/session_restore.cc', [\n    {anchor:'#include \"base/timer/timer.h\"\\n',replacement:'#include \"base/timer/timer.h\"\\n#include \"chrome/browser/lifetime/browser_shutdown.h\"\\n',present:'#include \"chrome/browser/lifetime/browser_shutdown.h\"\\n'},")
# include anchor timer must already exist on fresh preparation; move new entry after timer entry
lines=s.splitlines();entry=lines.pop(3);lines.insert(4,entry);s='\n'.join(lines)+'\n'
s=s.replace('  ]);\n}', '''    ,{anchor:'        quit_closure_for_sync_restore_ = loop.QuitClosure();\\n        loop.Run();',replacement:`        quit_closure_for_sync_restore_ = loop.QuitClosure();
        base::RepeatingTimer shutdown_check;
        if (blanc_prototype::IsEnabled()) {
          shutdown_check.Start(FROM_HERE, base::Milliseconds(100),
              base::BindRepeating([](base::RunLoop* pending) {
                if (browser_shutdown::IsTryingToQuit()) pending->Quit();
              }, &loop));
        }
        loop.Run();`,present:'        base::RepeatingTimer shutdown_check;\\n'},
    {anchor:'      recovery_screen.RunAndReset();\\n      BrowserWindowInterface* browser =',replacement:`      recovery_screen.RunAndReset();
      if (blanc_prototype::IsEnabled() && browser_shutdown::IsTryingToQuit()) {
        delete this;
        return nullptr;
      }
      BrowserWindowInterface* browser =`,present:'      if (blanc_prototype::IsEnabled() && browser_shutdown::IsTryingToQuit()) {\\n'}
  ]);
  edit('chrome/browser/ui/startup/startup_browser_creator_impl.cc', [
    {anchor:'#include "chrome/browser/ui/startup/startup_browser_creator_impl.h"\\n',replacement:'#include "chrome/browser/ui/startup/startup_browser_creator_impl.h"\\n#include "chrome/browser/lifetime/browser_shutdown.h"\\n',present:'#include "chrome/browser/lifetime/browser_shutdown.h"\\n'},
    {anchor:'    if (browser_window) {\\n      return browser_window;\\n    }',replacement:'    if (browser_window || browser_shutdown::IsTryingToQuit()) {\\n      return browser_window;\\n    }',present:'    if (browser_window || browser_shutdown::IsTryingToQuit()) {\\n'},
    {anchor:'  tab_groups::MaybeShowSharedTabGroupVersionOutOfDateModal(browser);',replacement:'  if (!browser) return;  // A pending restore may have been cancelled by Quit.\\n  tab_groups::MaybeShowSharedTabGroupVersionOutOfDateModal(browser);',present:'  if (!browser) return;  // A pending restore may have been cancelled by Quit.\\n'}
  ]);
}''')
p.write_text(s)
