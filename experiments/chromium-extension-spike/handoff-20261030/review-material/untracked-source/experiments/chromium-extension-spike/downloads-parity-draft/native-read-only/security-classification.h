#ifndef BLANC_DOWNLOADS_SECURITY_CLASSIFICATION_DRAFT_H_
#define BLANC_DOWNLOADS_SECURITY_CLASSIFICATION_DRAFT_H_

namespace blanc::downloads_projection {

// Presentation only; even kSafe is not a guarantee about file contents. This
// value never authorizes a native command. Callers
// must gather all fields from the same live item on its owning UI sequence,
// and re-resolve and recheck all policy and lifecycle conditions at dispatch.
// kSilentBlock must not be sent as a visible review prompt; native visibility
// and notification policy need separate verification before any UI projection.
enum class SecurityClassification { kSafe, kNeedsReview, kUnknown, kSilentBlock };
struct SecuritySnapshot {
  // Integer fields preserve future/unknown Chromium enum values. They are not
  // renderer-controlled and must not be cast back to an unchecked enum.
  int danger_type;
  int insecure_status;
  int danger_ui_pattern;
  bool is_dangerous;
  bool is_insecure;
};

SecurityClassification ClassifySecurity(const SecuritySnapshot& snapshot);

}  // namespace blanc::downloads_projection
#endif  // BLANC_DOWNLOADS_SECURITY_CLASSIFICATION_DRAFT_H_
