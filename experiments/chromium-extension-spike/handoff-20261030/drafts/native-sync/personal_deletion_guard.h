#ifndef BLANC_SYNC_PERSONAL_DELETION_GUARD_H_
#define BLANC_SYNC_PERSONAL_DELETION_GUARD_H_
#include <functional>
#include <optional>
#include "personal_identity_store.h"
#include "base/synchronization/lock.h"
namespace blanc::sync {
class NativeLocalProfileRegistry;
// Process-lifetime deletion fence. It stays alive through post-thread shutdown
// cleanup; no Profile, UI object, or provider is retained. All callbacks run
// under its lock on the caller's sequence, must not reenter this guard, and
// must be scheduled on a MayBlock sequence if they perform disk work.
class PersonalDeletionGuard {
 public:
  enum class Decision { kDeleted, kActionFailed, kProtected, kDeferred, kInvalidPath };
  enum class Preflight { kMaySchedule, kProtected, kDeferred, kInvalidPath };
  explicit PersonalDeletionGuard(base::FilePath root);
  // Must run before closing windows, cancelling downloads or marking a
  // profile for deletion. This is only a point-in-time veto, not permission
  // to delete later: the final destructive step must independently recheck.
  // Filesystem checks may block; use a MayBlock sequence.
  Preflight CheckBeforeScheduling(const base::FilePath& target);
  // Call at the actual destructive commit, not merely when scheduling. False
  // actions and deferred/protected decisions must preserve cleanup markers.
  Decision RunIfAllowed(const base::FilePath& target,std::function<bool()> action);
  // Invalidating never discards the pinned identity, so a later revalidation
  // may restore only that same identity/path. New work is deferred meanwhile.
  void Invalidate();
 private:
  friend class NativeLocalProfileRegistry;
  friend class PersonalDeletionGuardTestAccess;
  bool Confirm(const PersonalIdentityStore::Identity& identity);
  bool ValidChild(const base::FilePath& path) const;
  Preflight ClassifyLocked(const base::FilePath& target);
  const base::FilePath root_;
  base::Lock lock_;
  std::optional<PersonalIdentityStore::Identity> pinned_;
  bool verified_=false;
};
}  // namespace blanc::sync
#endif
