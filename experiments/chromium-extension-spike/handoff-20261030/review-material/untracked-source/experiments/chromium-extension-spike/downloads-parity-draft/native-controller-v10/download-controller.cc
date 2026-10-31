#include "download-controller.h"
#include "reconcile.h"
#include "reset-state.h"

#include <algorithm>
#include "base/check.h"
#include "chrome/browser/profiles/profile.h"
#include "components/download/public/common/download_item.h"
#include "content/public/browser/browser_thread.h"
#include "content/public/browser/download_item_utils.h"
#include "content/public/browser/download_manager.h"
#include "content/public/browser/render_frame_host.h"
#include "content/public/browser/web_contents.h"

namespace blanc::downloads_projection {
DownloadController::DownloadController(Profile* owner) {
  DCHECK_CURRENTLY_ON(content::BrowserThread::UI);
  if (!content::BrowserThread::CurrentlyOn(content::BrowserThread::UI)) return;
  if (owner && !owner->ShutdownStarted() && owner->IsRegularProfile() &&
      !owner->IsOffTheRecord()) owner_ = owner->GetWeakPtr();
}
DownloadController::~DownloadController() {
  CHECK(content::BrowserThread::CurrentlyOn(content::BrowserThread::UI));
}

bool DownloadController::SetOwnerGuard(
    base::RepeatingCallback<bool(content::RenderFrameHost*)> guard) {
  if (!content::BrowserThread::CurrentlyOn(content::BrowserThread::UI) ||
      !guard || owner_guard_ || document_) return false;
  owner_guard_ = std::move(guard);
  return true;
}

base::UnguessableToken DownloadController::ResetDocument() {
  if (!content::BrowserThread::CurrentlyOn(content::BrowserThread::UI)) return {};
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  const auto next = base::UnguessableToken::Create();
  // Revoke the old binding before detaching entries. Teardown can re-enter;
  // do not read or mutate controller state after the helper returns.
  document_.reset();
  ResetSnapshotState(document_epoch_, snapshot_gate_, handles_, next);
  return next;
}

bool DownloadController::BindDocument(content::WebContents* host,
    content::RenderFrameHost* frame, Profile* expected_context) {
  if (!content::BrowserThread::CurrentlyOn(content::BrowserThread::UI)) return false;
  auto weak_self = weak_factory_.GetWeakPtr();
  // The caller supplies live browser-owned objects on the UI sequence. Capture
  // weak identities before reset: observer teardown can synchronously destroy
  // the host, navigate/delete the document, or shut down its profile while the
  // controller survives. Even a null or invalid request revokes the old bind.
  auto weak_host = host ? host->GetWeakPtr() : base::WeakPtr<content::WebContents>();
  auto weak_document = frame ? frame->GetWeakDocumentPtr() : content::WeakDocumentPtr();
  auto weak_context = expected_context ? expected_context->GetWeakPtr() : base::WeakPtr<Profile>();
  const auto epoch = ResetDocument();
  if (!weak_self || epoch.is_empty() || weak_self->document_epoch_ != epoch ||
      weak_self->document_ || !weak_host || !weak_document.AsRenderFrameHostIfValid() ||
      !weak_context) return false;
  auto owner = weak_self->owner_;
  if (!owner || owner->ShutdownStarted() || weak_context->ShutdownStarted()) return false;
  if (weak_context.get() != owner.get() &&
      (!weak_context->IsPrimaryOTRProfile() || !weak_context->IsIncognitoProfile() ||
       weak_context->GetOriginalProfile() != owner.get() ||
       owner->GetPrimaryOTRProfile(false) != weak_context.get())) return false;
  // Reconstruct identities from weak references after all potentially
  // reentrant context checks, not from the pre-reset raw arguments.
  if (!weak_self || !owner || !weak_host || !weak_context ||
      !weak_document.AsRenderFrameHostIfValid() || weak_self->document_epoch_ != epoch ||
      weak_self->document_) return false;
  auto document = TrustedDocument::Bind(weak_host.get(),
      weak_document.AsRenderFrameHostIfValid(), weak_context.get());
  if (!document || !weak_self || !owner || !weak_host || !weak_context ||
      !weak_document.AsRenderFrameHostIfValid() ||
      weak_self->document_epoch_ != epoch || weak_self->document_) return false;
  weak_self->document_ = std::move(document);
  return true;
}

void DownloadController::PruneInvalidated() {
  // Called on UI outside an observer callback; invalidated leases already
  // detached from their items, so erasure cannot call into those items.
  std::erase_if(handles_, [](const auto& pair) { return !pair.second.item->IsLive(); });
}

std::optional<DownloadController::Resolved> DownloadController::Resolve(
    Scope scope) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  auto weak_self = weak_factory_.GetWeakPtr();
  auto owner = owner_;
  if (!content::BrowserThread::CurrentlyOn(content::BrowserThread::UI) ||
      !owner || owner->ShutdownStarted() || !owner->IsRegularProfile() ||
      owner->IsOffTheRecord()) return std::nullopt;
  Profile* context = owner.get();
  if (scope == Scope::kPrimaryPrivate) {
    context = owner->GetPrimaryOTRProfile(/*create_if_needed=*/false);
    if (!weak_self || !owner) return std::nullopt;
    if (!context || context->ShutdownStarted() || !context->IsIncognitoProfile() ||
        !context->IsPrimaryOTRProfile() || context->GetOriginalProfile() != owner.get())
      return std::nullopt;
  } else if (scope != Scope::kRegular) {
    return std::nullopt;
  }
  auto weak = context->GetWeakPtr();
  auto lifetime = content::GetBlancDownloadLifetime(context);
  if (!lifetime || !weak || !weak_self || !owner) return std::nullopt;
  // A valid token means a manager has already been installed; do not create a
  // manager or OTR profile for a request. Still recheck immediately afterward.
  auto* manager = context->GetDownloadManager();
  if (!weak || !weak_self || !owner || owner->ShutdownStarted() || weak->ShutdownStarted() ||
      !content::IsBlancDownloadLifetimeCurrent(weak.get(), *lifetime) ||
      !manager || manager->GetBrowserContext() != weak.get()) return std::nullopt;
  return Resolved{weak, manager, *lifetime};
}

