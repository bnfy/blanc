#ifndef BLANC_SYNC_WIPE_POLICY_H_
#define BLANC_SYNC_WIPE_POLICY_H_
#include <string>

namespace blanc::sync {
struct WipeOutcome {
  bool network_error = false;
  int status = 0;
  std::string body;
};
struct WipeDecision {
  bool clear_credentials;
  bool erasure_pending;
  std::string error;
};
// Composes released responseCode + wipeDecision. No I/O and no mutation.
// Only an explicit503 JSON signal means durable erasure is pending. Neither
// a failed DELETE nor that pending signal authorizes clearing local identity.
WipeDecision DecideWipe(const WipeOutcome& outcome);
}  // namespace blanc::sync
#endif
