#include "wipe_policy.h"
#include "base/json/json_reader.h"

namespace blanc::sync {
WipeDecision DecideWipe(const WipeOutcome& outcome) {
  if (outcome.network_error) return {false, false, "wipe-offline"};
  if (outcome.status == 503 && outcome.body.size() <= 4096) {
    const auto json = base::JSONReader::ReadDict(outcome.body, base::JSON_PARSE_RFC, 8);
    const auto* error = json ? json->FindString("error") : nullptr;
    if (error && *error == "quota erasure pending")
      return {false, true, "erasure-pending"};
  }
  if (outcome.status >= 200 && outcome.status < 300) return {true, false, {}};
  if (outcome.status == 429) return {false, false, "rate-limited"};
  return {false, false, "wipe-failed:" + std::to_string(outcome.status)};
}
}  // namespace blanc::sync
