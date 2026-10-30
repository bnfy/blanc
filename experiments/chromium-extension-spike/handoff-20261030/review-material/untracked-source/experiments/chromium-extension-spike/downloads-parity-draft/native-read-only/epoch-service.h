#ifndef BLANC_DOWNLOADS_EPOCH_SERVICE_DRAFT_H_
#define BLANC_DOWNLOADS_EPOCH_SERVICE_DRAFT_H_
#include <optional>
#include "base/memory/weak_ptr.h"
#include "base/scoped_observation.h"
#include "base/sequence_checker.h"
#include "base/unguessable_token.h"
#include "chrome/browser/profiles/profile_observer.h"
#include "components/keyed_service/core/keyed_service.h"
#include "content/public/browser/download_manager.h"
#include "scope.h"
class Profile;
namespace blanc::downloads_projection {
// UNREGISTERED LIFECYCLE EXPERIMENT. This class issues no rows, sends no IPC,
// and makes no safety or completion decision. It must not be deployed.
class EpochService final : public KeyedService,
                           public ProfileObserver,
                           public content::DownloadManager::Observer {
 public:
  struct Lease { Scope scope; base::UnguessableToken family; base::UnguessableToken context; };
  explicit EpochService(Profile* regular_owner);
  ~EpochService() override;
  // A future trusted browser lifecycle owner must prove the supplied manager
  // has not begun shutdown AND atomically register observation before it can
  // do so, on the UI sequence. Pointer existence is not such proof.
  // No existing caller establishes this; renderer input is never accepted.
  // This does not create or initialize a DownloadManager or private profile.
  bool Adopt(Scope scope, Profile* context, content::DownloadManager* manager);
  // Internal lease; not an authorization token or renderer-visible identifier.
  std::optional<Lease> Capture(Scope scope) const;
  bool IsCurrent(const Lease& lease) const;
  void Shutdown() override;
  void OnProfileWillBeDestroyed(Profile* profile) override;
  void ManagerGoingDown(content::DownloadManager* manager) override;
 private:
  void ResetPrivate();
  void ResetRegular();
  bool OwnerCurrent() const;
  bool closed_ = false;
  base::WeakPtr<Profile> owner_;
  base::WeakPtr<Profile> private_;
  base::UnguessableToken family_;
  base::UnguessableToken regular_epoch_;
  base::UnguessableToken private_epoch_;
  base::ScopedObservation<Profile, ProfileObserver> owner_observation_{this};
  base::ScopedObservation<Profile, ProfileObserver> private_observation_{this};
  base::ScopedObservation<content::DownloadManager, content::DownloadManager::Observer> regular_manager_{this};
  base::ScopedObservation<content::DownloadManager, content::DownloadManager::Observer> private_manager_{this};
  SEQUENCE_CHECKER(sequence_checker_);
  base::WeakPtrFactory<EpochService> weak_factory_{this};
};
}
#endif
