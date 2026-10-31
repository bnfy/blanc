#include "weekly_event_candidate.h"
#include <memory>
#include "browser_weekly_stats.h"
#include "base/files/file_path.h"
#include "base/functional/bind.h"
#include "base/supports_user_data.h"
#include "base/task/sequenced_task_runner.h"
#include "base/time/time.h"
#include "chrome/browser/profiles/nuke_profile_directory_utils.h"
#include "chrome/browser/profiles/profile.h"
#include "content/public/browser/browser_context.h"
namespace blanc::blocker_stats {
// This is deliberately not allowed to attest coverage. It can stage no
// persistence until real startup-to-shutdown coverage and dedup are proven.
class VerifiedBlockerEventSink final : public base::SupportsUserData::Data {
 public:
  explicit VerifiedBlockerEventSink(Profile* profile) : stats_(profile) {}
  void Observe(Profile* profile, double when) {
    stats_.Record(base::PassKey<VerifiedBlockerEventSink>(), profile, when);
  }
 private:
  BrowserWeeklyStats stats_;
};
namespace {
const char kSinkKey = 0;
void Deliver(base::WeakPtr<content::BrowserContext> context, double when) {
  if (!context || context->ShutdownStarted() ||
      IsProfileDirectoryMarkedForDeletion(context->GetPath())) return;
  auto* profile = Profile::FromBrowserContext(context.get());
  // Never derive an original profile from off-the-record activity.
  if (!profile || profile->IsOffTheRecord() || !profile->IsRegularProfile()) return;
  auto* sink = static_cast<VerifiedBlockerEventSink*>(profile->GetUserData(&kSinkKey));
  if (!sink) {
    auto created = std::make_unique<VerifiedBlockerEventSink>(profile);
    sink = created.get();
    profile->SetUserData(&kSinkKey, std::move(created));
  }
  sink->Observe(profile, when);  // No use of profile or sink after callback.
}
}  // namespace
void PostCandidateRuleBlock(base::WeakPtr<content::BrowserContext> context) {
  const double when = base::Time::Now().InMillisecondsFSinceUnixEpoch();
  // The decision object's callback may cancel/destroy it. Posting avoids
  // invoking preference observers during the enforcement callback.
  base::SequencedTaskRunner::GetCurrentDefault()->PostTask(
      FROM_HERE, base::BindOnce(&Deliver, std::move(context), when));
}
}  // namespace blanc::blocker_stats
