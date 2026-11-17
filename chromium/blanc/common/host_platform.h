// Copyright 2026 Bananify Creative. MIT; see LICENSE.
#ifndef BLANC_COMMON_HOST_PLATFORM_H_
#define BLANC_COMMON_HOST_PLATFORM_H_
#include <string>
#include <string_view>

#include "base/strings/strcat.h"
#include "build/build_config.h"
namespace blanc {
// This build's platform under the name Node gives it (process.platform),
// which shipping's modules and the sync and telemetry records read.
#if BUILDFLAG(IS_MAC)
inline constexpr char kHostPlatform[] = "darwin";
#elif BUILDFLAG(IS_WIN)
inline constexpr char kHostPlatform[] = "win32";
#else
inline constexpr char kHostPlatform[] = "linux";
#endif
// The host data a sync-runner bundle starts with:
// {"platform":"<this build's>","version":"<version>","env":{}}.
inline std::string RunnerConfigJson(std::string_view version) {
  return base::StrCat({R"({"platform":")", kHostPlatform, R"(","version":")", version, R"(","env":{}})"});
}
}  // namespace blanc
#endif  // BLANC_COMMON_HOST_PLATFORM_H_
