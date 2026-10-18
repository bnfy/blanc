// Included in the browser proxy translation unit. Prototype-only document gate.
struct PendingScript {
  content::WeakDocumentPtr document;
  uint64_t generation;
  int tab_id;
  std::string url;
  bool offered = false;
  base::OnceCallback<void(bool, const std::string&)> callback;
};
struct ScriptJobs : base::SupportsUserData::Data {
  std::map<std::string, PendingScript> jobs;
  ScriptJobs();
  ~ScriptJobs() override;
};
ScriptJobs::ScriptJobs() = default;
ScriptJobs::~ScriptJobs() { for (auto& [id, job] : jobs) std::move(job.callback).Run(false, ""); }
ScriptJobs& Jobs(content::BrowserContext* context) {
  static const char key = 0;
  auto* jobs = static_cast<ScriptJobs*>(context->GetUserData(&key));
  if (!jobs) { auto value = std::make_unique<ScriptJobs>(); jobs = value.get(); context->SetUserData(&key, std::move(value)); }
  return *jobs;
}
void CancelScripts(content::BrowserContext* context) {
  auto jobs = std::move(Jobs(context).jobs);
  for (auto& [id, job] : jobs) std::move(job.callback).Run(false, "");
}
class DocumentScript : public content::DocumentService<blanc::mojom::DocumentStart> {
 public:
  DocumentScript(content::RenderFrameHost& frame, mojo::PendingReceiver<blanc::mojom::DocumentStart> receiver);
  void GetScript(const std::string& url, GetScriptCallback callback) override;
};
DocumentScript::DocumentScript(content::RenderFrameHost& frame, mojo::PendingReceiver<blanc::mojom::DocumentStart> receiver)
    : DocumentService(frame, std::move(receiver)) {}
void DocumentScript::GetScript(const std::string& url, GetScriptCallback callback) {
    auto& frame = render_frame_host(); auto* context = frame.GetBrowserContext();
    if (!base::CommandLine::ForCurrentProcess()->HasSwitch("blanc-ubo-document-start") || context->IsOffTheRecord()) { std::move(callback).Run(true, ""); return; }
    auto& state = UboState(context);
    if (frame.GetParent() || !frame.GetLastCommittedURL().SchemeIsHTTPOrHTTPS() || frame.GetLastCommittedURL().spec() != url || !state.ready || !state.document.AsRenderFrameHostIfValid()) { std::move(callback).Run(false, ""); return; }
    auto& jobs = Jobs(context).jobs;
    if (jobs.size() >= 64) { std::move(callback).Run(false, ""); return; }
    const auto id = base::UnguessableToken::Create().ToString();
    jobs.emplace(id, PendingScript{frame.GetWeakDocumentPtr(), state.generation,
        sessions::SessionTabHelper::IdForTab(content::WebContents::FromRenderFrameHost(&frame)).id(), url, false, std::move(callback)});
    base::SingleThreadTaskRunner::GetCurrentDefault()->PostDelayedTask(FROM_HERE, base::BindOnce([](base::WeakPtr<content::BrowserContext> context, std::string id) {
      if (!context) return; auto& jobs = Jobs(context.get()).jobs; auto it = jobs.find(id); if (it == jobs.end()) return;
      auto callback = std::move(it->second.callback); jobs.erase(it); std::move(callback).Run(false, "");
    }, context->GetWeakPtr(), id), base::Seconds(3));
  }
