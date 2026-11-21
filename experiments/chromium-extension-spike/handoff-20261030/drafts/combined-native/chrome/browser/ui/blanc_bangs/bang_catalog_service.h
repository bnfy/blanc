#ifndef BLANC_BANGS_DRAFT_CATALOG_SERVICE_H_
#define BLANC_BANGS_DRAFT_CATALOG_SERVICE_H_
#include "bang_catalog.h"
#include "base/files/file_path.h"
#include "base/functional/callback.h"
#include "base/memory/weak_ptr.h"
#include "base/sequence_checker.h"
#include <optional>
namespace blanc::bangs::draft {
// UI-sequence owned. Call Start once with an independently trusted asset root.
// Destruction cancels the reply; the background task owns no browser objects.
class BangCatalogService {
 public:
  enum class State { kIdle, kLoading, kReady, kFailed };
  BangCatalogService();
  ~BangCatalogService();
  BangCatalogService(const BangCatalogService&) = delete;
  BangCatalogService& operator=(const BangCatalogService&) = delete;
  bool Start(const base::FilePath& trusted_root, base::OnceCallback<void(bool)> done);
  State state() const;
  const BangCatalog* catalog() const;
 private:
  void OnLoaded(base::OnceCallback<void(bool)> done, std::optional<BangCatalog> catalog);
  SEQUENCE_CHECKER(sequence_checker_);
  State state_ = State::kIdle;
  std::optional<BangCatalog> catalog_;
  base::WeakPtrFactory<BangCatalogService> weak_factory_{this};
};
}  // namespace blanc::bangs::draft
#endif
