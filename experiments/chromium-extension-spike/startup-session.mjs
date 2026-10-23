// Change only the registered default; explicit user/managed startup prefs win.
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
}
