// Copyright 2026 Bananify Creative. MIT; see the Blanc repository LICENSE.
#include "blanc/browser/ui/browser_api/bangs.h"

#include <set>
#include <string>
#include <utility>

#include "base/strings/string_util.h"
#include "base/strings/utf_string_conversions.h"
#include "blanc/browser/ui/modules/custom_template.h"
#include "components/prefs/pref_service.h"

namespace blanc::browser_api::bangs {
namespace {

constexpr size_t kMaxCustomBangs = 100;
constexpr size_t kMaxRecentBangs = 10;
constexpr size_t kMaxCustomBangName = 60;

std::string Trimmed(const std::string* value) {
  if (!value) return std::string();
  std::u16string text = base::UTF8ToUTF16(*value);
  return base::UTF16ToUTF8(base::TrimWhitespace(text, base::TRIM_ALL));
}

base::ListValue NormalizeRecent(const base::ListValue& codes) {
  base::ListValue out;
  for (const auto& value : codes) {
    if (!value.is_string() || !IsBangCode(value.GetString()) || out.contains(value.GetString())) continue;
    out.Append(value.GetString());
    if (out.size() >= kMaxRecentBangs) break;
  }
  return out;
}

}  // namespace

bool IsBangCode(std::string_view code) {
  if (code.empty() || code.size() > 32 || !base::IsAsciiAlphaNumeric(code[0])) return false;
  for (char c : code)
    if (!base::IsAsciiAlphaNumeric(c) && c != '_' && c != '-') return false;
  return true;
}

base::ListValue NormalizeCustomBangs(const base::ListValue& rows) {
  base::ListValue out;
  std::set<std::string> seen;
  for (const auto& row : rows) {
    if (!row.is_dict()) continue;
    const auto& dict = row.GetDict();
    const std::string code = base::ToLowerASCII(Trimmed(dict.FindString("code")));
    const std::string name = Trimmed(dict.FindString("name"));
    const std::string address = Trimmed(dict.FindString("template"));
    if (!IsBangCode(code) || seen.contains(code)) continue;
    if (name.empty() || base::UTF8ToUTF16(name).size() > kMaxCustomBangName) continue;
    if (!blanc::custom_search::Validate(address)) continue;
    seen.insert(code);
    out.Append(base::DictValue().Set("code", code).Set("name", name).Set("template", address));
    if (out.size() >= kMaxCustomBangs) break;
  }
  return out;
}

mojom::BangsStatePtr State(const PrefService& prefs) {
  std::vector<mojom::CustomBangPtr> custom;
  for (const auto& row : NormalizeCustomBangs(prefs.GetList(kCustomPref))) {
    const auto& dict = row.GetDict();
    custom.push_back(mojom::CustomBang::New(*dict.FindString("code"), *dict.FindString("name"),
                                            *dict.FindString("template")));
  }
  std::vector<std::string> recent;
  for (const auto& code : NormalizeRecent(prefs.GetList(kRecentPref))) recent.push_back(code.GetString());
  return mojom::BangsState::New(prefs.GetBoolean(kEnabledPref), std::move(custom), std::move(recent));
}

void RecordRecent(PrefService& prefs, std::string_view code) {
  if (!IsBangCode(code)) return;
  base::ListValue next;
  next.Append(std::string(code));
  for (const auto& value : prefs.GetList(kRecentPref)) next.Append(value.Clone());
  next = NormalizeRecent(next);
  if (next != prefs.GetList(kRecentPref)) prefs.SetList(kRecentPref, std::move(next));
}

void ClearRecent(PrefService& prefs) {
  if (!prefs.GetList(kRecentPref).empty()) prefs.SetList(kRecentPref, base::ListValue());
}

}  // namespace blanc::browser_api::bangs
