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
std::optional<GURL> ScriptSelection(content::RenderFrameHost& frame, const std::string& url) {
    // Non-network rule selection uses only browser-owned committed context.
    // The tuple/precursor is never an origin grant or a network-log substitute.
    const auto& committed = frame.GetLastCommittedURL();
    GURL selection = committed;
    if (!committed.SchemeIsHTTPOrHTTPS()) {
      const auto supported = [](const GURL& candidate) {
        return candidate.IsAboutBlank() || candidate.IsAboutSrcdoc() ||
               candidate.SchemeIs("data") || candidate.SchemeIs("blob");
      };
      const auto& tuple = frame.GetLastCommittedOrigin().GetTupleOrPrecursorTupleIfOpaque();
      auto* parent = frame.GetParent();
      bool matched = false;
      if (supported(committed) && committed.spec() == url && tuple.GetURL().SchemeIsHTTPOrHTTPS()) {
        // Every opaque hop must retain the same precursor. Stop at the first
        // non-opaque parent; never skip a mismatch to borrow a visible top tab.
        for (int depth = 0; parent && depth < 64; ++depth, parent = parent->GetParent()) {
          const auto& parent_origin = parent->GetLastCommittedOrigin();
          if (parent_origin.GetTupleOrPrecursorTupleIfOpaque() != tuple) break;
          if (!parent_origin.opaque()) { matched = true; break; }
          const auto& parent_url = parent->GetLastCommittedURL();
          if (!parent_url.SchemeIsHTTPOrHTTPS() && !supported(parent_url)) break;
        }
      }
      if (!matched) { return std::nullopt; }
      selection = tuple.GetURL();
    } else if (committed.spec() != url) { return std::nullopt; }
    return selection;
}
// Authenticated background messages carry actual MessageSender identity. Never
// accept a rule-selection URL from the content script or an active-tab fallback.
std::optional<base::DictValue> LateContext(content::BrowserContext* context,
                                        const base::DictValue& sender) {
  const auto* document = sender.FindString("documentId");
  const auto* url = sender.FindString("url");
  const auto* origin = sender.FindString("origin");
  const auto tab = sender.FindInt("tabId"), frame_id = sender.FindInt("frameId");
  if (!document || !url || !origin || !tab || !frame_id || context->IsOffTheRecord()) return std::nullopt;
  auto* frame = extensions::ExtensionApiFrameIdMap::Get()->GetRenderFrameHostByDocumentId(
      extensions::ExtensionApiFrameIdMap::DocumentIdFromString(*document));
  if (!frame || !frame->IsActive() || frame->GetBrowserContext() != context ||
      frame->GetLastCommittedURL().SchemeIsHTTPOrHTTPS() ||
      frame->GetLastCommittedOrigin().Serialize() != *origin ||
      extensions::ExtensionApiFrameIdMap::GetFrameId(frame) != *frame_id ||
      sessions::SessionTabHelper::IdForTab(content::WebContents::FromRenderFrameHost(frame)).id() != *tab) return std::nullopt;
  const auto selection = ScriptSelection(*frame, *url);
  if (!selection) return std::nullopt;
  base::ListValue ancestors;
  for (auto* parent = frame->GetParent(); parent; parent = parent->GetParent()) ancestors.Append(parent->GetLastCommittedURL().spec());
  base::DictValue result;
  result.Set("documentId", *document); result.Set("tabId", *tab); result.Set("frameId", *frame_id);
  result.Set("url", selection->spec()); result.Set("ancestors", std::move(ancestors));
  return result;
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
    const auto selection = ScriptSelection(frame, url);
    if (!selection) { std::move(callback).Run(!frame.GetLastCommittedURL().SchemeIsHTTPOrHTTPS(), ""); return; }
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
        sessions::SessionTabHelper::IdForTab(content::WebContents::FromRenderFrameHost(&frame)).id(), extensions::ExtensionApiFrameIdMap::GetFrameId(&frame), std::move(ancestors), selection->spec(), false, std::move(callback)});
    base::SingleThreadTaskRunner::GetCurrentDefault()->PostDelayedTask(FROM_HERE, base::BindOnce([](base::WeakPtr<content::BrowserContext> context, std::string id) {
      if (!context) return; auto& jobs = Jobs(context.get()).jobs; auto it = jobs.find(id); if (it == jobs.end()) return;
      auto callback = std::move(it->second.callback); jobs.erase(it); std::move(callback).Run(false, "");
    }, context->GetWeakPtr(), id), base::Seconds(3));
  }
