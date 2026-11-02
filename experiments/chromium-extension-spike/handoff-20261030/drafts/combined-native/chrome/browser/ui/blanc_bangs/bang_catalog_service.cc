#include "bang_catalog_service.h"
#include "base/files/file_util.h"
#include "base/functional/bind.h"
#include "base/task/thread_pool.h"
#include "base/task/task_traits.h"
namespace blanc::bangs::draft {
namespace {
std::optional<BangCatalog> LoadCatalog(const base::FilePath& root) {
  std::string bytes;
  if (root.empty() || !base::ReadFileToStringWithMaxSize(
          root.AppendASCII("blanc-bangs-catalog.json"), &bytes, 2 * 1024 * 1024))
    return std::nullopt;
  return ParsePinnedCatalog(bytes);
}
}  // namespace
BangCatalogService::BangCatalogService() = default;
BangCatalogService::~BangCatalogService() { DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_); }
bool BangCatalogService::Start(const base::FilePath& root, base::OnceCallback<void(bool)> done) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  if (state_ != State::kIdle || !done || root.empty()) return false;
  state_ = State::kLoading;
  const bool posted = base::ThreadPool::PostTaskAndReplyWithResult(
      FROM_HERE, {base::MayBlock(), base::TaskPriority::USER_VISIBLE},
      base::BindOnce(&LoadCatalog, root),
      base::BindOnce(&BangCatalogService::OnLoaded, weak_factory_.GetWeakPtr(), std::move(done)));
  if (!posted) state_ = State::kFailed;
  return posted;
}
BangCatalogService::State BangCatalogService::state() const {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_); return state_;
}
const BangCatalog* BangCatalogService::catalog() const {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_); return catalog_ ? &*catalog_ : nullptr;
}
void BangCatalogService::OnLoaded(base::OnceCallback<void(bool)> done, std::optional<BangCatalog> catalog) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  catalog_ = std::move(catalog);
  state_ = catalog_ ? State::kReady : State::kFailed;
  std::move(done).Run(catalog_.has_value());
}
}  // namespace blanc::bangs::draft
