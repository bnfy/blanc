// Copyright 2026 Bananify Creative. MIT; see LICENSE.
#include "blanc/browser/sync/desktop_sync_settings.h"

#include <memory>
#include <set>
#include "base/strings/string_util.h"
#include "base/strings/utf_string_conversions.h"
#include "blanc/browser/sync/sync_merge.h"
#include "blanc/browser/ui/browser_api/search_choice.h"
#include "blanc/browser/ui/modules/custom_template.h"
#include "chrome/browser/profiles/profile.h"
#include "chrome/browser/search_engines/template_url_service_factory.h"
#include "chrome/browser/themes/theme_service.h"
#include "chrome/browser/themes/theme_service_factory.h"
#include "components/prefs/pref_service.h"
#include "components/search_engines/template_url.h"
#include "components/search_engines/template_url_data.h"
#include "components/search_engines/template_url_service.h"
#include "url/gurl.h"

namespace blanc {
namespace {
using Scheme = ThemeService::BrowserColorScheme;
bool Editable(PrefService* prefs, std::string_view key) {
  const auto* pref = prefs->FindPreference(key);
  return pref && pref->IsUserModifiable();
}
bool SearchEditable(TemplateURLService* search) {
  return search && search->loaded() && !search->is_default_search_managed() &&
         !search->IsExtensionControlledDefaultSearch();
}
bool ValidTemplate(const std::string& value) {
  auto valid = custom_search::Validate(value);
  return valid && valid->literal == value && browser_api::ToChromiumPattern(value).has_value();
}
}  // namespace

bool SupportedDesktopSyncSetting(std::string_view key, const base::Value& value) {
  if (key == "theme") return value.is_string() &&
      (value.GetString() == "system" || value.GetString() == "light" || value.GetString() == "dark");
  if (key == "adblockEnabled" || key == "bangsEnabled") return value.is_bool();
  if (key == "searchEngine") return value.is_string() &&
      (value.GetString() == "custom" || browser_api::StockPrepopulateId(value.GetString()).has_value());
  if (key == "searchEngineTemplate") return value.is_string() &&
      (value.GetString().empty() || ValidTemplate(value.GetString()));
  if (key == "adblockExceptions") {
    if (!value.is_list()) return false;
    for (const auto& host : value.GetList()) {
      if (!host.is_string() || host.GetString().empty()) return false;
      const GURL url("https://" + host.GetString() + "/");
      if (!url.is_valid() || url.host() != host.GetString() ||
          url.has_port() || url.has_username() || url.has_password()) return false;
    }
    return true;
  }
  if (key == "customBangs") {
    if (!value.is_list() || value.GetList().size() > 100) return false;
    std::set<std::string> seen;
    for (const auto& row : value.GetList()) {
      if (!row.is_dict()) return false;
      const auto* code = row.GetDict().FindString("code");
      const auto* name = row.GetDict().FindString("name");
      const auto* address = row.GetDict().FindString("template");
      if (!code || code->empty() || code->size() > 32 ||
          !base::IsAsciiAlphaNumeric((*code)[0]) || base::ToLowerASCII(*code) != *code ||
          !seen.insert(*code).second || !name || name->empty() ||
          base::UTF8ToUTF16(*name).size() > 60 || !address || !ValidTemplate(*address)) return false;
      for (char c : *code)
        if (!base::IsAsciiAlphaNumeric(c) && c != '_' && c != '-') return false;
    }
    return true;
  }
  return false;
}

base::DictValue ReadDesktopSyncSettings(Profile* profile) {
  base::DictValue out;
  auto* prefs = profile->GetPrefs();
  for (const auto& mapping : sync_merge::kSettings) {
    if (mapping.pref.empty() || mapping.key == "theme" || !Editable(prefs, mapping.pref)) continue;
    const auto* value = prefs->GetUserPrefValue(mapping.pref);
    if (!value) value = prefs->GetDefaultPrefValue(mapping.pref);
    if (value && SupportedDesktopSyncSetting(mapping.key, *value))
      out.Set(mapping.key, value->Clone());
  }
  if (auto* theme = ThemeServiceFactory::GetForProfile(profile);
      theme && Editable(prefs, "browser.theme.color_scheme2")) {
    const auto scheme = theme->GetBrowserColorScheme();
    out.Set("theme", scheme == Scheme::kLight ? "light" : scheme == Scheme::kDark ? "dark" : "system");
  }
  auto* search = TemplateURLServiceFactory::GetForProfile(profile);
  if (search && !search->loaded()) search->Load();
  if (SearchEditable(search)) {
    const auto* custom = search->GetTemplateURLForKeyword(browser_api::kCustomKeyword);
    const auto* selected = search->GetDefaultSearchProvider();
    std::string pattern;
    if (custom) pattern = browser_api::FromChromiumPattern(custom->url()).value_or("");
    if (selected && selected == custom && ValidTemplate(pattern)) out.Set("searchEngine", "custom");
    else if (selected) {
      if (auto stock = browser_api::StockName(selected->prepopulate_id())) out.Set("searchEngine", std::string(*stock));
    }
    // An arbitrary native engine must not be replaced by a synced stock one.
    if (out.contains("searchEngine") && (pattern.empty() || ValidTemplate(pattern)))
      out.Set("searchEngineTemplate", pattern);
  }
  return out;
}

void ApplyDesktopSyncSettings(Profile* profile, const base::DictValue& patch) {
  auto* prefs = profile->GetPrefs();
  for (const auto& mapping : sync_merge::kSettings) {
    const auto* value = patch.Find(mapping.key);
    if (!value || mapping.pref.empty() || !Editable(prefs, mapping.pref) ||
        !SupportedDesktopSyncSetting(mapping.key, *value)) continue;
    if (mapping.key == "theme") {
      if (auto* theme = ThemeServiceFactory::GetForProfile(profile)) {
        const auto& text = value->GetString();
        theme->SetBrowserColorScheme(text == "light" ? Scheme::kLight : text == "dark" ? Scheme::kDark : Scheme::kSystem);
      }
    } else {
      prefs->Set(mapping.pref, *value);
    }
  }
  if (!patch.contains("searchEngine") && !patch.contains("searchEngineTemplate")) return;
  auto* search = TemplateURLServiceFactory::GetForProfile(profile);
  if (!SearchEditable(search)) return;
  auto current = ReadDesktopSyncSettings(profile);
  const auto* engine = patch.FindString("searchEngine");
  if (!engine) engine = current.FindString("searchEngine");
  const auto* address = patch.FindString("searchEngineTemplate");
  if (!address) address = current.FindString("searchEngineTemplate");
  if (!engine || !address || !SupportedDesktopSyncSetting("searchEngine", base::Value(*engine)) ||
      !SupportedDesktopSyncSetting("searchEngineTemplate", base::Value(*address)) ||
      (*engine == "custom" && address->empty())) return;
  auto* custom = search->GetTemplateURLForKeyword(browser_api::kCustomKeyword);
  if (!address->empty()) {
    const auto pattern = browser_api::ToChromiumPattern(*address);
    if (!pattern) return;
    if (custom) search->ResetTemplateURL(custom, u"Custom", browser_api::kCustomKeyword, *pattern);
    else {
      TemplateURLData data;
      data.SetShortName(u"Custom");
      data.SetKeyword(browser_api::kCustomKeyword);
      data.SetURL(*pattern);
      custom = search->Add(std::make_unique<TemplateURL>(data));
    }
  }
  if (*engine == "custom") {
    if (custom) search->SetUserSelectedDefaultSearchProvider(custom);
  } else if (auto id = browser_api::StockPrepopulateId(*engine)) {
    search->SetUserSelectedDefaultSearchProviderByPrepopulateId(*id);
    if (address->empty() && custom && search->GetDefaultSearchProvider() != custom) search->Remove(custom);
  }
}
}  // namespace blanc
