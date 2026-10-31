#include "download-controller.h"
#include "reconcile.h"

#include <algorithm>
#include "base/check.h"
#include "chrome/browser/profiles/profile.h"
#include "components/download/public/common/download_item.h"
#include "content/public/browser/browser_thread.h"
#include "content/public/browser/download_item_utils.h"
#include "content/public/browser/download_manager.h"

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

void DownloadController::ResetDocument() {
  if (!content::BrowserThread::CurrentlyOn(content::BrowserThread::UI)) return;
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  handles_.clear();
  document_.reset();
  document_epoch_ = base::UnguessableToken::Create();
}

bool DownloadController::BindDocument(content::WebContents* host,
    content::RenderFrameHost* frame, Profile* expected_context) {
  if (!content::BrowserThread::CurrentlyOn(content::BrowserThread::UI)) return false;
  // An unsuccessful rebind must revoke the prior document and its handles.
  ResetDocument();
  auto owner = owner_;
  if (!owner || owner->ShutdownStarted() || !expected_context ||
      expected_context->ShutdownStarted()) return false;
  if (expected_context != owner.get() &&
      (!expected_context->IsPrimaryOTRProfile() ||
       !expected_context->IsIncognitoProfile() ||
       expected_context->GetOriginalProfile() != owner.get() ||
       owner->GetPrimaryOTRProfile(false) != expected_context)) return false;
  auto document = TrustedDocument::Bind(host, frame, expected_context);
  if (!document) return false;
  document_ = std::move(document);
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

std::optional<base::UnguessableToken> DownloadController::IssueVisibleItem(
    Scope scope, const std::string& guid, content::RenderFrameHost* caller) {
  if (!content::BrowserThread::CurrentlyOn(content::BrowserThread::UI)) return std::nullopt;
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  if (!document_ || !document_->Validate(caller, false)) return std::nullopt;
  PruneInvalidated();
  if (guid.empty() || document_epoch_.is_empty()) return std::nullopt;
  const auto epoch = document_epoch_;
  auto weak_self = weak_factory_.GetWeakPtr();
  auto resolved = Resolve(scope);
  if (!weak_self || weak_self->document_epoch_ != epoch || !resolved)
    return std::nullopt;
  auto* item = resolved->manager->GetDownloadByGuid(guid);
  if (!weak_self || weak_self->document_epoch_ != epoch || !item ||
      !resolved->context ||
      content::DownloadItemUtils::GetBrowserContext(item) != resolved->context.get() ||
      !weak_self ||
      weak_self->document_epoch_ != epoch ||
      !resolved->context ||
      !content::IsBlancDownloadLifetimeCurrent(resolved->context.get(), resolved->lifetime))
    return std::nullopt;
  if (!weak_self || weak_self->document_epoch_ != epoch) return std::nullopt;
  for (const auto& [handle, entry] : weak_self->handles_) {
    if (entry.scope == scope && entry.lifetime == resolved->lifetime &&
        entry.guid == guid && entry.item->Matches(item)) return handle;
  }
  using Lease = ItemLifetime<download::DownloadItem, download::DownloadItem::Observer,
                             raw_ptr<download::DownloadItem>>;
  auto lease = std::make_unique<Lease>(item);
  if (!weak_self || weak_self->document_epoch_ != epoch || !lease->Matches(item) ||
      !resolved->context ||
      !content::IsBlancDownloadLifetimeCurrent(resolved->context.get(), resolved->lifetime))
    return std::nullopt;
  auto handle = base::UnguessableToken::Create();
  weak_self->handles_.emplace(handle, Entry{scope, resolved->lifetime, guid, std::move(lease)});
  return handle;
}

bool DownloadController::ReconcileVisible(
    const std::vector<base::UnguessableToken>& visible,
    content::RenderFrameHost* caller) {
  if (!content::BrowserThread::CurrentlyOn(content::BrowserThread::UI) ||
      !document_ || !document_->Validate(caller, false)) return false;
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  // No changes for a duplicate, unknown or expired token. The caller must
  // invoke only after a successful, complete browser-owned snapshot.
  return ReconcileSnapshot(handles_, visible,
      [](const Entry& entry) { return entry.item && entry.item->IsLive(); });
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
  // Mark before potentially reentrant dispatch. No access to item, manager,
  // context, controller, or map is made after Cancel.
  found->second.cancel_issued = true;
  item->Cancel(/*user_cancel=*/true);
  return Dispatch::kIssued;
}
}  // namespace blanc::downloads_projection
