// Auto-hide Island (F1-15…F1-27), shipping v1.45.1's main-process controller
// (src/main/main.js, "Auto-hide Island") over the policy in
// island_autohide.h. With the setting on, the page fills the window and the
// Island waits above it. The top edge reveals it, or a rest just below the
// edge does, after a dwell. It hides again once the pointer has left it.
// Anything open from the Island keeps it revealed (an open surface makes the
// host taller than the strip, `Owner::height`). In the push style revealing
// slides the page down and the Island in above it; in the float style (the
// default) the page keeps the whole window and the host slides its floating
// pill in over it, claiming only that pill (`Owner::float_bounds`). The
// page's own moves reach the Island, but none do while the pointer sits over
// a band the window keeps or outside it, so a hidden Island in the window in
// front samples the cursor. Included inside blanc_prototype_ui.cc's
// anonymous namespace, after Owner.

namespace autohide = blanc::island_autohide;

// Acceptance only, as shipping's testCursorPoint and
// testCursorSamplingUnavailable: a cursor in window content coordinates, and
// a platform without a global pointer position.
std::optional<gfx::PointF>& TestCursorPoint() {
  static std::optional<gfx::PointF> point;
  return point;
}
bool& TestCursorSamplingUnavailable() {
  static bool unavailable = false;
  return unavailable;
}

PrefService* IslandPrefsFor(Owner* owner) {
  return owner->browser->GetProfile()->GetOriginalProfile()->GetPrefs();
}

bool AutoHideOn(Owner* owner) {
  return IslandPrefsFor(owner)->GetBoolean(std::string(autohide::kPref));
}

std::string_view AutoHideStyle(Owner* owner) {
  return autohide::NormalizeStyle(IslandPrefsFor(owner)->GetString(std::string(autohide::kStylePref)));
}

BrowserView* BrowserViewFor(Owner* owner) {
  return BrowserView::GetBrowserViewForBrowser(owner->browser);
}

bool WindowActive(Owner* owner) {
  return owner->browser->GetWindow() && owner->browser->GetWindow()->IsActive();
}

bool AutoHidePinned(Owner* owner) {
  return autohide::IslandPinned(owner->height > owner->strip_height, owner->autohide_test_hold, owner->autohide_intro.IsRunning());
}

// Both layouts hide: in the vertical one the rail keeps its column and only
// the strip over the page pane goes (the host clips the strip to the rail).
bool AutoHideApplies(Owner* owner) {
  return AutoHideOn(owner);
}

bool IslandFloating(Owner* owner) {
  return autohide::FloatingLayout(AutoHideApplies(owner), AutoHideStyle(owner));
}

bool StripHiddenFor(Owner* owner) {
  return autohide::StripHidden(AutoHideApplies(owner), owner->autohide_revealed, AutoHidePinned(owner));
}

// Where the page starts once the layout settles (shipping's pageTopFor): a
// floating Island never moves it.
int TargetPageTop(Owner* owner, int base) {
  return IslandFloating(owner) || StripHiddenFor(owner) ? 0 : base;
}

// The host learns of a reveal or hide at once, not at its next snapshot, so
// the floating pill slides as the Island changes.
void NotifyAutoHide(Owner* owner) {
  auto* host = owner->view ? owner->view->GetWebContents() : nullptr;
  if (!host || host->GetLastCommittedURL() != GURL("chrome://blanc-prototype/host.html") ||
      !host->GetPrimaryMainFrame()->IsRenderFrameLive()) return;
  host->GetPrimaryMainFrame()->ExecuteJavaScript(u"window.blancPrototypeEvent?.('autohide')",
                                                 base::NullCallback());
}

void Relayout(Owner* owner) {
  if (auto* view = BrowserViewFor(owner)) view->InvalidateLayout();
}

// A setting or style change takes effect in the same task, as shipping's
// resizeActiveView sets the page's bounds at once: anything reading the page
// afterwards sees the new layout, not the old one.
void RelayoutNow(Owner* owner) {
  if (auto* view = BrowserViewFor(owner)) {
    view->InvalidateLayout();
    view->DeprecatedLayoutImmediately();
  }
}

struct RevealGeometry {
  gfx::Rect content;
  double left = 0;
  double reach_above = 0;
};