std::optional<DownloadController::SnapshotId> DownloadController::BeginSnapshot(
    content::RenderFrameHost* caller) {
  if (!content::BrowserThread::CurrentlyOn(content::BrowserThread::UI) ||
      !document_ || !document_->Validate(caller, false)) return std::nullopt;
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  return snapshot_gate_.Begin();
}

std::optional<base::UnguessableToken> DownloadController::IssueVisibleItem(
    Scope scope, const std::string& guid, content::RenderFrameHost* caller,
    const SnapshotId& snapshot) {
  if (!content::BrowserThread::CurrentlyOn(content::BrowserThread::UI)) return std::nullopt;
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  if (!document_ || !document_->Validate(caller, false) ||
      !snapshot_gate_.Current(snapshot)) return std::nullopt;
  PruneInvalidated();
  if (guid.empty() || document_epoch_.is_empty()) return std::nullopt;
  const auto epoch = document_epoch_;
  auto weak_self = weak_factory_.GetWeakPtr();
  auto resolved = Resolve(scope);
  if (!weak_self || (weak_self->document_epoch_ != epoch || !weak_self->snapshot_gate_.Current(snapshot)) || !resolved)
    return std::nullopt;
  auto* item = resolved->manager->GetDownloadByGuid(guid);
  if (!weak_self || (weak_self->document_epoch_ != epoch || !weak_self->snapshot_gate_.Current(snapshot)) || !item ||
      !resolved->context ||
      content::DownloadItemUtils::GetBrowserContext(item) != resolved->context.get() ||
      !weak_self ||
      (weak_self->document_epoch_ != epoch || !weak_self->snapshot_gate_.Current(snapshot)) ||
      !resolved->context ||
      !content::IsBlancDownloadLifetimeCurrent(resolved->context.get(), resolved->lifetime))
    return std::nullopt;
  if (!weak_self || (weak_self->document_epoch_ != epoch || !weak_self->snapshot_gate_.Current(snapshot))) return std::nullopt;
  for (const auto& [handle, entry] : weak_self->handles_) {
    if (entry.scope == scope && entry.lifetime == resolved->lifetime &&
        entry.guid == guid && entry.item->Matches(item)) return handle;
  }
  using Lease = ItemLifetime<download::DownloadItem, download::DownloadItem::Observer,
                             raw_ptr<download::DownloadItem>>;
  auto lease = std::make_unique<Lease>(item);
  if (!weak_self || (weak_self->document_epoch_ != epoch || !weak_self->snapshot_gate_.Current(snapshot)) || !lease->Matches(item) ||
      !resolved->context ||
      !content::IsBlancDownloadLifetimeCurrent(resolved->context.get(), resolved->lifetime))
    return std::nullopt;
  auto handle = base::UnguessableToken::Create();
  weak_self->handles_.emplace(handle, Entry{scope, resolved->lifetime, guid, std::move(lease)});
  return handle;
}

