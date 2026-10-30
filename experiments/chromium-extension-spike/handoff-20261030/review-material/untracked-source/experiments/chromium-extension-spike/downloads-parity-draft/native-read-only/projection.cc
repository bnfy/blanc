#include "projection.h"
#include <set>
#include <utility>
#include "chrome/browser/download/download_item_model.h"
#include "chrome/browser/profiles/profile.h"
#include "components/download/public/common/download_item.h"
#include "content/public/browser/download_item_utils.h"
#include "content/public/browser/download_manager.h"
#include "url/origin.h"

namespace blanc::downloads_projection {
Result ReadManager(Profile* owner, Scope scope,
                   const base::UnguessableToken& expected_epoch,
                   const base::UnguessableToken& current_epoch,
                   bool regular_history_ready) {
  if (!owner || !owner->IsRegularProfile() || owner->IsOffTheRecord() ||
      expected_epoch.is_empty() || current_epoch.is_empty() ||
      expected_epoch != current_epoch) return {};
  Profile* context = owner;
  if (scope == Scope::kPrimaryPrivate) {
    context = owner->GetPrimaryOTRProfile(/*create_if_needed=*/false);
    if (!context || !context->IsIncognitoProfile() ||
        !context->IsPrimaryOTRProfile() || context->GetOriginalProfile() != owner)
      return {};
  } else if (scope != Scope::kRegular) {
    return {};
  }
  auto* manager = context->GetDownloadManager();
  ScopeEvidence evidence{true, true, true, true, true,
                         manager && manager->GetBrowserContext() == context,
                         manager && manager->IsManagerInitialized(), regular_history_ready};
  const auto decision = CheckScope(scope, evidence);
  if (decision == ScopeDecision::kPending) return {Status::kPending, {}};
  if (decision != ScopeDecision::kReady) return {};
  content::DownloadManager::DownloadVector downloads;
  manager->GetAllDownloads(&downloads);
  Result result{Status::kReady, {}};
  std::set<std::string> seen;
  for (const auto& download : downloads) {
    auto* item = download.get();
    if (!item || item->GetGuid().empty() || !seen.insert(item->GetGuid()).second)
      return {Status::kInvalid, {}};
    auto* attached_context = content::DownloadItemUtils::GetBrowserContext(item);
    if (attached_context && attached_context != context) return {Status::kDenied, {}};
    DownloadItemModel model(item);
    // Do not infer safety from warning state. No action is granted.
    // This draft is not side-effect-free: manager access can initialize or
    // reenter, and this model registers an observer; lifetime proof is open.
    std::string origin;
    if (item->GetURL().SchemeIsHTTPOrHTTPS()) {
      auto parsed_origin = url::Origin::Create(item->GetURL());
      if (!parsed_origin.opaque()) origin = parsed_origin.Serialize();
    }
    auto filename = item->GetFileNameToReportUser().BaseName().LossyDisplayName();
    if (!ValidDisplayName(filename)) return {Status::kInvalid, {}};
    result.rows.push_back(InternalRow{
        item->GetGuid(), std::move(filename),
        std::move(origin), static_cast<int>(item->GetState()),
        static_cast<int>(item->GetDangerType()),
        static_cast<int>(item->GetInsecureDownloadStatus()),
        static_cast<int>(model.GetDangerUiPattern()), item->IsDangerous(),
        item->IsInsecure(), item->CanResume(), item->GetReceivedBytes(),
        item->GetTotalBytes(), item->GetStartTime().InMillisecondsSinceUnixEpoch(),
        scope == Scope::kPrimaryPrivate});
  }
  return result;
}
}
