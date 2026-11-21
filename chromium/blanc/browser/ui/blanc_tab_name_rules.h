#ifndef BLANC_TAB_NAMES_RULES_H_
#define BLANC_TAB_NAMES_RULES_H_
#include <optional>
#include <string>
#include <string_view>

namespace blanc_prototype::tab_names {
// Mirrors shipping src/main/tab-name.js, including ECMAScript whitespace,
// NEL, control removal and a 100-code-point (not UTF-16 unit) limit.
constexpr bool IsSpace(char16_t c) {
  return (c >= 9 && c <= 13) || c == 0x20 || c == 0x85 || c == 0xa0 ||
         c == 0x1680 || (c >= 0x2000 && c <= 0x200a) || c == 0x2028 ||
         c == 0x2029 || c == 0x202f || c == 0x205f || c == 0x3000 || c == 0xfeff;
}
constexpr std::optional<std::u16string> Normalize(std::u16string_view raw) {
  std::u16string folded;
  for (char16_t c : raw) {
    if (IsSpace(c)) c = u' ';
    else if (c <= 0x1f || (c >= 0x7f && c <= 0x9f)) continue;
    if (c == u' ' && (folded.empty() || folded.back() == u' ')) continue;
    folded.push_back(c);
  }
  if (!folded.empty() && folded.back() == u' ') folded.pop_back();
  size_t end = 0;
  for (size_t points = 0; end < folded.size() && points < 100; ++points) {
    const char16_t c = folded[end++];
    if (c >= 0xd800 && c <= 0xdbff && end < folded.size() &&
        folded[end] >= 0xdc00 && folded[end] <= 0xdfff) ++end;
  }
  folded.resize(end);
  if (!folded.empty() && folded.back() == u' ') folded.pop_back();
  if (folded.empty()) return std::nullopt;
  return folded;
}
// Outer nullopt means no change; inner nullopt means reset to page title.
constexpr std::optional<std::optional<std::u16string>> Resolve(
    std::u16string_view page_title, std::u16string_view current_name,
    std::u16string_view raw) {
  const auto next = Normalize(raw);
  const auto current = Normalize(current_name);
  if ((next && !current && next == Normalize(page_title)) || next == current)
    return std::nullopt;
  return std::optional<std::optional<std::u16string>>(std::in_place, next);
}
}  // namespace blanc_prototype::tab_names
#endif
