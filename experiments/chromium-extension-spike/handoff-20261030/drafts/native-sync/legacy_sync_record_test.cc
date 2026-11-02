#include "legacy_sync_record.h"
#include "base/at_exit.h"
#include "base/base64.h"
#include "base/check.h"
#include "base/json/json_writer.h"
#include "base/values.h"
#include <iostream>
using namespace blanc::sync;
int main() {
  base::AtExitManager at_exit;
  base::DictValue source;
  source.Set("enabled", true); source.Set("handle", "Personal Account");
  source.Set("accountId", std::string(64, 'a'));
  source.Set("protectedKey", base::Base64Encode("v10SYNTHETIC-OPAQUE-RECORD"));
  source.Set("deviceId", "550e8400-e29b-41d4-a716-446655440000");
  source.Set("syncTabs", true); source.Set("syncSpaces", true);
  source.Set("erasurePending", true); source.Set("origin", "generated");
  source.Set("recoveryPromptDismissed", true); source.Set("lastSyncedAt", 123.5);
  const auto parse = [](const base::DictValue& d) { return ParseLegacySyncRecord(*base::WriteJson(d)); };
  auto r = parse(source); CHECK(r.status == LegacySyncStatus::kParsed && r.record);
  CHECK(r.record->enabled && r.record->tabs && r.record->spaces && r.record->erasure_pending);
  CHECK(r.record->recovery_dismissed); CHECK_EQ(r.record->last_synced_at, 123.5);
  CHECK_EQ(r.record->device_id, "550e8400-e29b-41d4-a716-446655440000");
  for (const char* name : {"enabled", "syncTabs", "syncSpaces", "erasurePending", "recoveryPromptDismissed"}) {
    auto bad = source.Clone(); bad.Set(name, "true"); CHECK(!parse(bad).record);
  }
  for (const char* name : {"handle", "accountId", "protectedKey", "deviceId", "origin"}) {
    auto bad = source.Clone(); bad.Set(name, 42); CHECK(!parse(bad).record);
  }
  for (const char* name : {"accountId", "protectedKey", "handle"}) {
    auto bad = source.Clone(); bad.Set(name, ""); CHECK(!parse(bad).record);
  }
  auto raw = source.Clone(); raw.Set("key", "SYNTHETIC-LEGACY-KEY");
  auto legacy = parse(raw); CHECK(legacy.status == LegacySyncStatus::kNeedsLegacyKeyProtection);
  CHECK(!legacy.record);
  raw.Set("key", 1); CHECK(!parse(raw).record);
  raw.Set("key", ""); CHECK(parse(raw).record);
  auto status_source = source.Clone(); status_source.Set("lastError", "offline");
  CHECK_EQ(parse(status_source).record->last_error,"offline");
  status_source.Set("lastError", "unknown-source-diagnostic");
  CHECK(parse(status_source).record->status_mapping_required);
  CHECK(parse(status_source).record->last_error.empty());
  status_source.Set("lastError", 42); CHECK(!parse(status_source).record);
  auto disabled = source.Clone(); disabled.Set("enabled", false);
  CHECK(parse(disabled).record->protected_key == r.record->protected_key);
  CHECK(ParseLegacySyncRecord(std::string(65537, ' ')).status == LegacySyncStatus::kTooLarge);
  CHECK(!ParseLegacySyncRecord("[]").record); CHECK(!ParseLegacySyncRecord("{").record);
  auto bad = source.Clone(); bad.Set("lastSyncedAt", -1); CHECK(!parse(bad).record);
  bad = source.Clone(); bad.Set("deviceId", "550e8400-e29b-11d4-a716-446655440000"); CHECK(!parse(bad).record);
  CHECK(ParseLegacySyncRecord("{}").record && !ParseLegacySyncRecord("{}").record->enabled);
  std::cout << "legacy input metadata preservation, opaque credential retention, raw-key refusal and malformed/type bounds passed\n";
}
