#include "live-policy.h"

#include "chrome/browser/download/download_commands.h"
#include "chrome/browser/download/download_crx_util.h"
#include "chrome/browser/download/download_item_model.h"
#include "chrome/browser/profiles/profile.h"
#include "components/download/public/common/download_item.h"
#include "components/history/core/common/pref_names.h"
#include "components/prefs/pref_service.h"
#include "content/public/browser/browser_thread.h"
#include "content/public/browser/download_item_utils.h"

namespace blanc::downloads_projection {
namespace {
using Item = download::DownloadItem;
Phase GetPhase(Item::DownloadState state) {
  switch (state) {
    case Item::IN_PROGRESS: return Phase::kProgress;
    case Item::COMPLETE: return Phase::kComplete;
    case Item::INTERRUPTED: return Phase::kInterrupted;
    case Item::CANCELLED: return Phase::kCancelled;
    case Item::MAX_DOWNLOAD_STATE: return Phase::kUnknown;
  }
  return Phase::kUnknown;
}
}  // namespace

LivePolicy ReadLivePolicy(Profile* exact_context, Item* item) {
  if (!content::BrowserThread::CurrentlyOn(content::BrowserThread::UI) ||
      !exact_context || exact_context->ShutdownStarted() || !item ||
      content::DownloadItemUtils::GetBrowserContext(item) != exact_context)
    return {};
  // This scope uses a live model only synchronously. The eventual owner must
  // observe exact item/context lifetime and guard against any reentrant model
  // callbacks before using a result or dispatching a command.
  DownloadItemModel model(item);
  DownloadCommands commands(model.GetWeakPtr());
  LivePolicyInput input;
  input.authorized_context = true;
  input.temporary = item->IsTemporary();
  input.transient = item->IsTransient();
  input.trusted_extension = download_crx_util::IsTrustedExtensionDownload(
      exact_context, *item);
  input.model_shows = model.ShouldShowInUi();
  input.has_name = !item->GetFileNameToReportUser().empty();
  input.has_target = !item->GetTargetFilePath().empty();
  input.has_url = !item->GetURL().is_empty();
  input.phase = GetPhase(item->GetState());
  input.security = ClassifySecurity({
      static_cast<int>(item->GetDangerType()),
      static_cast<int>(item->GetInsecureDownloadStatus()),
      static_cast<int>(model.GetDangerUiPattern()), item->IsDangerous(),
      item->IsInsecure()});
  input.native_cancel = commands.IsCommandEnabled(DownloadCommands::CANCEL);
  input.native_resume = commands.IsCommandEnabled(DownloadCommands::RESUME);
  input.native_open = commands.IsCommandEnabled(DownloadCommands::OPEN_WHEN_COMPLETE);
  input.native_show = commands.IsCommandEnabled(DownloadCommands::SHOW_IN_FOLDER);
  input.allow_delete_history = exact_context->GetPrefs() &&
      exact_context->GetPrefs()->GetBoolean(prefs::kAllowDeletingBrowserHistory);
  return EvaluateLivePolicy(input);
}
}  // namespace blanc::downloads_projection
