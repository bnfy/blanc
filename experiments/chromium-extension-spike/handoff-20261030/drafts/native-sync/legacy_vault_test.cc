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
  const std::array<uint8_t,32> bytes={9,8,7,6};
  for (auto algorithm : {Algorithm::kAES128CBC, Algorithm::kAES256GCM}) {
    auto source=Make(Ring("v10",algorithm,3),"v10");
    auto destination=Make(Ring("v11",Algorithm::kAES256GCM,7),"v11");
    KeyVault vault(destination,context);
    const auto legacy=base::Base64Encode(*source->EncryptString(base::Base64Encode(bytes)));
    const auto copy=legacy;
    // A read-only source ring can decrypt without selecting an encryption key.
    auto read_only=Make(Ring("v10",algorithm,3),"");
    CHECK(!read_only->IsEncryptionAvailable());
    auto from_read_only=vault.RewrapLegacy(read_only,legacy);
    CHECK(from_read_only.status==Status::kOk);
    auto read_only_key=vault.Unprotect(from_read_only.blob);
    CHECK(read_only_key.key && crypto::SecureMemEqual(read_only_key.key->bytes(),bytes));
    auto result=vault.RewrapLegacy(source,legacy); CHECK(result.status==Status::kOk);
    CHECK_EQ(copy,legacy); CHECK(!result.blob.empty()); CHECK(result.blob!=legacy);
    auto recovered=vault.Unprotect(result.blob); CHECK(recovered.status==Status::kOk);
    CHECK(crypto::SecureMemEqual(recovered.key->bytes(),bytes));
    auto other=context; other.account_binding=std::string(64,'c');
    CHECK(KeyVault(destination,other).Unprotect(result.blob).status==Status::kContextMismatch);
    other=context; other.off_the_record=true;
    CHECK(KeyVault(destination,other).RewrapLegacy(source,legacy).status==Status::kNotAllowed);
    CHECK(vault.RewrapLegacy(nullptr,legacy).status==Status::kEncryptionUnavailable);
    CHECK(vault.RewrapLegacy(source,result.blob).status!=Status::kOk);
    CHECK(vault.RewrapLegacy(source,legacy+"\n").status==Status::kDecryptionFailed);
    for (const auto& invalid : {std::string("x"),std::string(44,'!'),std::string(48,'A')}) {
      const auto bad=base::Base64Encode(*source->EncryptString(invalid));
      CHECK(vault.RewrapLegacy(source,bad).status==Status::kInvalidKey);
    }
    auto temporary=Ring("v11",Algorithm::kAES256GCM,7); temporary.emplace("v10",std::nullopt);
    CHECK(vault.RewrapLegacy(Make(std::move(temporary),"v11"),legacy).status==Status::kTemporarilyUnavailable);
  }
  const auto source=Make(Ring("v10",Algorithm::kAES128CBC),"v10");
  const auto empty_key=std::to_array<uint8_t>({0xd0,0xd0,0xec,0x9c,0x7d,0x77,0xd4,0x3a,0xc5,0x41,0x87,0xfa,0x48,0x18,0xd1,0x7f});
  std::array<uint8_t,16> iv; iv.fill(' ');
  auto weak=crypto::aes_cbc::Encrypt(empty_key,iv,base::as_byte_span(base::Base64Encode(bytes)));
  weak.insert(weak.begin(),{'v','1','0'});
  CHECK(source->DecryptData(weak)==base::Base64Encode(bytes));
  CHECK(KeyVault(source,context).RewrapLegacy(source,base::Base64Encode(weak)).status==Status::kDecryptionFailed);
  std::cout<<"legacy source-to-destination rewrap, contextual recovery, private/invalid/temporary refusal and empty-key fallback rejection passed\n";
}
