// Blanc's lists and language in chrome://settings (S1.7, owner: Blanc's
// settings in Chromium's matching sections). Switches bind through
// settings_private (patch 0021); what needs shipping's validation goes
// through this handler, registered on SettingsUI by the same patch:
//   Search engine → Your bangs (shipping's normalizeCustomBangs, its
//     duplicate check and the built-in it replaces),
//   Privacy and security → Blanc Blocker's status and the sites that load
//     without blocking (shipping's host normalization),
//   Languages → the interface language (device-wide, after a relaunch).
// Only chrome://settings in the regular profile's main frame reaches it.
class ChromiumSettingsHandler final : public settings::SettingsPageUIHandler {
 public:
  explicit ChromiumSettingsHandler(Profile* profile)
      : profile_(profile->GetOriginalProfile()) {}
  ~ChromiumSettingsHandler() override = default;

  void RegisterMessages() override;
  void OnJavascriptAllowed() override;
  void OnJavascriptDisallowed() override;

 private:
  bool Allowed() {
    auto* frame = web_ui()->GetRenderFrameHost();
    return frame && frame == web_ui()->GetWebContents()->GetPrimaryMainFrame() &&
        frame->GetLastCommittedURL().host() == chrome::kChromeUISettingsHost &&
        !Profile::FromWebUI(web_ui())->IsOffTheRecord();
  }
  // Every message carries a callback id first; anything else is ignored.
  bool Begin(const base::ListValue& args, size_t count) {
    if (!Allowed() || args.size() != count + 1 || !args[0].is_string()) return false;
    for (size_t i = 1; i < args.size(); ++i)
      if (!args[i].is_string()) return false;
    AllowJavascript();
    return true;
  }
  base::Value State() {
    auto* prefs = profile_->GetPrefs();
    base::ListValue bangs;
    for (const auto& row : blanc::browser_api::bangs::NormalizeCustomBangs(
             prefs->GetList(blanc::browser_api::bangs::kCustomPref))) {
      base::DictValue bang = row.GetDict().Clone();
      const auto* address = row.GetDict().FindString("template");
      bang.Set("host", address ? std::string(GURL(*address).host()) : std::string());
      bangs.Append(std::move(bang));
    }
    base::ListValue exceptions;
    for (const auto& entry : prefs->GetList("blanc.blocking.exceptions"))
      if (entry.is_string()) exceptions.Append(entry.Clone());
    base::ListValue languages;
    for (const auto& language : blanc::ui_language::kLanguages)
      languages.Append(base::DictValue().Set("code", std::string(language.code))
                                        .Set("endonym", std::string(language.endonym)));
    base::DictValue state;
    state.Set("customBangs", std::move(bangs));
    state.Set("exceptions", std::move(exceptions));
    // Shipping's Blocking status line: the switch and Blanc Blocker's health.
    state.Set("blockingEnabled", blanc::BlockingEnabled(profile_));
    state.Set("blockingHealth", blanc::BlockerHealth());
    // Shipping's sheet look follows Surface style (S1.7).
    state.Set("surfaceStyle",
              prefs->GetString("blanc.appearance.surface_style") == "neutral" ? "neutral" : "sunrise");
    state.Set("uiLanguage", g_browser_process->local_state()->GetString(std::string(blanc::ui_language::kPref)));
    state.Set("uiLanguages", std::move(languages));
    // This launch's pinned language, or none when it follows the browser's.
    const auto& pin = LaunchUiLanguage();
    state.Set("launchUiLanguage", pin ? base::Value(*pin) : base::Value());
    return base::Value(std::move(state));
  }
  void Changed() {
    if (IsJavascriptAllowed()) FireWebUIListener("blanc-settings-changed", State());
  }
  void Resolve(const base::ListValue& args, base::DictValue result) {
    result.Set("state", State());
    ResolveJavascriptCallback(args[0], base::Value(std::move(result)));
  }

