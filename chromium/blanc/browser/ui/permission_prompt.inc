// Shipping's permission prompt (F13) over Chromium's PermissionRequestManager:
// in an Island window CreatePermissionPrompt (patch 0015) asks for this view
// instead of Chromium's bubble. The Island host draws shipping's own
// permission.html bottom-centre over the page and answers through
// "respondPermission". Shipping prompts only for camera and microphone,
// geolocation and notifications; any other request is denied, as shipping's
// policy denies it (permissions.js).
namespace {

std::map<int, class IslandPermissionPrompt*>& OpenPermissionPrompts() {
  static base::NoDestructor<std::map<int, IslandPermissionPrompt*>> prompts;
  return *prompts;
}

content::WebContents* IslandHost(BrowserWindowInterface* browser) {
  auto* parent = browser ? BrowserView::GetBrowserViewForBrowser(browser) : nullptr;
  auto* view = parent ? static_cast<views::WebView*>(parent->GetViewByID(kIslandViewId)) : nullptr;
  auto* contents = view ? view->GetWebContents() : nullptr;
  return contents && contents->GetLastCommittedURL() == GURL("chrome://blanc-prototype/host.html") &&
      contents->GetPrimaryMainFrame()->IsRenderFrameLive() ? contents : nullptr;
}

// Shipping's prompt payload for these requests, or none when shipping would
// deny them without asking.
std::optional<base::DictValue> PermissionPayload(permissions::PermissionPrompt::Delegate* delegate) {
  bool audio = false, video = false;
  const char* kind = nullptr;
  for (const auto& request : delegate->Requests()) {
    const char* next = nullptr;
    switch (request->request_type()) {
      case permissions::RequestType::kMicStream: audio = true; next = "media"; break;
      case permissions::RequestType::kCameraStream: video = true; next = "media"; break;
      case permissions::RequestType::kGeolocation: next = "geolocation"; break;
      case permissions::RequestType::kNotifications: next = "notifications"; break;
      default: return std::nullopt;
    }
    if (kind && std::string_view(kind) != next) return std::nullopt;
    kind = next;
  }
  if (!kind) return std::nullopt;
  base::ListValue media;
  if (audio) media.Append("audio");
  if (video) media.Append("video");
  return base::DictValue()
      .Set("origin", url::Origin::Create(delegate->GetRequestingOrigin()).Serialize())
      .Set("permission", kind)
      .Set("mediaTypes", std::move(media));
}

class IslandPermissionPrompt : public permissions::PermissionPrompt {
 public:
  IslandPermissionPrompt(content::WebContents* host, Delegate* delegate, std::optional<base::DictValue> payload);
  ~IslandPermissionPrompt() override;
  void Answer(bool allow);
  bool UpdateAnchor() override;
  TabSwitchingBehavior GetTabSwitchingBehavior() override;
  permissions::PermissionPromptDisposition GetPromptDisposition() const override;
  bool IsAskPrompt() const override;
  std::optional<gfx::Rect> GetViewBoundsInScreen() const override;
  std::vector<permissions::ElementAnchoredBubbleVariant> GetPromptVariants() const override;
  std::optional<permissions::feature_params::PermissionElementPromptPosition> GetPromptPosition() const override;

 private:
  void Run(const std::u16string& script);
  int id_ = 0;
  base::WeakPtr<Delegate> delegate_;
  base::WeakPtr<content::WebContents> host_;
};

IslandPermissionPrompt::IslandPermissionPrompt(content::WebContents* host, Delegate* delegate,
                                               std::optional<base::DictValue> payload)
    : delegate_(delegate->GetWeakPtr()) {
  static int next_id = 0;
  id_ = ++next_id;
  if (!payload) {
    // Denied without asking, once the manager has finished showing us.
    base::SequencedTaskRunner::GetCurrentDefault()->PostTask(FROM_HERE, base::BindOnce(
        [](base::WeakPtr<Delegate> delegate) {
          if (delegate) delegate->Deny(::PromptOptions(std::monostate()));
        }, delegate_));
    return;
  }
  host_ = host->GetWeakPtr();
  OpenPermissionPrompts()[id_] = this;
  payload->Set("id", id_);
  std::string json;
  base::JSONWriter::Write(*payload, &json);
  Run(u"window.BlancPrototypeHost?.permissionPrompt(" + base::UTF8ToUTF16(json) + u")");
}

IslandPermissionPrompt::~IslandPermissionPrompt() {
  if (!OpenPermissionPrompts().erase(id_)) return;
  Run(u"window.BlancPrototypeHost?.permissionGone(" + base::NumberToString16(id_) + u")");
}

void IslandPermissionPrompt::Answer(bool allow) {
  if (!delegate_) return;
  const ::PromptOptions options{std::monostate()};
  // The manager may destroy this prompt while it applies the answer.
  if (allow) delegate_->Accept(options);
  else delegate_->Deny(options);
}

bool IslandPermissionPrompt::UpdateAnchor() { return true; }

// Chromium shows a tab's requests only while it is the active tab.
permissions::PermissionPrompt::TabSwitchingBehavior IslandPermissionPrompt::GetTabSwitchingBehavior() {
  return kDestroyPromptButKeepRequestPending;
}

permissions::PermissionPromptDisposition IslandPermissionPrompt::GetPromptDisposition() const {
  return permissions::PermissionPromptDisposition::ANCHORED_BUBBLE;
}

bool IslandPermissionPrompt::IsAskPrompt() const { return true; }

std::optional<gfx::Rect> IslandPermissionPrompt::GetViewBoundsInScreen() const { return std::nullopt; }

std::vector<permissions::ElementAnchoredBubbleVariant> IslandPermissionPrompt::GetPromptVariants() const {
  return {};
}

std::optional<permissions::feature_params::PermissionElementPromptPosition>
IslandPermissionPrompt::GetPromptPosition() const {
  return std::nullopt;
}

void IslandPermissionPrompt::Run(const std::u16string& script) {
  if (host_ && host_->GetPrimaryMainFrame()->IsRenderFrameLive())
    host_->GetPrimaryMainFrame()->ExecuteJavaScript(script, base::NullCallback());
}

}  // namespace

std::unique_ptr<permissions::PermissionPrompt> CreateIslandPermissionPrompt(
    content::WebContents* contents, permissions::PermissionPrompt::Delegate* delegate) {
  auto* browser = GlobalBrowserCollection::GetInstance()->FindBrowserWithTab(contents);
  if (!browser || !IsIslandWindow(browser)) return nullptr;
  auto* host = IslandHost(browser);
  if (!host) return nullptr;
  return std::make_unique<IslandPermissionPrompt>(host, delegate, PermissionPayload(delegate));
}

bool AnswerPermissionPrompt(int id, bool allow) {
  auto prompt = OpenPermissionPrompts().find(id);
  if (prompt == OpenPermissionPrompts().end()) return false;
  prompt->second->Answer(allow);
  return true;
}
