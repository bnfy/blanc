// Address-only preflight. This does not resolve hosts or pin network requests.
#ifndef BLANC_READER_ADDRESS_POLICY_H_
#define BLANC_READER_ADDRESS_POLICY_H_
#include <cstdint>
#include <span>
#include <vector>
namespace blanc::reader {
bool IsReaderPublicAddress(std::span<const uint8_t> bytes);
bool AreReaderAddressesPublic(const std::vector<std::vector<uint8_t>>& addresses);
}  // namespace blanc::reader
#endif  // BLANC_READER_ADDRESS_POLICY_H_
