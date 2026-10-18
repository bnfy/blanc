// Included in the browser proxy translation unit. Prototype-only document gate.
struct PendingScript {
  content::WeakDocumentPtr document;
  uint64_t generation;
  int tab_id;
  int frame_id;
  base::ListValue ancestors;
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
    // Rule-selection fallback only for browser-verified inherited about documents.
    // This never changes the document/security origin or the network context log.
    const auto& committed = frame.GetLastCommittedURL();
    GURL selection = committed;
    if (!committed.SchemeIsHTTPOrHTTPS()) {
      const auto& origin = frame.GetLastCommittedOrigin();
      auto* parent = frame.GetParent();
      if ((!committed.IsAboutBlank() && !committed.IsAboutSrcdoc()) ||
          committed.spec() != url || origin.opaque() || !parent ||
          !origin.IsSameOriginWith(parent->GetLastCommittedOrigin()) ||
          !origin.GetURL().SchemeIsHTTPOrHTTPS()) {
        std::move(callback).Run(true, ""); return; // Explicitly unsupported, no guessed fallback.
      }
      selection = origin.GetURL();
    } else if (committed.spec() != url) { std::move(callback).Run(false, ""); return; }
    auto& state = UboState(context);
    if (!state.ready || !state.document.AsRenderFrameHostIfValid()) { std::move(callback).Run(false, ""); return; }
    auto& jobs = Jobs(context).jobs;
    if (jobs.size() >= 64) { std::move(callback).Run(false, ""); return; }
    const auto id = base::UnguessableToken::Create().ToString();
    base::ListValue ancestors;
    for (auto* parent = frame.GetParent(); parent; parent = parent->GetParent()) {
      ancestors.Append(parent->GetLastCommittedURL().spec());
    }
    jobs.emplace(id, PendingScript{frame.GetWeakDocumentPtr(), state.generation,
        sessions::SessionTabHelper::IdForTab(content::WebContents::FromRenderFrameHost(&frame)).id(), extensions::ExtensionApiFrameIdMap::GetFrameId(&frame), std::move(ancestors), selection.spec(), false, std::move(callback)});
    base::SingleThreadTaskRunner::GetCurrentDefault()->PostDelayedTask(FROM_HERE, base::BindOnce([](base::WeakPtr<content::BrowserContext> context, std::string id) {
      if (!context) return; auto& jobs = Jobs(context.get()).jobs; auto it = jobs.find(id); if (it == jobs.end()) return;
      auto callback = std::move(it->second.callback); jobs.erase(it); std::move(callback).Run(false, "");
    }, context->GetWeakPtr(), id), base::Seconds(3));
  }
