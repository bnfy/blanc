#ifndef BLANC_QUIET_TABS_ELIGIBILITY_H_
#define BLANC_QUIET_TABS_ELIGIBILITY_H_

#include <array>
#include <cstddef>
#include <cstdint>

namespace blanc::quiet {
// Unknown is never equivalent to a negative answer. These are observations
// from native state and the bounded all-frame probe, not renderer assertions.
enum class Observation { kUnknown, kNo, kYes };
enum class Hazard : size_t {
  kActive, kVisiblePane, kLoading, kTransitioning, kPinned, kMuted,
  kUsedMedia, kCapturing, kDisplayShare, kAdopted, kDeepScrolled,
  kInheritedPolicyRequiresLiveRenderer, kPermissionPending, kLiveOpenerFamily, kDirty,
  kBeforeUnload, kCount
};
struct Snapshot {
  uint64_t window = 0;
  uint64_t tab = 0;
  uint64_t document = 0;
  std::array<Observation, static_cast<size_t>(Hazard::kCount)> hazards{};
  Observation restorable_http_history = Observation::kUnknown;
  Observation native_eligible = Observation::kUnknown;
  Observation storage_preserved = Observation::kUnknown;
  size_t retained_snapshots = 50;
};
enum class Verdict { kEligible, kUnknown, kProtected, kChanged, kAtCapacity };
constexpr Verdict Assess(const Snapshot& value) {
  if (!value.window || !value.tab || !value.document) return Verdict::kUnknown;
  if (value.retained_snapshots >= 50) return Verdict::kAtCapacity;
  for (auto hazard : value.hazards) {
    if (hazard == Observation::kYes) return Verdict::kProtected;
    if (hazard == Observation::kUnknown) return Verdict::kUnknown;
  }
  for (auto proof : {value.restorable_http_history, value.native_eligible,
                     value.storage_preserved}) {
    if (proof == Observation::kUnknown) return Verdict::kUnknown;
    if (proof == Observation::kNo) return Verdict::kProtected;
  }
  return Verdict::kEligible;
}
// Call immediately before discard, after the asynchronous all-frame probe.
// Never let a result for an old owner/document authorize a newer document.
constexpr Verdict Revalidate(const Snapshot& probed, const Snapshot& current) {
  if (probed.window != current.window || probed.tab != current.tab ||
      probed.document != current.document) return Verdict::kChanged;
  const auto first = Assess(probed);
  return first == Verdict::kEligible ? Assess(current) : first;
}
}  // namespace blanc::quiet
#endif
