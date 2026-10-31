#include "bang_prefs.h"
#include <memory>
#include "base/at_exit.h"
#include "base/files/file.h"
#include "base/files/file_path.h"
#include "base/files/file_util.h"
#include "base/files/memory_mapped_file.h"
#include "base/functional/bind.h"
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
 auto registry=base::MakeRefCounted<PrefRegistrySimple>();RegisterBangPrefs(registry.get());
 PrefServiceFactory f;f.SetUserPrefsFile(path,task);return f.Create(registry);
}
int main(int argc,char** argv){
 if(argc!=3)return 2;base::AtExitManager at_exit;base::SingleThreadTaskExecutor executor;
 base::ThreadPoolInstance::CreateAndStartWithDefaultParams("BangPrefsDiskTest");
 base::File icu(base::FilePath::FromUTF8Unsafe(argv[1]).AppendASCII("icudtl.dat"),base::File::FLAG_OPEN|base::File::FLAG_READ);
 if(!icu.IsValid()||!base::i18n::InitializeICUWithFileDescriptor(icu.TakePlatformFile(),base::MemoryMappedFile::Region::kWholeFile))return 3;
 auto dir=base::FilePath::FromUTF8Unsafe(argv[2]);if(!base::CreateDirectory(dir))return 4;auto path=dir.AppendASCII("Preferences");if(base::PathExists(path))return 5;
 auto task=base::ThreadPool::CreateSequencedTaskRunner({base::MayBlock(),base::TaskShutdownBehavior::BLOCK_SHUTDOWN});
 std::u16string lone(1,static_cast<char16_t>(0xd800));
 {
  auto prefs=MakePrefs(path,task.get());if(!prefs||!SetBangEnabled(prefs.get(),false)||!SetBangCustom(prefs.get(),{{u"YT",lone,u"https://example.com/?q=%s"}})||!RecordBangRecent(prefs.get(),"yt",false))return 6;
  if(RecordBangRecent(prefs.get(),"w",true))return 7;
  base::RunLoop done;prefs->CommitPendingWrite(done.QuitClosure());done.Run();
 }
 if(!base::PathExists(path))return 8;
 {
  auto prefs=MakePrefs(path,task.get());auto state=ReadBangPrefs(prefs.get());
  if(!state||state->enabled||state->custom.size()!=1||state->custom[0].code!="yt"||state->custom[0].name!=lone||state->recent!=std::vector<std::string>{"yt"})return 9;
 }
 base::ThreadPoolInstance::Get()->Shutdown();return 0;
}
