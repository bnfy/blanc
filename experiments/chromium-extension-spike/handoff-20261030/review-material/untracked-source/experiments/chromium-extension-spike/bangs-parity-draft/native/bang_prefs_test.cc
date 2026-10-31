#include "bang_prefs.h"
#include <memory>
#include <string>
#include "base/at_exit.h"
#include "base/files/file.h"
#include "base/files/file_path.h"
#include "base/files/memory_mapped_file.h"
#include "base/i18n/icu_util.h"
#include "base/memory/scoped_refptr.h"
#include "base/values.h"
#include "base/task/single_thread_task_executor.h"
#include "components/prefs/in_memory_pref_store.h"
#include "components/prefs/pref_registry_simple.h"
#include "components/prefs/pref_service.h"
#include "components/prefs/pref_service_factory.h"
#include "components/prefs/value_map_pref_store.h"
using namespace blanc::bangs::draft;
std::unique_ptr<PrefService> MakePrefs(){
 auto registry=base::MakeRefCounted<PrefRegistrySimple>();RegisterBangPrefs(registry.get());
 PrefServiceFactory f;f.set_user_prefs(base::MakeRefCounted<InMemoryPrefStore>());return f.Create(registry);
}
int main(int argc,char** argv){
 if(argc!=2)return 2;base::AtExitManager at_exit;
 base::SingleThreadTaskExecutor executor;
 base::File icu(base::FilePath::FromUTF8Unsafe(argv[1]).AppendASCII("icudtl.dat"),base::File::FLAG_OPEN|base::File::FLAG_READ);
 if(!icu.IsValid()||!base::i18n::InitializeICUWithFileDescriptor(icu.TakePlatformFile(),base::MemoryMappedFile::Region::kWholeFile))return 3;
 auto a=MakePrefs(),b=MakePrefs();auto first=ReadBangPrefs(a.get());if(!first||!first->enabled||!first->custom.empty()||!first->recent.empty())return 4;
 std::u16string lone(1,static_cast<char16_t>(0xd800));
 if(!SetBangCustom(a.get(),{{u"YT",lone,u"https://example.com/?q=%s"},{u"yt",u"duplicate",u"https://duplicate.example/?q=%s"},{u"bad",u"Bad",u"http://remote.example/?q=%s"}}))return 5;
 auto snap=ReadBangPrefs(a.get());if(!snap||snap->custom.size()!=1||snap->custom[0].code!="yt"||snap->custom[0].name!=lone)return 6;
 if(!SetBangEnabled(a.get(),false)||ReadBangPrefs(a.get())->enabled)return 7;
 if(!RecordBangRecent(a.get(),"yt",false)||RecordBangRecent(a.get(),"yt",false))return 8;
 if(RecordBangRecent(a.get(),"w",true)||ClearBangRecents(a.get(),true))return 9;
 if(ReadBangPrefs(a.get())->recent!=std::vector<std::string>{"yt"})return 10;
 for(int i=0;i<12;++i)if(!RecordBangRecent(a.get(),"b"+std::to_string(i),false))return 11;
 snap=ReadBangPrefs(a.get());if(!snap||snap->recent.size()!=10||snap->recent.front()!="b11"||snap->recent.back()!="b2")return 12;
 if(!ClearBangRecents(a.get(),false)||ClearBangRecents(a.get(),false))return 13;
 auto other=ReadBangPrefs(b.get());if(!other||!other->enabled||!other->custom.empty()||!other->recent.empty())return 14;
 if(ReadBangPrefs(nullptr)||RecordBangRecent(a.get(),"!bad",false))return 15;
 base::DictValue corrupt;corrupt.Set("code","bad");base::ListValue units;units.Append(65536);corrupt.Set("name_units",std::move(units));base::ListValue templ;templ.Append(65);corrupt.Set("template_units",std::move(templ));base::ListValue bad_rows;bad_rows.Append(std::move(corrupt));a->SetList(kBangCustom,std::move(bad_rows));
 snap=ReadBangPrefs(a.get());if(!snap||!snap->custom.empty())return 16;
 base::ListValue huge;for(int i=0;i<1001;++i)huge.Append(false);a->SetList(kBangCustom,std::move(huge));if(ReadBangPrefs(a.get()))return 17;
 auto registry=base::MakeRefCounted<PrefRegistrySimple>();RegisterBangPrefs(registry.get());
 auto managed=base::MakeRefCounted<ValueMapPrefStore>();managed->SetValue(kBangEnabled,base::Value(false),0);
 PrefServiceFactory f;f.set_managed_prefs(managed);f.set_user_prefs(base::MakeRefCounted<InMemoryPrefStore>());auto policy=f.Create(registry);
 if(SetBangEnabled(policy.get(),true)||ReadBangPrefs(policy.get())->enabled)return 18;
 return 0;
}