RevealGeometry RevealGeometryFor(Owner* owner) {
  RevealGeometry geometry;
  auto* view = BrowserViewFor(owner);
  if (!view) return geometry;
  geometry.content = view->GetBoundsInScreen();
  geometry.left = RailWidth(view);
  const auto display = display::Screen::Get()->GetDisplayMatching(geometry.content);
  geometry.reach_above = autohide::ReachAboveWindow(geometry.content.y(), display.work_area().y(),
                                                     display.bounds().y());
  return geometry;
}

// Window content coordinates of the cursor now (or the test's). Where the
// cursor cannot be read, the last move the page saw stands in.
std::optional<autohide::Point> SampledCursor(Owner* owner, const RevealGeometry& geometry) {
  if (auto& test = TestCursorPoint()) return autohide::Point{test->x(), test->y()};
  if (TestCursorSamplingUnavailable()) {
    if (!owner->last_pointer) return std::nullopt;
    return autohide::Point{owner->last_pointer->x(), owner->last_pointer->y()};
  }
  const gfx::Point cursor = display::Screen::Get()->GetCursorScreenPoint();
  return autohide::Point{static_cast<double>(cursor.x() - geometry.content.x()),
                         static_cast<double>(cursor.y() - geometry.content.y())};
}

bool IslandHeldAt(Owner* owner, std::optional<autohide::Point> point, const RevealGeometry& geometry) {
  auto* view = BrowserViewFor(owner);
  autohide::HoldState state;
  state.revealed = owner->autohide_revealed;
  state.chrome_height = view ? BaseHeaderHeight(view) : 68;
  state.width = geometry.content.width();
  state.height = geometry.content.height();
  state.reach_above = geometry.reach_above;
  state.left = geometry.left;
  state.floating = IslandFloating(owner);
  return autohide::PointHoldsIsland(point, state);
}

void StopAutoHideWatch(Owner* owner) {
  owner->autohide_watch.Stop();
  owner->autohide_dwell.reset();
}

void SetIslandRevealed(Owner* owner, bool revealed);
void ScheduleAutoHideCheck(Owner* owner);

void RevealIsland(Owner* owner) {
  if (!AutoHideApplies(owner)) return;
  SetIslandRevealed(owner, true);
  ScheduleAutoHideCheck(owner);
}

// While the strip is hidden in the window in front, sample the cursor so the
// top edge (or a rest just below it) reveals the Island even when no view
// sees the pointer move. Stops on blur, reveal or turning the setting off.
void WatchAutoHideReveal(Owner* owner) {
  if (owner->autohide_watch.IsRunning() || !AutoHideApplies(owner) || !WindowActive(owner)) return;
  owner->autohide_watch.Start(FROM_HERE, base::Milliseconds(autohide::kRevealWatchMs),
      base::BindOnce([](Owner* owner) {
        if (!AutoHideApplies(owner) || !WindowActive(owner) || owner->autohide_revealed) return;
        const auto geometry = RevealGeometryFor(owner);
        const auto point = SampledCursor(owner, geometry);
        const auto dwell = autohide::RevealDwellStep(owner->autohide_dwell, point,
            base::TimeTicks::Now().since_origin().InMillisecondsF(), geometry.content.width(),
            geometry.left, IslandFloating(owner));
        owner->autohide_dwell = dwell.dwell;
        if (IslandHeldAt(owner, point, geometry) || dwell.reveal) {
          RevealIsland(owner);
          return;
        }
        WatchAutoHideReveal(owner);
      }, base::Unretained(owner)));
}

int CurrentPageTop(Owner* owner) {
  auto* view = BrowserViewFor(owner);
  return view ? HeaderHeight(view) : 0;
}

