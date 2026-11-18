// N16: the trust receipt and Diagnostics in Settings → About, as shipping's
// trust-receipt.js and diagnostics.js. Facts are checked on this device and
// opening the section makes no network request.
//
// Crash history is Blanc's own ledger: at most 50 events, each a time, a
// process type and a reason, in Local State. It never holds an address, a
// title or anything of a page. Chromium also keeps its crash dump files in
// the profile's Crashpad folder; a dump is a slice of memory and can hold
// page addresses. Blanc builds have no upload address, so nothing is sent
// (owner, 2026-11-16: keep the dumps for debugging, say so, and let Clear
// crash history delete them). Settings shows their count on Chromium's own
// Crashes row, which opens chrome://crashes.
constexpr char kCrashLedgerPref[] = "blanc.crash_ledger";
constexpr size_t kCrashLedgerLimit = 50;
// The identity shipping's release builds are signed with (trust-receipt.js).
constexpr char kExpectedTeamId[] = "XYGUCY4498";
constexpr char kExpectedPublisher[] = "Developer ID Application: Anthony Loria (XYGUCY4498)";

const char* CrashReason(base::TerminationStatus status) {
  switch (status) {
    case base::TERMINATION_STATUS_ABNORMAL_TERMINATION: return "abnormal-exit";
    case base::TERMINATION_STATUS_PROCESS_CRASHED: return "crashed";
    case base::TERMINATION_STATUS_OOM: return "oom";
    case base::TERMINATION_STATUS_LAUNCH_FAILED: return "launch-failed";
    default: return nullptr;  // A normal exit, or a process Blanc or the person ended.
  }
}

class CrashLedger final : public content::RenderProcessHostCreationObserver,
                          public content::RenderProcessHostObserver,
                          public content::BrowserChildProcessObserver {
 public:
  static CrashLedger* Get();
  CrashLedger();
  ~CrashLedger() override;
  static void Record(const std::string& process, const std::string& reason);
  static base::ListValue Events();
  static void Clear();

 private:
  void OnRenderProcessHostCreated(content::RenderProcessHost* host) override;
  void RenderProcessExited(content::RenderProcessHost* host,
                           const content::ChildProcessTerminationInfo& info) override;
  void RenderProcessHostDestroyed(content::RenderProcessHost* host) override;
  void BrowserChildProcessCrashed(const content::ChildProcessData& data,
                                  const content::ChildProcessTerminationInfo& info) override;
  base::ScopedMultiSourceObservation<content::RenderProcessHost, content::RenderProcessHostObserver>
      observed_{this};
};

CrashLedger* CrashLedger::Get() {
  static base::NoDestructor<CrashLedger> ledger;
  return ledger.get();
}
CrashLedger::CrashLedger() {
  content::BrowserChildProcessObserver::Add(this);
  for (auto it = content::RenderProcessHost::AllHostsIterator(); !it.IsAtEnd(); it.Advance())
    observed_.AddObservation(it.GetCurrentValue());
}
CrashLedger::~CrashLedger() = default;
void CrashLedger::Record(const std::string& process, const std::string& reason) {
  auto* state = g_browser_process ? g_browser_process->local_state() : nullptr;
  if (!state || !state->FindPreference(kCrashLedgerPref)) return;
  ScopedListPrefUpdate events(state, kCrashLedgerPref);
  events->Append(base::DictValue()
      .Set("at", base::Time::Now().InMillisecondsFSinceUnixEpoch())
      .Set("process", process).Set("reason", reason));
  while (events->size() > kCrashLedgerLimit) events->erase(events->begin());
}
base::ListValue CrashLedger::Events() {
  auto* state = g_browser_process ? g_browser_process->local_state() : nullptr;
  return state && state->FindPreference(kCrashLedgerPref) ? state->GetList(kCrashLedgerPref).Clone()
                                                          : base::ListValue();
}
void CrashLedger::Clear() {
  if (auto* state = g_browser_process ? g_browser_process->local_state() : nullptr)
    state->ClearPref(kCrashLedgerPref);
}
void CrashLedger::OnRenderProcessHostCreated(content::RenderProcessHost* host) {
  if (!observed_.IsObservingSource(host)) observed_.AddObservation(host);
}
void CrashLedger::RenderProcessExited(content::RenderProcessHost* host,
                                      const content::ChildProcessTerminationInfo& info) {
  if (const char* reason = CrashReason(info.status)) Record("renderer", reason);
}
void CrashLedger::RenderProcessHostDestroyed(content::RenderProcessHost* host) {
  observed_.RemoveObservation(host);
}
void CrashLedger::BrowserChildProcessCrashed(const content::ChildProcessData& data,
                                             const content::ChildProcessTerminationInfo& info) {
  const char* reason = CrashReason(info.status);
  Record(content::GetProcessTypeNameInEnglish(data.process_type), reason ? reason : "crashed");
}

