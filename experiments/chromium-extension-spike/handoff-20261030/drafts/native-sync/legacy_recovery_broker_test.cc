#include "legacy_recovery_broker.h"
#include "base/json/json_writer.h"
#include "base/values.h"
#include "base/synchronization/waitable_event.h"
#include "base/task/thread_pool/thread_pool_instance.h"
#include "base/task/thread_pool.h"
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
namespace blanc::sync {
class LegacyRecoveryBrokerTest {
 public:
  static auto Create(VaultContext c,scoped_refptr<Encryptor> destination,
      std::function<std::unique_ptr<os_crypt_async::OSCryptAsync>()> factory) {
    return std::unique_ptr<LegacyRecoveryBroker>(new LegacyRecoveryBroker(c,destination,std::move(factory)));
  }
};
}
struct Control { os_crypt_async::OSCryptAsync::InitCallback pending; scoped_refptr<Encryptor> key; bool immediate=false; };
class ControlledSource : public os_crypt_async::OSCryptAsync {
 public:
  explicit ControlledSource(std::shared_ptr<Control> c):OSCryptAsync({}),c_(c){}
  void GetInstance(InitCallback done) override {
    if(c_->immediate)std::move(done).Run(c_->key); else c_->pending=std::move(done);
  }
 private: std::shared_ptr<Control> c_;
};
void Wait(base::WaitableEvent& event){CHECK(event.TimedWait(base::Seconds(10)));}
void Post(scoped_refptr<base::SequencedTaskRunner> runner,std::function<void()> task) {
 CHECK(runner->PostTask(FROM_HERE,base::BindOnce([](auto task){task();},std::move(task))));
}
auto Done(std::function<void(LegacyRecoveryBroker::Result)> task) {
 return base::BindOnce([](std::function<void(LegacyRecoveryBroker::Result)> task,
                         LegacyRecoveryBroker::Result result){task(std::move(result));},std::move(task));
}
int main(){
 base::AtExitManager at_exit;
 base::ThreadPoolInstance::CreateAndStartWithDefaultParams("BlancBrokerCheck");
 auto runner=base::ThreadPool::CreateSequencedTaskRunner({base::MayBlock(),base::TaskShutdownBehavior::BLOCK_SHUTDOWN});
 const VaultContext context{std::string(64,'a'),std::string(64,'b'),true,false};
 auto source=Make(Ring("v10",Algorithm::kAES256GCM,3),"v10");
 auto decrypt_only=Make(Ring("v10",Algorithm::kAES256GCM,3),"");
 auto destination=Make(Ring("v11",Algorithm::kAES256GCM,7),"v11");
 std::array<uint8_t,32> key={1,2,3};
 base::DictValue record;record.Set("enabled",true);record.Set("handle","Test Account");
 record.Set("accountId",context.account_binding);record.Set("deviceId","550e8400-e29b-41d4-a716-446655440000");
 record.Set("protectedKey",base::Base64Encode(*source->EncryptString(base::Base64Encode(key))));
 const auto input=*base::WriteJson(record);const std::string ledger="{\"requestLog\":[]}";
 auto ctl=std::make_shared<Control>();ctl->key=decrypt_only;
 int factories=0,callbacks=0; std::unique_ptr<LegacyRecoveryBroker> broker;
 auto factory=[&](){++factories;return std::make_unique<ControlledSource>(ctl);};
 base::WaitableEvent invalid;
 Post(runner,[&]{broker=LegacyRecoveryBrokerTest::Create(context,destination,factory);
   broker->Recover("{",ledger,Done([&](auto r){CHECK(r.status==LegacyRecoveryBroker::Status::kRejected);invalid.Signal();}));});
 Wait(invalid);CHECK_EQ(factories,0);
 base::WaitableEvent started,busy,finished;
 Post(runner,[&]{broker->Recover(input,ledger,Done([&](auto r){CHECK(r.status==LegacyRecoveryBroker::Status::kPrepared);CHECK(r.preparation->core);++callbacks;finished.Signal();}));
   broker->Recover(input,ledger,Done([&](auto r){CHECK(r.status==LegacyRecoveryBroker::Status::kBusy);busy.Signal();}));started.Signal();});
 Wait(started);Wait(busy);CHECK_EQ(factories,1);
 Post(runner,[&]{std::move(ctl->pending).Run(decrypt_only);});Wait(finished);CHECK_EQ(callbacks,1);
 // An unavailable initialization must not poison a subsequent explicit retry.
 base::WaitableEvent unavailable,retry;
 Post(runner,[&]{ctl->immediate=true;ctl->key=nullptr;broker->Recover(input,ledger,Done([&](auto r){CHECK(r.status==LegacyRecoveryBroker::Status::kRejected);unavailable.Signal();}));});Wait(unavailable);
 Post(runner,[&]{ctl->key=decrypt_only;broker->Recover(input,ledger,Done([&](auto r){CHECK(r.status==LegacyRecoveryBroker::Status::kPrepared);retry.Signal();}));});Wait(retry);CHECK_EQ(factories,3);
 base::WaitableEvent shutdown,late_started;
 Post(runner,[&]{ctl->immediate=false;broker->Recover(input,ledger,Done([&](auto r){CHECK(r.status==LegacyRecoveryBroker::Status::kShutdown);++callbacks;shutdown.Signal();}));broker.reset();late_started.Signal();});
 Wait(late_started);Wait(shutdown);
 Post(runner,[&]{std::move(ctl->pending).Run(decrypt_only);});
 base::WaitableEvent queued;
 Post(runner,[&]{ctl->immediate=true;broker=LegacyRecoveryBrokerTest::Create(context,destination,factory);
   broker->Recover(input,ledger,Done([&](auto r){CHECK(r.status==LegacyRecoveryBroker::Status::kShutdown);CHECK(!r.preparation);queued.Signal();}));broker->Shutdown();broker.reset();});Wait(queued);
 base::WaitableEvent private_done;
 const int before=factories;
 Post(runner,[&]{auto private_context=context;private_context.off_the_record=true;
   broker=LegacyRecoveryBrokerTest::Create(private_context,destination,factory);
   broker->Recover(input,ledger,Done([&](auto r){CHECK(r.status==LegacyRecoveryBroker::Status::kShutdown);private_done.Signal();}));broker.reset();});
 // Owner destruction cancels even an already queued rejection.
 Wait(private_done);CHECK_EQ(factories,before);
 base::ThreadPoolInstance::Get()->FlushForTesting();base::ThreadPoolInstance::Get()->Shutdown();
 std::cout<<"broker invalid/private no-query, busy, retry-after-unavailable, late cancellation and queued-result redaction passed\n";
}
