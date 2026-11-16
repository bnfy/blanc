// Bound the invisible synchronous wait without consuming a pending session read.
export function prepareSessionRecovery(edit) {
  edit('chrome/browser/sessions/session_restore.cc', [
    {anchor:'#include "base/functional/callback_helpers.h"\n',replacement:'#include "base/functional/callback_helpers.h"\n#include "base/timer/timer.h"\n',present:'#include "base/timer/timer.h"\n'},
    {anchor:'#include "base/timer/timer.h"\n',replacement:'#include "base/timer/timer.h"\n#include "chrome/browser/lifetime/browser_shutdown.h"\n',present:'#include "chrome/browser/lifetime/browser_shutdown.h"\n'},
    {anchor:'    if (synchronous_) {\n      {\n        base::RunLoop loop',replacement:`    if (synchronous_) {
      // Keep the read alive: an unavailable key is not an empty session.
      // The native recovery surface creates no browser or session commands.
      base::ScopedClosureRunner recovery_screen;
      base::OneShotTimer recovery_deadline;
      if (blanc_prototype::IsEnabled()) {
        recovery_deadline.Start(FROM_HERE, base::Seconds(10),
            base::BindOnce([](base::ScopedClosureRunner* screen) {
              screen->ReplaceClosure(blanc_prototype::ShowSessionRecovery());
            }, &recovery_screen));
      }
      {
        base::RunLoop loop`,present:'      base::ScopedClosureRunner recovery_screen;\n'},
    {anchor:'      BrowserWindowInterface* browser =\n          ProcessSessionWindowsAndNotify(&windows_, active_window_id_);',replacement:'      recovery_deadline.Stop();\n      recovery_screen.RunAndReset();\n      BrowserWindowInterface* browser =\n          ProcessSessionWindowsAndNotify(&windows_, active_window_id_);',present:'      recovery_screen.RunAndReset();\n'},
    {anchor:'        quit_closure_for_sync_restore_ = loop.QuitClosure();\n        loop.Run();',replacement:`        quit_closure_for_sync_restore_ = loop.QuitClosure();
        base::RepeatingTimer shutdown_check;
        if (blanc_prototype::IsEnabled()) {
          shutdown_check.Start(FROM_HERE, base::Milliseconds(100),
              base::BindRepeating([](base::RunLoop* pending) {
                if (browser_shutdown::IsTryingToQuit() &&
                    GlobalBrowserCollection::GetInstance()->GetSize() == 0) {
                  pending->Quit();
                }
              }, &loop));
        }
        loop.Run();`,present:'        base::RepeatingTimer shutdown_check;\n'},
    {anchor:'      recovery_screen.RunAndReset();\n      BrowserWindowInterface* browser =',replacement:`      recovery_screen.RunAndReset();
      if (blanc_prototype::IsEnabled() && browser_shutdown::IsTryingToQuit() &&
          GlobalBrowserCollection::GetInstance()->GetSize() == 0) {
        // Startup has not installed the process quit closure yet. Release
        // these only after the startup stack unwinds into the main run loop.
        base::SingleThreadTaskRunner::GetCurrentDefault()->PostNonNestableTask(
            FROM_HERE, base::BindOnce(
                [](std::unique_ptr<ScopedKeepAlive> process,
                   std::unique_ptr<ScopedProfileKeepAlive> profile) {
                  profile.reset();
                  process.reset();
                }, std::move(keep_alive_), std::move(profile_keep_alive_)));
        delete this;
        return nullptr;
      }
      BrowserWindowInterface* browser =`,present:'      if (blanc_prototype::IsEnabled() && browser_shutdown::IsTryingToQuit() &&\n'}
  ]);
  edit('chrome/browser/ui/startup/startup_browser_creator_impl.cc', [
    {anchor:'#include "chrome/browser/ui/startup/startup_browser_creator_impl.h"\n',replacement:'#include "chrome/browser/ui/startup/startup_browser_creator_impl.h"\n#include "chrome/browser/lifetime/browser_shutdown.h"\n',present:'#include "chrome/browser/lifetime/browser_shutdown.h"\n'},
    {anchor:'    if (browser_window) {\n      return browser_window;\n    }',replacement:'    if (browser_window || browser_shutdown::IsTryingToQuit()) {\n      return browser_window;\n    }',present:'    if (browser_window || browser_shutdown::IsTryingToQuit()) {\n'},
    {anchor:'  tab_groups::MaybeShowSharedTabGroupVersionOutOfDateModal(browser);',replacement:'  if (!browser) return;  // A pending restore may have been cancelled by Quit.\n  tab_groups::MaybeShowSharedTabGroupVersionOutOfDateModal(browser);',present:'  if (!browser) return;  // A pending restore may have been cancelled by Quit.\n'}
  ]);
}
