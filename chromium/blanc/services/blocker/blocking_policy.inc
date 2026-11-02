// Included within namespace blanc, before the engine implementation.
// Explicit preferences are shared with private windows, as in shipping Blanc;
// request URLs and per-tab counts are never persisted here.
namespace {
constexpr char kBlockingEnabled[] = "blanc.blocking.enabled";
constexpr char kBlockingExceptions[] = "blanc.blocking.exceptions";
PrefService* BlockingPrefs(content::BrowserContext* context) {
  if (!context) return nullptr;
  auto* profile = Profile::FromBrowserContext(context);
  if (!profile) return nullptr;
  auto* prefs = profile->GetOriginalProfile()->GetPrefs();
  if (!prefs || !prefs->FindPreference(kBlockingEnabled) ||
      !prefs->FindPreference(kBlockingExceptions)) return nullptr;
  return prefs;
}
}
std::string BlockingHostname(const GURL& url) {
  if (!url.SchemeIsHTTPOrHTTPS()) return {};
  std::string host(url.host());
  if (base::StartsWith(host, "www.")) host.erase(0, 4);
  return host;
}
bool BlockingEnabled(content::BrowserContext* context) {
  auto* prefs = BlockingPrefs(context);
  return !prefs || prefs->GetBoolean(kBlockingEnabled);
}
bool BlockingSiteExcepted(content::BrowserContext* context, const GURL& url) {
  auto* prefs = BlockingPrefs(context);
  const std::string host = BlockingHostname(url);
  if (!prefs || host.empty()) return false;
  for (const auto& entry : prefs->GetList(kBlockingExceptions)) {
    if (entry.is_string() && entry.GetString() == host) return true;
  }
  return false;
}
bool ShouldFilter(content::BrowserContext* context, const GURL& top_url) {
  return BlockingEnabled(context) && !BlockingSiteExcepted(context, top_url);
}
bool SetBlockingEnabled(content::BrowserContext* context, bool enabled) {
  auto* prefs = BlockingPrefs(context);
  if (!prefs) return false;
  prefs->SetBoolean(kBlockingEnabled, enabled);
  return true;
}
bool SetBlockingSiteException(content::BrowserContext* context,
                              const GURL& url, bool allow) {
  auto* prefs = BlockingPrefs(context);
  const std::string host = BlockingHostname(url);
  if (!prefs || host.empty()) return false;
  base::ListValue list;
  for (const auto& entry : prefs->GetList(kBlockingExceptions)) {
    if (entry.is_string() && entry.GetString() != host) list.Append(entry.Clone());
  }
  if (allow) list.Append(host);
  prefs->SetList(kBlockingExceptions, std::move(list));
  return true;
}
