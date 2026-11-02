#include "legacy_backup.h"
#include "base/json/json_reader.h"
#include "base/json/json_writer.h"
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
int main(){
 base::AtExitManager at_exit;
 const std::string source(64,'d');
 const VaultContext context{std::string(64,'a'),source,true,false};
 for(auto algorithm:{Algorithm::kAES128CBC,Algorithm::kAES256GCM}) {
  auto provider=Make(Ring("v10",algorithm,3),"v10");KeyVault vault(provider,context);
  LegacySnapshot snapshot;snapshot.sync_json="SYNTHETIC-SECRET-CANARY";
  snapshot.shared_json=std::string(600000,'x');snapshot.shared_json[2]='\0';snapshot.shared_json[3]=char(0xff);
  snapshot.sync_sha256="stale-untrusted-hash";
  auto sealed=SealLegacyBackup(snapshot,vault,source);CHECK(sealed);CHECK(sealed->find(snapshot.sync_json)==std::string::npos);
  auto restored=OpenLegacyBackup(*sealed,vault,source);CHECK(restored);
  CHECK_EQ(restored->sync_json,snapshot.sync_json);CHECK_EQ(restored->shared_json,snapshot.shared_json);
  CHECK_EQ(restored->sync_sha256.size(),64u);CHECK_NE(restored->sync_sha256,snapshot.sync_sha256);
  CHECK(!OpenLegacyBackup(*sealed,vault,std::string(64,'e')));
  auto wrong=context;wrong.profile_binding=std::string(64,'c');
  KeyVault wrong_vault(provider,wrong);CHECK(!OpenLegacyBackup(*sealed,wrong_vault,source));
  for(const char* name:{"data","nonce","wrappedKey"}) {
   auto record=base::JSONReader::ReadDict(*sealed,base::JSON_PARSE_RFC);CHECK(record);
   auto value=*record->FindString(name);value[0]=value[0]=='A'?'B':'A';record->Set(name,value);
   CHECK(!OpenLegacyBackup(*base::WriteJson(*record),vault,source));
  }
  auto record=base::JSONReader::ReadDict(*sealed,base::JSON_PARSE_RFC);record->Set("version",2);
  CHECK(!OpenLegacyBackup(*base::WriteJson(*record),vault,source));
  record=base::JSONReader::ReadDict(*sealed,base::JSON_PARSE_RFC);record->Set("kind","endpoint-wire-envelope");
  CHECK(!OpenLegacyBackup(*base::WriteJson(*record),vault,source));
  auto second=SealLegacyBackup(snapshot,vault,source);CHECK(second);
  record=base::JSONReader::ReadDict(*sealed,base::JSON_PARSE_RFC);
  auto other=base::JSONReader::ReadDict(*second,base::JSON_PARSE_RFC);
  record->Set("wrappedKey",*other->FindString("wrappedKey"));
  CHECK(!OpenLegacyBackup(*base::WriteJson(*record),vault,source));
  auto private_context=context;private_context.off_the_record=true;KeyVault private_vault(provider,private_context);
  CHECK(!SealLegacyBackup(snapshot,private_vault,source));
  snapshot.sync_json=std::string(65537,'x');CHECK(!SealLegacyBackup(snapshot,vault,source));
 }
 auto provider=Make(Ring("v10",Algorithm::kAES256GCM,3),"v10");KeyVault vault(provider,context);
 LegacySnapshot max;max.sync_json=std::string(65536,'a');max.shared_json=std::string(8*1024*1024,'b');
 auto sealed=SealLegacyBackup(max,vault,source);CHECK(sealed);auto opened=OpenLegacyBackup(*sealed,vault,source);
 CHECK(opened && opened->sync_json==max.sync_json && opened->shared_json==max.shared_json);
 max.shared_json.push_back('b');CHECK(!SealLegacyBackup(max,vault,source));
 std::cout<<"authenticated local backup roundtrip/max bounds, binary preservation, context/tamper/mixed-key/private refusal passed\n";
}
