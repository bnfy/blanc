// Telemetry (F21): shipping's telemetry.js and day-one-signals.js. Included
// inside blanc_prototype_ui.cc's anonymous namespace, after first_run.inc.
// Consent comes first, the events are fixed, and only a build that reports a
// Blanc release version sends anything. The preview reports none
// (BlancReleaseVersion), so it mints no install id and sends nothing (owner,
// 2026-11-04). mahjong_play joins these when the Mahjong page does.

// install.json's fields: device-wide, never in a profile, never synced.
constexpr char kTelemetryInstallPref[] = "blanc.telemetry.install";
constexpr char kTelemetryHost[] = "https://blanc-ping.bnfy-441.workers.dev";
constexpr double kDayOneWindowMs = 24 * 60 * 60 * 1000;
constexpr base::TimeDelta kDayOneStartDelay = base::Minutes(2);
constexpr base::TimeDelta kDayOneDefaultInterval = base::Minutes(15);
constexpr int kDayOneBrowsedPages = 3;

// One app session: each event at most once, and one id for all of them.
struct TelemetrySession {
  std::set<std::string> sent;
  int session_id = 0;
  int page_loads = 0;
  bool starting = false;
  bool active = false;
  base::RepeatingTimer default_check;
};
TelemetrySession& Telemetry() {
  static base::NoDestructor<TelemetrySession> session;
  return *session;
}

std::string TelemetryTestHost() {
  const auto* command_line = base::CommandLine::ForCurrentProcess();
  return command_line->HasSwitch("blanc-test")
      ? command_line->GetSwitchValueASCII("blanc-test-telemetry-host") : std::string();
}
// settings.js and telemetry.js's gates together: a release build, first run
// finished, and the person's choice left on.
bool TelemetryAllowed() {
  // A test can only send to an explicitly selected loopback collector.
  // Missing or malformed overrides must never fall back to production, even
  // if a future build supplies a release version.
  if (base::CommandLine::ForCurrentProcess()->HasSwitch("blanc-test")) {
    const GURL host(TelemetryTestHost());
    if (!host.is_valid() || !host.SchemeIs("http") ||
        (host.host() != "127.0.0.1" && host.host() != "[::1]") ||
        host.has_username() || host.has_password() || host.has_query() ||
        host.has_ref() || host.path() != "/") return false;
  }
  return !BlancReleaseVersion().empty() && !FirstRunPending() &&
         g_privacy_writes_pending == 0 && !g_privacy_commit_failed &&
         g_browser_process->local_state()->GetBoolean(kUsagePingPref);
}

// Minted only on the way to a send, so a declined choice leaves no id. Callers
// check TelemetryAllowed first.
base::DictValue TelemetryInstall() {
  PrefService* local = g_browser_process->local_state();
  const base::DictValue& saved = local->GetDict(kTelemetryInstallPref);
  if (saved.FindString("id")) return saved.Clone();
  base::DictValue fresh = base::DictValue()
      .Set("id", base::Uuid::GenerateRandomV4().AsLowercaseString())
      .Set("createdAt", base::Time::Now().InMillisecondsFSinceUnixEpoch())
      .Set("day1Default", false).Set("day1Browsed", false);
  local->SetDict(kTelemetryInstallPref, fresh.Clone());
  local->CommitPendingWrite();
  return fresh;
}

