// Copyright 2026 Bananify Creative. MIT; see LICENSE.
#ifndef BLANC_COMMON_TEST_LAUNCH_H_
#define BLANC_COMMON_TEST_LAUNCH_H_
#include "base/command_line.h"
#include "blanc/buildflags.h"
namespace blanc {
// Whether this is a test launch (--blanc-test). Always false where test hooks
// are compiled out (Blanc Beta and release builds), whatever the command line
// says, so no switch can turn a test path on in a build people run.
inline bool BlancTestLaunch() {
#if BUILDFLAG(ENABLE_BLANC_TEST_HOOKS)
  return base::CommandLine::ForCurrentProcess()->HasSwitch("blanc-test");
#else
  return false;
#endif
}
}  // namespace blanc
#endif  // BLANC_COMMON_TEST_LAUNCH_H_
