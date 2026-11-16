#include "protocol_cipher.h"
#include "base/base64.h"
#include "base/json/json_writer.h"
#include "base/strings/string_util.h"
#include "base/values.h"
#include "crypto/aead.h"
#include "crypto/random.h"
#include "crypto/secure_util.h"

namespace blanc::sync {
namespace {
constexpr size_t kMaxBlobBytes = 512 * 1024;
bool WithinLimit(const Envelope& blob) {
  if (blob.iv.size() > 16 || blob.tag.size() > 24 || blob.ct.size() > kMaxBlobBytes)
    return false;
  base::DictValue json;
  json.Set("v", blob.version); json.Set("iv", blob.iv);
  json.Set("ct", blob.ct); json.Set("tag", blob.tag);
  const auto encoded = base::WriteJson(json);
  return encoded && encoded->size() <= kMaxBlobBytes;
}
std::optional<std::vector<uint8_t>> DecodeCanonical(const std::string& text) {
  auto bytes = base::Base64Decode(text);
  if (!bytes || base::Base64Encode(*bytes) != text) return std::nullopt;
  return bytes;
}
}  // namespace
ProtocolKey::ProtocolKey(base::span<const uint8_t> bytes) {
  std::copy(bytes.begin(), bytes.end(), bytes_.begin());
}
std::optional<ProtocolKey> ProtocolKey::Import(base::span<const uint8_t> bytes) {
  if (bytes.size() != 32) return std::nullopt;
  return ProtocolKey(bytes);
}
ProtocolKey::ProtocolKey(ProtocolKey&& other) noexcept
    : bytes_(other.bytes_), valid_(other.valid_) {
  crypto::SecureZeroBuffer(other.bytes_);
  other.valid_ = false;
}
ProtocolKey& ProtocolKey::operator=(ProtocolKey&& other) noexcept {
  if (this != &other) {
    crypto::SecureZeroBuffer(bytes_); bytes_ = other.bytes_;
    valid_ = other.valid_; other.valid_ = false;
    crypto::SecureZeroBuffer(other.bytes_);
  }
  return *this;
}
ProtocolKey::~ProtocolKey() { crypto::SecureZeroBuffer(bytes_); }
std::optional<Envelope> Encrypt(const ProtocolKey& key, std::string_view plaintext) {
  if (key.bytes().size() != 32 || plaintext.size() > kMaxBlobBytes ||
      !base::IsStringUTF8AllowingNoncharacters(plaintext))
    return std::nullopt;
  const auto iv = crypto::RandBytesAsArray<12>();
  auto encrypted = crypto::aead::Seal(crypto::aead::AES_256_GCM, key.bytes(),
      base::as_byte_span(plaintext), iv, {});
  if (encrypted.size() != plaintext.size() + 16) return std::nullopt;
  Envelope blob;
  blob.iv = base::Base64Encode(iv);
  const auto bytes = base::span<const uint8_t>(encrypted);
  blob.ct = base::Base64Encode(bytes.first(plaintext.size()));
  blob.tag = base::Base64Encode(bytes.last<16>());
  return WithinLimit(blob) ? std::optional<Envelope>(std::move(blob)) : std::nullopt;
}
std::optional<std::string> Decrypt(const ProtocolKey& key, const Envelope& blob) {
  if (key.bytes().size() != 32 || blob.version != 1 || !WithinLimit(blob))
    return std::nullopt;
  auto iv = DecodeCanonical(blob.iv), ct = DecodeCanonical(blob.ct),
       tag = DecodeCanonical(blob.tag);
  if (!iv || iv->size() != 12 || !ct || !tag || tag->size() != 16)
    return std::nullopt;
  ct->insert(ct->end(), tag->begin(), tag->end());
  auto clear = crypto::aead::Open(crypto::aead::AES_256_GCM, key.bytes(), *ct, *iv, {});
  if (!clear) return std::nullopt;
  std::string text(clear->begin(), clear->end());
  crypto::SecureZeroBuffer(*clear);
  if (!base::IsStringUTF8AllowingNoncharacters(text)) {
    crypto::SecureZeroBuffer(base::as_writable_byte_span(text));
    return std::nullopt;
  }
  return text;
}
}  // namespace blanc::sync
