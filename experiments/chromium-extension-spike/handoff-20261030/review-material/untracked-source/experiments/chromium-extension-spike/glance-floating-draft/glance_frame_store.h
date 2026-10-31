#ifndef BLANC_GLANCE_FLOATING_DRAFT_FRAME_STORE_H_
#define BLANC_GLANCE_FLOATING_DRAFT_FRAME_STORE_H_

#include <cstdint>
#include <memory>
#include <optional>

#include "base/files/file_path.h"
#include "base/functional/callback.h"
#include "base/memory/ref_counted.h"
#include "base/memory/weak_ptr.h"
#include "base/sequence_checker.h"
#include "glance_geometry.h"

namespace base { class SequencedTaskRunner; }
namespace blanc::glance::draft {

// One instance per original profile. The owning profile must outlive its
// windows and retain this store until writes settle. No writes occur before a
// successful read; malformed or unreadable data is never overwritten.
class GlanceFrameStore {
 public:
  enum class State { kLoading, kReady, kWriting, kWriteFailed, kReadFailed };
  GlanceFrameStore(base::FilePath path, base::RepeatingClosure changed);
  ~GlanceFrameStore();
  GlanceFrameStore(const GlanceFrameStore&) = delete;
  GlanceFrameStore& operator=(const GlanceFrameStore&) = delete;

  void Initialize();
  State state() const;
  // Valid only after initialization succeeds; empty is the default/reset.
  std::optional<Rect> Read() const;
  // True means accepted in memory and scheduled, not written to disk.
  bool Write(std::optional<Rect> frame);
  // The close path must wait until this is true and surface a failed write.
  bool IsDurable() const;
  bool Retry();

 private:
  struct ReadResult;
  void OnRead(ReadResult result);
  bool Schedule(std::optional<Rect> frame);
  void OnWritten(uint64_t sequence, bool ok);

  const base::FilePath path_;
  base::RepeatingClosure changed_;
  scoped_refptr<base::SequencedTaskRunner> runner_;
  std::optional<Rect> frame_;
  State state_ = State::kLoading;
  bool started_ = false;
  uint64_t sequence_ = 0;
  uint64_t completed_ = 0;
  bool latest_ok_ = true;
  SEQUENCE_CHECKER(sequence_checker_);
  base::WeakPtrFactory<GlanceFrameStore> weak_factory_{this};
};
}  // namespace blanc::glance::draft
#endif
