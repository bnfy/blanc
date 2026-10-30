#include "epoch-service.h"
#include <optional>
#include "chrome/browser/profiles/profile.h"
namespace blanc::downloads_projection {
EpochService::EpochService(Profile* owner) {
  if (!owner || owner->ShutdownStarted() || !owner->IsRegularProfile() || owner->IsOffTheRecord()) return;
  owner_ = owner->GetWeakPtr();
  family_ = base::UnguessableToken::Create();
  owner_observation_.Observe(owner);
}
EpochService::~EpochService() { Shutdown(); }
bool EpochService::OwnerCurrent() const {
  return !closed_ && owner_ && !family_.is_empty() && !owner_->ShutdownStarted() &&
         owner_->IsRegularProfile() && !owner_->IsOffTheRecord();
}
bool EpochService::Adopt(Scope scope, Profile* context, content::DownloadManager* manager) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  if (!OwnerCurrent() || !context || context->ShutdownStarted() || !manager ||
      manager->GetBrowserContext() != context) return false;
  if (scope == Scope::kRegular) {
    if (context != owner_.get() || regular_manager_) return false;
    // API contract prohibits callbacks/reentrancy during this registration.
    if (!manager->AddObserverIfRunning(this)) return false;
    regular_manager_ = manager;
    if (!OwnerCurrent() || context->ShutdownStarted()) { ResetRegular(); return false; }
    regular_epoch_ = base::UnguessableToken::Create();
    return true;
  }
  if (scope != Scope::kPrimaryPrivate || private_manager_ || private_observation_.IsObserving() ||
      context != owner_->GetPrimaryOTRProfile(/*create_if_needed=*/false) ||
      !context->IsIncognitoProfile() || !context->IsPrimaryOTRProfile() ||
      context->GetOriginalProfile() != owner_.get()) return false;
  auto weak = weak_factory_.GetWeakPtr();
  auto context_weak = context->GetWeakPtr();
  private_ = context_weak;
  private_observation_.Observe(context);
  if (!weak) return false;
  if (!context_weak || context_weak->ShutdownStarted() || !OwnerCurrent()) { ResetPrivate(); return false; }
  if (!manager->AddObserverIfRunning(this)) { ResetPrivate(); return false; }
  private_manager_ = manager;
  if (!context_weak || context_weak->ShutdownStarted() || !OwnerCurrent()) { ResetPrivate(); return false; }
  private_epoch_ = base::UnguessableToken::Create();
  return true;
}
std::optional<EpochService::Lease> EpochService::Capture(Scope scope) const {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  if (!OwnerCurrent()) return std::nullopt;
  if (scope == Scope::kRegular && regular_manager_ && !regular_epoch_.is_empty())
    return Lease{scope, family_, regular_epoch_};
  if (scope == Scope::kPrimaryPrivate && private_ && !private_->ShutdownStarted() &&
      private_manager_ && !private_epoch_.is_empty()) return Lease{scope, family_, private_epoch_};
  return std::nullopt;
}
bool EpochService::IsCurrent(const Lease& lease) const {
  auto current = Capture(lease.scope);
  return current && current->family == lease.family && current->context == lease.context;
}
void EpochService::ResetPrivate() {
  private_epoch_ = base::UnguessableToken();
  auto* manager = private_manager_.get();
  private_manager_ = nullptr;
  if (manager) manager->RemoveObserver(this);
  private_observation_.Reset();
  private_.reset();
}
void EpochService::ResetRegular() {
  regular_epoch_ = base::UnguessableToken();
  auto* manager = regular_manager_.get();
  regular_manager_ = nullptr;
  if (manager) manager->RemoveObserver(this);
}
void EpochService::OnProfileWillBeDestroyed(Profile* profile) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  if (profile == owner_.get()) { Shutdown(); return; }
  if (profile == private_.get()) ResetPrivate();
}
void EpochService::ManagerGoingDown(content::DownloadManager* manager) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  if (regular_manager_.get() == manager) ResetRegular();
  if (private_manager_.get() == manager) ResetPrivate();
}
void EpochService::Shutdown() {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  if (closed_) return;
  closed_ = true;
  family_ = base::UnguessableToken();
  weak_factory_.InvalidateWeakPtrs();
  ResetPrivate(); ResetRegular(); owner_observation_.Reset(); owner_.reset();
}
}
