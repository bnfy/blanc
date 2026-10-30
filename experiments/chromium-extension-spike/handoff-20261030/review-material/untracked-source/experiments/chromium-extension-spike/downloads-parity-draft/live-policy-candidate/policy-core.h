#ifndef BLANC_DOWNLOADS_LIVE_POLICY_CORE_H_
#define BLANC_DOWNLOADS_LIVE_POLICY_CORE_H_

#include "../native-read-only/security-classification.h"

namespace blanc::downloads_projection {
// Evaluated on each browser-owned read or dispatch, never from renderer flags.
// Authorization, item lifetime, warning presentation and operation completion
// are separate responsibilities; these booleans are not an IPC capability.
enum class RowVisibility { kHidden, kMetadataPending, kVisible };
enum class Phase { kProgress, kComplete, kInterrupted, kCancelled, kUnknown };
struct LivePolicyInput {
  bool authorized_context = false;
  bool temporary = false;
  bool transient = false;
  bool trusted_extension = false;
  bool model_shows = false;
  bool has_name = false;
  bool has_target = false;
  bool has_url = false;
  Phase phase = Phase::kUnknown;
  SecurityClassification security = SecurityClassification::kUnknown;
  bool native_cancel = false;
  bool native_resume = false;
  bool native_open = false;
  bool native_show = false;
  bool allow_delete_history = false;
};
struct LivePolicy {
  RowVisibility visibility = RowVisibility::kHidden;
  SecurityClassification security = SecurityClassification::kUnknown;
  bool cancel = false;
  bool resume = false;
  bool open = false;
  bool show = false;
  bool clear_completed = false;
};
inline LivePolicy EvaluateLivePolicy(const LivePolicyInput& input) {
  LivePolicy result;
  result.security = input.security;
  if (!input.authorized_context || input.temporary || input.transient ||
      input.trusted_extension || !input.model_shows ||
      input.security == SecurityClassification::kSilentBlock ||
      input.phase == Phase::kUnknown) return result;

  // Unlike the native Downloads page, shipping shows an active row before the
  // destination exists. Keep incomplete rows visible as metadata-pending;
  // the renderer must use a localized generic label and never expose a path.
  result.visibility = input.has_name && input.has_target && input.has_url
                          ? RowVisibility::kVisible
                          : RowVisibility::kMetadataPending;
  result.cancel = input.phase == Phase::kProgress && input.native_cancel;
  // No unreviewed KEEP, DISCARD, bypass, retry, or warning override is exposed.
  if (result.visibility != RowVisibility::kVisible ||
      input.security != SecurityClassification::kSafe) return result;
  result.resume = input.phase == Phase::kInterrupted && input.native_resume;
  if (input.phase == Phase::kComplete) {
    result.open = input.native_open;
    result.show = input.native_show;
    result.clear_completed = input.allow_delete_history;
  }
  return result;
}
}  // namespace blanc::downloads_projection
#endif
