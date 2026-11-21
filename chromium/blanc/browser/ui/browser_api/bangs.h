// Copyright 2026 Bananify Creative. MIT; see the Blanc repository LICENSE.
#ifndef BLANC_BROWSER_UI_BROWSER_API_BANGS_H_
#define BLANC_BROWSER_UI_BROWSER_API_BANGS_H_

#include <string_view>

#include "base/values.h"
#include "blanc/common/browser_api/browser_api.mojom.h"

class PrefService;

namespace blanc::browser_api::bangs {

// Profile preferences, registered in browser_prefs.cc (patch 0007). Shipping
// v1.45.1 keeps the same three settings (src/main/settings.js): the switch,
// the person's own bangs and the ten most recently used codes.
inline constexpr char kEnabledPref[] = "blanc.bangs.enabled";
inline constexpr char kCustomPref[] = "blanc.bangs.custom";
inline constexpr char kRecentPref[] = "blanc.bangs.recent";

// Shipping's bang code grammar (bangs.js isBangCode): a letter or digit, then
// up to 31 letters, digits, hyphens or underscores.
bool IsBangCode(std::string_view code);

// Shipping's normalizeCustomBangs: {code, name, template} rows with the code
// lowercased, the name trimmed to 1–60 characters and the address valid as a
// custom search address. Junk rows are dropped, the first of a duplicate code
// kept, at most 100.
base::ListValue NormalizeCustomBangs(const base::ListValue& rows);

// What the Island reads: the switch, the person's bangs and the recents.
mojom::BangsStatePtr State(const PrefService& prefs);

// A bang was used: its primary code goes first, at most ten. Callers never
// record from a private tab.
void RecordRecent(PrefService& prefs, std::string_view code);
// Clearing history also forgets which bangs were used.
void ClearRecent(PrefService& prefs);

}  // namespace blanc::browser_api::bangs

#endif  // BLANC_BROWSER_UI_BROWSER_API_BANGS_H_
