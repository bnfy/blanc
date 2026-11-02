#include "blob_exchange.h"
#include "base/functional/bind.h"
#include "base/json/json_reader.h"
#include "base/json/json_writer.h"
#include "base/values.h"
#include "base/task/bind_post_task.h"
#include "crypto/secure_util.h"
namespace blanc::sync {
namespace {
using Queue = RequestWorker::Queue;
void Wipe(std::string& text) { crypto::SecureZeroBuffer(base::as_writable_byte_span(text)); }
struct Operation : std::enable_shared_from_this<Operation> {
  std::shared_ptr<BlobTransport> transport;
  std::shared_ptr<const ProtocolKey> key;
  std::string account, store;
  bool optional_store;
  BlobExchangeMode mode;
  size_t attempt;
  BlobModelHooks hooks;
  Queue::TransportCompleted done;
  void Finish(std::string error, std::optional<std::string> outcome = {}, bool retry = false) {
    auto callback = std::move(done);
    if (callback) callback({std::move(outcome), retry, std::move(error)});
  }
  bool Current() {
    const auto reason = hooks.cancelled ? hooks.cancelled() : std::string();
    if (reason.empty()) return true;
    Finish("cancelled:" + reason); return false;
  }
  bool Network(const BlobTransport::Response& response) {
    if (!Current()) return false;
    if (response.net_error || !response.error.empty()) { Finish("offline"); return false; }
    return true;
  }
  std::string Error(const BlobTransport::Response& response) {
    if (response.status == 429) return "rate-limited";
    if (response.status == 503) {
      const auto body=base::JSONReader::ReadDict(response.body,base::JSON_PARSE_RFC,32);
      const auto* error=body ? body->FindString("error") : nullptr;
      if (error && *error == "quota erasure pending") return "erasure-pending";
    }
    return "http-" + std::to_string(response.status);
  }
  void Start() {
    if (!Current()) return;
    if (!transport || !key || (!hooks.plan && !hooks.plan_async && !hooks.plan_guarded_async) ||
        (hooks.plan_guarded_async && (!hooks.cancelled || hooks.plan || hooks.plan_async))) {
      Finish("service-unavailable"); return;
    }
    transport->Start({BlobTransport::Method::kGet,account,store,{},
        mode == BlobExchangeMode::kDeparture ? BlobTransport::Deadline::kDeparture : BlobTransport::Deadline::kNormal}, base::BindOnce(
        [](std::shared_ptr<Operation> self, BlobTransport::Response response) {
          self->Read(std::move(response));
        }, shared_from_this()));
  }
  void Read(BlobTransport::Response response) {
    if (!Network(response)) return;
    std::optional<std::string> clear;
    base::Value version;
    if (response.status == 200) {
      auto body = base::JSONReader::ReadDict(response.body,base::JSON_PARSE_RFC,32);
      const auto* wire = body ? body->FindDict("blob") : nullptr;
      const auto* v = body ? body->FindString("version") : nullptr;
      if (!wire || !v || v->empty() || v->size() > 128) { Finish("server"); return; }
      const auto bv = wire->FindInt("v");
      const auto* iv=wire->FindString("iv"), *ct=wire->FindString("ct"), *tag=wire->FindString("tag");
      if (!bv || !iv || !ct || !tag) { Finish("bad-passphrase"); return; }
      clear=Decrypt(*key, Envelope{*bv,*iv,*ct,*tag});
      if (!clear) { Finish("bad-passphrase"); return; }
      // Native synchronous planners use this validator. Lossless asynchronous
      // planners own JavaScript-compatible JSON validation on their sequence;
      // authenticated wire text must never be compiled as code.
      if (!hooks.plan_async && !hooks.plan_guarded_async && !base::JSONReader::Read(*clear,base::JSON_PARSE_RFC,128)) {
        Wipe(*clear); Finish("bad-passphrase"); return;
      }
      version=base::Value(*v);
    } else if (response.status == 404) {
      // Leaving never creates a record which did not already exist.
      if (mode == BlobExchangeMode::kDeparture) { Finish({},"unchanged"); return; }
      if (optional_store && response.body == "unknown store") { Finish({},"unavailable"); return; }
    } else { Finish(Error(response)); return; }
    if (!Current()) { if (clear) Wipe(*clear); return; }
    if (hooks.plan_guarded_async) {
      hooks.plan_guarded_async(std::move(clear),hooks.cancelled,base::BindPostTask(
          base::SequencedTaskRunner::GetCurrentDefault(),base::BindOnce(
              &Operation::Planned,shared_from_this(),std::move(version))));
      return;
    }
    if (hooks.plan_async) {
      hooks.plan_async(std::move(clear),base::BindPostTask(
          base::SequencedTaskRunner::GetCurrentDefault(),base::BindOnce(
              &Operation::Planned,shared_from_this(),std::move(version))));
      return;
    }
    auto plan=hooks.plan(clear);
    if (clear) Wipe(*clear);
    Planned(std::move(version),std::move(plan));
  }
  void Planned(base::Value version,BlobPlan plan) {
    if (!Current()) { if (plan.upload) Wipe(*plan.upload); return; }
    if (!plan.error.empty()) { if (plan.upload) Wipe(*plan.upload); Finish(std::move(plan.error)); return; }
    if (!plan.upload) { Finish({},"unchanged"); return; }
    auto blob=Encrypt(*key,*plan.upload); Wipe(*plan.upload);
    if (!blob) { Finish("payload-too-large"); return; }
    base::DictValue envelope; envelope.Set("v",blob->version);envelope.Set("iv",blob->iv);
    envelope.Set("ct",blob->ct);envelope.Set("tag",blob->tag);
    const auto encoded=base::WriteJson(envelope);
    if (!encoded || encoded->size() > 524288-4096) { Finish("payload-too-large"); return; }
    base::DictValue payload;payload.Set("ifVersion",std::move(version));payload.Set("blob",std::move(envelope));
    auto upload=base::WriteJson(payload);
    if (!upload) { Finish("server"); return; }
    transport->Start({BlobTransport::Method::kPut,account,store,std::move(*upload),
        mode == BlobExchangeMode::kDeparture ? BlobTransport::Deadline::kDeparture : BlobTransport::Deadline::kNormal},base::BindOnce(
        [](std::shared_ptr<Operation> self,BlobTransport::Response response) {
          self->Written(std::move(response));
        },shared_from_this()));
  }
  void Written(BlobTransport::Response response) {
    if (!Network(response)) return;
    if (response.status == 409) {
      if (attempt < (mode == BlobExchangeMode::kDeparture ? 1u : 3u)) Finish({}, {}, true); else Finish("conflict");
      return;
    }
    if (response.status == 507) { Finish("account-quota");return; }
    if (optional_store && response.status == 404) { Finish({},"unavailable");return; }
    if (response.status < 200 || response.status >= 300) { Finish(Error(response));return; }
    if (hooks.stored) hooks.stored();
    Finish({},"stored");
  }
};
}  // namespace
Queue::Request MakeBlobExchange(std::shared_ptr<BlobTransport> transport,
    std::shared_ptr<const ProtocolKey> key, std::string account,std::string store,
    std::string generation,RequestClass kind,bool optional_store,BlobModelHooks hooks,
    BlobExchangeMode mode) {
  Queue::Request request;request.kind=kind;request.item=store;request.generation=std::move(generation);
  request.immediate_only = mode == BlobExchangeMode::kDeparture;
  request.cancelled=hooks.cancelled;
  auto dispatch_guard=std::make_shared<std::function<std::string()>>(hooks.cancelled);
  request.bind_cancellation=[dispatch_guard](std::function<std::string()> guard) {
    *dispatch_guard=std::move(guard);
  };
  request.run=[transport=std::move(transport),key=std::move(key),account=std::move(account),
      store=std::move(store),optional_store,mode,hooks=std::move(hooks),dispatch_guard](size_t attempt,Queue::TransportCompleted done) {
    auto operation=std::make_shared<Operation>();operation->transport=transport;operation->key=key;
    operation->account=account;operation->store=store;operation->optional_store=optional_store;operation->mode=mode;
    operation->attempt=attempt;operation->hooks=hooks;operation->hooks.cancelled=*dispatch_guard;operation->done=std::move(done);operation->Start();
  };
  return request;
}
}  // namespace blanc::sync