// Slide the page from one top to another over shipping's durations, laying
// it out each frame; Reduce Motion lays it out once.
void SlideIsland(Owner* owner, double from, double to) {
  owner->autohide_slide_timer.Stop();
  owner->autohide_slide.reset();
  if (from == to || gfx::Animation::PrefersReducedMotion()) {
    Relayout(owner);
    return;
  }
  owner->autohide_slide = Owner::AutoHideSlide{from, to, from, base::TimeTicks::Now(),
      base::Milliseconds(to > from ? autohide::kSlideInMs : autohide::kSlideOutMs)};
  owner->autohide_slide_timer.Start(FROM_HERE, base::Milliseconds(16),
      base::BindRepeating([](Owner* owner) {
        auto& slide = owner->autohide_slide;
        if (!slide) return owner->autohide_slide_timer.Stop();
        const double progress = (base::TimeTicks::Now() - slide->start) / slide->duration;
        if (progress >= 1) {
          slide.reset();
          owner->autohide_slide_timer.Stop();
        } else {
          slide->top = slide->from + (slide->to - slide->from) * autohide::EaseOutCubic(progress);
        }
        Relayout(owner);
      }, base::Unretained(owner)));
  Relayout(owner);
}

// Move the Island in or out. A slide under way continues from where the
// page is now; a floating Island leaves the page where it is.
void SetIslandRevealed(Owner* owner, bool revealed) {
  if (owner->autohide_revealed == revealed) return;
  const double from = owner->autohide_slide ? owner->autohide_slide->top : CurrentPageTop(owner);
  owner->autohide_revealed = revealed;
  auto* view = BrowserViewFor(owner);
  if (IslandFloating(owner)) SlideIsland(owner, 0, 0);
  else SlideIsland(owner, from, view ? TargetPageTop(owner, BaseHeaderHeight(view)) : 0);
  if (revealed) StopAutoHideWatch(owner);
  else WatchAutoHideReveal(owner);
  NotifyAutoHide(owner);
}

void ScheduleAutoHideCheck(Owner* owner) {
  if (owner->autohide_hide.IsRunning()) return;
  owner->autohide_hide.Start(FROM_HERE, base::Milliseconds(autohide::HideCheckDelay(IslandFloating(owner))),
      base::BindOnce([](Owner* owner) {
        if (!AutoHideApplies(owner) || !owner->autohide_revealed) return;
        const auto geometry = RevealGeometryFor(owner);
        if (AutoHidePinned(owner) || IslandHeldAt(owner, SampledCursor(owner, geometry), geometry)) {
          ScheduleAutoHideCheck(owner);
          return;
        }
        SetIslandRevealed(owner, false);
      }, base::Unretained(owner)));
}

// A surface opening from the Island (⌘L, find, the shield menu) reveals it.
void AutoHideSurfaceOpened(Owner* owner) {
  RevealIsland(owner);
}

// The page saw the pointer move: only the top edge reveals from a move (the
// band below it is the watch's), and the move is the stand-in cursor where
// none can be read.
void AutoHidePageMove(Owner* owner, const blink::WebInputEvent& event) {
  if (!AutoHideOn(owner)) return;
  auto* view = BrowserViewFor(owner);
  auto* contents = view ? view->GetActiveContentsWebView() : nullptr;
  if (!contents) return;
  const auto& mouse = static_cast<const blink::WebMouseEvent&>(event);
  gfx::Point origin;
  views::View::ConvertPointToTarget(contents, view, &origin);
  const gfx::PointF point(origin.x() + mouse.PositionInWidget().x(), origin.y() + mouse.PositionInWidget().y());
  owner->last_pointer = point;
  if (owner->autohide_revealed || point.y() > autohide::kRevealEdgePx || !WindowActive(owner)) return;
  if (!IslandHeldAt(owner, autohide::Point{point.x(), point.y()}, RevealGeometryFor(owner))) return;
  RevealIsland(owner);
}

void AutoHideActivated(Owner* owner) {
  if (!owner->autohide_revealed) WatchAutoHideReveal(owner);
}

void EndAutoHideIntro(Owner* owner) {
  owner->autohide_intro.Stop();
}

// The setting changed. The window in front keeps its Island up from the
// start, with the how-to tip, so its page never jumps up only to slide back.
void ApplyAutoHide(Owner* owner) {
  owner->autohide_hide.Stop();
  EndAutoHideIntro(owner);
  StopAutoHideWatch(owner);
  owner->autohide_slide_timer.Stop();
  owner->autohide_slide.reset();
  const bool on = AutoHideApplies(owner);
  if (!IslandFloating(owner)) owner->float_frame = owner->float_bounds = gfx::Rect();
  owner->autohide_revealed = on && WindowActive(owner);
  if (on && owner->autohide_revealed) {
    owner->autohide_intro.Start(FROM_HERE, base::Milliseconds(autohide::kIntroMs),
        base::BindOnce([](Owner* owner) {
          Relayout(owner);
          ScheduleAutoHideCheck(owner);
          NotifyAutoHide(owner);
        }, base::Unretained(owner)));
  }
  RelayoutNow(owner);
  if (!owner->autohide_revealed) WatchAutoHideReveal(owner);
  NotifyAutoHide(owner);
}

