#ifndef BLANC_DOWNLOADS_EPOCH_SERVICE_DRAFT_H_
#define BLANC_DOWNLOADS_EPOCH_SERVICE_DRAFT_H_
#include <optional>
#include "base/memory/raw_ptr.h"
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
  // Trusted caller supplies a currently live context and manager on UI.
  // AddObserverIfRunning provides manager-shutdown registration, but not
  // caller/profile/document authorization or proof of pointer lifetime.
  // No renderer input is accepted and no manager or OTR profile is created.
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
  raw_ptr<content::DownloadManager> regular_manager_ = nullptr;
  raw_ptr<content::DownloadManager> private_manager_ = nullptr;
  SEQUENCE_CHECKER(sequence_checker_);
  base::WeakPtrFactory<EpochService> weak_factory_{this};
};
}
#endif
