// Browser-owned main-world payload obtained before the first page script.
class BlancFrameLifetime : public content::RenderFrameObserver {
 public:
  explicit BlancFrameLifetime(content::RenderFrame* frame);
  void OnDestruct() override;
  bool alive = true;
};
BlancFrameLifetime::BlancFrameLifetime(content::RenderFrame* frame) : RenderFrameObserver(frame) {}
void BlancFrameLifetime::OnDestruct() { alive = false; }
static bool BlancDocumentStart(content::RenderFrame* frame) {
  if (!base::CommandLine::ForCurrentProcess()->HasSwitch("blanc-ubo-document-start") || !frame->IsMainFrame()) return true;
  const GURL url(frame->GetWebFrame()->GetDocument().Url());
  if (!url.SchemeIsHTTPOrHTTPS()) return true;
  BlancFrameLifetime lifetime(frame);
  mojo::Remote<blanc::mojom::DocumentStart> remote;
  frame->GetBrowserInterfaceBroker().GetInterface(remote.BindNewPipeAndPassReceiver());
  bool ready = false; std::string code;
  if (!remote->GetScript(url.spec(), &ready, &code) || !ready) code = "window.stop();";
  if (lifetime.alive && !code.empty()) frame->GetWebFrame()->ExecuteScript(blink::WebScriptSource(blink::WebString::FromUtf8(code)));
  return lifetime.alive;
}
