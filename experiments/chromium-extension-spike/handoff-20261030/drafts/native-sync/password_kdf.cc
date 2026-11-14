#include "password_kdf.h"
#include "base/strings/string_number_conversions.h"
#include "base/strings/utf_string_conversions.h"
#include "crypto/kdf.h"
#include "crypto/secure_util.h"
#include "third_party/icu/source/common/unicode/ustring.h"
#include <limits>

namespace blanc::sync {
namespace {
// ECMAScript WhiteSpace + LineTerminator, deliberately excluding U+0085 and
// U+180E. Chromium's generic Unicode whitespace set is not this wire contract.
bool Trimmed(char16_t c) {
  return (c >= 0x9 && c <= 0xd) || c == 0x20 || c == 0xa0 || c == 0x1680 ||
      (c >= 0x2000 && c <= 0x200a) || c == 0x2028 || c == 0x2029 ||
      c == 0x202f || c == 0x205f || c == 0x3000 || c == 0xfeff;
}
template <size_t N> struct SecretBytes {
  std::array<uint8_t, N> bytes{};
  ~SecretBytes() { crypto::SecureZeroBuffer(bytes); }
};
struct SecretText {
  std::string bytes;
  ~SecretText() { crypto::SecureZeroBuffer(base::as_writable_byte_span(bytes)); }
};
}  // namespace
std::optional<std::string> PasswordKdf::Salt(std::u16string_view handle) {
  while (!handle.empty() && Trimmed(handle.front())) handle.remove_prefix(1);
  while (!handle.empty() && Trimmed(handle.back())) handle.remove_suffix(1);
  if (handle.size() > static_cast<size_t>(std::numeric_limits<int32_t>::max()))
    return std::nullopt;
  UErrorCode error = U_ZERO_ERROR;
  const int32_t length = u_strToLower(nullptr, 0, handle.data(),
      static_cast<int32_t>(handle.size()), "", &error);
  if (error != U_BUFFER_OVERFLOW_ERROR && U_FAILURE(error)) return std::nullopt;
  std::u16string lowered(static_cast<size_t>(length), u'\0');
  error = U_ZERO_ERROR;
  u_strToLower(lowered.data(), length, handle.data(), static_cast<int32_t>(handle.size()), "", &error);
  if (U_FAILURE(error)) return std::nullopt;
  // As Node's Buffer.from(UTF16 string), unpaired surrogates become U+FFFD.
  return "blanc-sync:v1:" + base::UTF16ToUTF8(lowered);
}
std::optional<AccountKeys> PasswordKdf::Derive(std::u16string_view handle,
                                             std::u16string_view passphrase) {
  auto salt = Salt(handle);
  if (!salt) return std::nullopt;
  SecretText password{base::UTF16ToUTF8(passphrase)};
  SecretBytes<64> root;
  // Fixed v1 compatibility parameters, never accepted from server/input:
  // N=32768,r=8,p=1,96MiB maximum allocation; 64-byte root. The dedicated
  // passkey patch documents why these must match existing accounts/devices.
  crypto::kdf::Scrypt({32768, 8, 1, 96 * 1024 * 1024},
      base::as_byte_span(password.bytes), base::as_byte_span(*salt), root.bytes,
      crypto::SubtlePassKey());
  SecretBytes<32> id, enc;
  crypto::kdf::Hkdf(crypto::hash::kSha256, root.bytes, base::as_byte_span(*salt),
      base::as_byte_span(std::string_view("blanc-sync-id/v1")), id.bytes);
  crypto::kdf::Hkdf(crypto::hash::kSha256, root.bytes, base::as_byte_span(*salt),
      base::as_byte_span(std::string_view("blanc-sync-enc/v1")), enc.bytes);
  auto key = ProtocolKey::Import(enc.bytes);
  if (!key) return std::nullopt;
  return AccountKeys{base::HexEncodeLower(id.bytes), std::move(*key)};
}
}  // namespace blanc::sync
