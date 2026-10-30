#ifndef BLANC_SYNC_BLOB_TRANSPORT_H_
#define BLANC_SYNC_BLOB_TRANSPORT_H_
#include <memory>
#include <atomic>
#include <cstdint>
#include <optional>
#include <string>
#include "base/functional/callback.h"
#include "base/memory/scoped_refptr.h"
#include "base/memory/weak_ptr.h"
#include "base/sequence_checker.h"
#include "base/task/sequenced_task_runner.h"
#include "services/network/public/cpp/shared_url_loader_factory.h"
namespace network { class SimpleURLLoader; }
namespace blanc::sync {
// Sequence-owned native transport. Not exposed to renderer. Caller must enforce
// brand/Personal/account/consent gates and charge the profile ledger BEFORE GET.
// No retry here: queue conflict/rate-limit policy owns every further request.
class BlobTransport {
 public:
  enum class Method { kGet, kPut, kDeleteAccount, kDeleteSpace };
  enum class Deadline { kNormal, kDeparture };
  struct Request {
    Method method;
    std::string account, store, body;
    Deadline deadline = Deadline::kNormal;
  };
  struct Response {
    int net_error = 0, status = 0;
    bool space_delete_supported = false;
    std::string body, error;
  };
  using Completed = base::OnceCallback<void(Response)>;
  explicit BlobTransport(scoped_refptr<network::SharedURLLoaderFactory> factory);
  ~BlobTransport();
  // One request at a time, matching the profile queue. Invalid/busy replies
  // are posted. Account locators are never accepted as URL fragments/queries.
  void Start(Request request, Completed done);
  void Cancel();
  static std::optional<std::string> PathFor(const Request& request);
 private:
  void Finished(std::optional<std::string> body);
  void Post(Completed done, Response response);
  scoped_refptr<network::SharedURLLoaderFactory> factory_;
  scoped_refptr<base::SequencedTaskRunner> runner_;
  std::unique_ptr<network::SimpleURLLoader> loader_;
  Completed pending_;
  std::shared_ptr<std::atomic<uint64_t>> generation_ =
      std::make_shared<std::atomic<uint64_t>>(0);
  std::string active_account_, capability_account_;
  bool active_get_ = false;
  bool space_delete_supported_ = false;
  SEQUENCE_CHECKER(sequence_checker_);
  base::WeakPtrFactory<BlobTransport> weak_factory_{this};
};
}  // namespace blanc::sync
#endif
