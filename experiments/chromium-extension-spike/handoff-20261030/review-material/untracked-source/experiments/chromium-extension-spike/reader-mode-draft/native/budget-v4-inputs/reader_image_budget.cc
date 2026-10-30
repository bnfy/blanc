#include "reader_image_budget.h"

#include <algorithm>
#include <limits>
#include "reader_raster.h"

namespace blanc::reader {
namespace {
constexpr uint64_t kTotalBytes = 20 * 1024 * 1024;
constexpr size_t kMaxAttempts = 30;
constexpr size_t kMaxConcurrent = 3;
}  // namespace
ReaderImageBudget::ReaderImageBudget(size_t image_count) : image_count_(image_count) {}
ReaderImageBudget::Admission ReaderImageBudget::Begin(size_t index, Time now) {
  if (closed_ || image_count_ > 100 || index >= image_count_) return {AdmissionKind::kDenied, 0};
  if (cached_.contains(index)) return {AdmissionKind::kCached, 0};
  if (jobs_.size() >= kMaxConcurrent || attempts_ >= kMaxAttempts || bytes_ >= kTotalBytes ||
      next_token_ == std::numeric_limits<uint64_t>::max()) return {AdmissionKind::kDenied, 0};
  for (const auto& [token, job] : jobs_) {
    if (job.index == index) return {AdmissionKind::kDenied, 0};
  }
  ++attempts_;
  const uint64_t token = ++next_token_;
  jobs_.emplace(token, Job{index, now + std::chrono::seconds(8), nullptr, 0});
  return {AdmissionKind::kStart, token};
}
std::shared_ptr<const std::vector<uint8_t>> ReaderImageBudget::BeginDecode(
    uint64_t token, Time now, std::vector<uint8_t> raw) {
  auto it = jobs_.find(token);
  if (closed_ || it == jobs_.end() || it->second.raw) return nullptr;
  if (now >= it->second.deadline || !ReaderRasterWithinLimits(raw, pixels_ + reserved_pixels_)) {
    jobs_.erase(it);
    return nullptr;
  }
  const auto header = ReadRasterDimensions(raw);
  if (!header) { jobs_.erase(it); return nullptr; }
  const uint64_t reservation = static_cast<uint64_t>(header->width) * header->height;
  it->second.raw = std::make_shared<const std::vector<uint8_t>>(raw);
  it->second.reserved_pixels = reservation;
  reserved_pixels_ += reservation;
  return it->second.raw;
}
bool ReaderImageBudget::Commit(uint64_t token, Time now, uint32_t width,
                               uint32_t height, size_t png_bytes) {
  auto it = jobs_.find(token);
  if (closed_ || it == jobs_.end()) return false;
  const Job job = it->second;
  jobs_.erase(it);
  reserved_pixels_ -= job.reserved_pixels;
  if (now >= job.deadline || !job.raw || !width || !height || !png_bytes ||
      png_bytes > kReaderMaxImageBytes || png_bytes > kTotalBytes - bytes_ ||
      !ReaderRasterWithinLimits(*job.raw, pixels_ + reserved_pixels_)) return false;
  auto header = ReadRasterDimensions(*job.raw);
  if (!header) return false;
  const uint64_t parsed_pixels = static_cast<uint64_t>(header->width) * header->height;
  const uint64_t decoded_pixels = static_cast<uint64_t>(width) * height;
  const uint64_t charged_pixels = std::max(parsed_pixels, decoded_pixels);
  if (decoded_pixels > kReaderMaxImagePixels || charged_pixels > kReaderMaxTotalPixels - pixels_ - reserved_pixels_)
    return false;
  bytes_ += png_bytes;
  pixels_ += charged_pixels;
  cached_.insert(job.index);
  return true;
}
void ReaderImageBudget::ForgetCached(size_t index) { cached_.erase(index); }
void ReaderImageBudget::Reject(uint64_t token) {
  auto it = jobs_.find(token);
  if (it == jobs_.end()) return;
  reserved_pixels_ -= it->second.reserved_pixels;
  jobs_.erase(it);
}
std::vector<uint64_t> ReaderImageBudget::Close() {
  closed_ = true;
  std::vector<uint64_t> tokens;
  tokens.reserve(jobs_.size());
  for (const auto& [token, job] : jobs_) tokens.push_back(token);
  jobs_.clear();
  reserved_pixels_ = 0;
  cached_.clear();
  return tokens;
}
}  // namespace blanc::reader
