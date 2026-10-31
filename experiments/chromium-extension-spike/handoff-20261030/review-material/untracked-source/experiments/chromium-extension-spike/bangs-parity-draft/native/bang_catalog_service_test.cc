#include "bang_catalog_service.h"
#include "base/at_exit.h"
#include "base/files/file_util.h"
#include "base/functional/bind.h"
#include "base/run_loop.h"
#include "base/task/single_thread_task_executor.h"
#include "base/task/thread_pool/thread_pool_instance.h"
#include <memory>
using namespace blanc::bangs::draft;
int main(int argc,char** argv){
 if(argc!=3)return 1;
 base::AtExitManager at_exit; base::SingleThreadTaskExecutor executor;
 base::ThreadPoolInstance::CreateAndStartWithDefaultParams("BangCatalogTest");
 auto root=base::FilePath::FromUTF8Unsafe(argv[2]);if(!base::CreateDirectory(root))return 2;
 auto target=root.AppendASCII("blanc-bangs-catalog.json");
 if(!base::CopyFile(base::FilePath::FromUTF8Unsafe(argv[1]),target))return 3;
 {
  BangCatalogService s; if(s.state()!=BangCatalogService::State::kIdle||s.catalog())return 4;
  bool ok=false;base::RunLoop loop;
  if(!s.Start(root,base::BindOnce([](bool* out,base::RunLoop* run,bool value){*out=value;run->Quit();},base::Unretained(&ok),base::Unretained(&loop))))return 5;
  if(s.state()!=BangCatalogService::State::kLoading || s.Start(root,base::BindOnce([](bool){})))return 6;
  loop.Run();if(!ok||s.state()!=BangCatalogService::State::kReady||!s.catalog()||s.catalog()->entries.size()!=10624)return 7;
 }
 if(!base::WriteFile(target,"corrupt"))return 8;
 {
  BangCatalogService s;bool ok=true;base::RunLoop loop;
  if(!s.Start(root,base::BindOnce([](bool* out,base::RunLoop* run,bool value){*out=value;run->Quit();},base::Unretained(&ok),base::Unretained(&loop))))return 9;
  loop.Run();if(ok||s.state()!=BangCatalogService::State::kFailed||s.catalog())return 10;
 }
 {
  bool called=false;auto s=std::make_unique<BangCatalogService>();
  if(!s->Start(root,base::BindOnce([](bool* out,bool){*out=true;},base::Unretained(&called))))return 11;
  s.reset();base::ThreadPoolInstance::Get()->FlushForTesting();base::RunLoop().RunUntilIdle();if(called)return 12;
 }
 base::ThreadPoolInstance::Get()->Shutdown();return 0;
}
