#include "chrome/services/blanc_blocker/blocker_proxy.h"
#include <deque>
#include <map>
#include "base/json/json_reader.h"
#include "base/task/single_thread_task_runner.h"
#include "content/public/browser/document_service.h"
#include "content/public/browser/web_contents.h"
#include "components/sessions/content/session_tab_helper.h"
#include "services/network/public/cpp/resource_request_body.h"
#include <memory>
#include "base/command_line.h"
#include "base/files/file_util.h"
#include "base/functional/bind.h"
#include "base/json/json_writer.h"
#include "base/no_destructor.h"
#include "base/memory/weak_ptr.h"
#include "base/supports_user_data.h"
#include "base/strings/string_number_conversions.h"
#include "base/strings/string_util.h"
#include "base/task/thread_pool.h"
#include "base/timer/timer.h"
#include "base/unguessable_token.h"
#include "chrome/services/blanc_blocker/blocker.mojom.h"
#include "chrome/services/blanc_blocker/bundle_hash.h"
#include "content/public/browser/browser_context.h"
#include "content/public/browser/content_browser_client.h"
#include "content/public/browser/render_frame_host.h"
#include "content/public/browser/weak_document_ptr.h"
#include "content/public/browser/service_process_host.h"
#include "crypto/hash.h"
#include "extensions/browser/process_manager.h"
#include "mojo/public/cpp/bindings/callback_helpers.h"
#include "mojo/public/cpp/bindings/receiver.h"
#include "mojo/public/cpp/bindings/remote.h"
#include "mojo/public/cpp/system/data_pipe.h"
#include "net/base/net_errors.h"
#include "net/http/http_response_headers.h"
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
  base::WeakPtr<content::BrowserContext> browser_context;
  std::string factory_instance;
  bool private_profile;
  content::GlobalRenderFrameHostId frame;
  int factory_type;
  net::IsolationInfo isolation_info;
};
// Offline component prototype only. Cancel while unready; never queue a request
// which might already have traversed an empty extension webRequest engine.
struct UboHold : public base::SupportsUserData::Data {
  content::WeakDocumentPtr document;
  uint64_t generation = 0;
  bool ready = false;
};
UboHold& UboState(content::BrowserContext* context) {
  static const char key = 0;
  auto* state = static_cast<UboHold*>(context->GetUserData(&key));
  if (!state) {
    auto owned = std::make_unique<UboHold>();
    state = owned.get(); context->SetUserData(&key, std::move(owned));
  }
  return *state;
}
#include "chrome/services/blanc_blocker/document_start.inc"
bool UboProbe() {
  return base::CommandLine::ForCurrentProcess()->HasSwitch("blanc-ubo-reload-probe");
}
bool UboBackground(const Context& context, const network::ResourceRequest& request) {
  if (!context.browser_context) return false;
  auto* frame = content::RenderFrameHost::FromID(context.frame);
  const GURL background("chrome-extension://oddhmofgkplblkmckempfepikkophank/background.html");
  auto* manager = extensions::ProcessManager::Get(context.browser_context.get());
  return !context.private_profile && frame && !frame->GetParent() &&
      manager && manager->GetBackgroundHostForRenderFrameHost(frame) &&
      manager->GetBackgroundHostForRenderFrameHost(frame) ==
          manager->GetBackgroundHostForExtension("oddhmofgkplblkmckempfepikkophank") &&
      frame->GetBrowserContext() == context.browser_context.get() &&
      frame->GetLastCommittedURL() == background && request.request_initiator &&
      *request.request_initiator == url::Origin::Create(background);
}
const char* FactoryKind(int value) {
  using F = content::ContentBrowserClient::URLLoaderFactoryType;
  switch (static_cast<F>(value)) {
    case F::kWorkerMainResource: return "worker-script";
    case F::kWorkerSubResource: return "worker-subresource";
    case F::kServiceWorkerScript: return "service-worker-script";
    case F::kServiceWorkerSubResource: return "service-worker-subresource";
    default: return "other";
  }
}
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
    // Snapshot the actual originating frame before an asynchronous decision can
    // outlive it. Worker factories may intentionally have no associated frame.
    auto* frame = content::RenderFrameHost::FromID(context_.frame);
    frame_state_ = frame ? "live-at-entry" : context_.frame == content::GlobalRenderFrameHostId()
        ? "not-associated" : "gone-at-entry";
    if (frame) {
      top_origin_ = frame->GetMainFrame()->GetLastCommittedOrigin().Serialize();
      frame_role_ = frame->GetParent() ? "sub" : "main";
    }
    receiver_.set_disconnect_handler(base::BindOnce(&Request::Destroy, base::Unretained(this)));
    client_.set_disconnect_handler(base::BindOnce(&Request::Destroy, base::Unretained(this)));
  }
  void Begin(base::TimeTicks entered) {
    if (UboProbe() && request_.url.host() == "blanc-ubo-control.invalid") {
      bool ok = false;
      if (base::CommandLine::ForCurrentProcess()->HasSwitch("blanc-ubo-document-start") && UboBackground(context_, request_) && request_.url.SchemeIs("http") && !request_.url.has_port()) {
        uint64_t generation = 0; auto& state = UboState(context_.browser_context.get());
        const bool current = base::StringToUint64(request_.url.query(), &generation) && generation == state.generation && state.ready && state.document.AsRenderFrameHostIfValid() == content::RenderFrameHost::FromID(context_.frame);
        if (request_.url.path() == "/work" && request_.method == "GET") {
          base::ListValue work;
          if (current) for (auto& [id, job] : Jobs(context_.browser_context.get()).jobs) {
            if (job.offered || job.generation != generation || !job.document.AsRenderFrameHostIfValid()) continue;
            job.offered = true; base::DictValue value; value.Set("token", id); value.Set("url", job.url); value.Set("tabId", job.tab_id); work.Append(std::move(value));
          }
          ReplyControl(current ? 200 : 409, base::WriteJson(work).value_or("[]")); return;
        }
        if (request_.url.path() == "/script" && request_.method == "POST") {
          std::string body;
          if (request_.request_body) for (const auto& element : *request_.request_body->elements()) {
            if (element.type() != network::DataElement::Tag::kBytes) { body.clear(); break; }
            body += element.As<network::DataElementBytes>().AsStringView();
            if (body.size() > 1024 * 1024) { body.clear(); break; }
          }
          auto parsed = base::JSONReader::ReadDict(body, base::JSON_PARSE_RFC);
          if (current && parsed) {
            const auto* token = parsed->FindString("token"); const auto* code = parsed->FindString("code");
            auto& jobs = Jobs(context_.browser_context.get()).jobs;
            auto it = token ? jobs.find(*token) : jobs.end();
            if (it != jobs.end() && code && it->second.offered && it->second.generation == generation && it->second.document.AsRenderFrameHostIfValid()) {
              auto callback = std::move(it->second.callback); jobs.erase(it); ok = true; std::move(callback).Run(true, *code);
            }
          }
          ReplyControl(ok ? 204 : 403, ""); return;
        }
      }
      if (UboBackground(context_, request_) && request_.method == "GET" &&
          request_.url.SchemeIs("http") && !request_.url.has_port()) {
        uint64_t generation = 0;
        auto* frame = content::RenderFrameHost::FromID(context_.frame);
        auto& state = UboState(context_.browser_context.get());
        const bool same = state.document.AsRenderFrameHostIfValid() == frame;
        if (base::StringToUint64(request_.url.query(), &generation) && generation > 0) {
          if (request_.url.path() == "/begin" && ((!same && generation == 1) ||
              (same && generation == state.generation + 1))) {
            state.document = frame->GetWeakDocumentPtr();
            state.generation = generation; state.ready = false; CancelScripts(context_.browser_context.get()); ok = true;
          } else if (request_.url.path() == "/ready" && same && generation == state.generation) {
            state.ready = true; ok = true;
          }
        }
      }
      base::DictValue event; event.Set("event", "ubo-control");
      event.Set("action", request_.url.path()); event.Set("accepted", ok); Record(std::move(event));
      if (!ok) { Complete(net::ERR_BLOCKED_BY_CLIENT); return; }
      auto head = network::mojom::URLResponseHead::New();
      head->headers = net::HttpResponseHeaders::TryToCreate(
          "HTTP/1.1 204 No Content\r\nAccess-Control-Allow-Origin: chrome-extension://oddhmofgkplblkmckempfepikkophank\r\n\r\n");
      mojo::ScopedDataPipeProducerHandle producer;
      mojo::ScopedDataPipeConsumerHandle consumer;
      if (mojo::CreateDataPipe(nullptr, producer, consumer) != MOJO_RESULT_OK) {
        Complete(net::ERR_FAILED); return;
      }
      producer.reset();
      client_->OnReceiveResponse(std::move(head), std::move(consumer), std::nullopt);
      Complete(net::OK); return;
    }
    Gate(base::BindOnce(&Request::Start, weak_.GetWeakPtr()), entered);
  }
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
    const auto entered = base::TimeTicks::Now();
    request_.UpdateOnRedirect(info); ++redirect_index_;
    Gate(base::BindOnce([](base::WeakPtr<Request> self, net::RedirectInfo redirect,
                          network::mojom::URLResponseHeadPtr response) {
      if (!self) return;
      self->redirect_pending_ = true;
      self->client_->OnReceiveRedirect(redirect, std::move(response));
    }, weak_.GetWeakPtr(), info, std::move(head)), entered);
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
  void ReplyControl(int status, const std::string& body) {
    auto head = network::mojom::URLResponseHead::New();
    head->headers = net::HttpResponseHeaders::TryToCreate("HTTP/1.1 " + base::NumberToString(status) + " Result\r\nContent-Type: application/json\r\nAccess-Control-Allow-Origin: chrome-extension://oddhmofgkplblkmckempfepikkophank\r\n\r\n");
    mojo::ScopedDataPipeProducerHandle producer; mojo::ScopedDataPipeConsumerHandle consumer;
    MojoCreateDataPipeOptions options{sizeof(options), MOJO_CREATE_DATA_PIPE_FLAG_NONE, 1, static_cast<uint32_t>(std::max<size_t>(body.size(), 1))};
    if (mojo::CreateDataPipe(&options, producer, consumer) != MOJO_RESULT_OK) { Complete(net::ERR_FAILED); return; }
    if (!body.empty()) { size_t written = 0; if (producer->WriteData(base::as_byte_span(body), MOJO_WRITE_DATA_FLAG_ALL_OR_NONE, written) != MOJO_RESULT_OK) { Complete(net::ERR_FAILED); return; } }
    producer.reset(); client_->OnReceiveResponse(std::move(head), std::move(consumer), std::nullopt); Complete(net::OK);
  }
  void Destroy() { delete this; }
  void Complete(int error) { OnComplete(network::URLLoaderCompletionStatus(error)); }
  void Gate(base::OnceClosure allowed, base::TimeTicks entered) {
    if (!context_.browser_context) { Complete(net::ERR_BLOCKED_BY_CLIENT); return; }
    if (!request_.url.SchemeIsHTTPOrHTTPS()) { std::move(allowed).Run(); return; }
    start_ = entered;
    if (UboProbe() && !context_.private_profile) {
      // Exact background-document list acquisition must not deadlock the hold.
      auto& state = UboState(context_.browser_context.get());
      const bool ready = state.ready && state.document.AsRenderFrameHostIfValid();
      if (!ready && !UboBackground(context_, request_)) {
        base::DictValue event; event.Set("event", "ubo-hold-cancel"); Record(std::move(event));
        Complete(net::ERR_BLOCKED_BY_CLIENT); return;
      }
      std::move(allowed).Run(); return;
    }
    timeout_.Start(FROM_HERE, base::Seconds(35), base::BindOnce(&Request::TimedOut, weak_.GetWeakPtr()));
    Engine::Get().Decide(request_.url.spec(), Type(request_), request_.referrer.spec(),
      base::BindOnce(&Request::Decided, weak_.GetWeakPtr(), std::move(allowed)));
  }
  void TimedOut() {
    Log(-1); Complete(net::ERR_BLOCKED_BY_CLIENT); Engine::Get().Fail();
  }
  void Log(int result) {
    const auto elapsed = base::TimeTicks::Now() - start_;
    const auto type = Type(request_);
    base::DictValue event;
    event.Set("event", "decision"); event.Set("url", request_.url.spec());
    event.Set("method", request_.method); event.Set("resource_type", type);
    event.Set("referrer", request_.referrer.spec());
    event.Set("initiator_present", request_.request_initiator.has_value());
    event.Set("initiator_origin", request_.request_initiator ? request_.request_initiator->Serialize() : "absent");
    event.Set("top_frame_origin", type == "mainFrame" ? url::Origin::Create(request_.url).Serialize() :
              top_origin_);
    event.Set("frame_role", type == "mainFrame" ? "main" : frame_role_);
    event.Set("frame_state", frame_state_);
    event.Set("factory_kind", FactoryKind(context_.factory_type));
    // Transport identity only: never substitute for a worker/client context.
    event.Set("factory_instance", context_.factory_instance);
    event.Set("loader_request_id", id_);
    event.Set("devtools_request_id", request_.devtools_request_id.value_or("absent"));
    // Isolation metadata is NOT a document/client origin. StorageKey can reduce
    // it to a schemeful site; never substitute it for the required frame fields.
    const auto& factory_top = context_.isolation_info.top_frame_origin();
    event.Set("factory_isolation_top_origin", factory_top ? factory_top->Serialize() : "absent");
    const auto request_top = request_.trusted_params
        ? request_.trusted_params->isolation_info.top_frame_origin() : std::nullopt;
    event.Set("request_isolation_top_origin", request_top ? request_top->Serialize() : "absent");
    event.Set("profile_kind", context_.private_profile ? "private" : "regular");
    event.Set("factory_type", context_.factory_type); event.Set("redirect_index", redirect_index_);
    event.Set("decision", result == 0 ? "allow" : "block"); event.Set("engine_result", result);
    event.Set("status", result == 0 || result == 1 ? "ready" : result == 2 ? "unsupported-resource-redirect" : "engine-error");
    event.Set("hook_to_decision_us", elapsed.InMicrosecondsF());
    Record(std::move(event));
  }
  void Decided(base::OnceClosure allowed, int result) {
    if (completed_) return;
    if (!context_.browser_context) { Complete(net::ERR_BLOCKED_BY_CLIENT); return; }
    timeout_.Stop();
    // Measure through application of the decision, not just receipt of the Mojo
    // reply. Capture time before optional context/logging work adds overhead.
    if (result != 0) Complete(net::ERR_BLOCKED_BY_CLIENT);
    else std::move(allowed).Run();
    Log(result);
  }
  void Start() {
    factory_->CreateLoaderAndStart(loader_.BindNewPipeAndPassReceiver(), id_, options_, request_,
                                   incoming_.BindNewPipeAndPassRemote(), annotation_);
    incoming_.set_disconnect_handler(base::BindOnce(&Request::Complete, weak_.GetWeakPtr(), net::ERR_FAILED));
    if (priority_) loader_->SetPriority(*priority_, intra_);
  }
  Context context_;
  std::string top_origin_ = "unresolved";
  std::string frame_role_ = "unresolved";
  std::string frame_state_;
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
    const auto entered = base::TimeTicks::Now();
    auto* proxy = new Request(context_, target_, std::move(receiver), id, options, request, std::move(client), annotation);
    proxy->Begin(entered);
  }
 private:
  ~Factory() override = default;
  Context context_;
  scoped_refptr<network::SharedURLLoaderFactory> target_;
};
}
void BindDocumentStart(content::RenderFrameHost* frame, mojo::PendingReceiver<mojom::DocumentStart> receiver) {
  new DocumentScript(*frame, std::move(receiver));
}
void MaybeProxy(content::BrowserContext* context, content::RenderFrameHost* frame,
                int factory_type, const net::IsolationInfo& isolation_info,
                network::URLLoaderFactoryBuilder& builder) {
  if (!base::CommandLine::ForCurrentProcess()->HasSwitch("blanc-blocker-assets") && !UboProbe()) return;
  auto [receiver, remote] = builder.Append();
  base::MakeSelfDeleting<Factory>(std::move(receiver), std::move(remote),
      Context{context->GetWeakPtr(), base::UnguessableToken::Create().ToString(), context->IsOffTheRecord(), frame ? frame->GetGlobalId() : content::GlobalRenderFrameHostId(), factory_type, isolation_info});
}
}
