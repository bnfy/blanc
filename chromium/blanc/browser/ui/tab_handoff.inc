// N20, tab handoff: the Bring Your Tabs extension's blanc-import: link
// (docs/superpowers/specs/2026-11-16-fork-tab-handoff-design.md). The link
// never navigates. Shipping's tab-import-handoff.js, unchanged in a sandboxed
// service with no I/O of its own, reads the link, checks and decrypts the
// relay's reply and cleans the list; this file makes the one claim request,
// holds the list in memory until the person chooses, and opens the tabs.
constexpr char kTabHandoffScheme[] = "blanc-import";
// It keeps the old name on purpose: shipped browsers refuse redirects on it.
constexpr char kTabHandoffRelay[] = "https://tabs.blancbrowser.com";

// One short-lived sandboxed parser per handoff; its host refuses every call.
class HandoffRunner final : public blanc::mojom::SyncHost {
 public:
  using Reply = base::OnceCallback<void(bool, const std::string&)>;
  HandoffRunner();
  ~HandoffRunner() override;
  void Call(std::string args, Reply reply);
  void Fetch(const std::string&, const std::string&, const std::string&,
             const std::optional<std::vector<uint8_t>>&, FetchCallback reply) override;
  void WriteStore(const std::string&, const std::vector<uint8_t>&) override;
  void PersistDesktopStore(const std::string&, const std::vector<uint8_t>&, PersistDesktopStoreCallback reply) override;
  void Protect(const std::vector<uint8_t>&, ProtectCallback reply) override;
  void Unprotect(const std::vector<uint8_t>&, UnprotectCallback reply) override;
  void Emit(const std::string&, const std::string&) override;

 private:
  void Send(uint64_t id, std::string args);
  void Fail(const char* why);
  mojo::Remote<blanc::mojom::SyncRunner> service_;
  mojo::Receiver<blanc::mojom::SyncHost> host_{this};
  std::map<uint64_t, Reply> pending_;
  std::vector<std::pair<uint64_t, std::string>> queued_;
  bool ready_ = false;
  uint64_t next_ = 0;
  base::WeakPtrFactory<HandoffRunner> weak_{this};
};
HandoffRunner::HandoffRunner() = default;
HandoffRunner::~HandoffRunner() { Fail("handoff-closed"); }
void HandoffRunner::Call(std::string args, Reply reply) {
  const uint64_t id = ++next_;
  pending_.emplace(id, std::move(reply));
  base::SingleThreadTaskRunner::GetCurrentDefault()->PostDelayedTask(FROM_HERE,
      base::BindOnce([](base::WeakPtr<HandoffRunner> self, uint64_t id) {
        if (self && self->pending_.contains(id)) self->Fail("handoff-timeout");
      }, weak_.GetWeakPtr(), id), base::Seconds(30));
  if (ready_) { Send(id, std::move(args)); return; }
  queued_.emplace_back(id, std::move(args));
  if (service_.is_bound()) return;
  auto resource = blanc::sync_resources::Find("handoff-bundle.js");
  if (!resource) { Fail("handoff-bundle-missing"); return; }
  const std::string script(reinterpret_cast<const char*>(resource->data()), resource->size());
  if (base::ToLowerASCII(base::HexEncode(crypto::hash::Sha256(script))) != blanc::kBlancHandoffBundleSha256) {
    Fail("handoff-bundle-invalid"); return;
  }
  service_ = content::ServiceProcessHost::Launch<blanc::mojom::SyncRunner>(
      content::ServiceProcessHost::Options().WithDisplayName("Blanc Tab Handoff").Pass());
  service_.set_disconnect_handler(base::BindOnce(&HandoffRunner::Fail, weak_.GetWeakPtr(), "handoff-ended"));
  service_->Start(script, {}, R"({"platform":"darwin","version":"tab-handoff","env":{}})", host_.BindNewPipeAndPassRemote(),
      base::BindOnce([](base::WeakPtr<HandoffRunner> self, bool ready) {
        if (!self) return;
        if (!ready) { self->Fail("handoff-start-failed"); return; }
        self->ready_ = true;
        auto queued = std::move(self->queued_);
        for (auto& [queued_id, queued_args] : queued) self->Send(queued_id, std::move(queued_args));
      }, weak_.GetWeakPtr()));
}
void HandoffRunner::Send(uint64_t id, std::string args) {
  service_->Call("desktop.handoff", args, base::BindOnce([](base::WeakPtr<HandoffRunner> self, uint64_t id, bool ok, const std::string& value) {
    if (!self) return;
    auto found = self->pending_.find(id);
    if (found == self->pending_.end()) return;
    auto reply = std::move(found->second);
    self->pending_.erase(found);
    std::move(reply).Run(ok, value);
  }, weak_.GetWeakPtr(), id));
}
void HandoffRunner::Fail(const char* why) {
  weak_.InvalidateWeakPtrs(); service_.reset(); host_.reset(); ready_ = false; queued_.clear();
  auto pending = std::move(pending_);
  for (auto& [id, reply] : pending) std::move(reply).Run(false, why);
}
void HandoffRunner::Fetch(const std::string&, const std::string&, const std::string&,
    const std::optional<std::vector<uint8_t>>&, FetchCallback reply) { std::move(reply).Run("forbidden", 0, "{}", {}); }
