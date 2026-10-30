#ifndef BLANC_SYNC_TAB_CACHE_STORE_H_
#define BLANC_SYNC_TAB_CACHE_STORE_H_
#include "profile_state_store.h"

namespace blanc::sync {
class TabSyncCoordinator;
// Native Personal-profile worker only. Reads return opaque JSON text which must
// be parsed, rebound and sanitized by the fixed shipping-model operation before
// any rendering or upload. Neither this class nor its raw text is a UI API.
class TabCacheStore {
 public:
  using Status = RequestLedger::Status;
  struct Loaded { Status status; std::optional<std::string> raw_json; };
  explicit TabCacheStore(std::shared_ptr<ProfileStateStore> profile);
  Loaded Read(int expected_revision, const std::string& account);
 private:
  friend class TabSyncCoordinator;
  friend class TabCacheStoreTestAccess;
  // Only the trusted coordinator may commit a successful fixed-model result.
  // Must share the profile state's one worker sequence; never call from UI.
  Status Commit(int expected_revision, const std::string& account,
                const std::string& validated_model_json);
  Status CheckIdentity(int expected_revision, const std::string& account);
  std::shared_ptr<ProfileStateStore> profile_;
  SEQUENCE_CHECKER(sequence_checker_);
};
}  // namespace blanc::sync
#endif
