// Unregistered integration candidate. Single UI sequence only. The process
// start comes from the OS, not first WebUI access; failure denies the grant.
#include "chrome/browser/ui/launch_sunrise_gate.h"

constexpr char kLaunchSunrisePref[] = "blanc.prototype.launch_sunrise";

class SunriseContentsData final : public base::SupportsUserData::Data {
 public:
  LaunchSunriseContentsAttempt attempt;
};

LaunchSunriseGate& ProcessSunriseGate() {
  static LaunchSunriseGate gate([]() -> std::optional<int64_t> {
    base::Time started = base::Process::Current().CreationTime();
    if (started.is_null()) return std::nullopt;
    return started.InMillisecondsSinceUnixEpoch();
  }());
  return gate;
}

bool ClaimSunriseForTrustedStart(content::WebContents* contents,
                                 Profile* profile) {
  if (!contents || !profile) return false;
  static constexpr char key[] = "blanc-launch-sunrise-attempt";
  if (!contents->GetUserData(key))
    contents->SetUserData(key, std::make_unique<SunriseContentsData>());
  auto* data = static_cast<SunriseContentsData*>(contents->GetUserData(key));
  auto* prefs = g_browser_process ? g_browser_process->local_state() : nullptr;
  bool enabled = prefs && prefs->FindPreference(kLaunchSunrisePref) &&
                 prefs->GetBoolean(kLaunchSunrisePref);
  auto* browser = GlobalBrowserCollection::GetInstance()->FindBrowserWithTab(contents);
  auto* view = browser ? BrowserView::GetBrowserViewForBrowser(browser) : nullptr;
  auto* widget = view ? view->GetWidget() : nullptr;
  const bool visible = widget && widget->IsVisible() && !widget->IsMinimized() &&
      contents->GetVisibility() == content::Visibility::VISIBLE;
  return data->attempt.Take(ProcessSunriseGate(),
      base::Time::Now().InMillisecondsSinceUnixEpoch(), enabled,
      profile->IsOffTheRecord(), visible);
}

// Read only the named setting from the Local State file and never expose the
// remaining JSON to the renderer or logs. Failure remains an unknown result.
std::optional<bool> ReadSunriseOnDisk(base::FilePath path) {
  std::string json;
  if (!base::ReadFileToStringWithMaxSize(path, &json, 16 * 1024 * 1024))
    return std::nullopt;
  auto data = base::JSONReader::Read(json, base::JSON_PARSE_RFC);
  if (!data || !data->is_dict()) return std::nullopt;
  auto value = data->GetDict().FindBoolByDottedPath(kLaunchSunrisePref);
  // An absent pref in a valid store resolves to the registered default false.
  if (!value && !data->GetDict().FindByDottedPath(kLaunchSunrisePref)) return false;
  return value;
}

// The setting is a device-local Chromium Local State pref, not synced profile
// data. A commit callback is only a queue barrier, so we check disk separately.
class SunriseSettingsHandler final : public content::WebUIMessageHandler {
 public:
  void RegisterMessages() override;
  void OnJavascriptDisallowed() override;

 private:
  bool Trusted() {
    auto* frame = web_ui()->GetRenderFrameHost();
    auto* profile = Profile::FromWebUI(web_ui());
    return profile && !profile->IsOffTheRecord() && frame &&
        frame == web_ui()->GetWebContents()->GetPrimaryMainFrame() &&
        frame->GetLastCommittedURL() ==
            GURL("chrome://blanc-prototype/appearance-settings.html");
  }
  void Reply(const std::string& id, bool ok, base::Value value) {
    if (!Trusted() || !IsJavascriptAllowed()) return;
    web_ui()->CallJavascriptFunctionUnsafe("blancSunriseSettingsReply",
        base::Value(id), base::Value(ok), value);
  }
  void Changed() {
    if (Trusted() && IsJavascriptAllowed())
      web_ui()->CallJavascriptFunctionUnsafe("blancSunriseSettingsChanged");
  }
  void Handle(const base::ListValue& message) {
    if (!Trusted() || message.size() != 3 || !message[0].is_string() ||
        !message[1].is_string() || !message[2].is_list()) return;
    const auto id = message[0].GetString();
    const auto method = message[1].GetString();
    const auto& args = message[2].GetList();
    AllowJavascript();
    auto* prefs = g_browser_process ? g_browser_process->local_state() : nullptr;
    const auto* pref = prefs ? prefs->FindPreference(kLaunchSunrisePref) : nullptr;
    if (!pref) { Reply(id, false, base::Value("Appearance setting unavailable")); return; }
    if (!observer_.prefs()) {
      observer_.Init(prefs);
      observer_.Add(kLaunchSunrisePref, base::BindRepeating(
          &SunriseSettingsHandler::Changed, base::Unretained(this)));
    }
    if (method == "set" && args.size() == 1 && args[0].is_bool()) {
      if (!pref->IsUserModifiable()) {
        Reply(id, false, base::Value("Appearance setting is managed")); return;
      }
      const bool desired = args[0].GetBool();
      prefs->SetBoolean(kLaunchSunrisePref, desired);
      prefs->CommitPendingWrite(base::BindOnce(&SunriseSettingsHandler::AfterCommit,
          weak_factory_.GetWeakPtr(), id, desired));
      return;
    } else if (method != "get" || !args.empty()) {
      Reply(id, false, base::Value("Unsupported appearance request")); return;
    }
    base::DictValue state;
    state.Set("enabled", prefs->GetBoolean(kLaunchSunrisePref));
    state.Set("modifiable", pref->IsUserModifiable());
    Reply(id, true, base::Value(std::move(state)));
  }
  void AfterCommit(std::string id, bool desired) {
    base::FilePath user_data;
    if (!base::PathService::Get(chrome::DIR_USER_DATA, &user_data)) {
      AfterRead(std::move(id), desired, std::nullopt);
      return;
    }
    base::ThreadPool::PostTaskAndReplyWithResult(FROM_HERE,
        {base::MayBlock(), base::TaskPriority::USER_VISIBLE},
        base::BindOnce(&ReadSunriseOnDisk, user_data.Append(chrome::kLocalStateFilename)),
        base::BindOnce(&SunriseSettingsHandler::AfterRead,
            weak_factory_.GetWeakPtr(), std::move(id), desired));
  }
  void AfterRead(std::string id, bool desired, std::optional<bool> on_disk) {
    auto* prefs = g_browser_process ? g_browser_process->local_state() : nullptr;
    const auto* pref = prefs ? prefs->FindPreference(kLaunchSunrisePref) : nullptr;
    if (!pref) { Reply(id, false, base::Value("Appearance setting unavailable")); return; }
    const bool effective = prefs->GetBoolean(kLaunchSunrisePref);
    base::DictValue state;
    state.Set("enabled", effective);
    state.Set("modifiable", pref->IsUserModifiable());
    state.Set("persisted", pref->IsUserModifiable() && effective == desired &&
        on_disk && *on_disk == desired);
    Reply(id, true, base::Value(std::move(state)));
  }
  PrefChangeRegistrar observer_;
  base::WeakPtrFactory<SunriseSettingsHandler> weak_factory_{this};
};

void SunriseSettingsHandler::RegisterMessages() {
  web_ui()->RegisterMessageCallback("blancSunriseSettings",
      base::BindRepeating(&SunriseSettingsHandler::Handle, base::Unretained(this)));
}
void SunriseSettingsHandler::OnJavascriptDisallowed() {
  weak_factory_.InvalidateWeakPtrs();
  observer_.Reset();
}
