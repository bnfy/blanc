#include "glance_frame_controller.h"
#include <memory>
#include "base/at_exit.h"
#include "base/check.h"
#include "base/functional/bind.h"
#include "base/run_loop.h"
#include "base/task/single_thread_task_executor.h"
#include "base/task/single_thread_task_runner.h"
#include "base/time/time.h"

using blanc::glance::draft::FrameController;
using GRect = blanc::glance::draft::Rect;
int main() {
  base::AtExitManager exit;
  base::SingleThreadTaskExecutor executor;
  GRect area{0, 0, 1200, 800};
  std::optional<GRect> saved;
  int writes = 0, layouts = 0;
  bool fail = false;
  auto area_cb = base::BindRepeating([](GRect* a) { return *a; }, &area);
  auto read_cb = base::BindRepeating([](std::optional<GRect>* f) { return *f; }, &saved);
  auto write_cb = base::BindRepeating(
      [](std::optional<GRect>* f, int* n, bool* fail, std::optional<GRect> value) {
        ++*n;
        if (*fail) return false;
        *f = value;
        return true;
      }, &saved, &writes, &fail);
  auto layout_cb = base::BindRepeating([](int* n) { ++*n; }, &layouts);
  FrameController card(area_cb, read_cb, write_cb, layout_cb);
  CHECK(!card.Open(0));
  CHECK(card.Open(1));
  CHECK(!card.Open(2));
  auto start = card.Frame();
  CHECK(start && start->width == 960 && start->height == 752);
  CHECK(!card.Move(2, 30, 30));
  CHECK(card.Move(1, 30, 20));
  CHECK(card.Resize(1, "nw", -20, -10));
  CHECK(writes == 0 && layouts == 2);
  CHECK(card.Resize(1, "invalid", 20, 20));
  CHECK(layouts == 2);
  base::RunLoop tick;
  base::SingleThreadTaskRunner::GetCurrentDefault()->PostDelayedTask(
      FROM_HERE, tick.QuitClosure(), base::Milliseconds(350));
  tick.Run();
  CHECK(writes == 1 && saved);
  CHECK(card.Move(1, 10, 10));
  fail = true;
  CHECK(!card.Flush());
  CHECK(!card.Close());
  CHECK(card.Frame());
  fail = false;
  CHECK(card.Close());
  CHECK(!card.Frame());
  CHECK(!card.Open(1));
  CHECK(card.Open(2));
  CHECK(!card.Move(1, 1, 1));
  CHECK(card.Reset(2));
  CHECK(!saved);
  area.width = 1e100;
  CHECK(!card.Frame());
  area.width = 1200;
  CHECK(card.Close());

  std::unique_ptr<FrameController> disposable;
  auto destroy = base::BindRepeating(
      [](std::unique_ptr<FrameController>* p) { p->reset(); }, &disposable);
  disposable = std::make_unique<FrameController>(area_cb, read_cb, write_cb, destroy);
  CHECK(disposable->Open(1));
  CHECK(!disposable->Move(1, 1, 1));
  CHECK(!disposable);
  return 0;
}