void HandoffRunner::WriteStore(const std::string&, const std::vector<uint8_t>&) {}
void HandoffRunner::PersistDesktopStore(const std::string&, const std::vector<uint8_t>&, PersistDesktopStoreCallback reply) { std::move(reply).Run(false); }
void HandoffRunner::Protect(const std::vector<uint8_t>&, ProtectCallback reply) { std::move(reply).Run(std::nullopt); }
void HandoffRunner::Unprotect(const std::vector<uint8_t>&, UnprotectCallback reply) { std::move(reply).Run(std::nullopt); }
void HandoffRunner::Emit(const std::string&, const std::string&) {}

// One handoff at a time, in memory only. Shipping's states, less its
// "waiting": a cancelled claim is dropped here at once (the runner and the
// request are destroyed), so no replacement ever waits behind one.
class TabHandoff final {
 public:
  static TabHandoff* Get();
  TabHandoff();
  ~TabHandoff();
  // True when |url| is a handoff link, whatever comes of it: it is never a
  // navigation.
  bool Queue(const GURL& url);
  // A window's host has started: a link kept while no window showed begins.
  base::DictValue Projection(BrowserWindowInterface* browser);
  void Accept(BrowserWindowInterface* browser, bool new_window, base::OnceCallback<void(base::Value)> reply);
  void Cancel(BrowserWindowInterface* browser);
  void SetRelayForTesting(std::string origin) { relay_ = std::move(origin); }

 private:
  enum class State { kNone, kLoading, kReady, kError };
  void Start(const std::string& link, BrowserWindowInterface* browser);
  void Parsed(uint64_t generation, bool ok, const std::string& text);
  void Claimed(uint64_t generation, std::optional<std::string> body);
  void Opened(uint64_t generation, bool ok, const std::string& text);
  void Fail(const std::string& code);
  void Reset();
  void Sheet(const char* action);
  BrowserWindowInterface* Window() const;

  State state_ = State::kNone;
  uint64_t generation_ = 0;
  std::string link_, pending_link_, error_, relay_ = kTabHandoffRelay;
  SessionID window_ = SessionID::InvalidValue();
  base::DictValue payload_;
  int skipped_ = 0;
  std::unique_ptr<HandoffRunner> runner_;
  std::unique_ptr<network::SimpleURLLoader> loader_;
  base::WeakPtrFactory<TabHandoff> weak_{this};
};
TabHandoff* TabHandoff::Get() {
  static base::NoDestructor<TabHandoff> handoff;
  return handoff.get();
}
TabHandoff::TabHandoff() = default;
TabHandoff::~TabHandoff() = default;

BrowserWindowInterface* TabHandoff::Window() const {
  BrowserWindowInterface* found = nullptr;
  GlobalBrowserCollection::GetInstance()->ForEach([&](BrowserWindowInterface* browser) {
    if (browser->GetSessionID() != window_ || browser->IsDeleteScheduled()) return true;
    found = browser; return false;
  });
  return found;
}

