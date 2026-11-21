#include "legacy_preparation.h"
namespace blanc::sync {
LegacyPreparation PrepareLegacyCore(std::string_view sync_json,
    std::string_view shared_json, KeyVault& destination,
    scoped_refptr<os_crypt_async::Encryptor> source) {
  using S = LegacyPreparationStatus;
  if (destination.availability() != KeyVault::Status::kOk)
    return {S::kCredentialUnavailable, {}, destination.availability()};
  auto parsed = ParseLegacySyncRecord(sync_json);
  if (parsed.status == LegacySyncStatus::kNeedsLegacyKeyProtection)
    return {S::kLegacyRawKey, {}};
  if (!parsed.record) return {S::kInvalidRecord, {}};
  auto& record = *parsed.record;
  if (record.status_mapping_required) return {S::kUnmappedStatus, {}};
  if (record.device_id.empty()) return {S::kNeedsDeviceIdentity, {}};
  auto quota = ParseLegacyRequestState(shared_json);
  if (!quota) return {S::kMissingQuota, {}};
  // Do not silently drop dormant credentials or inconsistent disabled state.
  if (!record.enabled && (!record.account.empty() || !record.protected_key.empty() ||
      !record.handle.empty() || record.spaces || record.erasure_pending))
    return {S::kDisabledReconciliation, {}};
  ProfileSyncState state;
  if (record.enabled) {
    if (!destination.MatchesAccount(record.account)) return {S::kDestinationAccountMismatch, {}};
    auto rewrapped = destination.RewrapLegacy(std::move(source), record.protected_key);
    if (rewrapped.status != KeyVault::Status::kOk)
      return {S::kCredentialUnavailable, {}, rewrapped.status};
    state.account_id = record.account;
    state.protected_key = std::move(rewrapped.blob);
    state.handle = record.handle;
  }
  state.enabled = record.enabled; state.device_id = record.device_id;
  state.sync_tabs = record.tabs; state.sync_spaces = record.spaces;
  state.erasure_pending = record.erasure_pending;
  state.recovery_prompt_dismissed = record.recovery_dismissed;
  state.last_synced_at = record.last_synced_at; state.last_error = record.last_error;
  state.origin = record.origin; state.quota = std::move(*quota);
  return {S::kPreparedCore, std::move(state), KeyVault::Status::kOk};
}
}
