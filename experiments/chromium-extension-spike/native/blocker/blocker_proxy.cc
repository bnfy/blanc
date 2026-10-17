#include "chrome/services/blanc_blocker/blocker_proxy.h"
#include <deque>
#include <memory>
#include "base/command_line.h"
#include "base/files/file_util.h"
#include "base/functional/bind.h"
#include "base/json/json_writer.h"
#include "base/no_destructor.h"
#include "base/memory/weak_ptr.h"
#include "base/strings/string_number_conversions.h"
#include "base/strings/string_util.h"
#include "base/task/thread_pool.h"
#include "base/timer/timer.h"
#include "chrome/services/blanc_blocker/blocker.mojom.h"
#include "chrome/services/blanc_blocker/bundle_hash.h"
#include "content/public/browser/browser_context.h"
#include "content/public/browser/render_frame_host.h"
#include "content/public/browser/service_process_host.h"
#include "crypto/hash.h"
#include "mojo/public/cpp/bindings/callback_helpers.h"
#include "mojo/public/cpp/bindings/receiver.h"
#include "mojo/public/cpp/bindings/remote.h"
#include "net/base/net_errors.h"
#include "net/url_request/redirect_info.h"
#include "services/network/public/cpp/resource_request.h"
#include "services/network/public/cpp/self_deleting_url_loader_factory.h"
#include "services/network/public/cpp/url_loader_completion_status.h"
#include "services/network/public/cpp/url_loader_factory_builder.h"
#include "services/network/public/cpp/wrapper_shared_url_loader_factory.h"
#include "services/network/public/mojom/url_loader.mojom.h"
#include "services/network/public/mojom/early_hints.mojom.h"
#include "services/network/public/mojom/url_response_head.mojom.h"
#include "url/origin.h"
namespace blanc {
namespace {
using DecisionCallback = base::OnceCallback<void(int)>;

void Record(base::DictValue value) {
  // Disabled by default, including in private profiles. The acceptance harness
  // explicitly opts its disposable instance into local, ordered observations.
  auto file = base::CommandLine::ForCurrentProcess()->GetSwitchValuePath("blanc-blocker-log");
  if (file.empty()) return;
  auto json = base::WriteJson(value);
  if (!json) return;
  static base::NoDestructor<scoped_refptr<base::SequencedTaskRunner>> writer(
      base::ThreadPool::CreateSequencedTaskRunner({base::MayBlock(), base::TaskShutdownBehavior::BLOCK_SHUTDOWN}));
  (*writer)->PostTask(FROM_HERE, base::BindOnce([](base::FilePath path, std::string line) {
    base::AppendToFile(path, line);
  }, file, *json + "\n"));
}
class Engine {
 public:
  static Engine& Get() { static base::NoDestructor<Engine> engine; return *engine; }
  Engine() = default;
  void Decide(std::string url, std::string type, std::string referrer, DecisionCallback callback) {
    if (failed_) { std::move(callback).Run(-1); return; }
    if (!started_) Start();
    if (!ready_) {
      if (waiting_.size() >= 4096) { std::move(callback).Run(-1); return; }
      waiting_.push_back(base::BindOnce(&Engine::Decide, base::Unretained(this),
                        std::move(url), std::move(type), std::move(referrer), std::move(callback)));
      return;
    }
    if (inflight_ >= 256) { std::move(callback).Run(-1); return; }
    ++inflight_;
    service_->Decide(url, type, referrer, mojo::WrapCallbackWithDefaultInvokeIfNotRun(
      base::BindOnce([](Engine* self, DecisionCallback cb, int result) {
        --self->inflight_; std::move(cb).Run(result);
      }, base::Unretained(this), std::move(callback)), -1));
  }
  void Fail() {
    failed_ = true; ready_ = false; startup_.Stop(); service_.reset();
    auto pending = std::move(waiting_);
    for (auto& callback : pending) std::move(callback).Run();
  }
 private:
  void Start() {
    started_ = true;
    startup_.Start(FROM_HERE, base::Seconds(30), base::BindOnce(&Engine::Fail, base::Unretained(this)));
    auto file = base::CommandLine::ForCurrentProcess()->GetSwitchValuePath("blanc-blocker-assets").AppendASCII("engine.js");
    base::ThreadPool::PostTaskAndReplyWithResult(FROM_HERE, {base::MayBlock()},
      base::BindOnce([](base::FilePath path) {
        std::string script;
        if (!base::ReadFileToStringWithMaxSize(path, &script, 16 * 1024 * 1024)) return std::string();
        if (base::ToLowerASCII(base::HexEncode(crypto::hash::Sha256(script))) != kBlancBlockerBundleSha256) return std::string();
        return script;
      }, file), base::BindOnce(&Engine::Loaded, base::Unretained(this)));
  }
  void Loaded(std::string script) {
    if (failed_) return;
    if (script.empty()) { Fail(); return; }
    service_ = content::ServiceProcessHost::Launch<mojom::Blocker>(
        content::ServiceProcessHost::Options().WithDisplayName("Blanc Blocker").Pass());
    service_.set_disconnect_handler(base::BindOnce(&Engine::Fail, base::Unretained(this)));
    service_->Initialize(script, base::BindOnce(&Engine::Initialized, base::Unretained(this)));
  }
  void Initialized(bool ready) {
    if (failed_) return;
    if (!ready) { Fail(); return; }
    ready_ = true; startup_.Stop();
    base::DictValue event; event.Set("event", "engine-ready");
    event.Set("bundle_sha256", kBlancBlockerBundleSha256); Record(std::move(event));
    auto pending = std::move(waiting_);
    for (auto& callback : pending) std::move(callback).Run();
  }
  bool started_ = false, ready_ = false, failed_ = false;
  int inflight_ = 0;
  std::deque<base::OnceClosure> waiting_;
  mojo::Remote<mojom::Blocker> service_;
  base::OneShotTimer startup_;
};
std::string Type(const network::ResourceRequest& request) {
  if (request.is_fetch_like_api) return "xhr";
  using D = network::mojom::RequestDestination;
  switch (request.destination) {
    case D::kDocument: return "mainFrame";
    case D::kIframe: case D::kFrame: case D::kFencedframe: return "subFrame";
    case D::kStyle: case D::kXslt: return "stylesheet";
    case D::kScript: case D::kWorker: case D::kSharedWorker: case D::kServiceWorker: return "script";
    case D::kImage: return "image";
    case D::kFont: return "font";
    case D::kAudio: case D::kVideo: case D::kTrack: return "media";
    case D::kObject: case D::kEmbed: return "object";
    case D::kReport: return "cspReport";
    default: return request.keepalive ? "ping" : "other";
  }
}
struct Context {
  bool private_profile;
  content::GlobalRenderFrameHostId frame;
  int factory_type;
};
// One request owns both Mojo sides. Cancellation and disconnect delete it and
// invalidate every pending decision callback. The underlying loader is never
// started until the utility replies; redirect hops pass through the same gate.
class Request : public network::mojom::URLLoader, public network::mojom::URLLoaderClient {
 public:
  Request(Context context, scoped_refptr<network::SharedURLLoaderFactory> factory,
      mojo::PendingReceiver<network::mojom::URLLoader> receiver, int32_t id, uint32_t options,
      const network::ResourceRequest& request, mojo::PendingRemote<network::mojom::URLLoaderClient> client,
      const net::MutableNetworkTrafficAnnotationTag& annotation)
      : context_(context), factory_(std::move(factory)), id_(id), options_(options), request_(request),
        annotation_(annotation), receiver_(this, std::move(receiver)), client_(std::move(client)), incoming_(this) {
    receiver_.set_disconnect_handler(base::BindOnce(&Request::Destroy, base::Unretained(this)));
    client_.set_disconnect_handler(base::BindOnce(&Request::Destroy, base::Unretained(this)));
  }
  void Begin() { Gate(base::BindOnce(&Request::Start, weak_.GetWeakPtr())); }
  ~Request() override = default;
  void FollowRedirect(network::HttpRequestHeadersUpdateParams headers, const std::optional<GURL>& url) override {
    // Forward all validation to the real loader. A caller-supplied replacement
    // URL is not yet supported: refuse rather than evaluate a different hop.
    if (!redirect_pending_ || url) { Complete(net::ERR_BLOCKED_BY_CLIENT); return; }
    redirect_pending_ = false;
    loader_->FollowRedirect(std::move(headers), url);
  }
  void SetPriority(net::RequestPriority priority, int32_t intra) override {
    priority_ = priority; intra_ = intra;
    if (loader_) loader_->SetPriority(priority, intra);
  }
  void OnReceiveEarlyHints(network::mojom::EarlyHintsPtr hints) override { client_->OnReceiveEarlyHints(std::move(hints)); }
  void OnReceiveResponse(network::mojom::URLResponseHeadPtr head, mojo::ScopedDataPipeConsumerHandle body,
                         std::optional<mojo_base::BigBuffer> metadata) override {
    client_->OnReceiveResponse(std::move(head), std::move(body), std::move(metadata));
  }
  void OnReceiveRedirect(const net::RedirectInfo& info, network::mojom::URLResponseHeadPtr head) override {
    request_.UpdateOnRedirect(info); ++redirect_index_;
    Gate(base::BindOnce([](base::WeakPtr<Request> self, net::RedirectInfo redirect,
                          network::mojom::URLResponseHeadPtr response) {
      if (!self) return;
      self->redirect_pending_ = true;
      self->client_->OnReceiveRedirect(redirect, std::move(response));
    }, weak_.GetWeakPtr(), info, std::move(head)));
  }
  void OnUploadProgress(int64_t current, int64_t total, OnUploadProgressCallback cb) override { client_->OnUploadProgress(current, total, std::move(cb)); }
  void OnTransferSizeUpdated(int32_t diff) override { client_->OnTransferSizeUpdated(diff); }
  void OnComplete(const network::URLLoaderCompletionStatus& status) override {
    if (completed_) return;
    completed_ = true; timeout_.Stop(); client_->OnComplete(status);
    // Keep the downstream loader/client endpoints alive until the consumer
    // closes them. Completion on one Mojo pipe does not order disconnects on
    // another; do not destroy the proxy while the response is being consumed.
  }
 private:
  void Destroy() { delete this; }
  void Complete(int error) { OnComplete(network::URLLoaderCompletionStatus(error)); }
  void Gate(base::OnceClosure allowed) {
    if (!request_.url.SchemeIsHTTPOrHTTPS()) { std::move(allowed).Run(); return; }
    start_ = base::TimeTicks::Now();
    timeout_.Start(FROM_HERE, base::Seconds(35), base::BindOnce(&Request::TimedOut, weak_.GetWeakPtr()));
    Engine::Get().Decide(request_.url.spec(), Type(request_), request_.referrer.spec(),
      base::BindOnce(&Request::Decided, weak_.GetWeakPtr(), std::move(allowed)));
  }
  void TimedOut() {
    Log(-1); Complete(net::ERR_BLOCKED_BY_CLIENT); Engine::Get().Fail();
  }
  void Log(int result) {
    auto* frame = content::RenderFrameHost::FromID(context_.frame);
    const auto type = Type(request_);
    base::DictValue event;
    event.Set("event", "decision"); event.Set("url", request_.url.spec());
    event.Set("method", request_.method); event.Set("resource_type", type);
    event.Set("referrer", request_.referrer.spec());
    event.Set("initiator_present", request_.request_initiator.has_value());
    event.Set("initiator_origin", request_.request_initiator ? request_.request_initiator->Serialize() : "absent");
    event.Set("top_frame_origin", type == "mainFrame" ? url::Origin::Create(request_.url).Serialize() :
              frame ? frame->GetMainFrame()->GetLastCommittedOrigin().Serialize() : "unresolved");
    event.Set("frame_role", type == "mainFrame" ? "main" : frame ? (frame->GetParent() ? "sub" : "main") : "unresolved");
    event.Set("profile_kind", context_.private_profile ? "private" : "regular");
    event.Set("factory_type", context_.factory_type); event.Set("redirect_index", redirect_index_);
    event.Set("decision", result == 0 ? "allow" : "block"); event.Set("engine_result", result);
    event.Set("status", result == 0 || result == 1 ? "ready" : result == 2 ? "unsupported-resource-redirect" : "engine-error");
    event.Set("hook_to_decision_us", (base::TimeTicks::Now() - start_).InMicrosecondsF());
    Record(std::move(event));
  }
  void Decided(base::OnceClosure allowed, int result) {
    if (completed_) return;
    timeout_.Stop(); Log(result);
    if (result != 0) { Complete(net::ERR_BLOCKED_BY_CLIENT); return; }
    std::move(allowed).Run();
  }
  void Start() {
    factory_->CreateLoaderAndStart(loader_.BindNewPipeAndPassReceiver(), id_, options_, request_,
                                   incoming_.BindNewPipeAndPassRemote(), annotation_);
    incoming_.set_disconnect_handler(base::BindOnce(&Request::Complete, weak_.GetWeakPtr(), net::ERR_FAILED));
    if (priority_) loader_->SetPriority(*priority_, intra_);
  }
  Context context_;
  scoped_refptr<network::SharedURLLoaderFactory> factory_;
  int32_t id_; uint32_t options_;
  network::ResourceRequest request_;
  net::MutableNetworkTrafficAnnotationTag annotation_;
  mojo::Receiver<network::mojom::URLLoader> receiver_;
  mojo::Remote<network::mojom::URLLoaderClient> client_;
  mojo::Remote<network::mojom::URLLoader> loader_;
  mojo::Receiver<network::mojom::URLLoaderClient> incoming_;
  std::optional<net::RequestPriority> priority_;
  int32_t intra_ = 0; int redirect_index_ = 0; bool redirect_pending_ = false; bool completed_ = false;
  base::TimeTicks start_;
  base::OneShotTimer timeout_;
  base::WeakPtrFactory<Request> weak_{this};
};
class Factory : public network::SelfDeletingURLLoaderFactory {
 public:
  Factory(mojo::PendingReceiver<network::mojom::URLLoaderFactory> receiver,
          mojo::PendingRemote<network::mojom::URLLoaderFactory> remote, Context context,
          base::SelfDeletingPassKey key)
      : network::SelfDeletingURLLoaderFactory(std::move(receiver), key), context_(context),
        target_(base::MakeRefCounted<network::WrapperSharedURLLoaderFactory>(std::move(remote))) {}
  void CreateLoaderAndStart(mojo::PendingReceiver<network::mojom::URLLoader> receiver,
      int32_t id, uint32_t options, const network::ResourceRequest& request,
      mojo::PendingRemote<network::mojom::URLLoaderClient> client,
      const net::MutableNetworkTrafficAnnotationTag& annotation) override {
    if (!request.url.SchemeIsHTTPOrHTTPS()) {
      target_->CreateLoaderAndStart(std::move(receiver), id, options, request, std::move(client), annotation);
      return;
    }
    auto* proxy = new Request(context_, target_, std::move(receiver), id, options, request, std::move(client), annotation);
    proxy->Begin();
  }
 private:
  ~Factory() override = default;
  Context context_;
  scoped_refptr<network::SharedURLLoaderFactory> target_;
};
}
void MaybeProxy(content::BrowserContext* context, content::RenderFrameHost* frame,
                int factory_type, network::URLLoaderFactoryBuilder& builder) {
  if (!base::CommandLine::ForCurrentProcess()->HasSwitch("blanc-blocker-assets")) return;
  auto [receiver, remote] = builder.Append();
  base::MakeSelfDeleting<Factory>(std::move(receiver), std::move(remote),
      Context{context->IsOffTheRecord(), frame ? frame->GetGlobalId() : content::GlobalRenderFrameHostId(), factory_type});
}
}
