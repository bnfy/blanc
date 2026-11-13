// Copyright 2026 Bananify Creative. MIT; see LICENSE.
#ifndef BLANC_BROWSER_MAC_BETA_IDENTITY_H_
#define BLANC_BROWSER_MAC_BETA_IDENTITY_H_
namespace base { class CommandLine; class FilePath; }
namespace blanc::beta {
bool StartupAllowed(const base::CommandLine& command);
bool ConfigureDataDirectory(base::CommandLine* command, base::FilePath* directory);
}
#endif
