// Native input interception preserves the source pane and renderer widget.
constexpr char kGestureEnabledPref[] = "blanc.mouse_gestures.enabled";
constexpr char kGestureMappingPref[] = "blanc.mouse_gestures.mapping";
const std::set<std::string>& GestureActions() {
  static const base::NoDestructor<std::set<std::string>> actions(std::set<std::string>{"back", "forward", "reload", "newTab", "closeTab", "reopenTab", "previousTab", "nextTab", "island"});
  return *actions;
}
bool ValidGestureMapping(const base::DictValue& mapping) {
  if (mapping.size() > 16) return false;
  for (const auto [pattern, action] : mapping) {
    if (pattern.empty() || pattern.size() > 3 || !action.is_string() || !GestureActions().contains(action.GetString())) return false;
    char previous = 0;
    for (char ch : pattern) { if (std::string_view("UDLR").find(ch) == std::string_view::npos || previous == ch) return false; previous = ch; }
  }
  return true;
}
base::DictValue GestureSettings(Profile* profile) {
  auto* prefs = profile->GetOriginalProfile()->GetPrefs();
  return base::DictValue().Set("enabled", prefs->GetBoolean(kGestureEnabledPref)).Set("mapping", prefs->GetDict(kGestureMappingPref).Clone());
}
bool SaveGestureSettings(Profile* profile, const base::DictValue& state) {
  const auto enabled = state.FindBool("enabled"); const auto* mapping = state.FindDict("mapping");
  if (!enabled || !mapping || !ValidGestureMapping(*mapping)) return false;
  auto* prefs = profile->GetOriginalProfile()->GetPrefs();
  prefs->SetDict(kGestureMappingPref, mapping->Clone()); prefs->SetBoolean(kGestureEnabledPref, *enabled); prefs->CommitPendingWrite();
  return true;
}
void DispatchMouseGesture(base::WeakPtr<content::WebContents> page, content::WeakDocumentPtr document, std::string action);
class MouseGestureTab : public base::SupportsUserData::Data, public content::WebContentsObserver {
 public:
  explicit MouseGestureTab(content::WebContents* page);
  ~MouseGestureTab() override;
  static void Install(content::WebContents* page);
  void RenderFrameCreated(content::RenderFrameHost* frame) override;
  void RenderFrameDeleted(content::RenderFrameHost*) override;
  void DidStartNavigation(content::NavigationHandle*) override;
  void PrimaryPageChanged(content::Page&) override;
  void OnWebContentsLostFocus(content::RenderWidgetHost*) override;
  void OnVisibilityChanged(content::Visibility visibility) override;
  void WebContentsDestroyed() override;
 private:
  class Widget final : public content::RenderWidgetHostObserver {
   public:
    Widget(MouseGestureTab* owner, content::RenderWidgetHost* host);
    ~Widget() override;
    void RenderWidgetHostDestroyed(content::RenderWidgetHost*) override;
    void RenderWidgetHostVisibilityChanged(content::RenderWidgetHost*, bool visible) override;
    void Cancel();
    bool Handle(const blink::WebMouseEvent& event);
   private:
    bool Eligible() const;
    void Replay(blink::WebMouseEvent down, blink::WebMouseEvent up, content::WeakDocumentPtr document);
    raw_ptr<MouseGestureTab> owner_;
    raw_ptr<content::RenderWidgetHost> host_;
    content::RenderWidgetHost::MouseEventCallback callback_;
    std::optional<blink::WebMouseEvent> down_;
    content::WeakDocumentPtr document_;
    gfx::PointF anchor_;
    std::string pattern_;
    bool moved_ = false, overflow_ = false, replaying_ = false;
    base::WeakPtrFactory<Widget> weak_factory_{this};
  };
  void Attach(content::RenderWidgetHost* host);
  void Cancel();
  std::map<content::RenderWidgetHost*, std::unique_ptr<Widget>> widgets_;
};
MouseGestureTab::MouseGestureTab(content::WebContents* page) : content::WebContentsObserver(page) {
  page->ForEachRenderFrameHost([this](content::RenderFrameHost* frame) { Attach(frame->GetRenderWidgetHost()); });
}
MouseGestureTab::~MouseGestureTab() = default;
void MouseGestureTab::Install(content::WebContents* page) {
  static constexpr char key[] = "blanc-mouse-gestures";
  if (!page->GetUserData(key)) page->SetUserData(key, std::make_unique<MouseGestureTab>(page));
}
void MouseGestureTab::Attach(content::RenderWidgetHost* host) {
  if (host && !widgets_.contains(host)) widgets_.emplace(host, std::make_unique<Widget>(this, host));
}
void MouseGestureTab::Cancel() { for (auto& [host, widget] : widgets_) widget->Cancel(); }
void MouseGestureTab::RenderFrameCreated(content::RenderFrameHost* frame) { Attach(frame->GetRenderWidgetHost()); }
void MouseGestureTab::RenderFrameDeleted(content::RenderFrameHost*) { Cancel(); }
void MouseGestureTab::DidStartNavigation(content::NavigationHandle*) { Cancel(); }
void MouseGestureTab::PrimaryPageChanged(content::Page&) { Cancel(); web_contents()->ForEachRenderFrameHost([this](content::RenderFrameHost* frame) {Attach(frame->GetRenderWidgetHost());}); }
void MouseGestureTab::OnWebContentsLostFocus(content::RenderWidgetHost*) { Cancel(); }
void MouseGestureTab::OnVisibilityChanged(content::Visibility visibility) { if (visibility != content::Visibility::VISIBLE) Cancel(); }
void MouseGestureTab::WebContentsDestroyed() { widgets_.clear(); }
MouseGestureTab::Widget::Widget(MouseGestureTab* owner, content::RenderWidgetHost* host) : owner_(owner), host_(host) {
  callback_ = base::BindRepeating(&Widget::Handle, base::Unretained(this));
  host_->AddMouseEventCallback(callback_); host_->AddObserver(this);
}
MouseGestureTab::Widget::~Widget() { if (host_) {host_->RemoveMouseEventCallback(callback_); host_->RemoveObserver(this);} }
void MouseGestureTab::Widget::RenderWidgetHostDestroyed(content::RenderWidgetHost* host) {
  host_->RemoveMouseEventCallback(callback_); host_->RemoveObserver(this); host_ = nullptr; owner_->widgets_.erase(host);
}
void MouseGestureTab::Widget::RenderWidgetHostVisibilityChanged(content::RenderWidgetHost*, bool visible) {if (!visible) Cancel();}
void MouseGestureTab::Widget::Cancel() {down_.reset(); pattern_.clear(); moved_ = overflow_ = false; weak_factory_.InvalidateWeakPtrs();}
bool MouseGestureTab::Widget::Eligible() const {
  auto* page = owner_->web_contents();
  const auto* tab = page ? tabs::TabInterface::MaybeGetFromContents(page) : nullptr;
  bool current_widget = false;
  if (page) page->GetPrimaryMainFrame()->ForEachRenderFrameHost([&](content::RenderFrameHost* frame) {
    if (frame->IsActive() && frame->GetRenderWidgetHost() == host_) current_widget = true;
  });
  const auto* modal = page ? web_modal::WebContentsModalDialogManager::FromWebContents(page) : nullptr;
  return current_widget && (!modal || !modal->IsDialogActive()) && host_ && host_->GetView() && host_->GetView()->IsShowing() && page && tab && tab->IsVisible() && !page->IsBeingDestroyed() &&
      Profile::FromBrowserContext(page->GetBrowserContext())->GetOriginalProfile()->GetPrefs()->GetBoolean(kGestureEnabledPref);
}
void MouseGestureTab::Widget::Replay(blink::WebMouseEvent down, blink::WebMouseEvent up, content::WeakDocumentPtr document) {
  if (!Eligible() || document.AsRenderFrameHostIfValid() != owner_->web_contents()->GetPrimaryMainFrame()) return;
  const auto weak = weak_factory_.GetWeakPtr();
  replaying_ = true; host_->ForwardMouseEvent(down);
  if (!weak || !host_) return;
  host_->ForwardMouseEvent(up); if (weak) replaying_ = false;
}
bool MouseGestureTab::Widget::Handle(const blink::WebMouseEvent& event) {
  if (replaying_) return false;
  if (!Eligible()) {Cancel(); return false;}
  using Type = blink::WebInputEvent::Type; using Button = blink::WebMouseEvent::Button;
  const auto type = event.GetType(); const int mods = event.GetModifiers();
  if (type == Type::kMouseDown) {
    Cancel();
    const bool right = event.button == Button::kRight;
    const bool option_left = event.button == Button::kLeft && (mods & blink::WebInputEvent::kAltKey);
    const int forbidden = blink::WebInputEvent::kShiftKey | blink::WebInputEvent::kControlKey | blink::WebInputEvent::kMetaKey |
        blink::WebInputEvent::kMiddleButtonDown | (right ? blink::WebInputEvent::kAltKey | blink::WebInputEvent::kLeftButtonDown : blink::WebInputEvent::kRightButtonDown);
    if ((!right && !option_left) || (mods & forbidden)) return false;
    down_ = event; anchor_ = event.PositionInWidget(); document_ = owner_->web_contents()->GetPrimaryMainFrame()->GetWeakDocumentPtr(); return true;
  }
  if (!down_) return false;
  if (document_.AsRenderFrameHostIfValid() != owner_->web_contents()->GetPrimaryMainFrame()) {Cancel();return false;}
  if (type == Type::kMouseLeave) {Cancel();return false;}
  if (type == Type::kMouseMove) {
    const auto point = event.PositionInWidget(); const float dx = point.x() - anchor_.x(), dy = point.y() - anchor_.y();
    if (std::max(std::abs(dx), std::abs(dy)) >= 24) {
      const char direction = std::abs(dx) >= std::abs(dy) ? (dx > 0 ? 'R' : 'L') : (dy > 0 ? 'D' : 'U'); moved_ = true;
      if (pattern_.empty() || pattern_.back() != direction) {if (pattern_.size() < 3) pattern_ += direction; else overflow_ = true;}
      anchor_ = point;
    }
    return true;
  }
  if (type == Type::kMouseUp && event.button == down_->button) {
    const auto down = *down_; const auto document = document_; const bool moved = moved_; const auto pattern = overflow_ ? std::string() : pattern_;
    Cancel();
    if (!moved) base::SequencedTaskRunner::GetCurrentDefault()->PostTask(FROM_HERE, base::BindOnce(&Widget::Replay, weak_factory_.GetWeakPtr(), down, event, document));
    else {
      const auto* prefs = Profile::FromBrowserContext(owner_->web_contents()->GetBrowserContext())->GetOriginalProfile()->GetPrefs();
      if (const auto* action = prefs->GetDict(kGestureMappingPref).FindString(pattern))
        base::SequencedTaskRunner::GetCurrentDefault()->PostTask(FROM_HERE, base::BindOnce(&DispatchMouseGesture, owner_->web_contents()->GetWeakPtr(), document, *action));
    }
    return true;
  }
  return false;
}