bool DownloadController::ReconcileVisible(
    const std::vector<base::UnguessableToken>& visible,
    content::RenderFrameHost* caller, const SnapshotId& snapshot) {
  if (!content::BrowserThread::CurrentlyOn(content::BrowserThread::UI) ||
      !document_ || !document_->Validate(caller, false) ||
      !snapshot_gate_.Current(snapshot)) return false;
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  auto weak_self = weak_factory_.GetWeakPtr();
  // Consume malformed tickets too; an invalid snapshot must start over.
  if (!snapshot_gate_.Take(snapshot)) return false;
  const bool applied = ReconcileSnapshot(handles_, visible,
      [](const Entry& entry) { return entry.item && entry.item->IsLive(); });
  // Detached observer destruction can start a newer snapshot, reset or
  // destroy this controller before ReconcileSnapshot returns. Never access
  // members without the weak check, and never commit a superseded ticket.
  if (!applied || !weak_self || !weak_self->document_ ||
      !weak_self->document_->Validate(caller, false)) return false;
  return weak_self && weak_self->snapshot_gate_.Commit(snapshot);
}

bool DownloadController::CanPublishSnapshot(
    content::RenderFrameHost* caller, const SnapshotId& snapshot) {
  if (!content::BrowserThread::CurrentlyOn(content::BrowserThread::UI)) return false;
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  auto weak_self = weak_factory_.GetWeakPtr();
  if (!snapshot_gate_.CanPublish(snapshot) || !document_ ||
      !document_->Validate(caller, false)) return false;
  if (!weak_self || !weak_self->owner_guard_) return false;
  // The callback can re-enter and destroy this controller. Hold a local copy
  // and recheck its weak identity and snapshot after the callback returns.
  auto guard = weak_self->owner_guard_;
  if (!guard.Run(caller) || !weak_self || !weak_self->document_ ||
      !weak_self->document_->Validate(caller, false) || !weak_self ||
      !weak_self->snapshot_gate_.CanPublish(snapshot)) return false;
  return true;
}

