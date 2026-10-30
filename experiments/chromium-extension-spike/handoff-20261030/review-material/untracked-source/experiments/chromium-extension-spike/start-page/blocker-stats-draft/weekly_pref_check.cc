#include "browser_weekly_stats.h"
#include <iostream>
#include <memory>
#include "base/at_exit.h"
#include "base/memory/ref_counted.h"
#include "base/task/single_thread_task_executor.h"
#include "base/values.h"
#include "components/prefs/in_memory_pref_store.h"
#include "components/prefs/pref_registry_simple.h"
#include "components/prefs/pref_service.h"
#include "components/prefs/pref_service_factory.h"
using namespace blanc::blocker_stats;
int main() {
  base::AtExitManager exit;
  base::SingleThreadTaskExecutor executor;
  int failures=0, checks=0;
  auto check=[&](bool v, const char* name) { ++checks; if(!v) { ++failures; std::cerr << "FAIL " << name << '\n'; } };
  auto reg=base::MakeRefCounted<PrefRegistrySimple>();
  reg->RegisterDictionaryPref(kWeeklyPref);
  auto user=base::MakeRefCounted<InMemoryPrefStore>();
  PrefServiceFactory factory; factory.set_user_prefs(user);
  auto prefs=factory.Create(reg);
  const double week=1793059200000.0;
  auto zero=ReadWeeklyPref(*prefs,week);
  check(zero && zero->blocked==0 && zero->days.size()==7,"new pref zero");
  check(!prefs->HasPrefPath(kWeeklyPref),"read does not persist");
  State written{week,3.0,{1,0,2,0,0,0,0}};
  check(WriteWeeklyPref(*prefs,written),"valid write stages");
  auto restored=ReadWeeklyPref(*prefs,week);
  check(restored && restored->blocked==3 && restored->days==written.days,"roundtrip");
  prefs.reset();
  PrefServiceFactory again; again.set_user_prefs(user); prefs=again.Create(reg);
  restored=ReadWeeklyPref(*prefs,week);
  check(restored && restored->blocked==3,"new service same memory store");
  auto next=ReadWeeklyPref(*prefs,week+604800000.0);
  check(next && next->blocked==0,"old week reset projection");
  check(!ReadWeeklyPref(*prefs,week-604800000.0),"future week denied");
  State bad=written; bad.days[0]=-1;
  check(!WriteWeeklyPref(*prefs,bad),"negative denied");
  check(ReadWeeklyPref(*prefs,week)->blocked==3,"invalid write unchanged");
  bad=written; bad.blocked=5;
  check(!WriteWeeklyPref(*prefs,bad),"inconsistent total denied");
  base::DictValue future; future.Set("version",2); prefs->SetDict(kWeeklyPref,std::move(future));
  check(!ReadWeeklyPref(*prefs,week),"unknown version unavailable");
  check(prefs->GetDict(kWeeklyPref).FindInt("version")==2,"unknown version preserved");
  base::DictValue empty; prefs->SetDict(kWeeklyPref,std::move(empty));
  check(!ReadWeeklyPref(*prefs,week),"user empty corruption unavailable");
  auto managed=base::MakeRefCounted<InMemoryPrefStore>();
  base::DictValue locked; locked.Set("version",2);
  managed->SetValue(kWeeklyPref,base::Value(std::move(locked)),0);
  PrefServiceFactory managed_factory;
  managed_factory.set_user_prefs(user); managed_factory.set_managed_prefs(managed);
  auto controlled=managed_factory.Create(reg);
  check(!ReadWeeklyPref(*controlled,week),"managed pref unavailable");
  check(!WriteWeeklyPref(*controlled,written),"managed pref rejects write");
  auto unregistered=base::MakeRefCounted<PrefRegistrySimple>();
  PrefServiceFactory no_registry_factory;
  no_registry_factory.set_user_prefs(base::MakeRefCounted<InMemoryPrefStore>());
  auto no_registry=no_registry_factory.Create(unregistered);
  check(!ReadWeeklyPref(*no_registry,week),"unregistered pref unavailable");
  check(!WriteWeeklyPref(*no_registry,written),"unregistered pref rejects write");
  std::cout << "pref-checks=" << checks << " failures=" << failures << '\n';
  return failures ? 1 : 0;
}
