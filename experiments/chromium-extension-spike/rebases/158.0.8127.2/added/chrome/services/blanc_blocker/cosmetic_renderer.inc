#include <set>
#include "base/json/json_reader.h"
#include "base/json/json_writer.h"
#include "base/timer/timer.h"
#include "content/public/renderer/render_frame_observer_tracker.h"
#include "third_party/blink/public/platform/scheduler/web_agent_group_scheduler.h"
#include "chrome/services/blanc_blocker/cosmetic_collector.h"
#include "chrome/services/blanc_blocker/procedural_renderer.h"

class BlancCosmeticFrame final : public content::RenderFrameObserver,
    public content::RenderFrameObserverTracker<BlancCosmeticFrame> {
 public:
  explicit BlancCosmeticFrame(content::RenderFrame* frame);
  ~BlancCosmeticFrame() override;
  void OnDestruct() override;
  void DidCreateNewDocument() override;
  void DidSetPageLifecycleState(blink::BFCacheStateChange change) override;
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
    const bool replied = remote->Get(true, hints, &ready, &output);
    if (!weak) return false;
    remote_ = std::move(remote);
    if (!replied || !ready || !Apply(output, true)) {
      if (weak) frame->ExecuteScript(blink::WebScriptSource(blink::WebString::FromUtf8("window.stop();")));
      return !!weak;
    }
    if (!weak) return false;
    timer_.Start(FROM_HERE, base::Milliseconds(250), base::BindRepeating(&BlancCosmeticFrame::Update, weak));
    return true;
  }
 private:
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
    if (cached_ || pending_ || !remote_.is_connected()) return;
    auto weak = weak_.GetWeakPtr();
    if (!Procedural("globalThis.__blancProcedural.tick(true)") || !weak) return;
    auto hints = Collect();
    if (!weak || hints.empty() || hints == "{\"ids\":[],\"classes\":[],\"hrefs\":[]}") return;
    pending_ = true;
    const auto generation = generation_;
    remote_->Get(false, hints, base::BindOnce([](base::WeakPtr<BlancCosmeticFrame> self,
        unsigned generation, bool ready, const std::string& output) {
      if (!self || self->generation_ != generation) return;
      self->pending_ = false;
      if (ready && !self->cached_) self->Apply(output, false);
    }, weak, generation));
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
      render_frame()->GetWebFrame()->GetDocument().InsertStyleSheet(
          blink::WebString::FromUtf8(*css), nullptr, blink::WebCssOrigin::kUser);
    }
    if (initial) for (const auto& script : *scripts) {
      if (!script.is_string()) return false;
      render_frame()->GetWebFrame()->ExecuteScript(
          blink::WebScriptSource(blink::WebString::FromUtf8(script.GetString())));
      if (!weak) return false;
    }
    return true;
  }
  mojo::Remote<blanc::mojom::Cosmetics> remote_;
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
void BlancCosmeticFrame::OnDestruct() { delete this; }
void BlancCosmeticFrame::DidCreateNewDocument() {
    weak_.InvalidateWeakPtrs(); timer_.Stop(); remote_.reset(); styles_.clear();
    bytes_ = 0; pending_ = false; cached_ = false; rescan_ = false; ++generation_;
  }

void BlancCosmeticFrame::DidSetPageLifecycleState(blink::BFCacheStateChange change) {
  if (change == blink::BFCacheStateChange::kStoredToBFCache) {
    cached_ = true; timer_.Stop();
  } else if (change == blink::BFCacheStateChange::kRestoredFromBFCache) {
    cached_ = false; rescan_ = true;
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
