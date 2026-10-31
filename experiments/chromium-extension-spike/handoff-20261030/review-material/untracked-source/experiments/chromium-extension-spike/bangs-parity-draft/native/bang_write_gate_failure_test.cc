#include "bang_disk_confirmation.h"
#include "bang_mutation.h"
#include "bang_pref_registration.h"
#include "bang_write_gate.h"

#include <memory>
#include <sys/stat.h>
#include <unistd.h>
#include "base/at_exit.h"
#include "base/check.h"
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

int main(int argc, char** argv) {
  if (argc != 3)
    return 1;
  base::AtExitManager exit;
  base::SingleThreadTaskExecutor executor;
  base::ThreadPoolInstance::CreateAndStartWithDefaultParams("BangLeaseDisk");
  base::File icu(base::FilePath::FromUTF8Unsafe(argv[1]).AppendASCII("icudtl.dat"),
                 base::File::FLAG_OPEN | base::File::FLAG_READ);
  if (!icu.IsValid() || !base::i18n::InitializeICUWithFileDescriptor(
                            icu.TakePlatformFile(),
                            base::MemoryMappedFile::Region::kWholeFile))
    return 2;
  const auto profile = base::FilePath::FromUTF8Unsafe(argv[2]);
  if (!base::CreateDirectory(profile))
    return 3;
  const auto file = profile.AppendASCII("Preferences");
  if (base::PathExists(file))
    return 4;
  auto task = base::ThreadPool::CreateSequencedTaskRunner(
      {base::MayBlock(), base::TaskShutdownBehavior::BLOCK_SHUTDOWN});
  auto registry = base::MakeRefCounted<PrefRegistrySimple>();
  RegisterBangPrefs(registry.get());
  PrefServiceFactory factory;
  factory.SetUserPrefsFile(file, task.get());
  auto prefs = factory.Create(registry);
  BangWriteGate<base::FilePath> gate;
  auto window_lease = gate.Acquire(profile);
  CHECK(window_lease);
  CHECK(AddCustomBang(prefs.get(), {u"one", u"One", u"https://one.test/?q=%s"}) ==
        CustomMutation::kChanged);
  const base::Value* saved = prefs->GetUserPrefValue(kBangCustom);
  CHECK(saved);
  base::RunLoop flushed;
  bool confirmed = false;
  prefs->CommitPendingWrite(base::BindOnce(
      [](BangWriteGate<base::FilePath>* gate, const base::FilePath& profile,
         const base::FilePath& file,
         std::shared_ptr<BangWriteGate<base::FilePath>::Lease> callback_lease,
         base::Value expected, bool* confirmed, base::OnceClosure quit) {
        CHECK(!gate->Acquire(profile));
        *confirmed = ConfirmBangPrefOnDisk(file, SavedBangPref::kCustom, expected);
        callback_lease.reset();
        std::move(quit).Run();
      }, &gate, profile, file, window_lease, saved->Clone(), &confirmed,
      flushed.QuitClosure()));
  // Simulate a view disappearing while the persistence callback owns the lease.
  window_lease.reset();
  CHECK(!gate.Acquire(profile));
  flushed.Run();
  CHECK(confirmed);
  auto next_window = gate.Acquire(profile);
  CHECK(next_window);
  CHECK(AddCustomBang(prefs.get(), {u"two", u"Two", u"https://two.test/?q=%s"}) ==
        CustomMutation::kChanged);
  const auto* updated = prefs->GetUserPrefValue(kBangCustom);
  CHECK(updated);
  CHECK(!ConfirmBangPrefOnDisk(file, SavedBangPref::kCustom, *updated));
  base::RunLoop second_flush;
  prefs->CommitPendingWrite(second_flush.QuitClosure());
  second_flush.Run();
  CHECK(ConfirmBangPrefOnDisk(file, SavedBangPref::kCustom, *updated));
  // Refuse directory writes only after a successful, readable baseline is
  // installed. Chromium's atomic writer must then fail to create its temp
  // file, leaving the previous complete Preferences file intact.
  if (geteuid() == 0)
    return 5;
  const base::Value before_failure = updated->Clone();
  CHECK(chmod(profile.value().c_str(), 0500) == 0);
  CHECK(RemoveCustomBang(prefs.get(), "one") == CustomMutation::kChanged);
  const base::Value* after_change = prefs->GetUserPrefValue(kBangCustom);
  CHECK(after_change);
  const base::Value attempted = after_change->Clone();
  base::RunLoop failed_flush;
  prefs->CommitPendingWrite(failed_flush.QuitClosure());
  failed_flush.Run();
  CHECK(!ConfirmBangPrefOnDisk(file, SavedBangPref::kCustom, attempted));
  CHECK(ConfirmBangPrefOnDisk(file, SavedBangPref::kCustom, before_failure));
  CHECK(chmod(profile.value().c_str(), 0700) == 0);
  next_window.reset();
  prefs.reset();
  base::ThreadPoolInstance::Get()->Shutdown();
  return 0;
}
