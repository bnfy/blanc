#ifndef CHROME_BROWSER_DOWNLOAD_BLANC_DOWNLOAD_VERDICT_STATE_H_
#define CHROME_BROWSER_DOWNLOAD_BLANC_DOWNLOAD_VERDICT_STATE_H_

#include <array>
#include <cstddef>
#include <cstdint>
#include <limits>
#include <optional>

#include "components/safe_browsing/core/browser/download_check_result.h"

// Raw observations only; none constitutes an authorization decision.
class BlancDownloadVerdictState {
 public:
  enum class Stage : size_t { kUrl, kClient, kSavePackage, kCount };
  struct Observation {
    uint64_t generation = 0;
    bool exhausted = false;
    bool pending = false;
    std::optional<safe_browsing::DownloadCheckResult> last_result;
    bool content_check_supported = false;
  };

  uint64_t Begin(Stage stage, bool supported = false) {
    const auto index = static_cast<size_t>(stage);
    if (!active_ || index >= entries_.size()) return 0;
    auto& entry = entries_[index];
    if (entry.exhausted || entry.generation == std::numeric_limits<uint64_t>::max()) {
      entry.exhausted = true;
      entry.pending = false;
      entry.last_result.reset();
      return 0;
    }
    ++entry.generation;
    entry.pending = true;
    entry.last_result.reset();
    entry.content_check_supported = supported;
    return entry.generation;
  }
  void Observe(Stage stage, uint64_t generation,
               safe_browsing::DownloadCheckResult result) {
    const auto index = static_cast<size_t>(stage);
    if (!active_ || index >= entries_.size()) return;
    auto& entry = entries_[index];
    if (entry.exhausted || !generation || entry.generation != generation) return;
    entry.last_result = result;
    // Repeating callbacks can emit later results; pending is not a guarantee
    // that every applicable protection channel has completed.
    entry.pending = result == safe_browsing::DownloadCheckResult::ASYNC_SCANNING ||
                    result == safe_browsing::DownloadCheckResult::ASYNC_LOCAL_PASSWORD_SCANNING ||
                    result == safe_browsing::DownloadCheckResult::IMMEDIATE_DEEP_SCAN ||
                    result == safe_browsing::DownloadCheckResult::PROMPT_FOR_SCANNING ||
                    result == safe_browsing::DownloadCheckResult::PROMPT_FOR_LOCAL_PASSWORD_SCANNING;
  }
  void InvalidateAll() {
    for (auto& entry : entries_) {
      if (entry.generation != std::numeric_limits<uint64_t>::max())
        ++entry.generation;
      else
        entry.exhausted = true;
      entry.pending = false;
      entry.last_result.reset();
    }
  }
  void Detach() { InvalidateAll(); active_ = false; }
  Observation observation(Stage stage) const {
    const auto index = static_cast<size_t>(stage);
    return index < entries_.size() ? entries_[index] : Observation{};
  }

 private:
  bool active_ = true;
  std::array<Observation, static_cast<size_t>(Stage::kCount)> entries_{};
};

#endif  // CHROME_BROWSER_DOWNLOAD_BLANC_DOWNLOAD_VERDICT_STATE_H_