// The sheet is shipping's tab-handoff page; the host shows, reloads or hides it.
void TabHandoff::Sheet(const char* action) {
  auto* browser = Window();
  if (!browser) return;
  for (auto* owner : Owner::Live()) {
    if (owner->browser != browser || !owner->view) continue;
    auto* host = owner->view->GetWebContents();
    if (!host || host->GetLastCommittedURL() != GURL("chrome://blanc-prototype/host.html") ||
        !host->GetPrimaryMainFrame()->IsRenderFrameLive()) return;
    // |action| is one of this file's two fixed words.
    host->GetPrimaryMainFrame()->ExecuteJavaScript(
        u"window.BlancPrototypeHost?.handoffSheet('" + base::ASCIIToUTF16(action) + u"')", base::NullCallback());
    if (std::string_view(action) == "show") { browser->GetWindow()->Show(); browser->GetWindow()->Activate(); }
  }
}

void TabHandoff::Reset() {
  ++generation_;
  weak_.InvalidateWeakPtrs();
  runner_.reset(); loader_.reset();
  state_ = State::kNone; link_.clear(); error_.clear(); payload_.clear(); skipped_ = 0;
  window_ = SessionID::InvalidValue();
}

bool TabHandoff::Queue(const GURL& url) {
  if (!url.SchemeIs(kTabHandoffScheme)) return false;
  if (state_ == State::kLoading || state_ == State::kReady) { Sheet("show"); return true; }
  auto* browser = RouteWindow();
  // No ordinary window yet: the first link is kept for the next one.
  if (!browser) { if (pending_link_.empty()) pending_link_ = url.possibly_invalid_spec(); return true; }
  if (state_ == State::kError) { Sheet("hide"); Reset(); }
  Start(url.possibly_invalid_spec(), browser);
  return true;
}

void TabHandoff::Start(const std::string& link, BrowserWindowInterface* browser) {
  Reset();
  state_ = State::kLoading; link_ = link; window_ = browser->GetSessionID();
  runner_ = std::make_unique<HandoffRunner>();
  std::string args = base::WriteJson(base::ListValue().Append("parse").Append(base::ListValue().Append(link))).value_or("[]");
  runner_->Call(std::move(args), base::BindOnce(&TabHandoff::Parsed, weak_.GetWeakPtr(), generation_));
  Sheet("show");
}

void TabHandoff::Fail(const std::string& code) {
  runner_.reset(); loader_.reset();
  state_ = State::kError; error_ = code; payload_.clear();
  Sheet("show");
}

