#include "download-controller.h"

#include "chrome/browser/profiles/profile.h"
#include "components/download/public/common/download_item.h"
#include "content/public/browser/browser_thread.h"
#include "content/public/browser/download_item_utils.h"
#include "content/public/browser/download_manager.h"

namespace blanc::downloads_projection {
DownloadController::DownloadController(Profile* owner) {
  DCHECK_CURRENTLY_ON(content::BrowserThread::UI);
  if (owner && !owner->ShutdownStarted() && owner->IsRegularProfile() &&
      !owner->IsOffTheRecord()) owner_ = owner->GetWeakPtr();
}
DownloadController::~DownloadController() = default;

void DownloadController::ResetDocument() {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  handles_.clear();
  document_epoch_ = base::UnguessableToken::Create();
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
    Scope scope, const std::string& guid) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
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
        entry.guid == guid) return handle;
  }
  auto handle = base::UnguessableToken::Create();
  weak_self->handles_.emplace(handle, Entry{scope, resolved->lifetime, guid});
  return handle;
}

DownloadController::Dispatch DownloadController::Cancel(
    const base::UnguessableToken& handle) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  auto found = handles_.find(handle);
  if (found == handles_.end()) return Dispatch::kRejected;
  if (found->second.cancel_issued) return Dispatch::kAlreadyIssued;
  const Entry entry = found->second;
  const auto epoch = document_epoch_;
  auto weak_self = weak_factory_.GetWeakPtr();
  auto resolved = Resolve(entry.scope);
  if (!weak_self || weak_self->document_epoch_ != epoch || !resolved ||
      resolved->lifetime != entry.lifetime)
    return Dispatch::kRejected;
  auto* item = resolved->manager->GetDownloadByGuid(entry.guid);
  if (!weak_self || weak_self->document_epoch_ != epoch || !item || !resolved->context ||
      content::DownloadItemUtils::GetBrowserContext(item) != resolved->context.get() ||
      !content::IsBlancDownloadLifetimeCurrent(resolved->context.get(), resolved->lifetime) ||
      item->GetState() != download::DownloadItem::IN_PROGRESS)
    return Dispatch::kRejected;
  if (!weak_self || weak_self->document_epoch_ != epoch) return Dispatch::kRejected;
  found = weak_self->handles_.find(handle);
  if (found == weak_self->handles_.end() || found->second.cancel_issued ||
      found->second.scope != entry.scope || found->second.guid != entry.guid ||
      found->second.lifetime != entry.lifetime) return Dispatch::kRejected;
  // Mark before potentially reentrant dispatch. Do not touch the item,
  // manager, context or map afterward: Cancel may notify observers inline.
  found->second.cancel_issued = true;
  item->Cancel(/*user_cancel=*/true);
  return Dispatch::kIssued;
}
}  // namespace blanc::downloads_projection