  void HandleGet(const base::ListValue& args) {
    if (!Begin(args, 0)) return;
    ResolveJavascriptCallback(args[0], State());
  }
  // Shipping's addCustomBang: a duplicate code is refused first, because the
  // stored list keeps the earlier row; the row counts as added only if the
  // normalized list kept it exactly.
  void HandleAddBang(const base::ListValue& args) {
    if (!Begin(args, 3)) return;
    std::string_view typed = base::TrimWhitespaceASCII(args[1].GetString(), base::TRIM_ALL);
    if (base::StartsWith(typed, "!")) typed.remove_prefix(1);
    const std::string code = base::ToLowerASCII(typed);
    const std::string name(base::TrimWhitespaceASCII(args[2].GetString(), base::TRIM_ALL));
    const std::string address(base::TrimWhitespaceASCII(args[3].GetString(), base::TRIM_ALL));
    auto* prefs = profile_->GetPrefs();
    const auto existing = blanc::browser_api::bangs::NormalizeCustomBangs(
        prefs->GetList(blanc::browser_api::bangs::kCustomPref));
    for (const auto& row : existing) {
      if (const auto* stored = row.GetDict().FindString("code"); stored && *stored == code) {
        Resolve(args, base::DictValue().Set("result", "duplicate").Set("code", code));
        return;
      }
    }
    base::ListValue next = existing.Clone();
    next.Append(base::DictValue().Set("code", code).Set("name", name).Set("template", address));
    next = blanc::browser_api::bangs::NormalizeCustomBangs(next);
    bool kept = false;
    for (const auto& row : next) {
      const auto& dict = row.GetDict();
      const auto* c = dict.FindString("code");
      const auto* n = dict.FindString("name");
      const auto* t = dict.FindString("template");
      kept = kept || (c && n && t && *c == code && *n == name && *t == address);
    }
    if (!kept) {
      Resolve(args, base::DictValue().Set("result", "invalid"));
      return;
    }
    prefs->SetList(blanc::browser_api::bangs::kCustomPref, std::move(next));
    prefs->CommitPendingWrite();
    base::DictValue result;
    result.Set("result", "added");
    if (auto site = BuiltInBangName(code)) {
      result.Set("code", code);
      result.Set("site", *site);
    }
    Resolve(args, std::move(result));
  }
  void HandleRemoveBang(const base::ListValue& args) {
    if (!Begin(args, 1)) return;
    auto* prefs = profile_->GetPrefs();
    base::ListValue next;
    for (const auto& row : prefs->GetList(blanc::browser_api::bangs::kCustomPref)) {
      const auto* code = row.is_dict() ? row.GetDict().FindString("code") : nullptr;
      if (!code || *code != args[1].GetString()) next.Append(row.Clone());
    }
    prefs->SetList(blanc::browser_api::bangs::kCustomPref,
                   blanc::browser_api::bangs::NormalizeCustomBangs(next));
    prefs->CommitPendingWrite();
    Resolve(args, base::DictValue().Set("result", "removed"));
  }
  // Shipping's settings.js normalization: a host or an address, without www.
  static std::string ExceptionHost(std::string_view input) {
    const std::string trimmed(base::TrimWhitespaceASCII(input, base::TRIM_ALL));
    if (trimmed.empty() || trimmed.size() > 2048) return {};
    const GURL url(trimmed.find("://") != std::string::npos ? trimmed : "https://" + trimmed);
    if (!url.is_valid() || !url.has_host()) return {};
    std::string host = base::ToLowerASCII(url.host());
    // Chromium escapes what the URL Standard forbids in a host (a space, %);
    // shipping's URL parser refuses those instead.
    if (host.find('%') != std::string::npos) return {};
    if (base::StartsWith(host, "www.")) host.erase(0, 4);
    return host.size() <= 253 ? host : std::string();
  }
  void HandleAddException(const base::ListValue& args) {
    if (!Begin(args, 1)) return;
    const std::string host = ExceptionHost(args[1].GetString());
    const GURL url("https://" + host + "/");
    const bool added = !host.empty() && url.is_valid() && url.host() == host &&
        blanc::BlockingHostname(url) == host &&
        blanc::SetBlockingSiteException(profile_, url, true);
    if (added) profile_->GetPrefs()->CommitPendingWrite();
    Resolve(args, base::DictValue().Set("result", added ? "added" : "invalid"));
  }
  void HandleRemoveException(const base::ListValue& args) {
    if (!Begin(args, 1)) return;
    const std::string& host = args[1].GetString();
    const GURL url("https://" + host + "/");
    if (url.is_valid() && url.host() == host && blanc::SetBlockingSiteException(profile_, url, false))
      profile_->GetPrefs()->CommitPendingWrite();
    Resolve(args, base::DictValue().Set("result", "removed"));
  }
  void HandleSetUiLanguage(const base::ListValue& args) {
    if (!Begin(args, 1)) return;
    if (blanc::ui_language::IsChoice(args[1].GetString())) {
      g_browser_process->local_state()->SetString(std::string(blanc::ui_language::kPref), args[1].GetString());
      g_browser_process->local_state()->CommitPendingWrite();
    }
    Resolve(args, base::DictValue().Set("result", "set"));
  }
  // Instrument Sans, shipping's UI face, for chrome://settings: its bytes
  // come from Blanc's bundled pages, loaded with the FontFace API.
  void HandleFont(const base::ListValue& args) {
    if (!Begin(args, 0)) return;
    const auto bytes = blanc::island_resources::Find("pages/instrument-sans-latin-wdth-normal.woff2");
    ResolveJavascriptCallback(args[0], bytes ? base::Value(base::Base64Encode(*bytes)) : base::Value());
  }
  void HandleRelaunch(const base::ListValue& args) {
    if (!Begin(args, 0)) return;
    ResolveJavascriptCallback(args[0], base::Value(true));
    chrome::AttemptRestart();
  }

