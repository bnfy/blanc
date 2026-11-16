#ifndef BLANC_SYNC_LEGACY_PREPARATION_H_
#define BLANC_SYNC_LEGACY_PREPARATION_H_
#include "legacy_sync_record.h"
#include "legacy_request_state.h"
#include "key_vault.h"
#include "profile_state_store.h"
namespace blanc::sync {
enum class LegacyPreparationStatus {
  kPreparedCore, kInvalidRecord, kLegacyRawKey, kMissingQuota,
  kUnmappedStatus, kNeedsDeviceIdentity, kDisabledReconciliation,
  kDestinationAccountMismatch, kCredentialUnavailable
};
// Prepared core only: not a commit token. Source binding/closed backup, model
// preservation, trusted migration authority and atomic commit remain mandatory.
struct LegacyPreparation {
  LegacyPreparationStatus status;
  std::optional<ProfileSyncState> core;
  KeyVault::Status vault_status = KeyVault::Status::kNotAllowed;
};
LegacyPreparation PrepareLegacyCore(std::string_view sync_json,
    std::string_view shared_json, KeyVault& destination,
    scoped_refptr<os_crypt_async::Encryptor> source);
}
#endif
