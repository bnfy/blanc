#ifndef BLANC_SERVICES_BLOCKER_BLOCKER_AVAILABLE_H_
#define BLANC_SERVICES_BLOCKER_BLOCKER_AVAILABLE_H_
#include "base/command_line.h"
#include "build/build_config.h"
namespace blanc {
// Whether this build filters at all. Android always does: its bundle is in the APK, and a missing
// or wrong bundle fails closed. Desktop's bundle comes from --blanc-blocker-assets.
inline bool BlockerAvailable() {
#if BUILDFLAG(IS_ANDROID)
  return true;
#else
  return base::CommandLine::ForCurrentProcess()->HasSwitch("blanc-blocker-assets");
#endif
}
}  // namespace blanc
#endif  // BLANC_SERVICES_BLOCKER_BLOCKER_AVAILABLE_H_
