#include <set>
#include <vector>
#include "mojo/public/cpp/bindings/receiver.h"
#include "base/json/json_reader.h"
#include "base/json/json_writer.h"
#include "base/timer/timer.h"
#include "content/public/renderer/render_frame_observer_tracker.h"
#include "third_party/blink/public/platform/scheduler/web_agent_group_scheduler.h"
#include "blanc/services/blocker/cosmetic_collector.h"
#include "blanc/services/blocker/procedural_renderer.h"

class BlancCosmeticFrame final : public content::RenderFrameObserver,
    public content::RenderFrameObserverTracker<BlancCosmeticFrame>,
    public blanc::mojom::CosmeticPolicyClient {
 public:
  explicit BlancCosmeticFrame(content::RenderFrame* frame);
  ~BlancCosmeticFrame() override;
  void OnDestruct() override;
  void DidCreateNewDocument() override;
  void DidSetPageLifecycleState(blink::BFCacheStateChange change) override;
  void PolicyChanged(bool enabled) override;
  bool Begin() {
    DidCreateNewDocument();
    auto* frame = render_frame()->GetWebFrame();
    const GURL document_url(frame->GetDocument().Url());
    const auto origin = frame->GetSecurityOrigin();
    const bool inherited = document_url.IsAboutBlank() || document_url.IsAboutSrcdoc();
    if (!document_url.SchemeIsHTTPOrHTTPS() &&
        !(inherited && !origin.IsOpaque() &&
          (origin.Protocol() == "http" || origin.Protocol() == "https"))) return true;
    auto weak = weak_.GetWeakPtr();
    mojo::Remote<blanc::mojom::Cosmetics> remote;
    render_frame()->GetBrowserInterfaceBroker().GetInterface(remote.BindNewPipeAndPassReceiver());
    bool ready = false; std::string output;
    const auto hints = Collect();
    if (!weak) return false;
    bool replied = false;
    // A policy change can retire an in-flight initial query. Retry only that
    // explicit cancellation; genuine utility errors remain fail closed.
    for (int attempt = 0; attempt < 3; ++attempt) {
      replied = remote->Get(true, false, hints, &ready, &output);
      if (!weak) return false;
      if (ready || output != "policy-changed") break;
    }
    remote_ = std::move(remote);
    if (!replied || !ready || !Apply(output, true)) {
      if (weak) frame->ExecuteScript(blink::WebScriptSource(blink::WebString::FromUtf8("window.stop();")));
      return !!weak;
    }
    if (!weak) return false;
    remote_->ObservePolicy(policy_receiver_.BindNewPipeAndPassRemote());
    timer_.Start(FROM_HERE, base::Milliseconds(250), base::BindRepeating(&BlancCosmeticFrame::Update, weak));
    return true;
  }
 private:
  void ClearOwnedCosmetics() {
    auto document = render_frame()->GetWebFrame()->GetDocument();
    for (const auto& key : style_keys_)
      document.RemoveInsertedStyleSheet(key, blink::WebCssOrigin::kUser);
    style_keys_.clear(); styles_.clear(); bytes_ = 0;
    clear_pending_ = false;
    Procedural("globalThis.__blancProcedural.dispose()");
  }
  bool Procedural(const std::string& operation) {
    auto* frame = render_frame()->GetWebFrame();
    auto* isolate = frame->GetAgentGroupScheduler()->Isolate();
    v8::HandleScope handles(isolate);
    const std::string source = std::string(kBlancProceduralRenderer) +
        ";(()=>{try{" + operation + ";return true;}catch{return false;}})()";
    auto value = frame->ExecuteScriptInIsolatedWorldAndReturnValue(
        ISOLATED_WORLD_ID_BLANC_COSMETICS,
        blink::WebScriptSource(blink::WebString::FromUtf8(source)),
        blink::BackForwardCacheAware::kAllow);
    return !value.IsEmpty() && value->IsTrue();
  }
  std::string Collect() {
    auto* frame = render_frame()->GetWebFrame();
    auto* isolate = frame->GetAgentGroupScheduler()->Isolate();
    v8::HandleScope handles(isolate);
    auto value = frame->ExecuteScriptInIsolatedWorldAndReturnValue(
        ISOLATED_WORLD_ID_BLANC_COSMETICS,
        blink::WebScriptSource(blink::WebString::FromUtf8(std::string(rescan_ ? "globalThis.__blancCosmeticRescan=true;" : "") + kBlancCosmeticCollector)),
        blink::BackForwardCacheAware::kAllow);
    rescan_ = false;
    if (value.IsEmpty() || !value->IsString()) return "";
    v8::String::Utf8Value text(isolate, value);
    if (!*text || text.length() > 128 * 1024) return "";
    return std::string(*text, text.length());
  }
  void Update() {
    if (cached_ || !filtering_ || pending_ || !remote_.is_connected()) return;
    auto weak = weak_.GetWeakPtr();
    if (!Procedural("globalThis.__blancProcedural.tick(true)") || !weak) return;
    auto hints = Collect();
    if (!weak || hints.empty() || (!full_query_ && hints == "{\"ids\":[],\"classes\":[],\"hrefs\":[]}")) return;
    pending_ = true;
    const auto generation = generation_;
    const bool full = full_query_;
    remote_->Get(false, full, hints, base::BindOnce([](base::WeakPtr<BlancCosmeticFrame> self,
        unsigned generation, bool full, bool ready, const std::string& output) {
      if (!self || self->generation_ != generation) return;
      self->pending_ = false;
      if (ready && !self->cached_ && self->filtering_) {
        if (self->Apply(output, full) && self) self->full_query_ = false;
      }
    }, weak, generation, full));
  }
  bool Apply(const std::string& output, bool initial) {
    if (output.size() > 1024 * 1024) return false;
    auto parsed = base::JSONReader::Read(output, base::JSON_PARSE_RFC);
    if (!parsed || !parsed->is_dict()) return false;
    const auto* css = parsed->GetDict().FindString("styles");
    const auto* scripts = parsed->GetDict().FindList("scripts");
    if (!css || !scripts || scripts->size() > 256) return false;
    auto weak = weak_.GetWeakPtr();
    if (initial) {
      const auto* extended = parsed->GetDict().FindList("extended");
      if (!extended || extended->size() > 256) return false;
      const auto json = base::WriteJson(*extended);
      if (!json || !Procedural("globalThis.__blancProcedural.replace(" + *json +
                              ");globalThis.__blancProcedural.tick(true)") || !weak)
        return false;
    }
    if (!css->empty() && !styles_.contains(*css)) {
      if (bytes_ + css->size() > 1024 * 1024) return false;
      bytes_ += css->size(); styles_.insert(*css);
      style_keys_.push_back(render_frame()->GetWebFrame()->GetDocument().InsertStyleSheet(
          blink::WebString::FromUtf8(*css), nullptr, blink::WebCssOrigin::kUser));
    }
    if (initial) for (const auto& script : *scripts) {
      if (!script.is_string()) return false;
      render_frame()->GetWebFrame()->ExecuteScript(
          blink::WebScriptSource(blink::WebString::FromUtf8(script.GetString())));
      if (!weak) return false;
    }
    return true;
  }
  mojo::Receiver<blanc::mojom::CosmeticPolicyClient> policy_receiver_{this};
  mojo::Remote<blanc::mojom::Cosmetics> remote_;
  std::vector<blink::WebString> style_keys_;
  bool clear_pending_ = false;
  bool filtering_ = true;
  bool full_query_ = false;
  base::RepeatingTimer timer_;
  std::set<std::string> styles_;
  size_t bytes_ = 0;
  unsigned generation_ = 0;
  bool pending_ = false;
  bool cached_ = false;
  bool rescan_ = false;
  base::WeakPtrFactory<BlancCosmeticFrame> weak_{this};
};
BlancCosmeticFrame::BlancCosmeticFrame(content::RenderFrame* frame)
      : RenderFrameObserver(frame), RenderFrameObserverTracker(frame) {}
