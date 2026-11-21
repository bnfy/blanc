#ifndef BLANC_SERVICES_BLOCKER_BLOCKER_AVAILABLE_H_
#define BLANC_SERVICES_BLOCKER_BLOCKER_AVAILABLE_H_
#include "base/command_line.h"
#include "blanc/buildflags.h"
#include "build/build_config.h"
namespace blanc {
// Linux packages, Android and Blanc Beta ship the engine. Keep filtering
// enabled so a missing or invalid bundle follows ReadBundle's fail-closed path.
inline bool BlockerAvailable() {
#if BUILDFLAG(IS_ANDROID) || BUILDFLAG(BLANC_BETA_CHANNEL) || BUILDFLAG(IS_LINUX)
  return true;
#else
  return base::CommandLine::ForCurrentProcess()->HasSwitch("blanc-blocker-assets");
#endif
}
}  // namespace blanc
#endif  // BLANC_SERVICES_BLOCKER_BLOCKER_AVAILABLE_H_
