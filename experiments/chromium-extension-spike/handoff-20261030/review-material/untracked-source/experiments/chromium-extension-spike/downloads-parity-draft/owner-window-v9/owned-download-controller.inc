// Include in blanc_prototype_ui.cc after Owner and GetOwner are defined, with
// native-controller-v8/download-controller.h included before the namespace.
// This remains an unregistered candidate, not a renderer-facing bridge.
class OwnedDownloadController final {
 public:
  using Controller = blanc::downloads_projection::DownloadController;
  using Scope = blanc::downloads_projection::Scope;
  ~OwnedDownloadController();

  // These are browser-selected, live UI-sequence objects, never renderer IDs.
  // The Owner must be the one installed on this Island's own WebContents.
  static std::unique_ptr<OwnedDownloadController> Bind(
      Owner* owner, content::WebContents* host,
      content::RenderFrameHost* frame) {
    if (!content::BrowserThread::CurrentlyOn(content::BrowserThread::UI) ||
        !owner || !owner->browser || !host || !frame)
      return nullptr;
    auto weak_owner = owner->GetWeakPtr();
    auto weak_browser = owner->browser->GetWeakPtr();
    auto weak_host = host->GetWeakPtr();
    auto weak_frame = frame->GetWeakDocumentPtr();
    if (!weak_owner || !weak_browser || !weak_host ||
        !weak_frame.AsRenderFrameHostIfValid())
      return nullptr;
    Profile* context = weak_browser->GetProfile();
    if (!context || context->ShutdownStarted()) return nullptr;
    auto weak_context = context->GetWeakPtr();
    Profile* original = context->GetOriginalProfile();
    if (!original || original->ShutdownStarted()) return nullptr;
    auto weak_original = original->GetWeakPtr();
    if (!weak_owner || !weak_browser || !weak_host || !weak_context ||
        !weak_original || !weak_frame.AsRenderFrameHostIfValid())
      return nullptr;
    auto result = std::unique_ptr<OwnedDownloadController>(
        new OwnedDownloadController(weak_owner, weak_browser, weak_host,
                                    weak_context, weak_original));
    if (!result->controller_.SetOwnerGuard(base::BindRepeating(
            [](base::WeakPtr<OwnedDownloadController> owner,
               content::RenderFrameHost* caller) {
              return owner && owner->Owns(caller);
            }, result->weak_factory_.GetWeakPtr())) ||
        !result->Owns(weak_frame.AsRenderFrameHostIfValid()) ||
        !result->controller_.BindDocument(
            weak_host.get(), weak_frame.AsRenderFrameHostIfValid(),
            weak_context.get()) ||
        !result->Owns(weak_frame.AsRenderFrameHostIfValid()))
      return nullptr;
    return result;
  }

  std::optional<Controller::SnapshotId> BeginSnapshot(
      content::RenderFrameHost* caller) {
    if (!Owns(caller)) return std::nullopt;
    return controller_.BeginSnapshot(caller);
  }

  // `guid` and the complete visible set must be produced by the native
  // download manager, not passed through from renderer-controlled input.
  std::optional<base::UnguessableToken> IssueVisibleItem(
      Scope scope, const std::string& guid, content::RenderFrameHost* caller,
      const Controller::SnapshotId& snapshot) {
    if (!Owns(caller)) return std::nullopt;
    return controller_.IssueVisibleItem(scope, guid, caller, snapshot);
  }

  bool ReconcileVisible(const std::vector<base::UnguessableToken>& visible,
                        content::RenderFrameHost* caller,
                        const Controller::SnapshotId& snapshot) {
    if (!Owns(caller)) return false;
    return controller_.ReconcileVisible(visible, caller, snapshot);
  }

  bool CanPublishSnapshot(content::RenderFrameHost* caller,
                          const Controller::SnapshotId& snapshot) {
    if (!Owns(caller)) return false;
    return controller_.CanPublishSnapshot(caller, snapshot);
  }

  Controller::Dispatch Cancel(const base::UnguessableToken& handle,
                              content::RenderFrameHost* caller) {
    if (!Owns(caller)) return Controller::Dispatch::kRejected;
    return controller_.Cancel(handle, caller);
  }

 private:
  OwnedDownloadController(base::WeakPtr<Owner> owner,
      base::WeakPtr<BrowserWindowInterface> browser,
      base::WeakPtr<content::WebContents> host, base::WeakPtr<Profile> context,
      base::WeakPtr<Profile> original);

  bool Owns(content::RenderFrameHost* caller) const {
    if (!content::BrowserThread::CurrentlyOn(content::BrowserThread::UI) ||
        !caller || !owner_ || !browser_ || !host_ || !context_ || !original_ ||
        context_->ShutdownStarted() || original_->ShutdownStarted())
      return false;
    if (owner_->browser != browser_.get() || GetOwner(host_.get()) != owner_.get() ||
        browser_->GetProfile() != context_.get() ||
        host_->GetBrowserContext() != context_.get() ||
        host_->GetPrimaryMainFrame() != caller)
      return false;
    // Compare the actual installed child before dereferencing Owner::view.
    auto* browser_view = BrowserView::GetBrowserViewForBrowser(browser_.get());
    if (!owner_ || !browser_ || !host_ || !context_ || !original_ ||
        !browser_view || !owner_->view ||
        browser_view->GetViewByID(kIslandViewId) != owner_->view)
      return false;
    return owner_->view->GetWebContents() == host_.get();
  }

  base::WeakPtr<Owner> owner_;
  base::WeakPtr<BrowserWindowInterface> browser_;
  base::WeakPtr<content::WebContents> host_;
  base::WeakPtr<Profile> context_;
  base::WeakPtr<Profile> original_;
  Controller controller_;
  base::WeakPtrFactory<OwnedDownloadController> weak_factory_{this};
};

OwnedDownloadController::OwnedDownloadController(
    base::WeakPtr<Owner> owner, base::WeakPtr<BrowserWindowInterface> browser,
    base::WeakPtr<content::WebContents> host, base::WeakPtr<Profile> context,
    base::WeakPtr<Profile> original)
    : owner_(owner), browser_(browser), host_(host), context_(context),
      original_(original), controller_(original.get()) {}

OwnedDownloadController::~OwnedDownloadController() = default;
