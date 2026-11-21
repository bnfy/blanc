#include "legacy_preparation.h"
#include "base/json/json_writer.h"
#include "base/values.h"
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
  const VaultContext context{std::string(64,'a'),std::string(64,'b'),true,false};
  auto source=Make(Ring("v10",Algorithm::kAES256GCM,3),"v10");
  auto current=Make(Ring("v11",Algorithm::kAES256GCM,7),"v11");
  KeyVault vault(current,context);
  const std::array<uint8_t,32> key={3,4,5,6};
  base::DictValue input; input.Set("enabled",true); input.Set("handle","Personal Account");
  input.Set("accountId",context.account_binding);
  input.Set("protectedKey",base::Base64Encode(*source->EncryptString(base::Base64Encode(key))));
  input.Set("deviceId","550e8400-e29b-41d4-a716-446655440000");
  input.Set("syncTabs",true); input.Set("syncSpaces",true); input.Set("erasurePending",true);
  input.Set("recoveryPromptDismissed",true); input.Set("origin","generated");
  input.Set("lastError","offline"); input.Set("lastSyncedAt",123.5);
  const std::string quota="{\"requestLog\":[100000,100001,100002],\"windowLimit\":3,\"backoffUntil\":400000}";
  const auto prepare=[&](const base::DictValue& value, std::string_view ledger) {
    return PrepareLegacyCore(*base::WriteJson(value),ledger,vault,source);
  };
  using S=LegacyPreparationStatus;
  auto result=prepare(input,quota); CHECK(result.status==S::kPreparedCore && result.core);
  const auto& state=*result.core;
  CHECK(state.enabled && state.sync_tabs && state.sync_spaces && state.erasure_pending && state.recovery_prompt_dismissed);
  CHECK_EQ(state.device_id,*input.FindString("deviceId")); CHECK_EQ(state.last_error,"offline");
  CHECK_EQ(state.last_synced_at,123.5); CHECK_EQ(state.quota.log.size(),3u); CHECK_EQ(state.quota.window_limit,3);
  auto recovered=vault.Unprotect(state.protected_key); CHECK(recovered.key);
  CHECK(crypto::SecureMemEqual(recovered.key->bytes(),key));
  CHECK(prepare(input,"").status==S::kMissingQuota);
  auto bad=input.Clone(); bad.Set("lastError","unmapped"); CHECK(prepare(bad,quota).status==S::kUnmappedStatus);
  bad=input.Clone(); bad.Set("key","synthetic-raw"); CHECK(prepare(bad,quota).status==S::kLegacyRawKey);
  bad=input.Clone(); bad.Set("deviceId",""); CHECK(prepare(bad,quota).status==S::kNeedsDeviceIdentity);
  bad=input.Clone(); bad.Set("enabled",false); CHECK(prepare(bad,quota).status==S::kDisabledReconciliation);
  bad=input.Clone(); bad.Set("accountId",std::string(64,'c')); CHECK(prepare(bad,quota).status==S::kDestinationAccountMismatch);
  auto denied=context; denied.off_the_record=true; KeyVault private_vault(current,denied);
  CHECK(PrepareLegacyCore(*base::WriteJson(input),quota,private_vault,source).status==S::kCredentialUnavailable);
  CHECK(PrepareLegacyCore(*base::WriteJson(input),quota,vault,nullptr).status==S::kCredentialUnavailable);
  std::cout<<"combined migration core preserves identity/consent/quota/erasure and refuses partial or mismatched credentials/status/device input\n";
}