// telemetry.js's coarseOsVersion: only the major leaves the device, and
// Windows 10 and 11 differ only by build number.
std::string TelemetryOsVersion() {
  int32_t major = 0, minor = 0, build = 0;
  base::SysInfo::OperatingSystemVersionNumbers(&major, &minor, &build);
#if BUILDFLAG(IS_WIN)
  if (major == 10) return build >= 22000 ? "11" : "10";
#endif
  return base::NumberToString(major);
}
base::DictValue TelemetryPayload() {
  TelemetrySession& session = Telemetry();
  if (!session.session_id) session.session_id = base::RandIntInclusive(1, 0x7fffffff);
  const base::DictValue install = TelemetryInstall();
  return base::DictValue()
      .Set("installId", *install.FindString("id"))
      .Set("sessionId", session.session_id)
      .Set("version", BlancReleaseVersion())
#if BUILDFLAG(IS_MAC)
      .Set("platform", "darwin")
#elif BUILDFLAG(IS_WIN)
      .Set("platform", "win32")
#else
      .Set("platform", "linux")
#endif
#if defined(ARCH_CPU_ARM64)
      .Set("arch", "arm64")
#else
      .Set("arch", "x64")
#endif
      .Set("osVersion", TelemetryOsVersion());
}

// Fire and forget: a failed or blocked event changes nothing for the person.
bool TelemetryPost(const std::string& key, const char* path, base::DictValue extra) {
  if (!TelemetryAllowed() || !Telemetry().sent.insert(key).second) return false;
  base::DictValue payload = TelemetryPayload();
  payload.Merge(std::move(extra));
  const auto body = base::WriteJson(payload);
  if (!body) return false;
  const std::string test_host = TelemetryTestHost();
  auto request = std::make_unique<network::ResourceRequest>();
  request->url = GURL((test_host.empty() ? std::string(kTelemetryHost) : test_host) + path);
  request->method = "POST";
  request->credentials_mode = network::mojom::CredentialsMode::kOmit;
  request->redirect_mode = network::mojom::RedirectMode::kError;
  auto loader = network::SimpleURLLoader::Create(std::move(request),
      net::DefineNetworkTrafficAnnotation("blanc_usage_ping", R"(
        semantics { sender: "Blanc usage measurement"
          description: "Counts active installs and fixed product events."
          trigger: "App launch and fixed events, after the first-run choice."
          data: "Random install and session ids, version, platform, architecture, OS major, a fixed event name."
          destination: OTHER destination_other: "Bananify's blanc-ping collector." }
        policy { cookies_allowed: NO setting: "Settings > Privacy and security > Help improve Blanc."
          policy_exception_justification: "Blanc's own measurement, off in the preview." })"));
  loader->AttachStringForUpload(*body, "application/json");
  loader->SetTimeoutDuration(base::Seconds(10));
  auto* pending = loader.get();
  pending->DownloadHeadersOnly(g_browser_process->shared_url_loader_factory().get(),
      base::BindOnce([](std::unique_ptr<network::SimpleURLLoader>,
                        scoped_refptr<net::HttpResponseHeaders>) {}, std::move(loader)));
  return true;
}

// First-day signals. The sent flag is saved before the event leaves, so a
// crash or restart can never send it twice.
bool WithinDayOne(const base::DictValue& install) {
  const auto created = install.FindDouble("createdAt");
  const double now = base::Time::Now().InMillisecondsFSinceUnixEpoch();
  return created && now >= *created && now - *created < kDayOneWindowMs;
}
bool TelemetryEmitDayOne(const std::string& signal, const char* field) {
  if (!TelemetryAllowed()) return false;
  base::DictValue install = TelemetryInstall();
  if (install.FindBool(field).value_or(false) || !WithinDayOne(install)) return false;
  install.Set(field, true);
  PrefService* local = g_browser_process->local_state();
  local->SetDict(kTelemetryInstallPref, std::move(install));
  local->CommitPendingWrite();
  return TelemetryPost("day1:" + signal, "/event",
                       base::DictValue().Set("event", "day1_" + signal));
}
void TelemetryNoteDefault(shell_integration::DefaultWebClientState state) {
  if (Telemetry().active && state == shell_integration::IS_DEFAULT &&
      TelemetryEmitDayOne("default", "day1Default")) {
    Telemetry().default_check.Stop();
  }
}
void TelemetryCheckDefault() {
  if (!TelemetryAllowed()) return;
  const base::DictValue install = TelemetryInstall();
  if (install.FindBool("day1Default").value_or(false) || !WithinDayOne(install)) {
    Telemetry().default_check.Stop();
    return;
  }
  base::MakeRefCounted<shell_integration::DefaultBrowserWorker>()->StartCheckIsDefault(
      base::BindOnce(&TelemetryNoteDefault));
}
void TelemetryActivateDayOne() {
  TelemetrySession& session = Telemetry();
  session.active = true;
  if (session.page_loads >= kDayOneBrowsedPages) TelemetryEmitDayOne("browsed", "day1Browsed");
  TelemetryCheckDefault();
  session.default_check.Start(FROM_HERE, kDayOneDefaultInterval,
                              base::BindRepeating(&TelemetryCheckDefault));
}
// A history visit feeds the browsing signal: an ordinary http(s) page that
// loaded, never a private one. The count holds no addresses.
void TelemetryNotePage(content::WebContents* tab) {
  TelemetrySession& session = Telemetry();
  if (!tab || session.page_loads >= kDayOneBrowsedPages ||
      tab->GetBrowserContext()->IsOffTheRecord()) return;
  auto* entry = tab->GetController().GetLastCommittedEntry();
  if (!entry || !entry->GetURL().SchemeIsHTTPOrHTTPS() || entry->GetHttpStatusCode() >= 400) return;
  if (++session.page_loads == kDayOneBrowsedPages && session.active)
    TelemetryEmitDayOne("browsed", "day1Browsed");
}

// At launch and again when the first-run choice lands; once per app session.
void TelemetryLaunch() {
  if (!TelemetryAllowed()) return;
  TelemetryPost("app_launch", "/ping", base::DictValue());
  TelemetrySession& session = Telemetry();
  if (session.starting) return;
  session.starting = true;
  base::SingleThreadTaskRunner::GetCurrentDefault()->PostDelayedTask(
      FROM_HERE, base::BindOnce(&TelemetryActivateDayOne),
      TelemetryTestHost().empty() ? kDayOneStartDelay : base::Seconds(1));
}
void TelemetryLayoutUsed(const std::string& layout) {
  if (layout != "ledger" && layout != "billboard" && layout != "shelf" && layout != "tally") return;
  TelemetryPost("newtab_layout:" + layout, "/event",
                base::DictValue().Set("event", "newtab_layout").Set("layout", layout));
}
// Settings' Reset install ID: the next send starts a brand-new install.
bool TelemetryResetInstall() {
  PrefService* local = g_browser_process->local_state();
  local->ClearPref(kTelemetryInstallPref);
  local->CommitPendingWrite();
  return true;
}

// Settings can change consent after onboarding too. Keep the same durable
// gate, without marking first run complete or changing the other choice.
void PersistUsagePing(bool enabled, base::OnceCallback<void(bool)> done) {
  ++g_privacy_writes_pending;
  auto* local = g_browser_process->local_state();
  local->SetBoolean(kUsagePingPref, enabled);
  local->CommitPendingWrite(base::BindOnce(
      [](base::FilePath file, bool enabled, base::OnceCallback<void(bool)> done) {
        base::ThreadPool::PostTaskAndReplyWithResult(
            FROM_HERE, {base::MayBlock(), base::TaskPriority::USER_VISIBLE},
            base::BindOnce([](base::FilePath file, bool enabled) {
              std::string bytes;
              if (!base::ReadFileToString(file, &bytes)) return false;
              const auto saved = base::JSONReader::ReadDict(bytes, base::JSON_PARSE_RFC);
              return saved && saved->FindBoolByDottedPath(kUsagePingPref) == enabled;
            }, file, enabled),
            base::BindOnce([](base::OnceCallback<void(bool)> done, bool saved) {
              --g_privacy_writes_pending;
              g_privacy_commit_failed = !saved;
              std::move(done).Run(saved);
            }, std::move(done)));
      }, g_browser_process->profile_manager()->user_data_dir().AppendASCII("Local State"),
      enabled, std::move(done)));
}
