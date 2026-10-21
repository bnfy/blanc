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
  if (!base::CommandLine::ForCurrentProcess()->HasSwitch("blanc-ubo-document-start")) return true;
  const GURL url(frame->GetWebFrame()->GetDocument().Url());
  if (!url.SchemeIsHTTPOrHTTPS() && !url.IsAboutBlank() && !url.IsAboutSrcdoc() && !url.SchemeIs("data") && !url.SchemeIs("blob")) return true;
  BlancFrameLifetime lifetime(frame);
  mojo::Remote<blanc::mojom::DocumentStart> remote;
  frame->GetBrowserInterfaceBroker().GetInterface(remote.BindNewPipeAndPassReceiver());
  bool ready = false; std::string code, token;
  if (!remote->GetScript(url.spec(), &ready, &code, &token) || !ready) code = "window.stop();";
  if (lifetime.alive && !code.empty()) frame->GetWebFrame()->ExecuteScript(blink::WebScriptSource(blink::WebString::FromUtf8(code)));
  // ExecuteScript is synchronous. Do not acknowledge before its invocation
  // returns; asynchronous effects scheduled by scriptlets are outside this lease.
  if (lifetime.alive && !token.empty()) {
    bool accepted = false;
    const bool replied = remote->Complete(token, &accepted);
    if (lifetime.alive && (!replied || !accepted)) {
      frame->GetWebFrame()->ExecuteScript(blink::WebScriptSource(blink::WebString::FromUtf8("window.stop();")));
    }
  }
  return lifetime.alive;
}
