#ifndef BLANC_SYNC_PROTOCOL_CIPHER_H_
#define BLANC_SYNC_PROTOCOL_CIPHER_H_
#include <array>
#include <optional>
#include <string>
#include "base/containers/span.h"

namespace blanc::sync {
// Internal, move-only key container. No renderer serialization or logging API.
// Import is for the future qualified vault/KDF path, not a plaintext key store.
class ProtocolKey {
 public:
  static std::optional<ProtocolKey> Import(base::span<const uint8_t> bytes);
  ProtocolKey(ProtocolKey&& other) noexcept;
  ProtocolKey& operator=(ProtocolKey&& other) noexcept;
  ProtocolKey(const ProtocolKey&) = delete;
  ProtocolKey& operator=(const ProtocolKey&) = delete;
  ~ProtocolKey();
  base::span<const uint8_t> bytes() const {
    return valid_ ? base::span<const uint8_t>(bytes_) : base::span<const uint8_t>();
  }
 private:
  explicit ProtocolKey(base::span<const uint8_t> bytes);
  std::array<uint8_t, 32> bytes_;
  bool valid_ = true;
};
struct Envelope {
  int version = 1;
  std::string iv, ct, tag;
};
// Exact valid v1 wire format: AES-256-GCM, random 12-byte IV, no AAD,
// separate 16-byte authentication tag and canonical padded base64 fields.
// Service's released serialized-blob ceiling is 512KiB. Malformed envelopes,
// unsupported versions, noncanonical encodings and failed tags return no data.
std::optional<Envelope> Encrypt(const ProtocolKey& key, std::string_view plaintext);
std::optional<std::string> Decrypt(const ProtocolKey& key, const Envelope& blob);
}  // namespace blanc::sync
#endif
