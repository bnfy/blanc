// Copyright 2026 Bananify Creative. MIT; see the Blanc repository LICENSE.
#ifndef BLANC_BROWSER_UI_BROWSER_API_THEME_CHOICE_H_
#define BLANC_BROWSER_UI_BROWSER_API_THEME_CHOICE_H_

#include <algorithm>
#include <array>
#include <optional>
#include <string>
#include <string_view>

namespace blanc::browser_api::theme_choice {

// Shipping v1.45.1's themes, in /theme's cycle order (src/main/main.js
// chrome:cycle-theme). Standard library only, so tools/theme-choice.test.mjs
// can compile it beside shipping's handler.
inline constexpr std::array<std::string_view, 3> kThemes = {"system", "light", "dark"};

inline bool IsTheme(std::string_view value) {
  for (std::string_view theme : kThemes) {
    if (value == theme) {
      return true;
    }
  }
  return false;
}

namespace internal {

// The code point at `at` and its byte length; a malformed sequence is one
// byte that is never whitespace.
inline char32_t DecodeAt(std::string_view s, size_t at, size_t& length) {
  const unsigned char lead = static_cast<unsigned char>(s[at]);
  length = 1;
  if (lead < 0x80) {
    return lead;
  }
  const size_t extra = lead >= 0xF0 ? 3 : lead >= 0xE0 ? 2 : lead >= 0xC0 ? 1 : 0;
  if (extra == 0 || at + extra >= s.size()) {
    return 0xFFFD;
  }
  char32_t value = lead & (0x3F >> extra);
  for (size_t i = 1; i <= extra; ++i) {
    const unsigned char next = static_cast<unsigned char>(s[at + i]);
    if ((next & 0xC0) != 0x80) {
      return 0xFFFD;
    }
    value = (value << 6) | (next & 0x3F);
  }
  length = extra + 1;
  return value;
}

// String.prototype.trim's whitespace: WhiteSpace and LineTerminator.
inline bool IsJsSpace(char32_t c) {
  return (c >= 0x09 && c <= 0x0D) || c == 0x20 || c == 0xA0 || c == 0x1680 ||
         (c >= 0x2000 && c <= 0x200A) || c == 0x2028 || c == 0x2029 || c == 0x202F ||
         c == 0x205F || c == 0x3000 || c == 0xFEFF;
}

}  // namespace internal

// `requested` as shipping reads it (trim, then toLowerCase), or nullopt when
// nothing is left after trimming. Only ASCII letters and U+212A KELVIN SIGN,
// which lowercases to "k", can lowercase into a theme name, so any other
// non-ASCII character becomes a byte no theme contains.
inline std::optional<std::string> ReadRequest(std::string_view requested) {
  size_t start = requested.size();
  size_t end = 0;
  for (size_t at = 0; at < requested.size();) {
    size_t length = 0;
    if (!internal::IsJsSpace(internal::DecodeAt(requested, at, length))) {
      start = std::min(start, at);
      end = at + length;
    }
    at += length;
  }
  if (start >= end) {
    return std::nullopt;
  }
  std::string lowered;
  for (size_t at = start; at < end;) {
    size_t length = 0;
    const char32_t c = internal::DecodeAt(requested, at, length);
    if (c == 0x212A) {
      lowered += 'k';
    } else if (c >= 'A' && c <= 'Z') {
      lowered += static_cast<char>(c - 'A' + 'a');
    } else {
      lowered += c < 0x80 ? static_cast<char>(c) : '\x7f';
    }
    at += length;
  }
  return lowered;
}

// /theme: an absent or blank request cycles system → light → dark; a request
// naming a theme selects it; any other request keeps the current theme.
inline std::string NextTheme(std::string_view current,
                             std::optional<std::string_view> requested) {
  const std::optional<std::string> named = requested ? ReadRequest(*requested) : std::nullopt;
  if (named) {
    return IsTheme(*named) ? *named : std::string(current);
  }
  for (size_t i = 0; i < kThemes.size(); ++i) {
    if (kThemes[i] == current) {
      return std::string(kThemes[(i + 1) % kThemes.size()]);
    }
  }
  return std::string(kThemes[0]);
}

}  // namespace blanc::browser_api::theme_choice

#endif  // BLANC_BROWSER_UI_BROWSER_API_THEME_CHOICE_H_
