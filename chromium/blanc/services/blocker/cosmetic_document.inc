// Included inside blanc's anonymous namespace, after Engine.
class CosmeticDocument final : public content::DocumentService<mojom::Cosmetics> {
 public:
  CosmeticDocument(content::RenderFrameHost& frame, mojo::PendingReceiver<mojom::Cosmetics> receiver, base::SelfDeletingPassKey key);
  void Get(bool initial, bool refresh, const std::string& hints, GetCallback callback) override;
  void ObservePolicy(mojo::PendingRemote<mojom::CosmeticPolicyClient> client) override;
 private:
  ~CosmeticDocument() override;
  void PolicyChanged();
  void Complete(bool ready, const std::string& output) {
    if (!pending_) return;
    timer_.Stop();
    // DocumentService destroys this object on a cross-document commit. The
    // weak callback cannot deliver a previous document's rules to a new page.
    std::move(pending_).Run(ready && render_frame_host().GetLastCommittedURL() == expected_url_, output);
  }
  PrefChangeRegistrar policy_registrar_;
  mojo::Remote<mojom::CosmeticPolicyClient> policy_client_;
  bool filtering_ = true;
  GURL expected_url_;
  bool initialized_ = false;
  bool initial_pending_ = false;
  GetCallback pending_;
  base::OneShotTimer timer_;
  base::WeakPtrFactory<CosmeticDocument> weak_{this};
};

CosmeticDocument::CosmeticDocument(content::RenderFrameHost& frame, mojo::PendingReceiver<mojom::Cosmetics> receiver, base::SelfDeletingPassKey key)
    : DocumentService(frame, std::move(receiver), key) {
  filtering_ = ShouldFilter(frame.GetBrowserContext(),
                            frame.GetMainFrame()->GetLastCommittedURL());
  if (auto* prefs = BlockingPrefs(frame.GetBrowserContext())) {
    policy_registrar_.Init(prefs);
    for (const char* preference : {kBlockingEnabled, kBlockingExceptions})
      policy_registrar_.Add(preference, base::BindRepeating(
          &CosmeticDocument::PolicyChanged, base::Unretained(this)));
  }
}
CosmeticDocument::~CosmeticDocument() = default;
void CosmeticDocument::ObservePolicy(
    mojo::PendingRemote<mojom::CosmeticPolicyClient> client) {
  policy_client_.reset();
  policy_client_.Bind(std::move(client));
  policy_client_->PolicyChanged(filtering_);
}
void CosmeticDocument::PolicyChanged() {
  auto& frame = render_frame_host();
  const bool enabled = ShouldFilter(frame.GetBrowserContext(),
                                    frame.GetMainFrame()->GetLastCommittedURL());
  if (enabled == filtering_) return;
  filtering_ = enabled;
  // Retire old engine replies before notifying the renderer. They must never
  // restore styles from the policy that the user just disabled.
  weak_.InvalidateWeakPtrs();
  timer_.Stop();
  if (pending_) {
    if (initial_pending_) initialized_ = false;
    initial_pending_ = false;
    std::move(pending_).Run(false, "policy-changed");
  }
  if (policy_client_) policy_client_->PolicyChanged(enabled);
}
void CosmeticDocument::Get(bool initial, bool refresh, const std::string& hints, GetCallback callback) {
    if (!base::CommandLine::ForCurrentProcess()->HasSwitch("blanc-blocker-assets")) {
      std::move(callback).Run(true, "{\"styles\":\"\",\"scripts\":[],\"extended\":[]}"); return;
    }
    if (pending_ || initial == initialized_ || hints.size() > 128 * 1024) {
      std::move(callback).Run(false, ""); return;
    }
    auto& frame = render_frame_host();
    if (!ShouldFilter(frame.GetBrowserContext(),
                      frame.GetMainFrame()->GetLastCommittedURL())) {
      initialized_ = true;
      std::move(callback).Run(true,
          "{\"styles\":\"\",\"scripts\":[],\"extended\":[]}");
      return;
    }
    const GURL document_url = frame.GetLastCommittedURL();
    GURL url = document_url;
    if ((url.IsAboutBlank() || url.IsAboutSrcdoc()) &&
        !frame.GetLastCommittedOrigin().opaque())
      url = frame.GetLastCommittedOrigin().GetURL();
    if (!url.SchemeIsHTTPOrHTTPS()) {
      // Opaque, non-web and browser-owned documents receive no injected code.
      std::move(callback).Run(true, "{\"styles\":\"\",\"scripts\":[],\"extended\":[]}"); return;
    }
    auto parsed = base::JSONReader::Read(hints, base::JSON_PARSE_RFC);
    if (!parsed || !parsed->is_dict()) { std::move(callback).Run(false, ""); return; }
    base::DictValue input;
    for (const char* key : {"ids", "classes", "hrefs"}) {
      const auto* values = parsed->GetDict().FindList(key);
      if (!values || values->size() > 2048) { std::move(callback).Run(false, ""); return; }
      base::ListValue copy;
      for (const auto& value : *values) {
        if (!value.is_string() || value.GetString().size() > 256) { std::move(callback).Run(false, ""); return; }
        copy.Append(value.GetString());
      }
      input.Set(key, std::move(copy));
    }
    auto context = [](const GURL& value) {
      base::DictValue result;
      result.Set("hostname", value.host());
      result.Set("domain", net::registry_controlled_domains::GetDomainAndRegistry(
          value, net::registry_controlled_domains::INCLUDE_PRIVATE_REGISTRIES));
      return result;
    };
    auto identity = context(url);
    input.Set("url", url.spec());
    input.Set("hostname", url.host());
    input.Set("domain", *identity.FindString("domain"));
    base::ListValue ancestors;
    for (auto* parent = frame.GetParent(); parent; parent = parent->GetParent()) {
      if (ancestors.size() >= 64) { std::move(callback).Run(false, ""); return; }
      ancestors.Append(context(parent->GetLastCommittedURL()));
    }
    input.Set("ancestors", std::move(ancestors));
    input.Set("initial", initial || refresh);
    auto json = base::WriteJson(input);
    if (!json) { std::move(callback).Run(false, ""); return; }
    expected_url_ = document_url;
    initialized_ = true;
    initial_pending_ = initial;
    pending_ = std::move(callback);
    timer_.Start(FROM_HERE, base::Seconds(35), base::BindOnce(
        &CosmeticDocument::Complete, weak_.GetWeakPtr(), false, std::string()));
    Engine::Get().Cosmetics(*json, base::BindOnce(&CosmeticDocument::Complete, weak_.GetWeakPtr()));
  }
