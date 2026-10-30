#include "glance_frame_controller.h"

#include <memory>

#include "base/at_exit.h"
#include "base/check.h"
#include "base/functional/bind.h"
#include "base/task/single_thread_task_executor.h"

using blanc::glance::draft::FrameController;
using GRect = blanc::glance::draft::Rect;
int main() {
  base::AtExitManager exit;
  base::SingleThreadTaskExecutor executor;
  GRect area{100, 50, 1200, 800};
  auto area_cb = base::BindRepeating([](GRect* value) { return *value; }, &area);
  auto read = base::BindRepeating([] { return std::optional<GRect>(); });
  auto write = base::BindRepeating([](std::optional<GRect>) { return true; });
  auto relayout = base::BindRepeating([] {});
  FrameController controller(area_cb, read, write, relayout);
  CHECK(!controller.CardLayout());
  CHECK(controller.Open(1));
  auto layout = controller.CardLayout();
  CHECK(layout && layout->frame.x == 220 && layout->frame.y == 66);
  CHECK(layout->chrome.x == 200 && layout->chrome.y == 54);
  CHECK(layout->page.x == 226 && layout->page.y == 106);
  CHECK(layout->page.width == 948 && layout->page.height == 706);
  area = {100, 50, 200, 160};
  layout = controller.CardLayout();
  CHECK(layout && layout->frame.x == 108 && layout->frame.y == 58);
  CHECK(layout->frame.width == 184 && layout->frame.height == 144);
  area.width = 1e100;
  CHECK(!controller.CardLayout());
  area.width = 200;
  CHECK(controller.Close());
  CHECK(!controller.CardLayout());
  return 0;
}
