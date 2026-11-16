// Copyright 2026 Bananify Creative. MIT; see the Blanc repository LICENSE.
#ifndef BLANC_BROWSER_UI_BROWSER_API_BANG_ICON_POLICY_H_
#define BLANC_BROWSER_UI_BROWSER_API_BANG_ICON_POLICY_H_

#include <map>
#include <optional>
#include <set>
#include <string>
#include <string_view>
#include <vector>

namespace blanc::browser_api::bang_icons {

// Shipping v1.45.1's rules for asking Blanc's icon server for a bang site's
// icon and for the bounded on-device store (src/main/bang-icons-policy.js), in
// plain C++ so tools/bang-icon-policy.test.mjs can compile it and compare it
// with shipping's own code. Times are milliseconds since the epoch.
inline constexpr std::string_view kServerOrigin = "https://blanc.day";
inline constexpr double kFetchTimeoutMs = 8000;
inline constexpr size_t kMaxInFlight = 4;
inline constexpr double kRetryAfterMs = 30000;
inline constexpr int kMaxRetriesPerRun = 2;
inline constexpr double kRefreshAfterMs = 30.0 * 24 * 60 * 60 * 1000;
inline constexpr size_t kStoreCap = 300;
// main.js MAX_BANG_ICON_HOSTS: the rows one request may name.
inline constexpr size_t kMaxHosts = 40;

std::string IconUrl(std::string_view host);

struct Record {
  std::string host;
  std::string icon;
  std::optional<double> fetched_at;
  double used_at = 0;
};
enum class Stored { kMissing, kStale, kFresh };
Stored StoredState(const Record* record, double now);

enum class Outcome { kOk, kNotFound, kFailed };
// What this app run has learned per host: in flight, a definite 404, or
// failures with the time of the last attempt. Never persisted.
class RunState {
 public:
  RunState();
  ~RunState();
  bool CanAsk(const std::string& host, double now) const;
  void Started(const std::string& host);
  void Finished(const std::string& host, Outcome outcome, double now);

 private:
  struct Failure {
    int count = 0;
    double at = 0;
  };
  std::set<std::string> in_flight_;
  std::set<std::string> not_found_;
  std::map<std::string, Failure> failures_;
};

// Whether the server may be asked for `host` now: bangs on, setup saved, not
// from a private tab, a catalog site that isn't one of the person's own bang
// sites, not kept fresh, and allowed by this run's history.
bool MayFetch(const std::string& host, bool enabled, bool setup_complete, bool private_active,
              const std::set<std::string>& catalog_hosts, const std::set<std::string>& custom_hosts,
              const Record* record, const RunState& run, double now);

// Records are ordered most recently used first.
std::vector<Record> PutRecord(std::vector<Record> records, const std::string& host,
                              const std::string& icon, double now);
std::vector<Record> DropRecord(std::vector<Record> records, const std::string& host);
std::vector<Record> TouchRecords(std::vector<Record> records, const std::vector<std::string>& hosts,
                                 double now);

// The JSON array literal inside shipping's generated bangs-catalog.js, so the
// browser reads the same catalog the Island draws from; nothing if the file's
// shape changed.
std::optional<std::string_view> CatalogArray(std::string_view catalog_js);

}  // namespace blanc::browser_api::bang_icons

#endif  // BLANC_BROWSER_UI_BROWSER_API_BANG_ICON_POLICY_H_
