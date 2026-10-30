// Unregistered integration candidate. Single UI sequence only. The process
// start comes from the OS, not first WebUI access; failure denies the grant.
#include "chrome/browser/ui/launch_sunrise_gate.h"

constexpr char kLaunchSunrisePref[] = "blanc.prototype.launch_sunrise";
uint64_t& SunriseSettingsRevision() {
  static uint64_t revision = 0;
  return revision;
}

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
  auto* model = browser ? browser->GetTabStripModel() : nullptr;
  const int index = model ? model->GetIndexOfWebContents(contents) : -1;
  const bool active = model && model->GetActiveWebContents() == contents;
  const auto target_split = model && index >= 0 ? model->GetSplitForTab(index) : std::nullopt;
  const auto active_split = model && model->active_index() >= 0
      ? model->GetSplitForTab(model->active_index()) : std::nullopt;
  const bool same_active_split = target_split && active_split && target_split == active_split;
  const bool granted = data->attempt.Take(ProcessSunriseGate(),
      base::Time::Now().InMillisecondsSinceUnixEpoch(), enabled,
      profile->IsOffTheRecord(), visible);
  // Fixture-only diagnostic: booleans and visibility enum, never URL or tab ID.
  LOG(ERROR) << "SUNRISE_FIXTURE_NATIVE"
             << " visibility=" << static_cast<int>(contents->GetVisibility())
             << " attached=" << (index >= 0) << " active=" << active
             << " active_split=" << same_active_split
             << " widget_visible=" << (widget && widget->IsVisible())
             << " widget_minimized=" << (widget && widget->IsMinimized())
             << " private=" << profile->IsOffTheRecord()
             << " enabled=" << enabled << " granted=" << granted;
  return granted;
}

#include "chrome/browser/ui/launch_sunrise_disk.inc"

// The setting is a device-local Chromium Local State pref, not synced profile
// data. A commit callback is only a queue barrier, so we check disk separately.
class SunriseSettingsHandler final : public content::WebUIMessageHandler {
 public:
  SunriseSettingsHandler();
  ~SunriseSettingsHandler() override;
  void RegisterMessages() override;
  void OnJavascriptDisallowed() override;

 private:
  bool Trusted() {
    auto* frame = web_ui()->GetRenderFrameHost();
    auto* profile = Profile::FromWebUI(web_ui());
    const bool allowed = profile && (!profile->IsOffTheRecord() ||
        (profile->IsIncognitoProfile() && profile->IsPrimaryOTRProfile()));
    return allowed && frame &&
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
    const uint64_t revision = ++SunriseSettingsRevision();
    if (Trusted() && IsJavascriptAllowed())
      web_ui()->CallJavascriptFunctionUnsafe("blancSunriseSettingsChanged",
                                            base::Value(base::NumberToString(revision)));
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
    state.Set("revision", base::NumberToString(SunriseSettingsRevision()));
    Reply(id, true, base::Value(std::move(state)));
  }
  void AfterCommit(std::string id, bool desired) {
    const uint64_t revision = SunriseSettingsRevision();
    base::FilePath user_data;
    if (!base::PathService::Get(chrome::DIR_USER_DATA, &user_data)) {
      AfterRead(std::move(id), desired, revision, std::nullopt);
      return;
    }
    base::ThreadPool::PostTaskAndReplyWithResult(FROM_HERE,
        {base::MayBlock(), base::TaskPriority::USER_VISIBLE},
        base::BindOnce(&ReadSunriseOnDisk, user_data.Append(chrome::kLocalStateFilename)),
        base::BindOnce(&SunriseSettingsHandler::AfterRead,
            weak_factory_.GetWeakPtr(), std::move(id), desired, revision));
  }
  void AfterRead(std::string id, bool desired, uint64_t revision,
                 std::optional<bool> on_disk) {
    auto* prefs = g_browser_process ? g_browser_process->local_state() : nullptr;
    const auto* pref = prefs ? prefs->FindPreference(kLaunchSunrisePref) : nullptr;
    if (!pref) { Reply(id, false, base::Value("Appearance setting unavailable")); return; }
    const bool effective = prefs->GetBoolean(kLaunchSunrisePref);
    base::DictValue state;
    state.Set("enabled", effective);
    state.Set("modifiable", pref->IsUserModifiable());
    state.Set("revision", base::NumberToString(SunriseSettingsRevision()));
    state.Set("persisted", pref->IsUserModifiable() && effective == desired &&
        revision == SunriseSettingsRevision() && on_disk && *on_disk == desired);
    Reply(id, true, base::Value(std::move(state)));
  }
  PrefChangeRegistrar observer_;
  base::WeakPtrFactory<SunriseSettingsHandler> weak_factory_{this};
};

SunriseSettingsHandler::SunriseSettingsHandler() = default;
SunriseSettingsHandler::~SunriseSettingsHandler() = default;
void SunriseSettingsHandler::RegisterMessages() {
  web_ui()->RegisterMessageCallback("blancSunriseSettings",
      base::BindRepeating(&SunriseSettingsHandler::Handle, base::Unretained(this)));
}
void SunriseSettingsHandler::OnJavascriptDisallowed() {
  weak_factory_.InvalidateWeakPtrs();
  observer_.Reset();
}