  // The built-in bang a code replaces, read from the bundled catalog the
  // Island uses (pages/bangs-catalog.js, one JSON row per line:
  // [code, aliases, name, ...]); a primary code wins over an alias, as in
  // shipping's findBang.
  static std::optional<std::string> BuiltInBangName(const std::string& code) {
    const auto bytes = blanc::island_resources::Find("pages/bangs-catalog.js");
    if (!bytes) return std::nullopt;
    const std::string_view text(reinterpret_cast<const char*>(bytes->front()), bytes->size());
    const std::string primary = "[\"" + code + "\",";
    std::optional<std::string> alias;
    for (auto line : base::SplitStringPiece(text, "\n", base::TRIM_WHITESPACE, base::SPLIT_WANT_NONEMPTY)) {
      if (!base::StartsWith(line, "[\"")) continue;
      const bool is_primary = base::StartsWith(line, primary);
      if (!is_primary && (alias || line.find("\"" + code + "\"") == std::string_view::npos)) continue;
      if (base::EndsWith(line, ",")) line.remove_suffix(1);
      const auto row = base::JSONReader::Read(line, base::JSON_PARSE_RFC);
      if (!row || !row->is_list() || row->GetList().size() < 3 || !row->GetList()[2].is_string()) continue;
      const auto& list = row->GetList();
      if (is_primary) return list[2].GetString();
      if (list[1].is_list())
        for (const auto& a : list[1].GetList())
          if (a.is_string() && a.GetString() == code) alias = list[2].GetString();
    }
    return alias;
  }

  raw_ptr<Profile> profile_;
  PrefChangeRegistrar prefs_;
  PrefChangeRegistrar local_;
};

void ChromiumSettingsHandler::RegisterMessages() {
  const auto bind = [this](const char* name, void (ChromiumSettingsHandler::*method)(const base::ListValue&)) {
    web_ui()->RegisterMessageCallback(name, base::BindRepeating(method, base::Unretained(this)));
  };
  bind("blancSettingsGet", &ChromiumSettingsHandler::HandleGet);
  bind("blancSettingsAddBang", &ChromiumSettingsHandler::HandleAddBang);
  bind("blancSettingsRemoveBang", &ChromiumSettingsHandler::HandleRemoveBang);
  bind("blancSettingsAddException", &ChromiumSettingsHandler::HandleAddException);
  bind("blancSettingsRemoveException", &ChromiumSettingsHandler::HandleRemoveException);
  bind("blancSettingsSetUiLanguage", &ChromiumSettingsHandler::HandleSetUiLanguage);
  bind("blancSettingsRelaunch", &ChromiumSettingsHandler::HandleRelaunch);
  bind("blancSettingsFont", &ChromiumSettingsHandler::HandleFont);
}

void ChromiumSettingsHandler::OnJavascriptAllowed() {
  prefs_.Init(profile_->GetPrefs());
  for (const char* pref : {blanc::browser_api::bangs::kCustomPref, "blanc.blocking.enabled",
                           "blanc.blocking.exceptions", "blanc.appearance.surface_style"})
    prefs_.Add(pref, base::BindRepeating(&ChromiumSettingsHandler::Changed, base::Unretained(this)));
  local_.Init(g_browser_process->local_state());
  local_.Add(std::string(blanc::ui_language::kPref),
             base::BindRepeating(&ChromiumSettingsHandler::Changed, base::Unretained(this)));
}

void ChromiumSettingsHandler::OnJavascriptDisallowed() {
  prefs_.Reset();
  local_.Reset();
}
