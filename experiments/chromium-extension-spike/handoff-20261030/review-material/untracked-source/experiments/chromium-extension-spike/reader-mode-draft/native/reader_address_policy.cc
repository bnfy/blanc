#include "reader_address_policy.h"

#include <array>

namespace blanc::reader {
namespace {
struct V4Prefix { std::array<uint8_t, 4> bytes; unsigned bits; };
constexpr V4Prefix kV4Blocked[] = {
    {{0,0,0,0},8}, {{10,0,0,0},8}, {{100,64,0,0},10}, {{127,0,0,0},8},
    {{169,254,0,0},16}, {{172,16,0,0},12}, {{192,0,0,0},24},
    {{192,0,2,0},24}, {{192,88,99,0},24}, {{192,168,0,0},16},
    {{198,18,0,0},15}, {{198,51,100,0},24}, {{203,0,113,0},24},
    {{224,0,0,0},4}, {{240,0,0,0},4}};
struct V6Prefix { std::array<uint8_t, 16> bytes; unsigned bits; };
constexpr V6Prefix kV6Blocked[] = {
    {{0},128}, {{0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1},128},
    {{0,0,0,0,0,0,0,0,0,0,0xff,0xff},96},
    {{0x00,0x64,0xff,0x9b},96}, {{0x00,0x64,0xff,0x9b,0,1},48},
    {{0x01,0x00},64}, {{0x20,0x01},23}, {{0x20,0x01,0x0d,0xb8},32},
    {{0x20,0x02},16}, {{0xfc},7}, {{0xfe,0x80},10}, {{0xfe,0xc0},10}, {{0xff},8}};
bool Matches(std::span<const uint8_t> address, std::span<const uint8_t> prefix, unsigned bits) {
  const auto full = bits / 8;
  for (unsigned i = 0; i < full; ++i) if (address[i] != prefix[i]) return false;
  const unsigned rest = bits % 8;
  if (!rest) return true;
  const auto mask = static_cast<uint8_t>(0xff << (8 - rest));
  return (address[full] & mask) == (prefix[full] & mask);
}
}  // namespace
bool IsReaderPublicAddress(std::span<const uint8_t> address) {
  if (address.size() == 4) {
    for (const auto& p : kV4Blocked) if (Matches(address,p.bytes,p.bits)) return false;
    return true;
  }
  if (address.size() == 16) {
    for (const auto& p : kV6Blocked) if (Matches(address,p.bytes,p.bits)) return false;
    return true;
  }
  return false;
}
bool AreReaderAddressesPublic(const std::vector<std::vector<uint8_t>>& addresses) {
  if (addresses.empty()) return false;
  for (const auto& address : addresses) if (!IsReaderPublicAddress(address)) return false;
  return true;
}
}  // namespace blanc::reader
