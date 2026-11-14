// Island proximity (the approach swell): the resting pill rises and grows as
// the cursor approaches it, shipping v1.45.1's main.js updateIslandProximity
// over island_proximity.h. Shipping's main process measures because the
// cursor is usually over the page, which the Island never sees. Here the host
// measures with shipping's own island-proximity.js (host.js updateProximity);
// native forwards it the page's moves near the Island, the newest at most once
// a frame, and draws the swell on Chromium's extension buttons, which sit over
// the pill as native views and cannot take its CSS transform. Included inside
// blanc_prototype_ui.cc's anonymous namespace, after Owner.

namespace proximity = blanc::island_proximity;

void IslandPointerFrameEnded(Owner* owner);

void SendIslandPointer(Owner* owner, const gfx::Point& point) {
  auto* host = owner->view ? owner->view->GetWebContents() : nullptr;
  if (!host || host->GetLastCommittedURL() != GURL("chrome://blanc-prototype/host.html") ||
      !host->GetPrimaryMainFrame()->IsRenderFrameLive()) return;
  host->GetPrimaryMainFrame()->ExecuteJavaScript(
      base::UTF8ToUTF16(base::StringPrintf("window.blancIslandPointer?.(%d,%d)", point.x(), point.y())),
      base::NullCallback());
  owner->island_pointer_frame.Start(FROM_HERE, base::Milliseconds(proximity::kFrameMs),
                                    base::BindOnce(&IslandPointerFrameEnded, base::Unretained(owner)));
}

// The frame is over: the newest move parked during it goes now (shipping
// parks the newest, not the first, so a fast sweep never animates to a place
// the cursor has already left).
void IslandPointerFrameEnded(Owner* owner) {
  if (auto pending = std::exchange(owner->island_pointer_pending, std::nullopt))
    SendIslandPointer(owner, *pending);
}

// The page saw the pointer move.
void IslandProximityPageMove(Owner* owner, const blink::WebInputEvent& event) {
  auto* view = BrowserViewFor(owner);
  auto* contents = view ? view->GetActiveContentsWebView() : nullptr;
  if (!contents || !owner->view || !owner->view->GetVisible()) return;
  const auto& mouse = static_cast<const blink::WebMouseEvent&>(event);
  gfx::Point origin;
  views::View::ConvertPointToTarget(contents, owner->view, &origin);
  const gfx::Point point(origin.x() + static_cast<int>(std::lround(mouse.PositionInWidget().x())),
                         origin.y() + static_cast<int>(std::lround(mouse.PositionInWidget().y())));
  const gfx::Rect& box = owner->interactive_bounds;
  switch (proximity::PageMove(owner->island_pointer_near, owner->island_pointer_frame.IsRunning(),
                              {static_cast<double>(point.x()), static_cast<double>(point.y())},
                              {static_cast<double>(box.x()), static_cast<double>(box.y()),
                               static_cast<double>(box.width()), static_cast<double>(box.height())})) {
    case proximity::Forward::kNone:
      return;
    case proximity::Forward::kPark:
      owner->island_pointer_pending = point;
      return;
    case proximity::Forward::kSend:
      SendIslandPointer(owner, point);
      return;
  }
}

// The swell changed without a page move: the pointer left the Island's own
// view, or a surface closed and the host sampled the cursor. The next page
// move may land beyond reach, where it would go unsent while the pill still
// shows that swell, so it goes wherever it lands.
void ArmIslandPointer(Owner* owner) {
  owner->island_pointer_near = true;
}

// The extension buttons' transform: the floating pill's slide
// (extensions_pill_y) and the swell the host measured on their slot. The view
// keeps the slot's resting bounds; the swell grows it from its own corner and
// moves it as the slot moved.
// A transform is no bounds change to a bubble: an extension's popup hanging
// from these buttons is placed again, so it moves with them.
void ReanchorExtensionPopups(views::View* extensions) {
  auto* widget = extensions->GetWidget();
  if (!widget) return;
  for (views::Widget* child : views::Widget::GetAllOwnedWidgets(widget->GetNativeView())) {
    auto* delegate = child->widget_delegate();
    auto* bubble = delegate ? delegate->AsBubbleDialogDelegate() : nullptr;
    auto* anchor = bubble ? bubble->GetAnchorView() : nullptr;
    if (anchor && extensions->Contains(anchor)) bubble->OnAnchorBoundsChanged();
  }
}

void SetExtensionsPillOffset(Owner* owner, views::View* extensions) {
  gfx::Transform transform;
  transform.Translate(owner->extensions_swell_dx, owner->extensions_pill_y + owner->extensions_swell_dy);
  transform.Scale(owner->extensions_swell_scale, owner->extensions_swell_scale);
  extensions->SetTransform(transform);
  if (owner->extension_popup) ReanchorExtensionPopups(extensions);
}
