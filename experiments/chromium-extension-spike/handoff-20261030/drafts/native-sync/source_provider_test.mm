#include "components/os_crypt/async/browser/keychain_key_provider.h"
#include "components/os_crypt/async/common/algorithm.mojom.h"
#include "crypto/apple/keychain_v2.h"
#include "base/at_exit.h"
#include "base/check.h"
#include "base/functional/bind.h"
#include "base/location.h"
#include "base/synchronization/waitable_event.h"
#include "base/task/thread_pool/thread_pool_instance.h"
#include "base/task/thread_pool.h"
#include "base/time/time.h"
#include <atomic>
#include <iostream>
namespace os_crypt_async {
class KeychainKeyProviderCompatTest {
 public:
  static std::unique_ptr<KeyProvider> Create(crypto::apple::KeychainV2* keychain,
                                            KeychainKeyProvider::ReadOnlyLookup names) {
    auto provider=std::make_unique<KeychainKeyProvider>(std::move(names));
    provider->keychain_for_testing_=keychain; return provider;
  }
};
}
class ReadOnlyFixture : public crypto::apple::KeychainV2 {
 public:
  std::atomic<int> reads=0,adds=0;
  OSStatus error=noErr;
  std::string password="synthetic-source-password";
  OSStatus AddGenericPassword(std::string_view,std::string_view,base::span<const uint8_t>) override {
    ++adds; return errSecAuthFailed;
  }
  base::expected<std::vector<uint8_t>,OSStatus> FindGenericPassword(std::string_view service,
                                                               std::string_view account) override {
    ++reads; CHECK_EQ(service,"Blanc Safe Storage"); CHECK_EQ(account,"Blanc");
    if(error!=noErr)return base::unexpected(error);
    return std::vector<uint8_t>(password.begin(),password.end());
  }
};
int main() {
  base::AtExitManager at_exit;
  base::ThreadPoolInstance::CreateAndStartWithDefaultParams("BlancSourceProviderCheck");
  auto reply=base::ThreadPool::CreateSequencedTaskRunner({base::MayBlock(),base::TaskShutdownBehavior::BLOCK_SHUTDOWN});
  ReadOnlyFixture keychain;
  for (int mode=0;mode<5;++mode) {
    keychain.error=mode==1?OSStatus(errSecItemNotFound):mode==2?OSStatus(errSecAuthFailed):OSStatus(noErr);
    keychain.password=mode==3?"":"synthetic-source-password";
    base::WaitableEvent completed;
    CHECK(reply->PostTask(FROM_HERE,base::BindOnce([](auto reply,ReadOnlyFixture* keychain,
        int mode,base::WaitableEvent* completed) {
      auto provider=os_crypt_async::KeychainKeyProviderCompatTest::Create(keychain,
          {mode==4?"":"Blanc Safe Storage","Blanc"});
      CHECK(!provider->UseForEncryption());
      provider->GetKey(base::BindOnce([](std::unique_ptr<os_crypt_async::KeyProvider> provider,scoped_refptr<base::SequencedTaskRunner> reply,int mode,
          base::WaitableEvent* completed,const std::string& tag,
          base::expected<os_crypt_async::Encryptor::Key,os_crypt_async::KeyProvider::KeyError> result) {
        CHECK(reply->RunsTasksInCurrentSequence()); CHECK_EQ(tag,"v10");
        if(mode==0) {
          CHECK(result.has_value());
          const std::array<uint8_t,16> bytes={0x5e,0x42,0x58,0x3a,0xa6,0x94,0xb8,0x4f,0x89,0x1e,0x4,0x27,0x30,0x9b,0x76,0xbd};
          CHECK(*result==os_crypt_async::Encryptor::Key(bytes,os_crypt_async::mojom::Algorithm::kAES128CBC));
        } else {
          CHECK(!result.has_value());
          CHECK(result.error()==os_crypt_async::KeyProvider::KeyError::kTemporarilyUnavailable);
        }
        completed->Signal();
      },std::move(provider),reply,mode,completed));
    },reply,base::Unretained(&keychain),mode,base::Unretained(&completed))));
    CHECK(completed.TimedWait(base::Seconds(15)));
  }
  CHECK_EQ(keychain.reads.load(),4); CHECK_EQ(keychain.adds.load(),0);
  base::ThreadPoolInstance::Get()->FlushForTesting(); base::ThreadPoolInstance::Get()->Shutdown();
  std::cout<<"read-only source keychain lookup/derivation, missing/denied/empty refusal, reply sequence and zero adds passed\n";
}
