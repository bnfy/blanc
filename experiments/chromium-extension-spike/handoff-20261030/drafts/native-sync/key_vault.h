#ifndef BLANC_SYNC_KEY_VAULT_H_
#define BLANC_SYNC_KEY_VAULT_H_
#include "protocol_cipher.h"
#include "base/memory/scoped_refptr.h"
#include "components/os_crypt/async/common/encryptor.h"

namespace blanc::sync {
enum class VaultPlatform { kMac, kWindows, kLinux, kUnsupported };
// Internal policy helper; actual vault platform always comes from build flags.
bool SecureProviderTag(VaultPlatform platform, base::span<const uint8_t> ciphertext);
struct VaultContext {
  std::string profile_binding, account_binding;  // native-owned64lowerhex IDs
  bool personal_profile = false;
  bool off_the_record = true;
};
class KeyVault {
 public:
  enum class Status { kOk, kNotAllowed, kEncryptionUnavailable, kStoreUnavailable,
    kInvalidKey, kMissing, kEncryptionFailed, kDecryptionFailed,
    kContextMismatch, kTemporarilyUnavailable };
  struct Protected { Status status; std::string blob; };
  struct Unprotected {
    Status status;
    std::optional<ProtocolKey> key;
    bool should_reencrypt = false;
  };
  // Caller obtains immutable Encryptor asynchronously from native OSCryptAsync;
  // never accept one, or the context, from a renderer. This codec does not
  // initialize credential providers; supplied Encryptor can use platform crypto.
  // Actual credential-provider initialization belongs to the profile service.
  KeyVault(scoped_refptr<os_crypt_async::Encryptor> encryptor, VaultContext context);
  Status availability() const { return availability_; }
  bool MatchesAccount(const std::string& account) const {
    return context_.account_binding == account;
  }
  Protected Protect(const ProtocolKey& key) const;
  Unprotected Unprotect(const std::string& blob) const;
  // Native migration broker supplies the source app's qualified Encryptor.
  // No source/context authenticity is inferred from opaque ciphertext alone.
  // Returns only destination-context ciphertext, never a raw imported key.
  Protected RewrapLegacy(scoped_refptr<os_crypt_async::Encryptor> source,
                         const std::string& blob) const;
 private:
  scoped_refptr<os_crypt_async::Encryptor> encryptor_;
  VaultContext context_;
  Status availability_ = Status::kNotAllowed;
  std::string Prefix() const;
};
}  // namespace blanc::sync
#endif
