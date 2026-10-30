#ifndef CHROME_BROWSER_DOWNLOAD_BLANC_DOWNLOAD_VERDICT_PROVENANCE_H_
#define CHROME_BROWSER_DOWNLOAD_BLANC_DOWNLOAD_VERDICT_PROVENANCE_H_

#include <array>
#include <cstddef>
#include <cstdint>
#include <limits>
#include <memory>
#include <optional>
#include <utility>

#include "base/memory/raw_ptr.h"
#include "base/memory/weak_ptr.h"
#include "base/supports_user_data.h"
#include "components/download/public/common/download_item.h"
#include "chrome/browser/download/blanc_download_verdict_state.h"

// Browser-owned, in-memory observations only. This class deliberately exposes
// no safe/unsafe decision: a caller must still establish which channels were
// applicable, final, and current and recheck policy before any action.
class BlancDownloadVerdictProvenance final
    : public base::SupportsUserData::Data,
      public download::DownloadItem::Observer {
 public:
  using Stage = BlancDownloadVerdictState::Stage;
  using Observation = BlancDownloadVerdictState::Observation;

  static BlancDownloadVerdictProvenance* GetOrCreate(
      download::DownloadItem* item) {
    if (!item) return nullptr;
    auto* existing = static_cast<BlancDownloadVerdictProvenance*>(
        item->GetUserData(&kUserDataKey));
    if (existing) return existing;
    auto owned = std::unique_ptr<BlancDownloadVerdictProvenance>(
        new BlancDownloadVerdictProvenance(item));
    auto* result = owned.get();
    item->SetUserData(&kUserDataKey, std::move(owned));
    return result;
  }
  static const BlancDownloadVerdictProvenance* Get(
      const download::DownloadItem* item) {
    return item ? static_cast<const BlancDownloadVerdictProvenance*>(
                      item->GetUserData(&kUserDataKey)) : nullptr;
  }

  ~BlancDownloadVerdictProvenance() override;
  BlancDownloadVerdictProvenance(const BlancDownloadVerdictProvenance&) = delete;
  BlancDownloadVerdictProvenance& operator=(const BlancDownloadVerdictProvenance&) = delete;

  base::WeakPtr<BlancDownloadVerdictProvenance> GetWeakPtr() {
    return weak_factory_.GetWeakPtr();
  }
  uint64_t Begin(Stage stage, bool content_check_supported = false) {
    return state_.Begin(stage, content_check_supported);
  }
  void Observe(Stage stage, uint64_t generation,
               safe_browsing::DownloadCheckResult result) {
    state_.Observe(stage, generation, result);
  }
  void InvalidateAll() { state_.InvalidateAll(); }
  Observation observation(Stage stage) const { return state_.observation(stage); }
  void OnDownloadUpdated(download::DownloadItem* item) override;
  void OnDownloadResuming(download::DownloadItem* item) override;
  void OnDownloadRemoved(download::DownloadItem* item) override;
  void OnDownloadDestroyed(download::DownloadItem* item) override;

 private:
  explicit BlancDownloadVerdictProvenance(download::DownloadItem* item);
  void Detach() {
    weak_factory_.InvalidateWeakPtrs();
    state_.Detach();
    auto* item = item_.get();
    item_ = nullptr;
    if (item) item->RemoveObserver(this);
  }

  inline static constexpr char kUserDataKey = 0;
  raw_ptr<download::DownloadItem> item_;
  BlancDownloadVerdictState state_;
  base::WeakPtrFactory<BlancDownloadVerdictProvenance> weak_factory_{this};
};

#endif  // CHROME_BROWSER_DOWNLOAD_BLANC_DOWNLOAD_VERDICT_PROVENANCE_H_
