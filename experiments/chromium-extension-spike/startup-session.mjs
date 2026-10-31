// Blanc startup defaults and scheduling; explicit user/managed prefs win.
export function prepareStartupSession(edit) {
  edit('chrome/browser/prefs/session_startup_pref.cc', [
    {
      anchor: '#include "base/feature_list.h"\n',
      replacement: '#include "base/command_line.h"\n#include "base/feature_list.h"\n',
      present: '#include "base/command_line.h"\n'
    },
    {
      anchor: 'SessionStartupPref::Type SessionStartupPref::GetDefaultStartupType() {\n',
      replacement: `SessionStartupPref::Type SessionStartupPref::GetDefaultStartupType() {
  // Blanc continues its saved session on an ordinary application launch.
  // This is a registered default, not an override of user or managed prefs.
  if (base::CommandLine::ForCurrentProcess()->HasSwitch("blanc-prototype-assets"))
    return SessionStartupPref::LAST;
`,
      present: '  // Blanc continues its saved session on an ordinary application launch.\n'
    }
  ]);
  edit('chrome/browser/ui/startup/startup_browser_creator.cc', [
    {
      anchor: '  if (is_first_run && SessionStartupPref::TypeIsDefault(prefs)) {\n',
      replacement: `  // A fresh Blanc profile has no previous session, including when its
  // controlled launcher suppresses the generic Chromium first-run flow.
  const bool blanc_new_profile =
      command_line.HasSwitch("blanc-prototype-assets") && profile->IsNewProfile();
  if ((is_first_run || blanc_new_profile) &&
      SessionStartupPref::TypeIsDefault(prefs)) {
`,
      present: '  const bool blanc_new_profile =\n'
    }
  ]);
  edit('chrome/browser/ui/startup/startup_browser_creator_impl.cc', [
    {
      anchor: '#include "base/functional/bind.h"\n',
      replacement: '#include "base/functional/bind.h"\n#include "base/task/single_thread_task_runner.h"\n#include "components/keep_alive_registry/keep_alive_types.h"\n#include "components/keep_alive_registry/scoped_keep_alive.h"\n',
      present: '#include "components/keep_alive_registry/scoped_keep_alive.h"\n'
    },
    {
      anchor: `  BrowserWindowInterface* browser = RestoreOrCreateBrowser(
      tabs, behavior, restore_options, process_startup, is_post_crash_launch);

  if (!browser) return;  // A pending restore may have been cancelled by Quit.
  tab_groups::MaybeShowSharedTabGroupVersionOutOfDateModal(browser);
  tab_groups::MaybeShowSharedTabGroupVersionUpToDateToast(browser);

  if (base::FeatureList::IsEnabled(features::kNonMilestoneUpdateToast)) {
    std::string current_version_string =
        current_chrome_version_string_for_testing_.has_value()
            ? current_chrome_version_string_for_testing_.value()
            : CHROME_VERSION_STRING;
    MaybeShowNonMilestoneUpdateToast(browser, current_version_string);
  }
`,
      replacement: `  auto browser_ready = base::BindOnce(
      [](std::optional<std::string> version, BrowserWindowInterface* browser) {
        if (!browser) return;
        tab_groups::MaybeShowSharedTabGroupVersionOutOfDateModal(browser);
        tab_groups::MaybeShowSharedTabGroupVersionUpToDateToast(browser);
        if (base::FeatureList::IsEnabled(features::kNonMilestoneUpdateToast)) {
          MaybeShowNonMilestoneUpdateToast(
              browser, version.value_or(CHROME_VERSION_STRING));
        }
      }, current_chrome_version_string_for_testing_);
#if BUILDFLAG(IS_MAC)
  if (command_line_->HasSwitch("blanc-prototype-assets") &&
      process_startup == chrome::startup::IsProcessStartup::kYes &&
      behavior == BrowserOpenBehavior::SYNCHRONOUS_RESTORE) {
    // Do not start AppKit's first application loop inside session restore.
    // A non-nestable task lets startup unwind into the normal main loop first.
    // Retain only value inputs and keep-alives; this creator is stack-owned.
    base::SingleThreadTaskRunner::GetCurrentDefault()->PostNonNestableTask(
        FROM_HERE, base::BindOnce(
            [](base::WeakPtr<Profile> profile, base::FilePath cur_dir,
               base::CommandLine command_line,
               chrome::startup::IsFirstRun first_run, StartupTabs tabs,
               SessionRestore::BehaviorBitmask options,
               std::unique_ptr<ScopedKeepAlive> process_keep_alive,
               std::unique_ptr<ScopedProfileKeepAlive> profile_keep_alive,
               base::OnceCallback<void(BrowserWindowInterface*)> ready) {
              if (!profile || browser_shutdown::IsTryingToQuit() ||
                  GetBrowserWindowCreationStatusForProfile(*profile) !=
                      BrowserWindowInterface::CreationStatus::kOk) return;
              StartupBrowserCreatorImpl deferred(cur_dir, command_line,
                                                 first_run);
              deferred.profile_ = profile.get();
              std::move(ready).Run(deferred.RestoreOrCreateBrowser(
                  tabs, BrowserOpenBehavior::SYNCHRONOUS_RESTORE, options,
                  chrome::startup::IsProcessStartup::kYes, false));
            }, profile_->GetWeakPtr(), cur_dir_, *command_line_, is_first_run_,
            tabs, restore_options,
            std::make_unique<ScopedKeepAlive>(KeepAliveOrigin::SESSION_RESTORE,
                                              KeepAliveRestartOption::DISABLED),
            std::make_unique<ScopedProfileKeepAlive>(
                profile_, ProfileKeepAliveOrigin::kBrowserWindow),
            std::move(browser_ready)));
    return;
  }
#endif
  std::move(browser_ready).Run(RestoreOrCreateBrowser(
      tabs, behavior, restore_options, process_startup, is_post_crash_launch));
`,
      present: "    // Do not start AppKit's first application loop inside session restore.\n"
    }
  ]);
}
