#include "bang_mutation.h"
#include "bang_prefs.h"
#include <memory>
#include "base/at_exit.h"
#include "base/files/file.h"
#include "base/files/file_path.h"
#include "base/files/file_util.h"
#include "base/files/memory_mapped_file.h"
#include "base/i18n/icu_util.h"
#include "base/memory/scoped_refptr.h"
#include "base/run_loop.h"
#include "base/task/single_thread_task_executor.h"
#include "base/task/thread_pool.h"
#include "base/task/thread_pool/thread_pool_instance.h"
#include "components/prefs/pref_registry_simple.h"
#include "components/prefs/pref_service.h"
#include "components/prefs/pref_service_factory.h"
using namespace blanc::bangs::draft;
std::unique_ptr<PrefService> MakePrefs(const base::FilePath& path,base::SequencedTaskRunner* task){
 auto registry=base::MakeRefCounted<PrefRegistrySimple>();RegisterBangPrefs(registry.get());PrefServiceFactory f;f.SetUserPrefsFile(path,task);return f.Create(registry);
}
int main(int argc,char** argv){
 if(argc!=3)return 1;base::AtExitManager exit;base::SingleThreadTaskExecutor executor;base::ThreadPoolInstance::CreateAndStartWithDefaultParams("BangMutationDiskTest");
 base::File icu(base::FilePath::FromUTF8Unsafe(argv[1]).AppendASCII("icudtl.dat"),base::File::FLAG_OPEN|base::File::FLAG_READ);if(!icu.IsValid()||!base::i18n::InitializeICUWithFileDescriptor(icu.TakePlatformFile(),base::MemoryMappedFile::Region::kWholeFile))return 2;
 auto dir=base::FilePath::FromUTF8Unsafe(argv[2]);if(!base::CreateDirectory(dir))return 3;auto file=dir.AppendASCII("Preferences");if(base::PathExists(file))return 4;
 auto task=base::ThreadPool::CreateSequencedTaskRunner({base::MayBlock(),base::TaskShutdownBehavior::BLOCK_SHUTDOWN});std::u16string lone(1,static_cast<char16_t>(0xd800));
 {
  auto prefs=MakePrefs(file,task.get());if(!prefs)return 5;
  if(AddCustomBang(prefs.get(),{u"one",u"One",u"https://one.test/?q=%s"})!=CustomMutation::kChanged)return 6;
  if(AddCustomBang(prefs.get(),{u"two",lone,u"https://two.test/?q=%s"})!=CustomMutation::kChanged)return 7;
  if(RemoveCustomBang(prefs.get(),"one")!=CustomMutation::kChanged)return 8;
  if(AddCustomBang(prefs.get(),{u"two",u"Collision",u"https://x.test/%s"})!=CustomMutation::kDuplicate)return 9;
  base::RunLoop flushed;prefs->CommitPendingWrite(flushed.QuitClosure());flushed.Run();
 }
 if(!base::PathExists(file))return 10;
 {
  auto prefs=MakePrefs(file,task.get());auto state=ReadBangPrefs(prefs.get());
  if(!state||state->custom.size()!=1||state->custom[0].code!="two"||state->custom[0].name!=lone)return 11;
  if(AddCustomBang(prefs.get(),{u"third",u"Three",u"https://three.test/%s"})!=CustomMutation::kChanged)return 12;
  base::RunLoop flushed;prefs->CommitPendingWrite(flushed.QuitClosure());flushed.Run();
 }
 {
  auto prefs=MakePrefs(file,task.get());auto state=ReadBangPrefs(prefs.get());
  if(!state||state->custom.size()!=2||state->custom[0].code!="two"||state->custom[1].code!="third")return 13;
 }
 base::ThreadPoolInstance::Get()->Shutdown();return 0;
}