void BlancCosmeticFrame::PolicyChanged(bool enabled) {
  if (enabled == filtering_) return;
  filtering_ = enabled;
  ++generation_;
  pending_ = false;
  full_query_ = enabled;
  rescan_ = enabled;
  if (!enabled) {
    clear_pending_ = true;
    if (!cached_) ClearOwnedCosmetics();
  } else if (!cached_) {
    Update();
  }
}
void BlancCosmeticFrame::OnDestruct() { delete this; }
void BlancCosmeticFrame::DidCreateNewDocument() {
    weak_.InvalidateWeakPtrs(); timer_.Stop(); remote_.reset(); policy_receiver_.reset(); styles_.clear();
    style_keys_.clear(); filtering_ = true; full_query_ = false; clear_pending_ = false;
    bytes_ = 0; pending_ = false; cached_ = false; rescan_ = false; ++generation_;
  }

void BlancCosmeticFrame::DidSetPageLifecycleState(blink::BFCacheStateChange change) {
  if (change == blink::BFCacheStateChange::kStoredToBFCache) {
    cached_ = true; timer_.Stop();
  } else if (change == blink::BFCacheStateChange::kRestoredFromBFCache) {
    cached_ = false; rescan_ = true;
    if (clear_pending_) {
      auto weak = weak_.GetWeakPtr();
      ClearOwnedCosmetics();
      if (!weak) return;
    }
    if (remote_.is_connected()) timer_.Start(FROM_HERE, base::Milliseconds(250),
        base::BindRepeating(&BlancCosmeticFrame::Update, weak_.GetWeakPtr()));
  }
}
BlancCosmeticFrame::~BlancCosmeticFrame() = default;
static bool BlancProductionDocumentStart(content::RenderFrame* frame) {
  auto* observer = BlancCosmeticFrame::Get(frame);
  if (!observer) observer = new BlancCosmeticFrame(frame);
  return observer->Begin();
}
