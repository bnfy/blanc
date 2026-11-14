#include "key_vault.h"
#include "base/at_exit.h"
#include "base/base64.h"
#include "base/check.h"
#include "base/memory/scoped_refptr.h"
#include "components/os_crypt/async/common/algorithm.mojom.h"
#include "crypto/aes_cbc.h"
#include "crypto/secure_util.h"
#include <iostream>
using namespace blanc::sync;
using Encryptor = os_crypt_async::Encryptor;
using Algorithm = os_crypt_async::mojom::Algorithm;
using Status = KeyVault::Status;
class FixtureEncryptor : public Encryptor {
 public:
  FixtureEncryptor(KeyRing keys, const std::string& provider)
      : Encryptor(std::move(keys), provider) {}
};
Encryptor::KeyRing Ring(std::string tag, Algorithm algorithm, uint8_t byte = 0) {
  Encryptor::KeyRing ring;
  const std::vector<uint8_t> key(algorithm == Algorithm::kAES128CBC ? 16 : 32, byte);
  ring.emplace(tag, Encryptor::Key(key, algorithm)); return ring;
}
scoped_refptr<Encryptor> Make(Encryptor::KeyRing keys, const std::string& provider) {
  return base::MakeRefCounted<FixtureEncryptor>(std::move(keys), provider);
}
int main() {
  base::AtExitManager at_exit;
  const VaultContext context{std::string(64, 'a'), std::string(64, 'b'), true, false};
  const std::array<uint8_t, 32> bytes = {1,2,3,4};
  auto key = ProtocolKey::Import(bytes); CHECK(key);
  KeyVault missing(nullptr, context); CHECK(missing.availability() == Status::kEncryptionUnavailable);
  CHECK(missing.Protect(*key).blob.empty());
  KeyVault unknown(Make(Ring("bad", Algorithm::kAES256GCM), "bad"), context);
  CHECK(unknown.availability() == Status::kStoreUnavailable);
  CHECK(unknown.Protect(*key).blob.empty());
  for (auto algorithm : {Algorithm::kAES128CBC, Algorithm::kAES256GCM}) {
    const auto encryptor = Make(Ring("v10", algorithm), "v10");
    KeyVault vault(encryptor, context); CHECK(vault.availability() == Status::kOk);
    const auto protected_key = vault.Protect(*key); CHECK(protected_key.status == Status::kOk);
    CHECK(!protected_key.blob.empty()); CHECK(protected_key.blob != base::Base64Encode(bytes));
    auto restored = vault.Unprotect(protected_key.blob); CHECK(restored.status == Status::kOk);
    CHECK(crypto::SecureMemEqual(restored.key->bytes(), bytes)); CHECK(!restored.should_reencrypt);
    auto wrong = context; wrong.account_binding = std::string(64, 'c');
    CHECK(KeyVault(encryptor, wrong).Unprotect(protected_key.blob).status == Status::kContextMismatch);
    wrong = context; wrong.profile_binding = std::string(64, 'c');
    CHECK(KeyVault(encryptor, wrong).Unprotect(protected_key.blob).status == Status::kContextMismatch);
    wrong = context; wrong.off_the_record = true;
    CHECK(KeyVault(encryptor, wrong).Protect(*key).status == Status::kNotAllowed);
    wrong = context; wrong.personal_profile = false;
    CHECK(KeyVault(encryptor, wrong).Protect(*key).status == Status::kNotAllowed);
    CHECK(vault.Unprotect("").status == Status::kMissing);
    for (const auto& bad : {std::string("!"), std::string(5501, 'a'),
                           protected_key.blob + "\n", base::Base64Encode(bytes)})
      CHECK(vault.Unprotect(bad).status != Status::kOk);
  }
  // Demonstrate the exact upstream legacy fallback, then prove the new strict
  // entry point and Sync vault both reject that same ciphertext.
  const auto cbc = Make(Ring("v10", Algorithm::kAES128CBC), "v10");
  const auto empty_key = std::to_array<uint8_t>({0xd0,0xd0,0xec,0x9c,0x7d,0x77,0xd4,0x3a,
                                               0xc5,0x41,0x87,0xfa,0x48,0x18,0xd1,0x7f});
  const auto plain = "blanc-sync-key:v1:" + context.profile_binding + ":" +
      context.account_binding + ":" + base::Base64Encode(bytes);
  std::array<uint8_t, 16> iv; iv.fill(' ');
  auto weak = crypto::aes_cbc::Encrypt(empty_key, iv, base::as_byte_span(plain));
  weak.insert(weak.begin(), {'v','1','0'});
  CHECK(cbc->DecryptData(weak) == plain);
  CHECK(!cbc->DecryptDataStrict(weak));
  CHECK(KeyVault(cbc, context).Unprotect(base::Base64Encode(weak)).status == Status::kDecryptionFailed);
  // A genuine available older provider still works and signals re-wrapping.
  const auto old = Make(Ring("v10", Algorithm::kAES256GCM), "v10");
  auto ring = Ring("v10", Algorithm::kAES256GCM);
  auto newer = Ring("v11", Algorithm::kAES256GCM, 7); ring.merge(newer);
  const auto current = Make(std::move(ring), "v11");
  const auto blob = KeyVault(old, context).Protect(*key).blob;
  auto rotated = KeyVault(current, context).Unprotect(blob);
  CHECK(rotated.status == Status::kOk && rotated.should_reencrypt);
  const auto rewrapped = KeyVault(current, context).Protect(*rotated.key);
  CHECK(rewrapped.status == Status::kOk);
  CHECK(!KeyVault(current, context).Unprotect(rewrapped.blob).should_reencrypt);
  auto temporary = Ring("v11", Algorithm::kAES256GCM, 7);
  temporary.emplace("v10", std::nullopt);
  CHECK(KeyVault(Make(std::move(temporary), "v11"), context).Unprotect(blob).status == Status::kTemporarilyUnavailable);
  const auto tag = [](const char* text) { return base::as_byte_span(std::string_view(text)); };
  CHECK(!SecureProviderTag(VaultPlatform::kLinux, tag("v10")));
  CHECK(SecureProviderTag(VaultPlatform::kLinux, tag("v11")));
  CHECK(SecureProviderTag(VaultPlatform::kLinux, tag("v12")));
  CHECK(SecureProviderTag(VaultPlatform::kWindows, tag("v10")));
  CHECK(SecureProviderTag(VaultPlatform::kWindows, tag("v20")));
  CHECK(!SecureProviderTag(VaultPlatform::kWindows, tag("v11")));
  CHECK(!SecureProviderTag(VaultPlatform::kUnsupported, tag("v10")));
  std::cout << "vault codec, context binding, fallback refusal, strict CBC, provider rotation and availability passed\n";
}
