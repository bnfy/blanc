#include "restart_record_auth.h"
#include <algorithm>
#include <string_view>
#include <vector>
#include "crypto/hmac.h"
namespace blanc::fresh_default {
namespace {
template <typename T> bool Nonzero(const T& x) { return std::ranges::any_of(x,[](uint8_t v){return v!=0;}); }
bool Valid(const AuthKey& key,const AuthenticatedRecord& r) {
  return Nonzero(key)&&Nonzero(r.installation)&&Nonzero(r.profile)&&Nonzero(r.filesystem_identity)&&r.generation>0&&
      (r.phase==RecordPhase::kPending||r.phase==RecordPhase::kCommitted||r.phase==RecordPhase::kRetired);
}
std::vector<uint8_t> Encode(const AuthenticatedRecord& r) {
  std::vector<uint8_t> bytes;
  constexpr std::string_view domain="blanc-search-cohort-record-v1";
  for(char c:domain) bytes.push_back(static_cast<uint8_t>(c));
  bytes.push_back(0);  // Domain delimiter.
  for(uint8_t b:r.installation) bytes.push_back(b);
  for(uint8_t b:r.profile) bytes.push_back(b);
  for(uint8_t b:r.filesystem_identity) bytes.push_back(b);
  for(int shift=56;shift>=0;shift-=8) bytes.push_back(static_cast<uint8_t>(r.generation>>shift));
  bytes.push_back(static_cast<uint8_t>(r.phase));
  return bytes;
}
}
std::optional<AuthTag> SealRecord(const AuthKey& key,const AuthenticatedRecord& r) {
  if(!Valid(key,r))return std::nullopt;
  return crypto::hmac::SignSha256(key,Encode(r));
}
bool VerifyRecord(const AuthKey& key,const AuthenticatedRecord& r,const AuthTag& tag,const TrustedAnchor& anchor) {
  if(!Valid(key,r)||r.installation!=anchor.installation||r.profile!=anchor.profile||
      r.filesystem_identity!=anchor.filesystem_identity||r.generation!=anchor.generation||r.phase!=anchor.phase)return false;
  return crypto::hmac::VerifySha256(key,Encode(r),tag);
}
}
