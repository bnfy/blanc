// Copyright 2026 Bananify Creative. MIT; see the Blanc repository LICENSE.
// Standard library only: tools/suggestion-policy.test.mjs compiles this file.
#include "blanc/browser/ui/browser_api/suggestion_policy.h"

#include <array>
#include <string>

namespace blanc::browser_api {
namespace {

using Text = std::u32string;

// Shipping works on JavaScript strings, so text is compared as code points.
std::optional<Text> Decode(std::string_view in) {
  Text out;
  for (size_t i = 0; i < in.size();) {
    const auto b = static_cast<unsigned char>(in[i]);
    size_t n = b < 0x80 ? 1 : (b >> 5) == 6 ? 2 : (b >> 4) == 14 ? 3 : (b >> 3) == 30 ? 4 : 0;
    if (!n || i + n > in.size()) return std::nullopt;
    char32_t c = n == 1 ? b : b & (0x7f >> n);
    for (size_t k = 1; k < n; ++k) {
      const auto t = static_cast<unsigned char>(in[i + k]);
      if ((t >> 6) != 2) return std::nullopt;
      c = (c << 6) | (t & 0x3f);
    }
    constexpr std::array<char32_t, 5> kMin = {0, 0, 0x80, 0x800, 0x10000};
    if (c < kMin[n] || c > 0x10ffff || (c >= 0xd800 && c <= 0xdfff)) return std::nullopt;
    out.push_back(c);
    i += n;
  }
  return out;
}

std::string Encode(const Text& in) {
  std::string out;
  for (char32_t c : in) {
    if (c < 0x80) {
      out += static_cast<char>(c);
    } else if (c < 0x800) {
      out += static_cast<char>(0xc0 | (c >> 6));
      out += static_cast<char>(0x80 | (c & 0x3f));
    } else if (c < 0x10000) {
      out += static_cast<char>(0xe0 | (c >> 12));
      out += static_cast<char>(0x80 | ((c >> 6) & 0x3f));
      out += static_cast<char>(0x80 | (c & 0x3f));
    } else {
      out += static_cast<char>(0xf0 | (c >> 18));
      out += static_cast<char>(0x80 | ((c >> 12) & 0x3f));
      out += static_cast<char>(0x80 | ((c >> 6) & 0x3f));
      out += static_cast<char>(0x80 | (c & 0x3f));
    }
  }
  return out;
}

// JavaScript's \s and String.prototype.trim().
bool IsSpace(char32_t c) {
  return (c >= 0x9 && c <= 0xd) || c == 0x20 || c == 0xa0 || c == 0x1680 ||
         (c >= 0x2000 && c <= 0x200a) || c == 0x2028 || c == 0x2029 || c == 0x202f ||
         c == 0x205f || c == 0x3000 || c == 0xfeff;
}
bool IsLineTerminator(char32_t c) { return c == '\n' || c == '\r' || c == 0x2028 || c == 0x2029; }
bool IsDigit(char32_t c) { return c >= '0' && c <= '9'; }
bool IsAlpha(char32_t c) { return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z'); }
bool IsWord(char32_t c) { return IsAlpha(c) || IsDigit(c) || c == '_'; }
bool IsHex(char32_t c) { return IsDigit(c) || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F'); }
char32_t Lower(char32_t c) { return c >= 'A' && c <= 'Z' ? c + 32 : c; }
bool IsEndMark(const Text& t, size_t i) { return i == t.size() || t[i] == '/' || t[i] == '?' || t[i] == '#'; }

Text Trim(const Text& t) {
  size_t a = 0, b = t.size();
  while (a < b && IsSpace(t[a])) ++a;
  while (b > a && IsSpace(t[b - 1])) --b;
  return t.substr(a, b - a);
}
// String.length counts UTF-16 code units.
size_t JsLength(const Text& t) {
  size_t n = 0;
  for (char32_t c : t) n += c > 0xffff ? 2 : 1;
  return n;
}

// ASCII-case-insensitive `word` at `at`.
bool HasAt(const Text& t, size_t at, std::string_view word, bool fold = true) {
  if (at + word.size() > t.size()) return false;
  for (size_t k = 0; k < word.size(); ++k) {
    const char32_t c = fold ? Lower(t[at + k]) : t[at + k];
    if (c != static_cast<unsigned char>(word[k])) return false;
  }
  return true;
}
size_t Digits(const Text& t, size_t i) {
  while (i < t.size() && IsDigit(t[i])) ++i;
  return i;
}
// (?::\d+)?(?:[/?#]|$) from `i`.
bool PortThenEnd(const Text& t, size_t i) {
  if (i < t.size() && t[i] == ':') {
    const size_t end = Digits(t, i + 1);
    return end > i + 1 && IsEndMark(t, end);
  }
  return IsEndMark(t, i);
}

std::optional<Text> NormalizeQuery(std::string_view input) {
  auto decoded = Decode(input);
  if (!decoded) return std::nullopt;
  Text query = Trim(*decoded);
  const size_t length = JsLength(query);
  if (length < 2 || length > 200) return std::nullopt;
  return query;
}

// /\.(?:x?html?)(?:[?#].*)?$/i
bool EndsAsHtml(const Text& t) {
  for (size_t i = 0; i < t.size(); ++i) {
    if (t[i] != '.') continue;
    for (std::string_view ext : {"xhtml", "xhtm", "html", "htm"}) {
      if (!HasAt(t, i + 1, ext)) continue;
      size_t j = i + 1 + ext.size();
      if (j == t.size()) return true;
      if (t[j] != '?' && t[j] != '#') continue;
      bool clean = true;
      for (size_t k = j + 1; k < t.size(); ++k) clean = clean && !IsLineTerminator(t[k]);
      if (clean) return true;
    }
  }
  return false;
}

// /^(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?(?:[/?#]|$)/
bool IsIpv4(const Text& t) {
  size_t i = 0;
  for (int part = 0; part < 4; ++part) {
    const size_t end = Digits(t, i);
    if (end == i || end - i > 3) return false;
    i = end;
    if (part < 3) {
      if (i >= t.size() || t[i] != '.') return false;
      ++i;
    }
  }
  return PortThenEnd(t, i);
}

// /^\[[0-9a-z:.%_-]+\](?::\d+)?(?:[/?#]|$)/i
bool IsBracketHost(const Text& t) {
  if (t.empty() || t[0] != '[') return false;
  size_t i = 1;
  while (i < t.size() && (IsDigit(t[i]) || IsAlpha(t[i]) || t[i] == ':' || t[i] == '.' ||
                          t[i] == '%' || t[i] == '_' || t[i] == '-')) ++i;
  if (i == 1 || i >= t.size() || t[i] != ']') return false;
  return PortThenEnd(t, i + 1);
}

// /^[0-9a-f]*:[0-9a-f:]+(?:[/?#]|$)/i
bool IsBareIpv6(const Text& t) {
  size_t i = 0;
  while (i < t.size() && IsHex(t[i])) ++i;
  if (i >= t.size() || t[i] != ':') return false;
  size_t j = i + 1;
  while (j < t.size() && (IsHex(t[j]) || t[j] == ':')) ++j;
  return j > i + 1 && IsEndMark(t, j);
}

// /^(?!\.)[^\s./?#:]+(?:\.[^\s./?#:]+)+(?::\d+)?(?:[/?#][^\s]*)?$/u
bool IsHostShape(const Text& t) {
  const auto label = [](char32_t c) {
    return !IsSpace(c) && c != '.' && c != '/' && c != '?' && c != '#' && c != ':';
  };
  size_t i = 0, labels = 0;
  while (true) {
    const size_t start = i;
    while (i < t.size() && label(t[i])) ++i;
    if (i == start) return false;
    ++labels;
    if (i < t.size() && t[i] == '.') { ++i; continue; }
    break;
  }
  if (labels < 2) return false;
  if (i < t.size() && t[i] == ':') {
    const size_t end = Digits(t, i + 1);
    if (end == i + 1) return false;
    i = end;
  }
  if (i == t.size()) return true;
  if (t[i] != '/' && t[i] != '?' && t[i] != '#') return false;
  for (size_t k = i + 1; k < t.size(); ++k)
    if (IsSpace(t[k])) return false;
  return true;
}

// /(?:\d[\s-]?){13,19}/
bool HasCardNumber(const Text& t) {
  for (size_t i = 0; i < t.size();) {
    if (!IsDigit(t[i])) { ++i; continue; }
    size_t count = 0;
    while (i < t.size() && IsDigit(t[i])) {
      ++count;
      ++i;
      if (i < t.size() && (IsSpace(t[i]) || t[i] == '-')) ++i;
    }
    if (count >= 13) return true;
  }
  return false;
}

bool WordStart(const Text& t, size_t i) { return i == 0 || !IsWord(t[i - 1]); }

// /\b(?:password|passwd|token|secret|api[_ -]?key)\s*[:=]/i, /\bsk-/i,
// /\bgh[pousr]_/i and /\bAKIA/.
bool HasCredentialPrefix(const Text& t) {
  for (size_t i = 0; i < t.size(); ++i) {
    if (!IsWord(t[i]) || !WordStart(t, i)) continue;
    for (std::string_view word : {"password", "passwd", "token", "secret", "apikey", "api_key",
                                  "api-key", "api key"}) {
      if (!HasAt(t, i, word)) continue;
      size_t j = i + word.size();
      while (j < t.size() && IsSpace(t[j])) ++j;
      if (j < t.size() && (t[j] == ':' || t[j] == '=')) return true;
    }
    if (HasAt(t, i, "sk-") || HasAt(t, i, "AKIA", false)) return true;
    if (HasAt(t, i, "gh") && i + 3 < t.size() && t[i + 3] == '_' &&
        std::u32string_view(U"pousr").find(Lower(t[i + 2])) != std::u32string_view::npos) return true;
  }
  return false;
}

// application/x-www-form-urlencoded, as URLSearchParams serializes.
std::string FormEncode(std::string_view utf8) {
  constexpr std::string_view kHex = "0123456789ABCDEF";
  std::string out;
  for (unsigned char c : utf8) {
    if ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c == '*' ||
        c == '-' || c == '.' || c == '_') {
      out += static_cast<char>(c);
    } else if (c == ' ') {
      out += '+';
    } else {
      out += '%';
      out += kHex[c >> 4];
      out += kHex[c & 15];
    }
  }
  return out;
}

bool IsBangCode(const Text& code) {
  if (code.empty() || code.size() > 32 || !(IsAlpha(code[0]) || IsDigit(code[0]))) return false;
  for (char32_t c : code)
    if (!(IsAlpha(c) || IsDigit(c) || c == '_' || c == '-')) return false;
  return true;
}

}  // namespace

bool IsSuggestionEligible(std::string_view input) {
  const auto normalized = NormalizeQuery(input);
  if (!normalized) return false;
  const Text& t = *normalized;
  if (t[0] == '/' || t.find_first_of(U"\r\n") != Text::npos) return false;
  // /^[a-z][a-z0-9+.-]*:/i
  if (IsAlpha(t[0])) {
    size_t i = 1;
    while (i < t.size() && (IsAlpha(t[i]) || IsDigit(t[i]) || t[i] == '+' || t[i] == '.' || t[i] == '-')) ++i;
    if (i < t.size() && t[i] == ':') return false;
  }
  // A leading backslash is a Windows root-relative, UNC or device path.
  if (t[0] == '\\') return false;
  const auto slash = [&](size_t i) { return i < t.size() && (t[i] == '\\' || t[i] == '/'); };
  if ((t[0] == '.' && (slash(1) || (t.size() > 1 && t[1] == '.' && slash(2)))) ||
      (t[0] == '~' && slash(1)) || (IsAlpha(t[0]) && t.size() > 1 && t[1] == ':' && slash(2)))
    return false;
  if (EndsAsHtml(t)) return false;
  if (HasAt(t, 0, "localhost") && PortThenEnd(t, 9)) return false;
  if (IsIpv4(t) || IsBracketHost(t) || IsBareIpv6(t) || IsHostShape(t)) return false;
  if (HasCardNumber(t) || HasCredentialPrefix(t)) return false;
  return true;
}

std::optional<std::string> SuggestionRequestUrl(std::string_view engine, std::string_view query,
                                                std::string_view locale) {
  const auto normalized = NormalizeQuery(query);
  if (!normalized) return std::nullopt;
  const std::string q = FormEncode(Encode(*normalized));
  if (engine == "duckduckgo") return "https://duckduckgo.com/ac/?q=" + q + "&type=list";
  if (engine == "google")
    return "https://www.google.com/complete/search?output=chrome&ie=utf-8&oe=utf-8&q=" + q;
  if (engine == "bing") {
    std::string url = "https://api.bing.com/osjson.aspx?query=" + q;
    if (!locale.empty()) url += "&language=" + FormEncode(locale);
    return url;
  }
  if (engine == "brave") return "https://search.brave.com/api/suggest?q=" + q;
  if (engine == "kagi") return "https://kagi.com/api/autosuggest?q=" + q;
  return std::nullopt;
}

bool HasBangToken(std::string_view text) {
  const auto decoded = Decode(text);
  if (!decoded) return false;
  const Text trimmed = Trim(*decoded);
  if (trimmed.empty()) return false;
  size_t first_end = 0;
  while (first_end < trimmed.size() && !IsSpace(trimmed[first_end])) ++first_end;
  if (trimmed[0] == '!' && IsBangCode(trimmed.substr(1, first_end - 1))) return true;
  if (first_end == trimmed.size()) return false;
  size_t last_start = trimmed.size();
  while (last_start > 0 && !IsSpace(trimmed[last_start - 1])) --last_start;
  return trimmed[last_start] == '!' && IsBangCode(trimmed.substr(last_start + 1));
}

std::optional<std::string> CleanSuggestion(std::string_view value) {
  const auto decoded = Decode(value);
  if (!decoded) return std::nullopt;
  Text collapsed;
  for (char32_t c : *decoded) {
    if (!IsSpace(c)) collapsed.push_back(c);
    else if (collapsed.empty() || collapsed.back() != ' ') collapsed.push_back(' ');
  }
  const Text text = Trim(collapsed);
  if (text.empty() || JsLength(text) > 200) return std::nullopt;
  return Encode(text);
}

}  // namespace blanc::browser_api
