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
// secure network time queries and autofill server predictions. On 2026-11-23
// a private window on a used profile also asked www.google.com for Google AI
// Mode's eligibility (/async/folae) and loaded Google's search prewarm page
// (/search/warmup.html, hard-coded to Google), so desktop now turns off the
// rest of Android's list too (patch 0102), except its Android-only DRM
// preprovisioning. They are turned off with Chromium's own switch and
// features, in the browser process before anything reads them; child
// processes get the features from the browser. Header-only, like
// island_mode.h.
inline constexpr std::string_view kDisableComponentUpdateSwitch =
    "disable-component-update";
inline constexpr std::array<std::string_view, 8> kDisabledBackgroundFeatures =
    {"NetworkTimeServiceQuerying",
     "AutofillServerCommunication",
     "AimEnabled",
     "AimServerEligibilityEnabled",
     "Prewarm",
     "PredictionModelComponentDelivery",
     "PreconnectToSearch",
     "SearchEnginePreconnect2"};

// Chromium's in-product tips that teach Chrome's own tab strip, which the
// Island replaces: "Move your tabs to the side" showed over a window with
// more than 20 tabs on the owner's Blanc Beta (2026-11-28), anchored to a tab
// strip Blanc never draws. Blanc's vertical tabs are its own rail, so the
// tips for Chromium's vertical tab strip are off too.
inline constexpr std::array<std::string_view, 2> kDisabledChromiumPromos = {
    "IPH_VerticalTabstripTutorialFeature",
    "IPH_VerticalTabsExpandOnHoverFeature"};

// Adds the switch and the features to any --disable-features already given.
inline void DisableBackgroundServices(base::CommandLine& command_line) {
  command_line.AppendSwitch(kDisableComponentUpdateSwitch);
  std::vector<std::string> features = base::SplitString(
      command_line.GetSwitchValueASCII("disable-features"), ",",
      base::TRIM_WHITESPACE, base::SPLIT_WANT_NONEMPTY);
  const auto add = [&features](std::string_view feature) {
    if (!std::ranges::contains(features, feature)) {
      features.emplace_back(feature);
    }
  };
  std::ranges::for_each(kDisabledBackgroundFeatures, add);
  std::ranges::for_each(kDisabledChromiumPromos, add);
  command_line.AppendSwitchASCII("disable-features",
                                 base::JoinString(features, ","));
}

}  // namespace blanc

#endif  // BLANC_COMMON_BACKGROUND_SERVICES_H_
