// Copyright 2026 Bananify Creative. MIT; see the Blanc repository LICENSE.
#ifndef BLANC_BROWSER_UI_UI_LANGUAGE_H_
#define BLANC_BROWSER_UI_UI_LANGUAGE_H_

#include <array>
#include <optional>
#include <string>
#include <string_view>

namespace blanc::ui_language {

// Shipping v1.45.1's interface language (F44): "system" or one of its
// selectable languages, stored device-wide and read once at launch, so a change
// applies after a relaunch (src/main/i18n.js). Only Blanc's own text follows
// it; Chromium's menus, page widgets and Accept-Language stay on the OS
// language, as in shipping. Standard library only, so tools/ui-language.test.mjs
// can compile it beside shipping's resolver.
inline constexpr std::string_view kPref = "blanc.ui_language";
inline constexpr std::string_view kSystem = "system";

struct Language {
  std::string_view code;
  std::string_view endonym;
};
// Shipping's selectable languages (src/main/i18n-locales.json), in its order.
inline constexpr std::array<Language, 6> kLanguages = {{
    {"en", "English"},
    {"de", "Deutsch"},
    {"es", "Español"},
    {"fr", "Français"},
    {"it", "Italiano"},
    {"pt-BR", "Português do Brasil"},
}};

inline bool IsSelectable(std::string_view code) {
  for (const Language& language : kLanguages) {
    if (language.code == code) {
      return true;
    }
  }
  return false;
}

// What Settings may store: "system" or a selectable language.
inline bool IsChoice(std::string_view value) {
  return value == kSystem || IsSelectable(value);
}

// The language Blanc's documents are pinned to for this launch, or nullopt to
// follow the browser's languages (strings.js resolves those as shipping's
// resolveLocale does). A stored language that is no longer selectable renders
// English and stays stored.
inline std::optional<std::string> Pin(std::string_view stored) {
  if (IsSelectable(stored)) {
    return std::string(stored);
  }
  if (stored == kSystem) {
    return std::nullopt;
  }
  return std::string("en");
}

}  // namespace blanc::ui_language

#endif  // BLANC_BROWSER_UI_UI_LANGUAGE_H_
