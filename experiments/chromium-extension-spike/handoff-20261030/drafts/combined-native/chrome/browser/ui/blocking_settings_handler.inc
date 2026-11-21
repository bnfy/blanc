// Only the bundled top-level settings document can read or change blocking
// preferences. Web content and the Island's other documents cannot invoke it.
class BlockingSettingsHandler final : public content::WebUIMessageHandler {
 public:
  BlockingSettingsHandler();
  ~BlockingSettingsHandler() override;
  void RegisterMessages() override;
  void OnJavascriptDisallowed() override;
 private:
  bool IsSettingsPage();
  void Handle(const base::ListValue& message);
  void Notify();
  void Reply(const std::string& id, bool ok, base::Value value);
  PrefChangeRegistrar registrar_;
  PrefChangeRegistrar language_registrar_;
  base::WeakPtrFactory<BlockingSettingsHandler> weak_factory_{this};
};
BlockingSettingsHandler::BlockingSettingsHandler() = default;
BlockingSettingsHandler::~BlockingSettingsHandler() = default;
void BlockingSettingsHandler::RegisterMessages() {
  web_ui()->RegisterMessageCallback("blancBlockingSettings",
      base::BindRepeating(&BlockingSettingsHandler::Handle, base::Unretained(this)));
}
void BlockingSettingsHandler::OnJavascriptDisallowed() {
  weak_factory_.InvalidateWeakPtrs();
  registrar_.Reset();
  language_registrar_.Reset();
}
bool BlockingSettingsHandler::IsSettingsPage() {
  auto* frame = web_ui()->GetRenderFrameHost();
  return frame && frame == web_ui()->GetWebContents()->GetPrimaryMainFrame() &&
      frame->GetLastCommittedURL() ==
          GURL("chrome://blanc-prototype/blocking-settings.html");
}
void BlockingSettingsHandler::Reply(const std::string& id, bool ok, base::Value value) {
  if (!IsSettingsPage() || !IsJavascriptAllowed()) return;
  web_ui()->CallJavascriptFunctionUnsafe("blancBlockingSettingsReply", base::Value(id), base::Value(ok), value);
}
void BlockingSettingsHandler::Notify() {
  if (IsSettingsPage() && IsJavascriptAllowed())
    web_ui()->CallJavascriptFunctionUnsafe("blancBlockingSettingsChanged");
}
void BlockingSettingsHandler::Handle(const base::ListValue& message) {
  if (!IsSettingsPage() || message.size() != 3 || !message[0].is_string() ||
      !message[1].is_string() || !message[2].is_list()) return;
  const std::string id = message[0].GetString();
  const std::string method = message[1].GetString();
  const auto& args = message[2].GetList();
  auto* profile = Profile::FromWebUI(web_ui());
  if (!profile) return;
  if (method == "languageGet" || method == "languageSet" ||
      method == "languageRestart") {
    auto* local = g_browser_process ? g_browser_process->local_state() : nullptr;
    AllowJavascript();
    if (!local || !local->FindPreference(kInterfaceLanguagePref)) {
      Reply(id, false, base::Value("Language preference unavailable.")); return;
    }
    if (!language_registrar_.prefs()) {
      language_registrar_.Init(local);
      language_registrar_.Add(kInterfaceLanguagePref,
          base::BindRepeating(&BlockingSettingsHandler::Notify, base::Unretained(this)));
    }
    if (method == "languageGet" && args.empty()) {
      const std::string stored = local->GetString(kInterfaceLanguagePref);
      base::DictValue state;
      state.Set("setting", IsInterfaceLanguage(stored) ? stored : "system");
      state.Set("activeSetting", ActiveInterfaceLanguageSetting());
      state.Set("modifiable", local->IsUserModifiablePreference(kInterfaceLanguagePref));
      state.Set("writePending", LanguageWriteState().pending);
      state.Set("writeConfirmed", !LanguageWriteState().unconfirmed);
      Reply(id, true, base::Value(std::move(state))); return;
    }
    if (method == "languageSet" && args.size() == 1 && args[0].is_string() &&
        IsInterfaceLanguage(args[0].GetString()) &&
        local->IsUserModifiablePreference(kInterfaceLanguagePref)) {
      auto& write = LanguageWriteState();
      if (write.pending) { Reply(id, false, base::Value("Another language change is still being checked.")); return; }
      base::FilePath user_data;
      if (!base::PathService::Get(chrome::DIR_USER_DATA, &user_data)) {
        Reply(id, false, base::Value("Language preference path is unavailable.")); return;
      }
      const auto path = user_data.Append(chrome::kLocalStateFilename);
      const std::string requested = args[0].GetString();
      ActiveInterfaceLanguageSetting();
      write.pending = true;
      write.unconfirmed = true;
      // Force a write when retrying the same in-memory value after an
      // unconfirmed outcome; the process-frozen active language is unchanged.
      if (local->GetString(kInterfaceLanguagePref) == requested)
        local->ClearPref(kInterfaceLanguagePref);
      local->SetString(kInterfaceLanguagePref, requested);
      local->CommitPendingWrite(base::BindOnce(
          [](base::WeakPtr<BlockingSettingsHandler> self, std::string request_id,
             base::FilePath path, std::string requested) {
            const std::string rejected_request_id = request_id;
            const bool posted = base::ThreadPool::PostTaskAndReplyWithResult(
                FROM_HERE, {base::MayBlock()},
                base::BindOnce(&ConfirmInterfaceLanguageOnDisk, std::move(path), requested),
                base::BindOnce([](base::WeakPtr<BlockingSettingsHandler> self,
                                  std::string request_id, std::string requested, bool on_disk) {
                  auto& write = LanguageWriteState();
                  auto* local = g_browser_process ? g_browser_process->local_state() : nullptr;
                  const bool confirmed = on_disk && local &&
                      local->FindPreference(kInterfaceLanguagePref) &&
                      local->GetString(kInterfaceLanguagePref) == requested;
                  write.pending = false;
                  write.unconfirmed = !confirmed;
                  if (self) self->Notify();
                  if (self) self->Reply(request_id, confirmed, confirmed ? base::Value(true) :
                      base::Value("Could not confirm the language change. Try again."));
                }, self, std::move(request_id), std::move(requested)));
            if (!posted) {
              auto& write = LanguageWriteState();
              write.pending = false;
              write.unconfirmed = true;
              if (self) self->Notify();
              if (self) self->Reply(rejected_request_id, false,
                  base::Value("Could not confirm the language change. Try again."));
            }
          }, weak_factory_.GetWeakPtr(), id, path, requested));
      return;
    }
    if (method == "languageRestart" && args.empty()) {
      if (LanguageWriteState().pending || LanguageWriteState().unconfirmed) {
        Reply(id, false, base::Value("Confirm the language change before restarting.")); return;
      }
      const std::string requested = local->GetString(kInterfaceLanguagePref);
      Reply(id, true, base::Value(true));
      // A later language change invalidates this request before restart.
      // AttemptRestart retains Chromium's ordinary unload/veto handling.
      local->CommitPendingWrite(base::BindOnce([](std::string requested) {
        auto* prefs = g_browser_process ? g_browser_process->local_state() : nullptr;
        if (!LanguageWriteState().pending && !LanguageWriteState().unconfirmed && prefs &&
            prefs->FindPreference(kInterfaceLanguagePref) &&
            prefs->GetString(kInterfaceLanguagePref) == requested)
          chrome::AttemptRestart();
      }, requested));
      return;
    }
    Reply(id, false, base::Value("Invalid or unavailable language setting.")); return;
  }
  auto* prefs = profile->GetOriginalProfile()->GetPrefs();
  if (!prefs->FindPreference("blanc.blocking.enabled") ||
      !prefs->FindPreference("blanc.blocking.exceptions")) {
    AllowJavascript(); Reply(id, false, base::Value("Blocking preferences are unavailable.")); return;
  }
  AllowJavascript();
  if (!registrar_.prefs()) {
    registrar_.Init(prefs);
    for (const char* pref : {"blanc.blocking.enabled", "blanc.blocking.exceptions"})
      registrar_.Add(pref, base::BindRepeating(&BlockingSettingsHandler::Notify, base::Unretained(this)));
  }
  if (method == "get" && args.empty()) {
    base::ListValue entries;
    for (const auto& entry : prefs->GetList("blanc.blocking.exceptions"))
      if (entry.is_string()) entries.Append(entry.Clone());
    base::DictValue state;
    state.Set("enabled", blanc::BlockingEnabled(profile));
    state.Set("exceptions", std::move(entries));
    state.Set("health", blanc::BlockerHealth());
    Reply(id, true, base::Value(std::move(state))); return;
  }
  bool changed = false;
  if (method == "setEnabled" && args.size() == 1 && args[0].is_bool()) {
    changed = blanc::SetBlockingEnabled(profile, args[0].GetBool());
  } else if ((method == "addException" || method == "removeException") &&
             args.size() == 1 && args[0].is_string()) {
    const std::string host = args[0].GetString();
    const GURL url("https://" + host + "/");
    // Accept only an already normalized hostname, never URL paths, userinfo,
    // ports, or arbitrary serialized preference values.
    if (!host.empty() && host.size() <= 253 && url.is_valid() &&
        url.host() == host && blanc::BlockingHostname(url) == host)
      changed = blanc::SetBlockingSiteException(profile, url, method == "addException");
  }
  if (!changed) { Reply(id, false, base::Value("Invalid or unavailable blocking setting.")); return; }
  prefs->CommitPendingWrite();
  Reply(id, true, base::Value(true));
}
