#include "glance_frame_controller.h"

#include <cmath>
#include <utility>
#include "base/functional/bind.h"
#include "base/time/time.h"

namespace blanc::glance::draft {
namespace {
bool SafeArea(Rect r) {
  constexpr double kLimit = 1000000;
  return std::isfinite(r.x) && std::isfinite(r.y) && std::isfinite(r.width) &&
         std::isfinite(r.height) && std::abs(r.x) <= kLimit &&
         std::abs(r.y) <= kLimit && r.width >= 0 && r.width <= kLimit &&
         r.height >= 0 && r.height <= kLimit;
}
bool SafeFractions(Rect r) {
  return std::isfinite(r.x) && std::isfinite(r.y) && std::isfinite(r.width) &&
         std::isfinite(r.height) && r.x >= 0 && r.x <= 1 && r.y >= 0 &&
         r.y <= 1 && r.width >= 0 && r.width <= 1 && r.height >= 0 && r.height <= 1;
}
}  // namespace

FrameController::FrameController(ReadArea area, ReadFrame read, WriteFrame write,
                                 base::RepeatingClosure relayout)
    : area_(std::move(area)), read_(std::move(read)), write_(std::move(write)),
      relayout_(std::move(relayout)) {}
FrameController::~FrameController() = default;
bool FrameController::Open(uint64_t generation) {
  if (open_ || generation == 0 || generation <= generation_ || !area_ || !read_ ||
      !write_ || !relayout_)
    return false;
  generation_ = generation;
  open_ = true;
  return true;
}
bool FrameController::Current(uint64_t generation) const {
  return open_ && generation == generation_;
}
bool FrameController::Flush() {
  timer_.Stop();
  if (!pending_) return true;
  auto value = std::exchange(pending_, std::nullopt);
  const auto generation = generation_;
  auto self = weak_.GetWeakPtr();
  auto write = write_;
  const bool saved = write.Run(value);
  if (!saved && self && Current(generation) && !pending_) pending_ = value;
  return saved;
}
bool FrameController::Close() {
  if (!open_) return false;
  const auto generation = generation_;
  auto self = weak_.GetWeakPtr();
  const bool saved = Flush();
  if (self && saved && Current(generation)) open_ = false;
  return saved;
}
std::optional<Rect> FrameController::Frame() {
  if (!open_) return std::nullopt;
  const auto generation = generation_;
  auto self = weak_.GetWeakPtr();
  auto area_reader = area_;
  const Rect area = area_reader.Run();
  if (!self || !SafeArea(area)) return std::nullopt;
  auto read = read_;
  auto fractions = pending_ ? pending_ : read.Run();
  if (!self || !Current(generation)) return std::nullopt;
  if (fractions && !SafeFractions(*fractions)) fractions.reset();
  return FractionsToFrame(fractions, area);
}
std::optional<CardGeometry> FrameController::CardLayout() {
  if (!open_) return std::nullopt;
  const auto generation = generation_;
  auto self = weak_.GetWeakPtr();
  auto frame = Frame();
  if (!self || !frame || !Current(generation)) return std::nullopt;
  auto area_reader = area_;
  const Rect area = area_reader.Run();
  if (!self || !SafeArea(area) || !Current(generation)) return std::nullopt;
  return Geometry(ClampFrame(*frame, area), area);
}
std::optional<Rect> FrameController::Apply(uint64_t generation, Rect frame, Rect area) {
  if (!Current(generation)) return std::nullopt;
  pending_ = FrameToFractions(frame, area);
  timer_.Start(FROM_HERE, base::Milliseconds(250),
               base::BindOnce([](base::WeakPtr<FrameController> self) {
                 if (self) self->Flush();
               }, weak_.GetWeakPtr()));
  auto self = weak_.GetWeakPtr();
  auto relayout = relayout_;
  relayout.Run();
  if (!self || !Current(generation)) return std::nullopt;
  return Frame();
}
std::optional<Rect> FrameController::Move(uint64_t generation, double dx, double dy) {
  if (!Current(generation)) return std::nullopt;
  auto self = weak_.GetWeakPtr();
  auto frame = Frame();
  if (!self || !frame || !Current(generation)) return std::nullopt;
  auto area_reader = area_;
  const Rect area = area_reader.Run();
  if (!self || !SafeArea(area) || !Current(generation)) return std::nullopt;
  return Apply(generation, MoveFrame(*frame, dx, dy, area), area);
}
std::optional<Rect> FrameController::Resize(uint64_t generation, std::string_view edge,
                                            double dx, double dy) {
  if (!Current(generation)) return std::nullopt;
  auto self = weak_.GetWeakPtr();
  auto frame = Frame();
  if (!self || !frame || !Current(generation)) return std::nullopt;
  if (edge != "n" && edge != "s" && edge != "e" && edge != "w" &&
      edge != "ne" && edge != "nw" && edge != "se" && edge != "sw") return frame;
  auto area_reader = area_;
  const Rect area = area_reader.Run();
  if (!self || !SafeArea(area) || !Current(generation)) return std::nullopt;
  return Apply(generation, ResizeFrame(*frame, edge, dx, dy, area), area);
}
std::optional<Rect> FrameController::Reset(uint64_t generation) {
  if (!Current(generation)) return std::nullopt;
  timer_.Stop();
  auto previous = std::exchange(pending_, std::nullopt);
  auto self = weak_.GetWeakPtr();
  auto write = write_;
  const bool saved = write.Run(std::nullopt);
  if (!self || !Current(generation)) return std::nullopt;
  if (!saved) {
    if (!pending_) pending_ = previous;
    return std::nullopt;
  }
  auto relayout = relayout_;
  relayout.Run();
  if (!self || !Current(generation)) return std::nullopt;
  return Frame();
}
}  // namespace blanc::glance::draft
