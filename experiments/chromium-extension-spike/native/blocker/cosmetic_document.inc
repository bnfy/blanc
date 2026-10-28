// Included inside blanc's anonymous namespace, after Engine.
class CosmeticDocument final : public content::DocumentService<mojom::Cosmetics> {
 public:
  CosmeticDocument(content::RenderFrameHost& frame, mojo::PendingReceiver<mojom::Cosmetics> receiver);
  ~CosmeticDocument() override;
  void Get(bool initial, const std::string& hints, GetCallback callback) override;
 private:
  void Complete(bool ready, const std::string& output) {
    if (!pending_) return;
    timer_.Stop();
    // DocumentService destroys this object on a cross-document commit. The
    // weak callback cannot deliver a previous document's rules to a new page.
    std::move(pending_).Run(ready && render_frame_host().GetLastCommittedURL() == expected_url_, output);
  }
  GURL expected_url_;
  bool initialized_ = false;
  GetCallback pending_;
  base::OneShotTimer timer_;
  base::WeakPtrFactory<CosmeticDocument> weak_{this};
};

CosmeticDocument::CosmeticDocument(content::RenderFrameHost& frame, mojo::PendingReceiver<mojom::Cosmetics> receiver)
    : DocumentService(frame, std::move(receiver)) {}
CosmeticDocument::~CosmeticDocument() = default;
void CosmeticDocument::Get(bool initial, const std::string& hints, GetCallback callback) {
    if (!base::CommandLine::ForCurrentProcess()->HasSwitch("blanc-blocker-assets")) {
      std::move(callback).Run(true, "{\"styles\":\"\",\"scripts\":[]}"); return;
    }
    if (pending_ || initial == initialized_ || hints.size() > 128 * 1024) {
      std::move(callback).Run(false, ""); return;
    }
    auto& frame = render_frame_host();
    GURL url = frame.GetLastCommittedURL();
    if (!url.SchemeIsHTTPOrHTTPS()) {
      // Opaque and browser-owned documents receive no injected code. Broader
      // inherited-origin support requires separate qualification.
      std::move(callback).Run(true, "{\"styles\":\"\",\"scripts\":[]}"); return;
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
    input.Set("initial", initial);
    auto json = base::WriteJson(input);
    if (!json) { std::move(callback).Run(false, ""); return; }
    expected_url_ = url;
    initialized_ = true;
    pending_ = std::move(callback);
    timer_.Start(FROM_HERE, base::Seconds(35), base::BindOnce(
        &CosmeticDocument::Complete, weak_.GetWeakPtr(), false, std::string()));
    Engine::Get().Cosmetics(*json, base::BindOnce(&CosmeticDocument::Complete, weak_.GetWeakPtr()));
  }
