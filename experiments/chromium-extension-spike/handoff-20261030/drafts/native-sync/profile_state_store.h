#ifndef BLANC_SYNC_PROFILE_STATE_STORE_H_
#define BLANC_SYNC_PROFILE_STATE_STORE_H_
#include "request_state_store.h"

namespace blanc::sync {
struct ProfileSyncState {
  std::string device_id, handle, account_id, protected_key, origin, last_error;
  bool enabled = false, sync_tabs = false, sync_spaces = false;
  bool erasure_pending = false, recovery_prompt_dismissed = false;
  double last_synced_at = 0;
  int identity_revision = 0;
  SchedulerState quota;
};
// Owned by the native Personal-profile service on its MayBlock sequence. This
// layer persists state only; it cannot establish consent, validate a vault key,
// drain transport, or authorize remote deletion. Those service gates remain
// mandatory. No raw key/password field exists in the serialized schema.
class ProfileStateStore : public std::enable_shared_from_this<ProfileStateStore> {
 public:
  using Status = RequestLedger::Status;
  enum class BootstrapMode { kExistingOnly, kKnownFirstNativeSetup };
  struct Loaded { Status status; std::optional<ProfileSyncState> state; };
  ProfileStateStore(base::FilePath profile_root, std::string profile_binding,
                    bool personal_profile, bool off_the_record);
  Loaded Read();
  // First-setup authority must come from native profile creation/migration,
  // never absence of files or renderer input. Existing is the default.
  Status Bootstrap(BootstrapMode mode = BootstrapMode::kExistingOnly);
  // Caller has drained old work and obtained the blob from the qualified vault.
  Status Adopt(int expected_revision, std::string handle, std::string account, std::string protected_key,
               bool generated_account);
  Status SetConsents(int expected_revision, bool tabs, bool spaces);
  Status SetErasurePending(int expected_revision, bool pending);
  Status RecordResult(int expected_revision, double success_time, const std::string& error_code);
  Status DismissRecoveryPrompt(int expected_revision);
  Status RewrapProtectedKey(int expected_revision, std::string protected_key);
  // Caller has completed the released drain/retraction/wipe decision protocol.
  Status ClearCredentials(int expected_revision);
  // Captures the identity/consent revision. Old workers cannot overwrite quota
  // after account replacement. New workers share the same profile-wide ledger.
  std::unique_ptr<RequestLedger> MakeLedger();
 private:
  friend class ProfileRequestLedger;
  friend class TabCacheStore;
  Status InitializeProfile();
  Status ReadyMarker();
  Status Save(const ProfileSyncState& state);
  Status CommitQuota(int revision, const SchedulerState& quota);
  bool Allowed() const;
  base::FilePath folder_, path_, marker_;
  std::string binding_;
  bool personal_, private_;
  bool observed_existing_ = false;
  bool bootstrapping_ = false;
  SEQUENCE_CHECKER(sequence_checker_);
};
}  // namespace blanc::sync
#endif
