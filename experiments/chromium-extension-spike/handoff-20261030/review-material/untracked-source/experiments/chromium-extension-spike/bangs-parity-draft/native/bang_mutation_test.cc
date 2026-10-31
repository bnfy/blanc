#include "bang_mutation.h"
#include "bang_prefs.h"
#include "base/at_exit.h"
#include "base/files/file.h"
#include "base/files/file_path.h"
#include "base/files/memory_mapped_file.h"
#include "base/i18n/icu_util.h"
#include "base/memory/scoped_refptr.h"
#include "base/task/single_thread_task_executor.h"
#include "base/strings/utf_string_conversions.h"
#include "components/prefs/in_memory_pref_store.h"
#include "components/prefs/pref_service.h"
#include "components/prefs/pref_registry_simple.h"
#include "components/prefs/pref_service_factory.h"
#include "components/prefs/value_map_pref_store.h"
using namespace blanc::bangs::draft;
int main(int argc,char** argv){
 if(argc!=2)return 1;base::AtExitManager exit;base::SingleThreadTaskExecutor executor;
 base::File icu(base::FilePath::FromUTF8Unsafe(argv[1]).AppendASCII("icudtl.dat"),base::File::FLAG_OPEN|base::File::FLAG_READ);
 if(!icu.IsValid()||!base::i18n::InitializeICUWithFileDescriptor(icu.TakePlatformFile(),base::MemoryMappedFile::Region::kWholeFile))return 2;
 auto registry=base::MakeRefCounted<PrefRegistrySimple>();RegisterBangPrefs(registry.get());
 PrefServiceFactory f;f.set_user_prefs(base::MakeRefCounted<InMemoryPrefStore>());auto prefs=f.Create(registry);
 if(AddCustomBang(prefs.get(),{u"YT",u"Video",u"https://example.com/?q=%s"})!=CustomMutation::kChanged)return 3;
 if(AddCustomBang(prefs.get(),{u"yt",u"Duplicate",u"https://example.com/?q=%s"})!=CustomMutation::kDuplicate)return 4;
 if(AddCustomBang(prefs.get(),{u"bad",u"Bad",u"http://public.example/?q=%s"})!=CustomMutation::kInvalid)return 5;
 if(AddCustomBang(prefs.get(),{u"wiki",u"Wiki",u"https://example.org/?q=%s"})!=CustomMutation::kChanged)return 6;
 if(RemoveCustomBang(prefs.get(),"yt")!=CustomMutation::kChanged)return 7;
 auto state=ReadBangPrefs(prefs.get());if(!state||state->custom.size()!=1||state->custom[0].code!="wiki")return 8;
 if(RemoveCustomBang(prefs.get(),"yt")!=CustomMutation::kNotFound||AddCustomBang(nullptr,{u"x",u"X",u"https://example.org/%s"})!=CustomMutation::kUnavailable)return 9;
 auto reg2=base::MakeRefCounted<PrefRegistrySimple>();RegisterBangPrefs(reg2.get());auto managed=base::MakeRefCounted<ValueMapPrefStore>();managed->SetValue(kBangCustom,base::Value(base::ListValue()),0);PrefServiceFactory f2;f2.set_managed_prefs(managed);f2.set_user_prefs(base::MakeRefCounted<InMemoryPrefStore>());auto locked=f2.Create(reg2);
 if(AddCustomBang(locked.get(),{u"x",u"X",u"https://example.org/%s"})!=CustomMutation::kUnavailable)return 10;
 std::vector<CustomBangInput> full;for(int i=0;i<100;++i)full.push_back({base::UTF8ToUTF16("x"+std::to_string(i)),u"X",u"https://example.org/%s"});if(!SetBangCustom(prefs.get(),full))return 11;
 if(AddCustomBang(prefs.get(),{u"new",u"New",u"https://example.org/%s"})!=CustomMutation::kLimit)return 12;
 return 0;
}
