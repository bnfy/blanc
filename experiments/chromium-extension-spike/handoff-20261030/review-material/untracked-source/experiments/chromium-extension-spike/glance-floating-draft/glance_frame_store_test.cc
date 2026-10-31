#include "glance_frame_store.h"
#include <string>
#include "base/at_exit.h"
#include "base/check.h"
#include "base/files/file_util.h"
#include "base/functional/bind.h"
#include "base/run_loop.h"
#include "base/task/single_thread_task_executor.h"
#include "base/task/thread_pool/thread_pool_instance.h"
#include "base/time/time.h"
#include "base/timer/timer.h"

using blanc::glance::draft::GlanceFrameStore;
using GRect = blanc::glance::draft::Rect;
struct Waiter {
  base::RunLoop* loop = nullptr;
  void Changed() { if (loop) loop->Quit(); }
  void Until(GlanceFrameStore& store, GlanceFrameStore::State state) {
    for (int attempt = 0; store.state() != state && attempt < 20; ++attempt) {
      base::RunLoop run;
      loop = &run;
      base::OneShotTimer timeout;
      timeout.Start(FROM_HERE, base::Seconds(3), run.QuitClosure());
      run.Run();
      loop = nullptr;
    }
    CHECK(store.state() == state);
  }
};
int main(int argc, char** argv) {
  CHECK_EQ(argc, 2);
  base::AtExitManager exit;
  base::SingleThreadTaskExecutor executor;
  base::ThreadPoolInstance::CreateAndStartWithDefaultParams("GlanceFrameStoreTest");
  base::FilePath root(argv[1]);
  CHECK(base::CreateDirectory(root));
  auto path = root.AppendASCII("frame.json");
  Waiter waiter;
  auto changed = base::BindRepeating(&Waiter::Changed, base::Unretained(&waiter));
  {
    GlanceFrameStore store(path, changed);
    CHECK(!store.Write(GRect{0,0,0.5,0.5}));
    store.Initialize();
    waiter.Until(store, GlanceFrameStore::State::kReady);
    CHECK(store.IsDurable());
    CHECK(!store.Read());
    CHECK(store.Write(GRect{0.1,0.2,0.5,0.4}));
    CHECK(store.Write(GRect{0.2,0.3,0.4,0.6}));
    CHECK(!store.IsDurable());
    waiter.Until(store, GlanceFrameStore::State::kReady);
    CHECK(store.IsDurable());
    CHECK(store.Read()->x == 0.2);
    CHECK(!store.Write(GRect{0,0,0,0.4}));
    CHECK(store.IsDurable());
  }
  {
    GlanceFrameStore store(path, changed);
    store.Initialize();
    waiter.Until(store, GlanceFrameStore::State::kReady);
    CHECK(store.Read() && store.Read()->x == 0.2 && store.Read()->height == 0.6);
    CHECK(store.Write(std::nullopt));
    CHECK(!store.IsDurable());
    waiter.Until(store, GlanceFrameStore::State::kReady);
    CHECK(store.IsDurable());
  }
  {
    GlanceFrameStore store(path, changed);
    store.Initialize();
    waiter.Until(store, GlanceFrameStore::State::kReady);
    CHECK(!store.Read());
  }
  const auto corrupt = root.AppendASCII("corrupt.json");
  CHECK(base::WriteFile(corrupt, "{bad json"));
  {
    GlanceFrameStore store(corrupt, changed);
    store.Initialize();
    waiter.Until(store, GlanceFrameStore::State::kReadFailed);
    CHECK(!store.Write(GRect{0,0,0.5,0.5}));
    CHECK(!store.IsDurable());
  }
  std::string contents;
  CHECK(base::ReadFileToString(corrupt, &contents));
  CHECK_EQ(contents, "{bad json");
  const auto dir = root.AppendASCII("late");
  {
    GlanceFrameStore store(dir.AppendASCII("frame.json"), changed);
    store.Initialize();
    waiter.Until(store, GlanceFrameStore::State::kReady);
    CHECK(store.Write(GRect{0.1,0.1,0.8,0.8}));
    waiter.Until(store, GlanceFrameStore::State::kWriteFailed);
    CHECK(!store.IsDurable());
    CHECK(base::CreateDirectory(dir));
    CHECK(store.Retry());
    waiter.Until(store, GlanceFrameStore::State::kReady);
    CHECK(store.IsDurable());
  }
  base::ThreadPoolInstance::Get()->Shutdown();
  return 0;
}
