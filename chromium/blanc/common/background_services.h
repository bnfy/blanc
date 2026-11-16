// Copyright 2026 Bananify Creative. MIT; see LICENSE.
#ifndef BLANC_COMMON_BACKGROUND_SERVICES_H_
#define BLANC_COMMON_BACKGROUND_SERVICES_H_

#include <algorithm>
#include <array>
#include <string>
#include <string_view>
#include <vector>

#include "base/command_line.h"
#include "base/strings/string_split.h"
#include "base/strings/string_util.h"

namespace blanc {

// Chromium services that reach Google on their own and that shipping Blanc
// never runs (outbound-isolation check, 2026-11-01): the component updater,
// secure network time queries and autofill server predictions. They are
// turned off with Chromium's own switch and features, in the browser process
// before anything reads them; child processes get the features from the
// browser. Header-only, like island_mode.h.
inline constexpr std::string_view kDisableComponentUpdateSwitch =
    "disable-component-update";
inline constexpr std::array<std::string_view, 2> kDisabledBackgroundFeatures =
    {"NetworkTimeServiceQuerying", "AutofillServerCommunication"};

// Adds the switch and the features to any --disable-features already given.
inline void DisableBackgroundServices(base::CommandLine& command_line) {
  command_line.AppendSwitch(kDisableComponentUpdateSwitch);
  std::vector<std::string> features = base::SplitString(
      command_line.GetSwitchValueASCII("disable-features"), ",",
      base::TRIM_WHITESPACE, base::SPLIT_WANT_NONEMPTY);
  for (std::string_view feature : kDisabledBackgroundFeatures) {
    if (!std::ranges::contains(features, feature)) {
      features.emplace_back(feature);
    }
  }
  command_line.AppendSwitchASCII("disable-features",
                                 base::JoinString(features, ","));
}

}  // namespace blanc

#endif  // BLANC_COMMON_BACKGROUND_SERVICES_H_
