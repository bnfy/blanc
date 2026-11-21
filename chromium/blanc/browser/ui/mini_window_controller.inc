// Mini windows are ordinary native tab containers with explicit transient
// session ownership. Promotion changes that ownership before persisting.
constexpr char kMiniShortcutPref[] = "blanc.mini_window.shortcut";
struct MiniWindowState {
  base::WeakPtr<BrowserWindowInterface> browser;
  base::OneShotTimer idle;
  uint64_t generation = 0;
  bool probing = false;
};
std::map<BrowserWindowInterface*, std::unique_ptr<MiniWindowState>>& MiniWindows() {
  static base::NoDestructor<std::map<BrowserWindowInterface*, std::unique_ptr<MiniWindowState>>> states;
  return *states;
}
MiniWindowState* MiniState(BrowserWindowInterface* browser) {
  auto it = MiniWindows().find(browser);
  return it != MiniWindows().end() && it->second->browser ? it->second.get() : nullptr;
}
void ForgetMiniWindow(BrowserWindowInterface* browser) { MiniWindows().erase(browser); }
gfx::Rect MiniBounds(const gfx::Rect& area, bool ordinary) {
  const int width = std::max(640, std::min(ordinary ? 1280 : 760, area.width() - 32));
  const int height = std::max(480, std::min(ordinary ? 800 : 600, area.height() - 32));
  return gfx::Rect(area.x() + (area.width() - width) / 2,
      area.y() + std::max(0, static_cast<int>((area.height() - height) * .4)), width, height);
}
void ArmMiniWindow(BrowserWindowInterface* browser);
bool MiniPagesIdle(BrowserWindowInterface* browser, bool ignore_focus) {
  if (!MiniState(browser) || browser->IsDeleteScheduled() ||
      (!ignore_focus && browser->GetWindow()->IsActive())) return false;
  auto* tabs = browser->GetTabStripModel();
  for (int i = 0; i < tabs->count(); ++i) {
    auto* page = tabs->GetWebContentsAt(i);
    auto* lifecycle = resource_coordinator::TabLifecycleUnitExternal::FromWebContents(page);
    if (TabIsCapturing(page) || page->IsCurrentlyAudible() || page->IsLoading() ||
        !page->GetPrimaryMainFrame()->IsRenderFrameLive() || page->GetController().NeedsReload() ||
        (lifecycle && lifecycle->GetTabState() != ::mojom::LifecycleUnitState::ACTIVE) ||
        OpenedAnotherPage(page)) return false;
  }
  return true;
}
void ProbeMiniWindow(base::WeakPtr<BrowserWindowInterface> browser, uint64_t generation,
    bool ignore_focus, std::vector<content::WeakDocumentPtr> documents, size_t next) {
  if (!browser) return;
  auto* state = MiniState(browser.get());
  if (!state) return;
  const auto fail = [&] {state->probing = false; ArmMiniWindow(browser.get());};
  if (state->generation != generation || !MiniPagesIdle(browser.get(), ignore_focus) ||
      documents.size() != static_cast<size_t>(browser->GetTabStripModel()->count())) {fail(); return;}
  for (size_t i = 0; i < documents.size(); ++i)
    if (documents[i].AsRenderFrameHostIfValid() != browser->GetTabStripModel()->GetWebContentsAt(i)->GetPrimaryMainFrame()) {fail(); return;}
  if (next == documents.size()) {
    state->probing = false;
    browser->GetWindow()->Close(); // Native beforeunload remains the final guard.
    return;
  }
  auto* page = browser->GetTabStripModel()->GetWebContentsAt(next);
  blanc::quiet::DirtyProbe::Run(page, base::BindOnce(
      [](base::WeakPtr<BrowserWindowInterface> browser, uint64_t generation, bool ignore_focus,
         std::vector<content::WeakDocumentPtr> documents, size_t next, blanc::quiet::DirtyResult result) {
        if (!browser) return;
        auto* state = MiniState(browser.get());
        if (!state) return;
        if (!result.complete || result.dirty) {state->probing = false; ArmMiniWindow(browser.get()); return;}
        ProbeMiniWindow(browser, generation, ignore_focus, std::move(documents), next + 1);
      }, browser, generation, ignore_focus, std::move(documents), next));
}
std::string ExpireMiniWindow(BrowserWindowInterface* browser, bool ignore_focus) {
  auto* state = MiniState(browser);
  if (!state) return "gone";
  if (state->probing) return "pending";
  if (!MiniPagesIdle(browser, ignore_focus)) {ArmMiniWindow(browser); return "in-use";}
  std::vector<content::WeakDocumentPtr> documents;
  auto* tabs = browser->GetTabStripModel();
  for (int i = 0; i < tabs->count(); ++i) documents.push_back(tabs->GetWebContentsAt(i)->GetPrimaryMainFrame()->GetWeakDocumentPtr());
  state->probing = true;
  ProbeMiniWindow(browser->GetWeakPtr(), state->generation, ignore_focus, std::move(documents), 0);
  return "pending";
}
void ArmMiniWindow(BrowserWindowInterface* browser) {
  auto* state = MiniState(browser);
  if (!state) return;
  state->idle.Start(FROM_HERE, base::Hours(1), base::BindOnce(
      [](base::WeakPtr<BrowserWindowInterface> browser) {if (browser) ExpireMiniWindow(browser.get(), false);}, browser->GetWeakPtr()));
}
void MiniWindowFocusChanged(BrowserWindowInterface* browser) {
  auto* state = MiniState(browser);
  if (!state) return;
  ++state->generation;
  ArmMiniWindow(browser);
}
BrowserWindowInterface* CreateMiniWindow() {
  auto* ordinary = RouteWindow();
  auto* profile = ordinary ? ordinary->GetProfile() : ProfileManager::GetLastUsedProfileAllowedByPolicy();
  if (!profile || profile->IsOffTheRecord() || GetBrowserWindowCreationStatusForProfile(*profile) != BrowserWindowInterface::CreationStatus::kOk) return nullptr;
  const auto area = display::Screen::Get()->GetDisplayNearestPoint(display::Screen::Get()->GetCursorScreenPoint()).work_area();
  BrowserWindowCreateParams params(profile, true);
  params.omit_from_session_restore = true; params.should_trigger_session_restore = false;
  params.initial_bounds = MiniBounds(area, false);
  auto* browser = CreateBrowserWindow(std::move(params));
  if (!browser) return nullptr;
  auto state = std::make_unique<MiniWindowState>();state->browser = browser->GetWeakPtr();
  MiniWindows().emplace(browser, std::move(state));
  chrome::AddTabAt(browser, GURL("chrome://newtab/"), -1, true);
  browser->GetWindow()->SetBounds(MiniBounds(area, false));
  browser->GetWindow()->Show();browser->GetWindow()->Activate();
  ArmMiniWindow(browser);
  return browser;
}
bool KeepMiniWindow(BrowserWindowInterface* browser) {
  if (!MiniState(browser) || browser->IsDeleteScheduled()) return false;
  BrowserInitState::From(browser)->IncludeInSessionRestore();
  ForgetMiniWindow(browser);
  const auto area = display::Screen::Get()->GetDisplayMatching(browser->GetWindow()->GetBounds()).work_area();
  browser->GetWindow()->SetBounds(MiniBounds(area, true));
  if (auto* session = SessionServiceFactory::GetForProfile(browser->GetProfile())) {
    session->WindowOpened(browser);
    session->ResetFromCurrentBrowsers();
    session->SaveAndFlushSession(base::BindOnce([](bool) {}));
  }
  return true;
}
class MiniShortcut final : public ui::GlobalAcceleratorListener::Observer {
 public:
  void OnKeyPressed(const ui::Accelerator&) override;
  void ExecuteCommand(const std::string&, const std::string&) override;
  base::DictValue Apply(std::optional<std::string> choice = std::nullopt) {
    auto* prefs = g_browser_process->local_state();
    if (choice && (*choice == "off" || *choice == "ctrl-alt-space"
#if BUILDFLAG(IS_MAC)
        || *choice == "alt-cmd-n"
#else
        || *choice == "ctrl-shift-space"
#endif
        )) { prefs->SetString(kMiniShortcutPref, *choice); prefs->CommitPendingWrite(); }
    const auto saved = prefs->GetString(kMiniShortcutPref);
    if (applied_ == saved && status_ != "unavailable") return base::DictValue().Set("saved", saved).Set("status", status_);
    auto* listener = ui::GlobalAcceleratorListener::GetInstance();
    if (listener && accelerator_) listener->UnregisterAccelerator(*accelerator_, this);
    accelerator_.reset();applied_ = saved;status_ = saved == "off" ? "off" : "unavailable";
    if (saved == "ctrl-alt-space") accelerator_ = ui::Accelerator(ui::VKEY_SPACE, ui::EF_CONTROL_DOWN | ui::EF_ALT_DOWN);
#if BUILDFLAG(IS_MAC)
    if (saved == "alt-cmd-n") accelerator_ = ui::Accelerator(ui::VKEY_N, ui::EF_COMMAND_DOWN | ui::EF_ALT_DOWN);
#else
    if (saved == "ctrl-shift-space") accelerator_ = ui::Accelerator(ui::VKEY_SPACE, ui::EF_CONTROL_DOWN | ui::EF_SHIFT_DOWN);
#endif
    if (accelerator_ && listener && listener->RegisterAccelerator(*accelerator_, this)) status_ = "on";
    else accelerator_.reset();
    return base::DictValue().Set("saved", saved).Set("status", status_);
  }
 private:
  std::string applied_, status_ = "off";
  std::optional<ui::Accelerator> accelerator_;
};
void MiniShortcut::OnKeyPressed(const ui::Accelerator&) { CreateMiniWindow(); }
void MiniShortcut::ExecuteCommand(const std::string&, const std::string&) { CreateMiniWindow(); }
MiniShortcut& MiniKeys() {static base::NoDestructor<MiniShortcut> keys;return *keys;}
void InitializeMiniShortcut() { MiniKeys().Apply(); }
