#include "glance_frame_store.h"

#include <cmath>
#include <limits>
#include <utility>

#include "base/check.h"
#include "base/containers/span.h"
#include "base/files/file.h"
#include "base/files/file_util.h"
#include "base/files/important_file_writer.h"
#include "base/functional/bind.h"
#include "base/json/json_reader.h"
#include "base/json/json_writer.h"
#include "base/task/sequenced_task_runner.h"
#include "base/task/thread_pool.h"
#include "base/values.h"

namespace blanc::glance::draft {
namespace {
bool Valid(Rect r) {
  return std::isfinite(r.x) && std::isfinite(r.y) &&
      std::isfinite(r.width) && std::isfinite(r.height) &&
      r.x >= 0 && r.x <= 1 && r.y >= 0 && r.y <= 1 &&
      r.width > 0 && r.width <= 1 && r.height > 0 && r.height <= 1;
}
base::Value Encode(std::optional<Rect> frame) {
  if (!frame) return base::Value();
  base::DictValue value;
  value.Set("x", frame->x);
  value.Set("y", frame->y);
  value.Set("width", frame->width);
  value.Set("height", frame->height);
  return base::Value(std::move(value));
}
bool Save(base::FilePath path, std::optional<Rect> frame) {
  base::DictValue doc;
  doc.Set("version", 1);
  doc.Set("frame", Encode(frame));
  auto json = base::WriteJson(doc);
  return json && base::ImportantFileWriter::WriteFileAtomically(path, *json);
}
}  // namespace

struct GlanceFrameStore::ReadResult {
  bool ok = false;
  std::optional<Rect> frame;
};
GlanceFrameStore::GlanceFrameStore(base::FilePath path, base::RepeatingClosure changed)
    : path_(std::move(path)), changed_(std::move(changed)),
      runner_(base::ThreadPool::CreateSequencedTaskRunner(
          {base::MayBlock(), base::TaskShutdownBehavior::BLOCK_SHUTDOWN})) {}
GlanceFrameStore::~GlanceFrameStore() { DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_); }
void GlanceFrameStore::Initialize() {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  if (started_) return;
  started_ = true;
  const bool posted = runner_->PostTaskAndReplyWithResult(FROM_HERE,
      base::BindOnce([](base::FilePath path) -> ReadResult {
        if (base::IsLink(path)) return {};
        base::File file(path, base::File::FLAG_OPEN | base::File::FLAG_READ);
        if (!file.IsValid())
          return file.error_details() == base::File::FILE_ERROR_NOT_FOUND
              ? ReadResult{true, std::nullopt} : ReadResult{};
        base::File::Info info;
        if (!file.GetInfo(&info) || info.is_directory || info.size < 0 ||
            info.size > 4096) return {};
        std::string bytes(static_cast<size_t>(info.size), '\0');
        if (!bytes.empty()) {
          auto count = file.ReadAtCurrentPos(base::as_writable_byte_span(bytes));
          if (!count || *count != bytes.size()) return {};
        }
        auto doc = base::JSONReader::ReadDict(bytes, base::JSON_PARSE_RFC);
        if (!doc || doc->size() != 2 || doc->FindInt("version") != 1) return {};
        const auto* value = doc->Find("frame");
        if (!value) return {};
        if (value->is_none()) return {true, std::nullopt};
        if (!value->is_dict() || value->GetDict().size() != 4) return {};
        const auto& d = value->GetDict();
        auto x=d.FindDouble("x"), y=d.FindDouble("y"), w=d.FindDouble("width"), h=d.FindDouble("height");
        if (!x || !y || !w || !h) return {};
        Rect frame{*x,*y,*w,*h};
        return Valid(frame) ? ReadResult{true, frame} : ReadResult{};
      }, path_), base::BindOnce(&GlanceFrameStore::OnRead, weak_factory_.GetWeakPtr()));
  if (!posted) OnRead({});
}
void GlanceFrameStore::OnRead(ReadResult result) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  frame_ = result.frame;
  state_ = result.ok ? State::kReady : State::kReadFailed;
  if (changed_) changed_.Run();
}
GlanceFrameStore::State GlanceFrameStore::state() const {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  return state_;
}
std::optional<Rect> GlanceFrameStore::Read() const {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  return frame_;
}
bool GlanceFrameStore::Write(std::optional<Rect> frame) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  if (state_ == State::kLoading || state_ == State::kReadFailed ||
      (frame && !Valid(*frame)) || sequence_ == std::numeric_limits<uint64_t>::max())
    return false;
  frame_ = frame;
  return Schedule(frame);
}
bool GlanceFrameStore::Schedule(std::optional<Rect> frame) {
  const uint64_t sequence = ++sequence_;
  state_ = State::kWriting;
  const bool posted = runner_->PostTaskAndReplyWithResult(FROM_HERE,
      base::BindOnce(&Save, path_, frame),
      base::BindOnce(&GlanceFrameStore::OnWritten, weak_factory_.GetWeakPtr(), sequence));
  if (!posted) {
    completed_ = sequence;
    latest_ok_ = false;
    state_ = State::kWriteFailed;
  }
  return posted;
}
void GlanceFrameStore::OnWritten(uint64_t sequence, bool ok) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  // Replies are sequenced by the worker; only the final requested write may
  // establish durability or expose failure for the current value.
  completed_ = sequence;
  if (sequence == sequence_) {
    latest_ok_ = ok;
    state_ = ok ? State::kReady : State::kWriteFailed;
  }
  if (changed_) changed_.Run();
}
bool GlanceFrameStore::IsDurable() const {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  return started_ && state_ == State::kReady && sequence_ == completed_ && latest_ok_;
}
bool GlanceFrameStore::Retry() {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  if (state_ != State::kWriteFailed || sequence_ == std::numeric_limits<uint64_t>::max())
    return false;
  return Schedule(frame_);
}
}  // namespace blanc::glance::draft
