#include "key_vault.h"
#include "base/base64.h"
#include "build/build_config.h"
#include "crypto/secure_util.h"
#include <algorithm>

namespace blanc::sync {
namespace {
VaultPlatform HostPlatform() {
#if BUILDFLAG(IS_MAC)
  return VaultPlatform::kMac;
#elif BUILDFLAG(IS_WIN)
  return VaultPlatform::kWindows;
#elif BUILDFLAG(IS_LINUX)
  return VaultPlatform::kLinux;
#else
  return VaultPlatform::kUnsupported;
#endif
}
bool Binding(const std::string& value) {
  return value.size() == 64 && std::all_of(value.begin(), value.end(), [](char c) {
    return (c >= 'a' && c <= 'f') || (c >= '0' && c <= '9');
  });
}
struct ClearText {
  std::string bytes;
  ~ClearText() { crypto::SecureZeroBuffer(base::as_writable_byte_span(bytes)); }
};
}  // namespace
bool SecureProviderTag(VaultPlatform platform, base::span<const uint8_t> ciphertext) {
  if (ciphertext.size() < 3) return false;
  const std::string tag(ciphertext.begin(), ciphertext.begin() + 3);
  switch (platform) {
    case VaultPlatform::kMac: return tag == "v10" || tag == "v11";
    case VaultPlatform::kWindows: return tag == "v10" || tag == "v20";
    case VaultPlatform::kLinux: return tag == "v11" || tag == "v12";
    case VaultPlatform::kUnsupported: return false;
  }
  return false;
}
KeyVault::KeyVault(scoped_refptr<os_crypt_async::Encryptor> encryptor, VaultContext context)
    : encryptor_(std::move(encryptor)), context_(std::move(context)) {
  if (!context_.personal_profile || context_.off_the_record ||
      !Binding(context_.profile_binding) || !Binding(context_.account_binding)) return;
  if (!encryptor_ || !encryptor_->IsEncryptionAvailable()) {
    availability_ = Status::kEncryptionUnavailable; return;
  }
  // The shared Linux encryptor can advertise available encryption with a
  // public-constant v10 fallback. Discover the immutable selected provider with
  // a non-secret probe before ever passing a Sync key to it.
  const auto probe = encryptor_->EncryptString("blanc-sync-provider-probe:v1");
  if (!probe || probe->empty()) { availability_ = Status::kEncryptionFailed; return; }
  availability_ = SecureProviderTag(HostPlatform(), *probe)
      ? Status::kOk : Status::kStoreUnavailable;
}
std::string KeyVault::Prefix() const {
  return "blanc-sync-key:v1:" + context_.profile_binding + ":" + context_.account_binding + ":";
}
KeyVault::Protected KeyVault::Protect(const ProtocolKey& key) const {
  if (availability_ != Status::kOk) return {availability_, {}};
  if (key.bytes().size() != 32) return {Status::kInvalidKey, {}};
  ClearText encoded{base::Base64Encode(key.bytes())};
  ClearText plain{Prefix()};
  plain.bytes.append(encoded.bytes);
  const auto encrypted = encryptor_->EncryptString(plain.bytes);
  if (!encrypted || encrypted->empty() || encrypted->size() > 4096)
    return {Status::kEncryptionFailed, {}};
  if (!SecureProviderTag(HostPlatform(), *encrypted)) return {Status::kStoreUnavailable, {}};
  return {Status::kOk, base::Base64Encode(*encrypted)};
}
KeyVault::Protected KeyVault::RewrapLegacy(scoped_refptr<os_crypt_async::Encryptor> source,
                                         const std::string& blob) const {
  if (availability_ != Status::kOk) return {availability_, {}};
  // Source migration is decrypt-only. Its read-only provider must not need an
  // encryption key or create a replacement source Keychain item on a miss.
  if (!source) return {Status::kEncryptionUnavailable, {}};
  if (blob.empty()) return {Status::kMissing, {}};
  if (blob.size() > 5500) return {Status::kDecryptionFailed, {}};
  const auto encrypted = base::Base64Decode(blob);
  if (!encrypted || encrypted->size() > 4096 || base::Base64Encode(*encrypted) != blob ||
      !SecureProviderTag(HostPlatform(), *encrypted)) return {Status::kDecryptionFailed, {}};
  os_crypt_async::Encryptor::DecryptFlags flags;
  auto decrypted = source->DecryptDataStrict(*encrypted, &flags);
  if (!decrypted) return {flags.temporarily_unavailable
      ? Status::kTemporarilyUnavailable : Status::kDecryptionFailed, {}};
  ClearText plain{std::move(*decrypted)};
  // Released safeStorage plaintext is a canonical base64 32-byte Sync key,
  // not the contextual native envelope. Never accept one format as the other.
  if (plain.bytes.size() != 44) return {Status::kInvalidKey, {}};
  auto bytes = base::Base64Decode(plain.bytes);
  if (!bytes) return {Status::kInvalidKey, {}};
  ClearText canonical{base::Base64Encode(*bytes)};
  auto key = canonical.bytes == plain.bytes ? ProtocolKey::Import(*bytes) : std::nullopt;
  crypto::SecureZeroBuffer(*bytes);
  if (!key) return {Status::kInvalidKey, {}};
  return Protect(*key);
}
KeyVault::Unprotected KeyVault::Unprotect(const std::string& blob) const {
  if (availability_ != Status::kOk) return {availability_, {}};
  if (blob.empty()) return {Status::kMissing, {}};
  if (blob.size() > 5500) return {Status::kDecryptionFailed, {}};
  const auto encrypted = base::Base64Decode(blob);
  if (!encrypted || encrypted->size() > 4096 || base::Base64Encode(*encrypted) != blob ||
      !SecureProviderTag(HostPlatform(), *encrypted)) return {Status::kDecryptionFailed, {}};
  os_crypt_async::Encryptor::DecryptFlags flags;
  auto decrypted = encryptor_->DecryptDataStrict(*encrypted, &flags);
  if (!decrypted) return {flags.temporarily_unavailable
      ? Status::kTemporarilyUnavailable : Status::kDecryptionFailed, {}};
  ClearText plain{std::move(*decrypted)};
  const auto prefix = Prefix();
  if (!plain.bytes.starts_with(prefix)) return {Status::kContextMismatch, {}};
  const std::string_view encoded(plain.bytes.data() + prefix.size(), plain.bytes.size() - prefix.size());
  if (encoded.size() != 44) return {Status::kInvalidKey, {}};
  auto bytes = base::Base64Decode(encoded);
  if (!bytes) return {Status::kInvalidKey, {}};
  ClearText canonical_text{base::Base64Encode(*bytes)};
  const bool canonical = canonical_text.bytes == encoded;
  auto key = canonical ? ProtocolKey::Import(*bytes) : std::nullopt;
  crypto::SecureZeroBuffer(*bytes);
  if (!key) return {Status::kInvalidKey, {}};
  return {Status::kOk, std::move(key), flags.should_reencrypt};
}
}  // namespace blanc::sync
