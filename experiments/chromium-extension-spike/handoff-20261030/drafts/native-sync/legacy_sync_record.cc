#include "legacy_sync_record.h"
#include "base/base64.h"
#include "base/json/json_reader.h"
#include "base/strings/string_util.h"
#include "base/strings/utf_string_conversions.h"
#include "base/uuid.h"
#include <algorithm>
#include <cmath>
namespace blanc::sync {
LegacySyncParsed ParseLegacySyncRecord(std::string_view bytes) {
  if (bytes.size() > 65536) return {LegacySyncStatus::kTooLarge, {}};
  const auto json = base::JSONReader::ReadDict(bytes, base::JSON_PARSE_RFC, 8);
  if (!json) return {};
  // A pre-hardening raw key needs a dedicated source-key protection/import
  // transaction. Never return it, erase it, or silently treat this as fresh.
  if (const auto* key = json->Find("key")) {
    if (!key->is_string()) return {};
    if (!key->GetString().empty()) return {LegacySyncStatus::kNeedsLegacyKeyProtection, {}};
  }
  LegacySyncRecord r;
  auto boolean = [&](const char* name, bool& out) {
    const auto* value = json->Find(name);
    if (!value) return true;
    if (!value->is_bool()) return false;
    out = value->GetBool(); return true;
  };
  auto string = [&](const char* name, std::string& out) {
    const auto* value = json->Find(name);
    if (!value) return true;
    if (!value->is_string() || value->GetString().size() > 8192) return false;
    out = value->GetString(); return base::IsStringUTF8AllowingNoncharacters(out);
  };
  if (!boolean("enabled", r.enabled) || !boolean("syncTabs", r.tabs) ||
      !boolean("syncSpaces", r.spaces) || !boolean("erasurePending", r.erasure_pending) ||
      !boolean("recoveryPromptDismissed", r.recovery_dismissed) ||
      !string("handle", r.handle) || !string("accountId", r.account) ||
      !string("protectedKey", r.protected_key) || !string("deviceId", r.device_id) ||
      !string("origin", r.origin)) return {};
  if (const auto* time = json->Find("lastSyncedAt")) {
    if (!time->is_double() && !time->is_int()) return {};
    r.last_synced_at = time->GetDouble();
    if (!std::isfinite(r.last_synced_at) || r.last_synced_at < 0) return {};
  }
  if (const auto* error = json->Find("lastError"); error && !error->is_none()) {
    if (!error->is_string() || error->GetString().size() > 1024) return {};
    static constexpr std::string_view allowed[] = {"", "offline", "rate-limited", "conflict",
        "server", "server-error", "erasure-pending", "account-quota", "bad-passphrase", "service-unavailable"};
    const auto& code = error->GetString();
    if (std::find(std::begin(allowed), std::end(allowed), code) != std::end(allowed)) r.last_error = code;
    else r.status_mapping_required = true;  // Never copy arbitrary diagnostic text into native UI/state.
  }
  if (!r.device_id.empty()) {
    const auto id = base::Uuid::ParseLowercase(r.device_id);
    if (!id.is_valid() || r.device_id[14] != '4' ||
        !std::string_view("89ab").contains(r.device_id[19])) return {};
  }
  if (r.origin != "" && r.origin != "generated") return {};
  if (!r.account.empty() && (r.account.size() != 64 ||
      !std::all_of(r.account.begin(), r.account.end(), [](char c) {
        return (c >= '0' && c <= '9') || (c >= 'a' && c <= 'f');
      }))) return {};
  if (!r.protected_key.empty()) {
    const auto blob = base::Base64Decode(r.protected_key);
    if (!blob || blob->size() < 3 || blob->size() > 4096 ||
        base::Base64Encode(*blob) != r.protected_key) return {};
  }
  if (r.enabled && (base::UTF8ToUTF16(r.handle).size() < 2 || r.account.empty() ||
      r.protected_key.empty())) return {};
  // Do not discard credential remnants in a disabled source. Import policy
  // must decide their disposition explicitly after the source is backed up.
  return {LegacySyncStatus::kParsed, std::move(r)};
}
}
