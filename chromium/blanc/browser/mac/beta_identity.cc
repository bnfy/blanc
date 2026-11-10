// Copyright 2026 Bananify Creative. MIT; see LICENSE.
#include "blanc/browser/mac/beta_identity.h"
#include "blanc/browser/mac/beta_profile_guard.h"
#include "base/command_line.h"
#include "base/files/file_path.h"
#include "base/files/file_util.h"

namespace blanc::beta {
bool StartupAllowed(const base::CommandLine& command) {
  // No unattended profile import, including import child processes. File
  // selection inside an already-running browser remains an explicit action.
  for (const auto& entry : command.GetSwitches())
    if (entry.first.starts_with("import")) return false;
  const auto profile = command.GetSwitchValueASCII("profile-directory");
  if (profile == "." || profile == ".." || profile.find_first_of("/\\") != std::string::npos)
    return false;
  const auto home = base::GetHomeDir().value();
  for (const char* name : {"user-data-dir", "disk-cache-dir"})
    if (command.HasSwitch(name) && !SafeDirectory(command.GetSwitchValuePath(name).value(), home))
      return false;
  return !home.empty();
}
bool ConfigureDataDirectory(base::CommandLine* command, base::FilePath* directory) {
  if (!StartupAllowed(*command)) return false;
  const auto home = base::GetHomeDir();
  if (directory->empty())
    *directory = home.Append("Library").Append("Application Support").Append("Blanc Beta");
  // Also validate enterprise policy, which is resolved after command-line
  // startup checks and before Chromium creates/opens Local State or a profile.
  if (!SafeDirectory(directory->value(), home.value())) return false;
  const auto profile = command->GetSwitchValueASCII("profile-directory");
  if (!SafeDirectory(directory->Append(profile.empty() ? "Default" : profile).value(), home.value()))
    return false;
  command->AppendSwitchPath("user-data-dir", *directory);
  return true;
}
}