// The style changed: the Island stays as it is (shown or hidden) and the
// page takes the new style's place at once, as shipping's
// applyIslandAutoHideStyle relays the active view out.
void ApplyAutoHideStyle(Owner* owner) {
  owner->autohide_slide_timer.Stop();
  owner->autohide_slide.reset();
  owner->autohide_dwell.reset();
  owner->autohide_hide.Stop();
  if (!IslandFloating(owner)) owner->float_frame = owner->float_bounds = gfx::Rect();
  if (owner->autohide_revealed) ScheduleAutoHideCheck(owner);
  RelayoutNow(owner);
  NotifyAutoHide(owner);
}

#if BUILDFLAG(ENABLE_BLANC_TEST_HOOKS)
// Acceptance only (shipping's holdIslandInWindow): reveal and hold, or let go.
void HoldIslandForTest(Owner* owner, bool on) {
  owner->autohide_test_hold = on;
  if (on) RevealIsland(owner);
  else if (owner->autohide_revealed) ScheduleAutoHideCheck(owner);
  Relayout(owner);
  NotifyAutoHide(owner);
}
#endif

// macOS draws its traffic lights over the window's top-left corner; while
// the strip is hidden they would sit on the page, so they come and go with
// the Island in both styles. The vertical rail owns that corner in its own
// right, so there they stay (shipping's syncWindowButtons). Every layout
// passes here, so each change of state reaches the buttons.
void SyncWindowButtons(Owner* owner) {
#if BUILDFLAG(IS_MAC)
  auto* view = BrowserViewFor(owner);
  if (!view || !view->GetWidget()) return;
  const bool visible = owner->vertical || !StripHiddenFor(owner);
  if (owner->window_buttons_visible == visible) return;
  owner->window_buttons_visible = visible;
  blanc::SetWindowButtonsVisible(view->GetWidget()->GetNativeWindow(), visible);
#endif
}

// The page top the layout uses now: the slide's while one runs.
int AutoHidePageTop(Owner* owner, int base) {
  if (owner->autohide_slide) return static_cast<int>(std::round(owner->autohide_slide->top));
  return TargetPageTop(owner, base);
}

base::DictValue AutoHideState(Owner* owner) {
  auto* view = BrowserViewFor(owner);
  base::Value bounds;
  if (auto* contents = view ? view->GetActiveContentsWebView() : nullptr) {
    gfx::Rect rect = contents->ConvertRectToWidget(contents->GetLocalBounds());
    gfx::Point origin;
    views::View::ConvertPointToTarget(contents, view, &origin);
    bounds = base::Value(base::DictValue().Set("x", origin.x()).Set("y", origin.y())
        .Set("width", rect.width()).Set("height", rect.height()));
  }
  base::DictValue state;
#if BUILDFLAG(IS_MAC)
  // What macOS draws, not what was asked for.
  if (view && view->GetWidget())
    state.Set("windowButtonsVisible", blanc::WindowButtonsVisible(view->GetWidget()->GetNativeWindow()));
#endif
  return std::move(state)
      .Set("enabled", AutoHideOn(owner))
      .Set("style", AutoHideStyle(owner))
      .Set("revealed", owner->autohide_revealed)
      .Set("introducing", owner->autohide_intro.IsRunning())
      .Set("sliding", owner->autohide_slide.has_value())
      .Set("reducedMotion", gfx::Animation::PrefersReducedMotion())
      .Set("stripHidden", StripHiddenFor(owner))
      .Set("floating", IslandFloating(owner))
      .Set("pageY", view ? TargetPageTop(owner, BaseHeaderHeight(view)) : 0)
      .Set("chromeHeight", view ? BaseHeaderHeight(view) : 68)
      .Set("coveredStripPx", 0)
      .Set("activeBounds", std::move(bounds));
}
