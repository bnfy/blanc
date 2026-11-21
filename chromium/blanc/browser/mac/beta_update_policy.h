// Copyright 2026 Bananify Creative. MIT; see LICENSE.
#ifndef BLANC_BROWSER_MAC_BETA_UPDATE_POLICY_H_
#define BLANC_BROWSER_MAC_BETA_UPDATE_POLICY_H_
#include <string>
#include <string_view>
namespace blanc::beta {
inline int UpdateBuild(std::string_view text) {
  if (text.empty() || text.size() > 4 || text.front() == '0') return 0;
  int value = 0;
  for (char c : text) {
    if (c < '0' || c > '9') return 0;
    value = value * 10 + c - '0';
  }
  return value;
}
inline bool UpdateVersion(std::string_view text) {
  constexpr std::string_view prefix = "2.0.0-beta.";
  if (!text.starts_with(prefix)) return false;
  text.remove_prefix(prefix.size());
  if (text.empty() || text.front() == '0') return false;
  for (char c : text) if (c < '0' || c > '9') return false;
  return true;
}
inline bool AllowUpdate(std::string_view current, std::string_view next,
                        std::string_view version, std::string_view url,
                        std::string_view arch, bool delta) {
  if (delta || !UpdateBuild(current) || !UpdateBuild(next) ||
      UpdateBuild(next) <= UpdateBuild(current) || !UpdateVersion(version) ||
      (arch != "arm64" && arch != "x64")) return false;
  const std::string expected =
      "https://github.com/bnfy/blanc/releases/download/chromium-beta-" +
      std::string(version) + "/Blanc-Beta-" + std::string(version) +
      "-mac-" + std::string(arch) + ".dmg";
  return url == expected;
}
// Fixed loopback origin for explicitly compiled local qualification only. No
// renderer, command line, plist edit or feed can select an arbitrary server.
inline bool AllowLocalUpdate(std::string_view current, std::string_view next,
                             std::string_view version, std::string_view url,
                             std::string_view arch, bool delta) {
  if (arch != "arm64" || delta || !UpdateBuild(current) || !UpdateBuild(next) ||
      UpdateBuild(next) <= UpdateBuild(current) || !UpdateVersion(version)) return false;
  return url == "http://127.0.0.1:49262/Blanc-Beta-" + std::string(version) + "-mac-arm64.dmg";
}
}
#endif
