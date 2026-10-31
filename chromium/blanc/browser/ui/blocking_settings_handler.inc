// Only the bundled top-level settings document can read or change blocking
// preferences. Web content and the Island's other documents cannot invoke it.
class BlockingSettingsHandler final : public content::WebUIMessageHandler {
 public:
  BlockingSettingsHandler() = default;
  ~BlockingSettingsHandler() override = default;
  void RegisterMessages() override;
  void OnJavascriptDisallowed() override;
 private:
  bool IsSettingsPage();
  void Handle(const base::ListValue& message);
  void Notify();
  void Reply(const std::string& id, bool ok, base::Value value);
  PrefChangeRegistrar registrar_;
};
void BlockingSettingsHandler::RegisterMessages() {
  web_ui()->RegisterMessageCallback("blancBlockingSettings",
      base::BindRepeating(&BlockingSettingsHandler::Handle, base::Unretained(this)));
}
void BlockingSettingsHandler::OnJavascriptDisallowed() { registrar_.Reset(); }
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
