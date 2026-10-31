// Per-reader accounting only, confined to the owner sequence.
// This class performs no network or decoding.
#ifndef BLANC_READER_IMAGE_BUDGET_H_
#define BLANC_READER_IMAGE_BUDGET_H_

#include <chrono>
#include <cstddef>
#include <cstdint>
#include <map>
#include <memory>
#include <optional>
#include <set>
#include <span>
#include <vector>

namespace blanc::reader {
class ReaderImageBudget {
 public:
  using Time = std::chrono::steady_clock::time_point;
  enum class AdmissionKind { kStart, kCached, kDenied };
  struct Admission { AdmissionKind kind; uint64_t token; };
  struct DecodeInput {
    std::shared_ptr<const std::vector<uint8_t>> bytes;
    uint32_t max_pixels;
  };

  explicit ReaderImageBudget(size_t image_count);
  Admission Begin(size_t index, Time now);
  // Call only after native policy, address pinning and bounded streaming. The
  // decoder must consume the exact immutable bytes and enforce the returned
  // max_pixels before allocation in the sandboxed decoder process.
  std::optional<DecodeInput> BeginDecode(
      uint64_t token, Time now, std::vector<uint8_t> raw);
  // Dimensions and PNG size must come from the trusted decoder of those bytes.
  bool Commit(uint64_t token, Time now, uint32_t decoded_width,
              uint32_t decoded_height, size_t png_bytes);
  // Call if storing the committed PNG fails; accounting stays charged.
  void ForgetCached(size_t index);
  void Reject(uint64_t token);
  // Owner must immediately abort the returned network/decoder operations.
  std::vector<uint64_t> Close();

  size_t active() const { return jobs_.size(); }
  size_t attempts() const { return attempts_; }
  uint64_t pixels() const { return pixels_; }
  uint64_t reserved_pixels() const { return reserved_pixels_; }
  uint64_t bytes() const { return bytes_; }

 private:
  struct Job { size_t index; Time deadline; std::shared_ptr<const std::vector<uint8_t>> raw; uint64_t reserved_pixels; };
  size_t image_count_;
  uint64_t next_token_ = 0;
  size_t attempts_ = 0;
  uint64_t pixels_ = 0;
  uint64_t reserved_pixels_ = 0;
  uint64_t bytes_ = 0;
  bool closed_ = false;
  std::map<uint64_t, Job> jobs_;
  std::set<size_t> cached_;
};
}  // namespace blanc::reader
#endif  // BLANC_READER_IMAGE_BUDGET_H_