// What `codesign -dv --verbose=2` says of this app, off the UI thread.
base::DictValue InspectSignature() {
  base::DictValue signature;
  signature.Set("expected", kExpectedPublisher);
#if BUILDFLAG(IS_MAC)
  std::string out;
  const auto bundle = base::apple::OuterBundlePath();
  if (!base::GetAppOutputAndError({"/usr/bin/codesign", "-dv", "--verbose=2", bundle.value()}, &out)) {
    signature.Set("status", "unavailable");
    return signature;
  }
  std::string team, publisher;
  bool adhoc = false;
  for (const auto& line : base::SplitStringPiece(out, "\n", base::TRIM_WHITESPACE, base::SPLIT_WANT_NONEMPTY)) {
    if (base::StartsWith(line, "TeamIdentifier=")) team = std::string(line.substr(15));
    else if (base::StartsWith(line, "Authority=") && publisher.empty()) publisher = std::string(line.substr(10));
    else if (line == "Signature=adhoc") adhoc = true;
  }
  if (adhoc || team.empty() || team == "not set") {
    signature.Set("status", "development");
    return signature;
  }
  signature.Set("observed", publisher);
  signature.Set("status", team == kExpectedTeamId &&
      base::StartsWith(publisher, "Developer ID Application:") ? "verified" : "mismatch");
#else
  signature.Set("status", "unavailable");
#endif
  return signature;
}

// Chromium's crash dump files kept in this profile's Crashpad folder.
int CrashDumpCount() {
  std::vector<crash_reporter::Report> reports;
  crash_reporter::GetReports(&reports);
  return static_cast<int>(reports.size());
}

// The facts that need no waiting; the signature and the dump count join them.
base::DictValue TrustReceiptFacts(Profile* profile) {
  CrashLedger::Get();
  std::string version(version_info::GetVersionNumber()), build;
#if BUILDFLAG(IS_MAC)
  // The release's own version and build number (Blanc Beta's 2.0.0-beta.N).
  const auto bundle = blanc::BundleVersion();
  if (!bundle.first.empty()) version = bundle.first;
  build = bundle.second;
#endif
  auto dns = SystemNetworkContextManager::GetStubResolverConfigReader()->GetSecureDnsConfiguration(false);
  return base::DictValue()
      .Set("app", base::DictValue()
          .Set("version", version)
          .Set("build", build)
          .Set("chromium", std::string(version_info::GetVersionNumber()))
          .Set("platform", "macOS")
          .Set("architecture", base::SysInfo::OperatingSystemArchitecture())
          .Set("packaged", IsBetaBuild()))
      .Set("blocker", base::DictValue().Set("combinedSha256", kBlancBlockerBundleSha256))
      .Set("choices", base::DictValue()
          .Set("usageMeasurement", g_browser_process->local_state()->GetBoolean(kUsagePingPref))
          .Set("searchSuggestions", profile->GetOriginalProfile()->GetPrefs()->GetBoolean(prefs::kSearchSuggestEnabled))
          .Set("secureDns", dns.mode() == net::SecureDnsMode::kOff ? "off"
              : dns.doh_servers().ToString().empty() ? "auto" : "custom")
          .Set("crashLedger", base::DictValue().Set("eventLimit", static_cast<int>(kCrashLedgerLimit))
              .Set("eventCount", static_cast<int>(CrashLedger::Events().size()))));
}

// The exported report, as shipping's: what build this is and the ledger.
// Never a dump, an address or anything of a page.
std::string DiagnosticsReport(Profile* profile) {
  auto facts = TrustReceiptFacts(profile);
  std::string json;
  base::JSONWriter::WriteWithOptions(base::DictValue()
      .Set("generatedAt", base::Time::Now().InMillisecondsFSinceUnixEpoch())
      .Set("app", facts.Find("app")->Clone())
      .Set("crashEvents", CrashLedger::Events()),
      base::JSONWriter::OPTIONS_PRETTY_PRINT, &json);
  return json;
}
