#ifndef BLANC_SYNC_BLOB_EXCHANGE_H_
#define BLANC_SYNC_BLOB_EXCHANGE_H_
#include "blob_transport.h"
#include "protocol_cipher.h"
#include "request_worker.h"
namespace blanc::sync {
struct BlobPlan {
  // No upload means no server write; a read-only model may still update cache.
  std::optional<std::string> upload;
  std::string error;
};
struct BlobModelHooks {
  std::function<std::string()> cancelled;
  // Native-only model merge/export, on the worker sequence. A missing record
  // is nullopt. This must not mutate another profile/account or inspect UI.
  std::function<BlobPlan(const std::optional<std::string>&)> plan;
  // Native-only lossless planner. It MUST parse authenticated input as JSON
  // (never code) and reject malformed JSON. Completion may arrive from any
  // sequence; the exchange returns it to its owner and rechecks cancellation.
  using Planned = base::OnceCallback<void(BlobPlan)>;
  std::function<void(std::optional<std::string>, Planned)> plan_async;
  // For models that may commit local state during planning. The supplied live
  // guard is the final dispatch-bound controller/worker guard; call it on the
  // exchange owner sequence immediately before any local side effect. Missing
  // guard fails closed. Authenticated wire text remains JSON data, never code.
  using Guard = std::function<std::string()>;
  std::function<void(std::optional<std::string>, Guard, Planned)> plan_guarded_async;
  std::function<void()> stored;
};
enum class BlobExchangeMode { kNormal, kDeparture };
// Account/store identity is immutable for the entire queued operation. Native
// caller supplies qualified key, gates and the profile-wide queue/controller.
// Each conflict retry re-enters that queue, charging a fresh GET reservation.
RequestWorker::Queue::Request MakeBlobExchange(
    std::shared_ptr<BlobTransport> transport, std::shared_ptr<const ProtocolKey> key,
    std::string account, std::string store, std::string generation,
    RequestClass kind, bool optional_store, BlobModelHooks hooks,
    BlobExchangeMode mode = BlobExchangeMode::kNormal);
}  // namespace blanc::sync
#endif
