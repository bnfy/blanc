// Copyright 2026 Bananify Creative. MIT; see LICENSE.
#ifndef BLANC_COMMON_PRODUCT_NAME_H_
#define BLANC_COMMON_PRODUCT_NAME_H_

#include <string>
#include <string_view>

namespace blanc {

// Chromium's own text names the browser Blanc (owner, November 13, 2026):
// "Chromium wants to use your camera" reads "Blanc wants to use your
// camera", in every language, since translations keep the product name.
// Kept as Chromium: its copyright holder ("The Chromium Authors"), the
// linked project it credits ("…the <a>Chromium</a> open source project"),
// and other products (ChromiumOS, Chromium Enterprise), and any part of a
// longer word. Header-only and dependency-free: ui/base applies it to every
// localized string as it loads.
inline std::u16string BlancProductText(std::u16string text) {
  static constexpr std::u16string_view kChromium = u"Chromium";
  static constexpr std::u16string_view kBlanc = u"Blanc";
  static constexpr std::u16string_view kKeep[] = {
      u"</a>", u" Authors", u"OS", u" OS", u" Enterprise", u" open source project",
      u" project", u"-based"};
  const auto word_char = [](char16_t c) {
    return (c >= u'a' && c <= u'z') || (c >= u'A' && c <= u'Z') ||
           (c >= u'0' && c <= u'9') || c == u'_' || c == u'.' || c == u'/';
  };
  size_t at = 0;
  while ((at = text.find(kChromium, at)) != std::u16string::npos) {
    const std::u16string_view after = std::u16string_view(text).substr(at + kChromium.size());
    bool keep = (at > 0 && word_char(text[at - 1])) ||
                (!after.empty() && word_char(after.front()) && after.front() != u'.');
    for (const auto suffix : kKeep) keep = keep || after.starts_with(suffix);
    if (keep) { at += kChromium.size(); continue; }
    text.replace(at, kChromium.size(), kBlanc);
    at += kBlanc.size();
  }
  return text;
}

}  // namespace blanc

#endif  // BLANC_COMMON_PRODUCT_NAME_H_
