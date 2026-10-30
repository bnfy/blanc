#ifndef BLANC_GLANCE_FLOATING_DRAFT_FRAME_CONTROLLER_H_
#define BLANC_GLANCE_FLOATING_DRAFT_FRAME_CONTROLLER_H_

#include <cstdint>
#include <optional>
#include <string_view>
#include "base/functional/callback.h"
#include "base/memory/weak_ptr.h"
#include "base/timer/timer.h"
#include "glance_geometry.h"

namespace blanc::glance::draft {
// Window-owned draft; callbacks and their targets must outlive this object or
// be weakly bound. Owner supplies a new monotonically increasing generation
// each time a Glance card opens or is replaced.
class FrameController {
 public:
  using ReadArea = base::RepeatingCallback<Rect()>;
  using ReadFrame = base::RepeatingCallback<std::optional<Rect>()>;
  using WriteFrame = base::RepeatingCallback<bool(std::optional<Rect>)>;
  FrameController(ReadArea area, ReadFrame read, WriteFrame write,
                  base::RepeatingClosure relayout);
  ~FrameController();
  base::WeakPtr<FrameController> GetWeakPtr() { return weak_.GetWeakPtr(); }
  bool Open(uint64_t generation);
  bool Close();
  bool Flush();
  std::optional<Rect> Frame();
  std::optional<Rect> Move(uint64_t generation, double dx, double dy);
  std::optional<Rect> Resize(uint64_t generation, std::string_view edge,
                             double dx, double dy);
  std::optional<Rect> Reset(uint64_t generation);

 private:
  bool Current(uint64_t generation) const;
  std::optional<Rect> Apply(uint64_t generation, Rect frame, Rect area);
  ReadArea area_;
  ReadFrame read_;
  WriteFrame write_;
  base::RepeatingClosure relayout_;
  std::optional<Rect> pending_;
  uint64_t generation_ = 0;
  bool open_ = false;
  base::OneShotTimer timer_;
  base::WeakPtrFactory<FrameController> weak_{this};
};
}  // namespace blanc::glance::draft
#endif
