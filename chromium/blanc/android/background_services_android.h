// Copyright 2026 Bananify Creative. MIT; see LICENSE.
#ifndef BLANC_ANDROID_BACKGROUND_SERVICES_ANDROID_H_
#define BLANC_ANDROID_BACKGROUND_SERVICES_ANDROID_H_

#include <algorithm>
#include <array>
#include <string>
#include <string_view>
#include <vector>

#include "base/command_line.h"
#include "base/strings/string_split.h"
#include "base/strings/string_util.h"
#include "blanc/common/background_services.h"

namespace blanc {

// What Blanc for Android turns off beyond desktop's list, found by the
// Android outbound gate on 2026-11-03: Google AI Mode's startup eligibility
// request (/async/folae), the search engine prewarm (warmup.html) and DRM
// origin pre-provisioning at startup (devicecertificates/create; protected
// playback still provisions when a page asks for it). Patch 0102 calls this
// in the browser process from ChromeMainDelegate::BasicStartupComplete.
inline constexpr std::array<std::string_view, 4> kDisabledAndroidFeatures = {
    "AimEnabled", "AimServerEligibilityEnabled", "Prewarm",
    "MediaDrmPreprovisioningAtStartup"};

inline void DisableAndroidBackgroundServices(base::CommandLine& command_line) {
  DisableBackgroundServices(command_line);
  std::vector<std::string> features = base::SplitString(
      command_line.GetSwitchValueASCII("disable-features"), ",",
      base::TRIM_WHITESPACE, base::SPLIT_WANT_NONEMPTY);
  for (std::string_view feature : kDisabledAndroidFeatures) {
    if (!std::ranges::contains(features, feature)) {
      features.emplace_back(feature);
    }
  }
  command_line.AppendSwitchASCII("disable-features",
                                 base::JoinString(features, ","));
}

}  // namespace blanc

#endif  // BLANC_ANDROID_BACKGROUND_SERVICES_ANDROID_H_
