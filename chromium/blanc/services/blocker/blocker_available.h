#ifndef BLANC_SERVICES_BLOCKER_BLOCKER_AVAILABLE_H_
#define BLANC_SERVICES_BLOCKER_BLOCKER_AVAILABLE_H_
#include "base/command_line.h"
#include "blanc/buildflags.h"
#include "build/build_config.h"
namespace blanc {
// Whether this build filters at all. Android and Blanc Beta always do: their bundle ships inside
// the APK or app, and a missing or wrong bundle fails closed. Preview builds filter only when
// --blanc-blocker-assets names a bundle folder.
inline bool BlockerAvailable() {
#if BUILDFLAG(IS_ANDROID) || BUILDFLAG(BLANC_BETA_CHANNEL)
  return true;
#else
  return base::CommandLine::ForCurrentProcess()->HasSwitch("blanc-blocker-assets");
#endif
}
}  // namespace blanc
#endif  // BLANC_SERVICES_BLOCKER_BLOCKER_AVAILABLE_H_
