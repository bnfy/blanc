// Copyright 2026 Bananify Creative. MIT; see the Blanc repository LICENSE.
// Standard library only: tools/bang-icon-policy.test.mjs compiles this file.
#include "blanc/browser/ui/browser_api/bang_icon_policy.h"

#include <algorithm>
#include <iterator>
#include <utility>

namespace blanc::browser_api::bang_icons {

std::string IconUrl(std::string_view host) {
  return std::string(kServerOrigin) + "/bang-icons/" + std::string(host);
}

Stored StoredState(const Record* record, double now) {
  if (!record) return Stored::kMissing;
  if (!record->fetched_at) return Stored::kStale;
  return now - *record->fetched_at > kRefreshAfterMs ? Stored::kStale : Stored::kFresh;
}

RunState::RunState() = default;
RunState::~RunState() = default;

bool RunState::CanAsk(const std::string& host, double now) const {
  if (in_flight_.contains(host) || not_found_.contains(host)) return false;
  auto failed = failures_.find(host);
  if (failed == failures_.end()) return true;
  return failed->second.count <= kMaxRetriesPerRun && now - failed->second.at >= kRetryAfterMs;
}

void RunState::Started(const std::string& host) { in_flight_.insert(host); }

void RunState::Finished(const std::string& host, Outcome outcome, double now) {
  in_flight_.erase(host);
  if (outcome == Outcome::kNotFound) {
    not_found_.insert(host);
    failures_.erase(host);
  } else if (outcome == Outcome::kFailed) {
    Failure& failure = failures_[host];
    failure.count += 1;
    failure.at = now;
  } else {
    failures_.erase(host);
  }
}

bool MayFetch(const std::string& host, bool enabled, bool setup_complete, bool private_active,
              const std::set<std::string>& catalog_hosts, const std::set<std::string>& custom_hosts,
              const Record* record, const RunState& run, double now) {
  if (!enabled || !setup_complete || private_active) return false;
  if (!catalog_hosts.contains(host) || custom_hosts.contains(host)) return false;
  if (StoredState(record, now) == Stored::kFresh) return false;
  return run.CanAsk(host, now);
}

std::vector<Record> PutRecord(std::vector<Record> records, const std::string& host,
                              const std::string& icon, double now) {
  std::erase_if(records, [&](const Record& record) { return record.host == host; });
  records.insert(records.begin(), Record{host, icon, now, now});
  if (records.size() > kStoreCap) records.resize(kStoreCap);
  return records;
}

std::vector<Record> DropRecord(std::vector<Record> records, const std::string& host) {
  std::erase_if(records, [&](const Record& record) { return record.host == host; });
  return records;
}

std::vector<Record> TouchRecords(std::vector<Record> records, const std::vector<std::string>& hosts,
                                 double now) {
  const std::set<std::string> used(hosts.begin(), hosts.end());
  std::vector<Record> front;
  std::vector<Record> rest;
  for (auto& record : records) {
    if (used.contains(record.host)) {
      record.used_at = now;
      front.push_back(std::move(record));
    } else {
      rest.push_back(std::move(record));
    }
  }
  front.insert(front.end(), std::make_move_iterator(rest.begin()), std::make_move_iterator(rest.end()));
  return front;
}

std::optional<std::string_view> CatalogArray(std::string_view catalog_js) {
  constexpr std::string_view kStart = "const catalog = [";
  constexpr std::string_view kEnd = "\n  ];\n";
  const size_t start = catalog_js.find(kStart);
  if (start == std::string_view::npos) return std::nullopt;
  const size_t open = start + kStart.size() - 1;
  const size_t close = catalog_js.find(kEnd, open);
  if (close == std::string_view::npos) return std::nullopt;
  return catalog_js.substr(open, close + kEnd.find(']') + 1 - open);
}

}  // namespace blanc::browser_api::bang_icons
