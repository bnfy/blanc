#ifndef BLANC_SYNC_NATIVE_LOCAL_PROFILE_REGISTRY_H_
#define BLANC_SYNC_NATIVE_LOCAL_PROFILE_REGISTRY_H_
#include <atomic>
#include <memory>
#include <set>
#include "personal_identity_loader.h"
#include "personal_deletion_guard.h"
#include "base/memory/weak_ptr.h"
#include "base/scoped_observation.h"
#include "chrome/browser/profiles/profile_manager_observer.h"
#include "chrome/browser/profiles/profile_observer.h"
class Profile;
class ProfileManager;
namespace blanc::sync {
// UI-owned adapter for the protected Personal mapping. It observes the actual
// loaded Profile before publishing a resolver. This is not the named-profile
// registry/UI or first-creation authority and is not wired into the app yet.
class NativeLocalProfileRegistry final : public ProfileManagerObserver, public ProfileObserver {
 public:
  enum class State { kReady,kUnavailable,kNotLoaded,kBusy,kRevoked,kShutdown };
  struct Result { State state; PersonalIdentityStore::Status store_status; };
  using Completed=base::OnceCallback<void(Result)>;
  NativeLocalProfileRegistry(ProfileManager* manager,scoped_refptr<base::SequencedTaskRunner> worker,
                             std::shared_ptr<PersonalDeletionGuard> deletion_guard);
  ~NativeLocalProfileRegistry() override;
  void LoadExisting(Completed done);
  void Shutdown();
  void OnProfileMarkedForPermanentDeletion(Profile* profile) override;
  void OnProfileManagerDestroying() override;
  void OnProfileWillBeDestroyed(Profile* profile) override;
 private:
  void Loaded(PersonalIdentityLoader::Result result);
  void Finish(Result result);
  void Revoke();
  std::optional<base::FilePath> Resolve() const;
  ProfileManager* manager_;
  Profile* active_=nullptr;
  std::set<base::FilePath> deleted_;
  std::unique_ptr<PersonalIdentityLoader> loader_;
  std::shared_ptr<PersonalDeletionGuard> deletion_guard_;
  scoped_refptr<base::SequencedTaskRunner> owner_;
  base::ScopedObservation<ProfileManager,ProfileManagerObserver> manager_observation_{this};
  base::ScopedObservation<Profile,ProfileObserver> profile_observation_{this};
  Completed pending_;
  bool revoked_=false;
  std::shared_ptr<std::atomic<bool>> stopped_=std::make_shared<std::atomic<bool>>(false);
  std::shared_ptr<std::atomic<uint64_t>> epoch_=std::make_shared<std::atomic<uint64_t>>(0);
  SEQUENCE_CHECKER(sequence_checker_);
  base::WeakPtrFactory<NativeLocalProfileRegistry> weak_factory_{this};
};
}  // namespace blanc::sync
#endif