void TabHandoff::Parsed(uint64_t generation, bool ok, const std::string& text) {
  if (generation != generation_ || state_ != State::kLoading) return;
  auto parsed = ok ? base::JSONReader::ReadDict(text, base::JSON_PARSE_RFC) : std::nullopt;
  const std::string* claim = parsed ? parsed->FindString("claimUrl") : nullptr;
  const int limit = parsed ? parsed->FindInt("maxResponseBytes").value_or(0) : 0;
  // Shipping ignores a link that is not a handoff link; nothing is shown.
  if (!claim || limit <= 0) { Sheet("hide"); Reset(); return; }
  // The sandbox is not trusted to choose where the browser connects: the
  // address must be the relay's claim path and nothing else.
  const GURL claimed(*claim);
  if (!claimed.is_valid() || !url::Origin::Create(claimed).IsSameOriginWith(GURL(kTabHandoffRelay)) ||
      !base::StartsWith(claimed.GetPath(), "/v1/handoffs/") || !base::EndsWith(claimed.GetPath(), "/claim") ||
      claimed.has_query() || claimed.has_ref() || claimed.has_username() || claimed.has_password()) {
    Fail("generic"); return;
  }
  // The request goes to the relay; only a test launch's hook replaces its
  // origin, with a stand-in on 127.0.0.1.
  const GURL url = relay_ == kTabHandoffRelay ? claimed : GURL(relay_).Resolve(claimed.GetPath());
  if (!url.is_valid()) { Fail("generic"); return; }
  auto request = std::make_unique<network::ResourceRequest>();
  request->url = url;
  request->method = "POST";
  request->credentials_mode = network::mojom::CredentialsMode::kOmit;
  request->load_flags = net::LOAD_DISABLE_CACHE | net::LOAD_BYPASS_CACHE;
  request->redirect_mode = network::mojom::RedirectMode::kError;
  request->referrer_policy = net::ReferrerPolicy::NO_REFERRER;
  request->headers.SetHeader("Accept", "application/json");
  loader_ = network::SimpleURLLoader::Create(std::move(request),
      net::DefineNetworkTrafficAnnotation("blanc_tab_handoff_claim", R"(
        semantics { sender: "Blanc tab handoff" description: "Claims, once, the encrypted list of tabs a person sent from another browser with the Bring Your Tabs extension."
          trigger: "The person follows a blanc-import: handoff link." data: "A random handoff id. No cookies, credentials or browsing data; the decryption key never leaves this device."
          destination: OTHER destination_other: "Blanc's tab handoff relay" }
        policy { cookies_allowed: NO setting: "Only sent when a handoff link is opened."
          policy_exception_justification: "A person's explicit handoff; no setting applies." })"));
  loader_->SetTimeoutDuration(base::Seconds(10));
  auto* browser = Window();
  if (!browser) { Reset(); return; }
  loader_->DownloadToString(
      browser->GetProfile()->GetOriginalProfile()->GetDefaultStoragePartition()->GetURLLoaderFactoryForBrowserProcess().get(),
      base::BindOnce(&TabHandoff::Claimed, weak_.GetWeakPtr(), generation), static_cast<size_t>(limit));
}

void TabHandoff::Claimed(uint64_t generation, std::optional<std::string> body) {
  if (generation != generation_ || state_ != State::kLoading || !loader_) return;
  const int net_error = loader_->NetError();
  const bool responded = loader_->ResponseInfo() && loader_->ResponseInfo()->headers;
  loader_.reset();
  if (!body) {
    // Shipping: a reply that is not 2xx is "unavailable" (expired, used or
    // gone); one that is too large cannot be a handoff; anything else, a
    // timeout included, is the connection.
    Fail(net_error == net::ERR_HTTP_RESPONSE_CODE_FAILURE && responded ? "unavailable"
         : net_error == net::ERR_INSUFFICIENT_RESOURCES ? "invalid-envelope" : "offline");
    return;
  }
  std::string args = base::WriteJson(base::ListValue().Append("open")
      .Append(base::ListValue().Append(link_).Append(base::Base64Encode(*body)))).value_or("[]");
  runner_->Call(std::move(args), base::BindOnce(&TabHandoff::Opened, weak_.GetWeakPtr(), generation));
}

void TabHandoff::Opened(uint64_t generation, bool ok, const std::string& text) {
  if (generation != generation_ || state_ != State::kLoading) return;
  runner_.reset();
  auto opened = ok ? base::JSONReader::ReadDict(text, base::JSON_PARSE_RFC) : std::nullopt;
  if (!opened) { Fail("generic"); return; }
  if (const auto* code = opened->FindString("error")) { Fail(*code); return; }
  auto* value = opened->FindDict("value");
  const auto* tabs = value ? value->FindList("tabs") : nullptr;
  // The sandbox is not trusted to grant a navigation outside ordinary web
  // pages or beyond shipping's limits: check the whole list again here.
  if (!tabs || tabs->empty() || tabs->size() > 100 || !value->FindString("sourceBrowser")) { Fail("generic"); return; }
  int active = 0;
  for (const auto& tab : *tabs) {
    const auto* url = tab.is_dict() ? tab.GetDict().FindString("url") : nullptr;
    const auto* title = tab.is_dict() ? tab.GetDict().FindString("title") : nullptr;
    const GURL parsed(url ? *url : std::string());
    if (!url || url->size() > 2048 || !parsed.is_valid() || !parsed.SchemeIsHTTPOrHTTPS() || parsed.has_username() ||
        parsed.has_password() || !title || title->size() > 4096 || !tab.GetDict().FindBool("active")) {
      Fail("generic"); return;
    }
    active += *tab.GetDict().FindBool("active") ? 1 : 0;
  }
  if (active != 1) { Fail("generic"); return; }
  payload_ = std::move(*value);
  skipped_ = opened->FindInt("skippedCount").value_or(0);
  state_ = State::kReady; link_.clear();
  Sheet("show");
}

// What the page may see: titles and host names, never an address.
base::DictValue TabHandoff::Projection(BrowserWindowInterface* browser) {
  if (state_ == State::kNone && !pending_link_.empty() && browser && browser == RouteWindow()) {
    const std::string link = std::move(pending_link_);
    pending_link_.clear();
    Start(link, browser);
  }
  if (state_ == State::kNone || !browser || browser->GetSessionID() != window_) return base::DictValue().Set("state", "empty");
  if (state_ == State::kLoading) return base::DictValue().Set("state", "loading");
  if (state_ == State::kError) return base::DictValue().Set("state", "error").Set("error", error_);
  base::ListValue rows;
  for (const auto& tab : *payload_.FindList("tabs")) {
    rows.Append(base::DictValue().Set("title", *tab.GetDict().FindString("title"))
        .Set("domain", std::string(GURL(*tab.GetDict().FindString("url")).GetHost()))
        .Set("active", *tab.GetDict().FindBool("active")));
  }
  return base::DictValue().Set("state", "ready").Set("sourceBrowser", *payload_.FindString("sourceBrowser"))
      .Set("profileName", "").Set("skippedCount", skipped_).Set("tabs", std::move(rows));
}

void TabHandoff::Cancel(BrowserWindowInterface* browser) {
  if (state_ == State::kNone || !browser || browser->GetSessionID() != window_) return;
  Reset();
}

// The tabs open quiet, in order, all or none, with the source's active tab
// in front (shipping's createQuietTabsBatch).
void TabHandoff::Accept(BrowserWindowInterface* browser, bool new_window, base::OnceCallback<void(base::Value)> reply) {
  const auto failed = [&](bool retryable) {
    std::move(reply).Run(base::Value(base::DictValue().Set("ok", false).Set("retryable", retryable)));
  };
  if (state_ != State::kReady || !browser || browser->GetSessionID() != window_) { failed(false); return; }
  BrowserWindowInterface* target = browser;
  content::WebContents* placeholder = nullptr;
  if (new_window) {
    auto* profile = browser->GetProfile()->GetOriginalProfile();
    if (GetBrowserWindowCreationStatusForProfile(*profile) != BrowserWindowInterface::CreationStatus::kOk) { failed(true); return; }
    BrowserWindowCreateParams params(profile, true);
    params.should_trigger_session_restore = false;
    target = CreateBrowserWindow(std::move(params));
    if (!target) { failed(true); return; }
    placeholder = target->GetTabStripModel()->GetActiveWebContents();
  }
  auto* model = target->GetTabStripModel();
  auto* context = BrowserLiveTabContext::From(target);
  if (!context || model->closing_all()) { failed(true); return; }
  std::vector<content::WebContents*> created;
  content::WebContents* front = nullptr;
  auto* previous = model->GetActiveWebContents();
  const auto rollback = [&] {
    for (auto* tab : created) {
      const int index = model->GetIndexOfWebContents(tab);
      if (index >= 0) model->DetachWebContentsAtForInsertion(index).reset();
    }
    if (previous && model->GetIndexOfWebContents(previous) >= 0) model->ActivateTabAt(model->GetIndexOfWebContents(previous));
  };
  for (const auto& value : *payload_.FindList("tabs")) {
    const auto& spec = value.GetDict();
    sessions::tab_restore::Tab saved;
    sessions::SerializedNavigationEntry nav;
    nav.set_index(0);
    nav.set_virtual_url(GURL(*spec.FindString("url")));
    nav.set_title(base::UTF8ToUTF16(*spec.FindString("title")));
    saved.navigations.push_back(std::move(nav));
    saved.current_navigation_index = 0;
    auto* live = context->AddRestoredTab(saved, model->count(), false, false, sessions::tab_restore::TAB);
    auto* tab = live ? model->GetWebContentsAt(model->count() - 1) : nullptr;
    if (!tab || sessions::SessionTabHelper::IdForTab(tab) != live->GetSessionID()) { rollback(); failed(true); return; }
    created.push_back(tab);
    if (*spec.FindBool("active")) front = tab;
  }
  if (!front) front = created.front();
  model->ActivateTabAt(model->GetIndexOfWebContents(front));
  front->GetController().LoadIfNecessary();
  // A window opened for the handoff holds only its tabs.
  if (placeholder && model->GetIndexOfWebContents(placeholder) >= 0)
    model->CloseWebContentsAt(model->GetIndexOfWebContents(placeholder), TabCloseTypes::CLOSE_NONE);
  if (new_window) target->GetWindow()->Show();
  NoteChecklistTask(target->GetProfile(), "tabs");
  base::ListValue ids;
  for (auto* tab : created) ids.Append(base::NumberToString(sessions::SessionTabHelper::IdForTab(tab).id()));
  Reset();
  std::move(reply).Run(base::Value(base::DictValue().Set("ok", true).Set("tabIds", std::move(ids))
      .Set("windowId", target->GetSessionID().id())));
}
