#include "policy-core.h"
#include <cassert>
using namespace blanc::downloads_projection;
int main() {
  LivePolicyInput x;
  x.authorized_context = x.model_shows = true;
  x.phase = Phase::kProgress;
  x.native_cancel = true;
  auto p = EvaluateLivePolicy(x);
  assert(p.visibility == RowVisibility::kMetadataPending && p.cancel);
  assert(!p.open && !p.show && !p.resume && !p.clear_completed);
  x.security = SecurityClassification::kNeedsReview;
  assert(EvaluateLivePolicy(x).cancel);  // cancel does not bypass a warning
  x.security = SecurityClassification::kSilentBlock;
  p = EvaluateLivePolicy(x);
  assert(p.visibility == RowVisibility::kHidden && !p.cancel);
  x.security = SecurityClassification::kSafe;
  x.has_name = x.has_target = x.has_url = true;
  x.phase = Phase::kComplete;
  x.native_open = x.native_show = x.allow_delete_history = true;
  x.warning_free_history = true;
  p = EvaluateLivePolicy(x);
  assert(p.visibility == RowVisibility::kVisible && p.open && p.show && p.clear_completed);
  x.security = SecurityClassification::kUnknown;
  p = EvaluateLivePolicy(x);
  assert(!p.open && !p.show && p.clear_completed);
  x.warning_free_history = false;
  assert(!EvaluateLivePolicy(x).clear_completed);
  x.warning_free_history = true;
  x.security = SecurityClassification::kSafe;
  x.allow_delete_history = false;
  assert(!EvaluateLivePolicy(x).clear_completed);
  x.phase = Phase::kInterrupted;
  x.native_resume = true;
  p = EvaluateLivePolicy(x);
  assert(p.resume && !p.cancel && !p.open && !p.show);
  x.native_resume = false;
  assert(!EvaluateLivePolicy(x).resume);
  x.temporary = true;
  assert(EvaluateLivePolicy(x).visibility == RowVisibility::kHidden);
  x.temporary = false; x.transient = true;
  assert(EvaluateLivePolicy(x).visibility == RowVisibility::kHidden);
  x.transient = false; x.trusted_extension = true;
  assert(EvaluateLivePolicy(x).visibility == RowVisibility::kHidden);
  x.trusted_extension = false; x.model_shows = false;
  assert(EvaluateLivePolicy(x).visibility == RowVisibility::kHidden);
  x.model_shows = true; x.authorized_context = false;
  assert(EvaluateLivePolicy(x).visibility == RowVisibility::kHidden);
  x.authorized_context = true; x.phase = Phase::kUnknown;
  assert(EvaluateLivePolicy(x).visibility == RowVisibility::kHidden);
}