DownloadController::Dispatch DownloadController::Cancel(
    const base::UnguessableToken& handle, content::RenderFrameHost* caller) {
  if (!content::BrowserThread::CurrentlyOn(content::BrowserThread::UI)) return Dispatch::kRejected;
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  // Validate the document without consuming the user's gesture until the
  // request has a current, actionable item. An invalid or already-issued
  // request must not use up the activation for a following valid action.
  if (!document_ || !document_->Validate(caller, false)) return Dispatch::kRejected;
  PruneInvalidated();
  auto found = handles_.find(handle);
  if (found == handles_.end()) return Dispatch::kRejected;
  const auto scope = found->second.scope;
  const auto lifetime = found->second.lifetime;
  const auto guid = found->second.guid;
  const auto epoch = document_epoch_;
  auto weak_self = weak_factory_.GetWeakPtr();

  // Re-resolve from the browser-owned family each time. The item observer
  // lease binds the handle to this exact DownloadItem lifetime, including
  // removal followed by reuse of the same GUID or address.
  auto current_item = [&]() -> download::DownloadItem* {
    if (!weak_self || weak_self->document_epoch_ != epoch) return nullptr;
    auto resolved = weak_self->Resolve(scope);
    if (!weak_self || weak_self->document_epoch_ != epoch || !resolved ||
        resolved->lifetime != lifetime || !weak_self->document_ ||
        !weak_self->document_->Validate(caller, false)) return nullptr;
    if (!weak_self || weak_self->document_epoch_ != epoch || !resolved->context ||
        !content::IsBlancDownloadLifetimeCurrent(resolved->context.get(), lifetime))
      return nullptr;
    auto* item = resolved->manager->GetDownloadByGuid(guid);
    if (!weak_self || weak_self->document_epoch_ != epoch || !item || !resolved->context ||
        content::DownloadItemUtils::GetBrowserContext(item) != resolved->context.get() ||
        !weak_self || weak_self->document_epoch_ != epoch || !resolved->context ||
        !content::IsBlancDownloadLifetimeCurrent(resolved->context.get(), lifetime))
      return nullptr;
    if (!weak_self || weak_self->document_epoch_ != epoch) return nullptr;
    auto entry = weak_self->handles_.find(handle);
    if (entry == weak_self->handles_.end() || entry->second.scope != scope ||
        entry->second.guid != guid || entry->second.lifetime != lifetime ||
        !entry->second.item->Matches(item)) return nullptr;
    return item;
  };

  auto* item = current_item();
  if (!item || !weak_self || weak_self->document_epoch_ != epoch)
    return Dispatch::kRejected;
  found = weak_self->handles_.find(handle);
  if (found == weak_self->handles_.end() || !found->second.item->Matches(item))
    return Dispatch::kRejected;
  if (found->second.cancel_issued) return Dispatch::kAlreadyIssued;
  if (item->GetState() != download::DownloadItem::IN_PROGRESS || !weak_self ||
      weak_self->document_epoch_ != epoch) return Dispatch::kRejected;
  found = weak_self->handles_.find(handle);
  if (found == weak_self->handles_.end() || found->second.cancel_issued ||
      !found->second.item->Matches(item)) return Dispatch::kRejected;

  // Activation is consumed only after preliminary checks. It can still be
  // consumed if the document/item changes during this call; therefore the
  // entire browser-owned lookup and exact item lease are checked again.
  if (!weak_self->document_ || !weak_self->document_->Validate(caller, true))
    return Dispatch::kRejected;
  if (!weak_self || weak_self->document_epoch_ != epoch) return Dispatch::kRejected;
  item = current_item();
  if (!item || !weak_self || weak_self->document_epoch_ != epoch)
    return Dispatch::kRejected;
  found = weak_self->handles_.find(handle);
  if (found == weak_self->handles_.end() || !found->second.item->Matches(item))
    return Dispatch::kRejected;
  if (found->second.cancel_issued) return Dispatch::kAlreadyIssued;
  if (item->GetState() != download::DownloadItem::IN_PROGRESS || !weak_self ||
      weak_self->document_epoch_ != epoch) return Dispatch::kRejected;
  found = weak_self->handles_.find(handle);
  if (found == weak_self->handles_.end() || found->second.cancel_issued ||
      found->second.scope != scope || found->second.guid != guid ||
      found->second.lifetime != lifetime || !found->second.item->Matches(item))
    return Dispatch::kRejected;
  // Pending navigation or document replacement can invalidate the original
  // check during an intervening browser callback. Check the live bound document
  // immediately before marking, then re-check the exact item lease/state after
  // this potentially reentrant guard. DownloadItemImpl::GetState() is a local
  // state read in Chromium 158; real lifecycle/reentrancy proof remains open.
  if (!weak_self->document_ || !weak_self->document_->Validate(caller, false) ||
      !weak_self || weak_self->document_epoch_ != epoch) return Dispatch::kRejected;
  found = weak_self->handles_.find(handle);
  if (found == weak_self->handles_.end() || found->second.cancel_issued ||
      found->second.scope != scope || found->second.guid != guid ||
      found->second.lifetime != lifetime || !found->second.item->Matches(item) ||
      item->GetState() != download::DownloadItem::IN_PROGRESS || !weak_self ||
      weak_self->document_epoch_ != epoch) return Dispatch::kRejected;
  found = weak_self->handles_.find(handle);
  if (found == weak_self->handles_.end() || found->second.cancel_issued ||
      found->second.scope != scope || found->second.guid != guid ||
      found->second.lifetime != lifetime || !found->second.item->Matches(item))
    return Dispatch::kRejected;
  // Window and Island association must still hold at dispatch, not merely
  // when the wrapper was entered. The guard may synchronously re-enter.
  if (!weak_self->owner_guard_) return Dispatch::kRejected;
  auto owner_guard = weak_self->owner_guard_;
  if (!owner_guard.Run(caller) || !weak_self || weak_self->document_epoch_ != epoch ||
      !weak_self->document_ || !weak_self->document_->Validate(caller, false) ||
      !weak_self || weak_self->document_epoch_ != epoch)
    return Dispatch::kRejected;
  found = weak_self->handles_.find(handle);
  if (found == weak_self->handles_.end() || found->second.cancel_issued ||
      found->second.scope != scope || found->second.guid != guid ||
      found->second.lifetime != lifetime || !found->second.item->Matches(item) ||
      item->GetState() != download::DownloadItem::IN_PROGRESS)
    return Dispatch::kRejected;
  // Mark before potentially reentrant dispatch. No access to item, manager,
  // context, controller, or map is made after Cancel.
  found->second.cancel_issued = true;
  item->Cancel(/*user_cancel=*/true);
  return Dispatch::kIssued;
}
}  // namespace blanc::downloads_projection
