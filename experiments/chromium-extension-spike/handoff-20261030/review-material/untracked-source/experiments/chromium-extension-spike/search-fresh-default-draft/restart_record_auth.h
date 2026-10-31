#ifndef BLANC_RESTART_RECORD_AUTH_H_
#define BLANC_RESTART_RECORD_AUTH_H_
#include <array>
#include <cstdint>
#include <optional>
namespace blanc::fresh_default {
using AuthKey = std::array<uint8_t,32>;
using AuthTag = std::array<uint8_t,32>;
using Id128 = std::array<uint8_t,16>;
using Identity256 = std::array<uint8_t,32>;
enum class RecordPhase : uint8_t { kPending=1, kCommitted=2, kRetired=3 };
struct AuthenticatedRecord {
  Id128 installation{};
  Id128 profile{};
  Identity256 filesystem_identity{};
  uint64_t generation = 0;
  RecordPhase phase = RecordPhase::kPending;
};
struct TrustedAnchor {
  Id128 installation{};
  Id128 profile{};
  Identity256 filesystem_identity{};
  uint64_t generation = 0;
  RecordPhase phase = RecordPhase::kPending;
};
// Cryptographic integrity component only. A real coordinator must obtain the
// installation key and independently trusted, rollback-resistant anchor from
// OS-backed storage. These functions do not establish fresh-profile provenance.
std::optional<AuthTag> SealRecord(const AuthKey& key,const AuthenticatedRecord& record);
bool VerifyRecord(const AuthKey& key,const AuthenticatedRecord& record,
                  const AuthTag& tag,const TrustedAnchor& anchor);
}
#endif
