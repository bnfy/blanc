// Copyright 2026 Bananify Creative. MIT; see the Blanc repository LICENSE.
// One pre-target handler for Ctrl+Tab in every desktop aura window.
#include "blanc/browser/ui/tab_switch_keys_aura.h"

#include <memory>
#include <tuple>
#include <utility>

#include "base/functional/bind.h"
#include "base/location.h"
#include "base/no_destructor.h"
#include "base/scoped_observation.h"
#include "base/task/sequenced_task_runner.h"
#include "build/build_config.h"
#if BUILDFLAG(IS_LINUX)
#include "base/time/time.h"
#include "base/timer/timer.h"
#include "ui/base/accelerators/accelerator.h"
#endif
#include "ui/aura/env.h"
#include "ui/aura/window.h"
#include "ui/aura/window_tracker.h"
#include "ui/aura/window_tree_host.h"
#include "ui/events/event.h"
#include "ui/events/event_handler.h"
#include "ui/events/event_sink.h"
#include "ui/events/keycodes/keyboard_codes.h"
#include "ui/views/widget/widget.h"
#include "ui/views/widget/widget_observer.h"

namespace blanc {
namespace {

using Send = base::RepeatingCallback<void(const std::string&)>;
Send& Sender() {
  static base::NoDestructor<Send> send;
  return *send;
}
// |send| may replace or clear the sender; run a copy.
void Run(const std::string& action) {
  Send send = Sender();
  if (send) send.Run(action);
}

bool IsControlKey(ui::KeyboardCode code) {
  return code == ui::VKEY_CONTROL || code == ui::VKEY_LCONTROL || code == ui::VKEY_RCONTROL;
}

// Linux layouts expose a separate AltGr modifier, sometimes alongside Ctrl.
// Keep the original Windows interpretation of its key messages.
bool IsAltGr(const ui::KeyEvent& event) {
#if BUILDFLAG(IS_LINUX)
  return (event.flags() & ui::EF_ALTGR_DOWN) != 0;
#else
  return false;
#endif
}

bool IsClosePick(const ui::KeyEvent& event) {
  if (event.key_code() != ui::VKEY_W) return false;
#if BUILDFLAG(IS_LINUX)
  return ui::Accelerator::MaskOutKeyEventFlags(event.flags()) == ui::EF_CONTROL_DOWN &&
         !(event.flags() & ui::EF_MOD3_DOWN);
#else
  return event.IsControlDown() && !event.IsAltDown();
#endif
}

class TabSwitchKeyState {
 public:
  void OnKeyPressed(const ui::KeyEvent& event) {
    control_down_ = event.IsControlDown() && !IsAltGr(event);
    current_ = event.key_code() == ui::VKEY_TAB && control_down_ && !event.IsAltDown()
                   ? TabSwitchKey::kCtrlTab
                   : TabSwitchKey::kOther;
  }
  void OnKeyReleased(const ui::KeyEvent& event) {
    control_down_ = !IsControlKey(event.key_code()) && event.IsControlDown() && !IsAltGr(event);
#if BUILDFLAG(IS_LINUX)
    ClearCurrent();
#endif
  }
  void OnDeactivated() {
    control_down_ = false;
    ClearCurrent();
  }
  void ClearCurrent() { current_ = TabSwitchKey::kNone; }
  TabSwitchKey Current() const { return current_; }
  bool control_down() const { return control_down_; }

 private:
  bool control_down_ = false;
  TabSwitchKey current_ = TabSwitchKey::kNone;
};

class Watcher : public ui::EventHandler, public views::WidgetObserver {
 public:
  static Watcher& Get() {
    static base::NoDestructor<Watcher> watcher;
    return *watcher;
  }
  void EnsureInstalled() {
    if (installed_) return;
    aura::Env::GetInstance()->AddPreTargetHandler(this, ui::EventTarget::Priority::kSystem);
    installed_ = true;
  }
  TabSwitchKey current() const { return keys_.Current(); }
  // Watches the window the Ctrl+Tab went to: its losing activation (another
  // app or window in front) cancels the switch. Aura reports no focus change
  // when the whole app is deactivated, so it is the widget's activation.
  void Watch() {
    EnsureInstalled();
#if BUILDFLAG(IS_LINUX)
    // A fullscreen page can return a Tab press after its Control-up has
    // already passed through aura. Complete that step as a tap.
    if (!keys_.control_down()) {
      Stop();
      Run("release");
      return;
    }
#endif
    watching_ = true;
    if (widget_.IsObserving() || key_window_.windows().empty()) return;
    if (auto* widget = views::Widget::GetWidgetForNativeWindow(key_window_.windows().front()))
      widget_.Observe(widget);
  }
  void Stop() {
    watching_ = false;
    widget_.Reset();
  }
  void CancelKeyboardSwitch(const ui::KeyEvent& event) {
#if BUILDFLAG(IS_LINUX)
    cancelled_through_ = event.time_stamp();
#endif
    if (!watching_) return;
#if BUILDFLAG(IS_LINUX)
    Stop();
#endif
    Run("cancel");
  }
#if BUILDFLAG(IS_LINUX)
  bool PrepareStep() {
    // A page may still be handling an earlier Tab when the click or Escape
    // arrives. Consume that late reply without starting another session.
    if (TabSwitchPressTime() <= cancelled_through_) return false;
    if (click_cancel_.IsRunning()) click_cancel_.FireNow();
    return true;
  }
#endif

  // ui::EventHandler:
  void OnKeyEvent(ui::KeyEvent* event) override {
    // Windows follows a key with a character event (Ctrl+W's 0x17); the key
    // itself is what counts.
    if (event->is_char()) return;
    if (event->type() == ui::EventType::kKeyPressed) {
      // The top-level window this key went to, for Watch().
      auto* target = static_cast<aura::Window*>(event->target());
      const aura::WindowTracker::WindowList previous = key_window_.windows();
      for (aura::Window* window : previous) key_window_.Remove(window);
      if (target && target->GetToplevelWindow()) key_window_.Add(target->GetToplevelWindow());
      keys_.OnKeyPressed(*event);
#if BUILDFLAG(IS_WIN)
      // Windows classifies the current native dispatch.
      base::SequencedTaskRunner::GetCurrentDefault()->PostTask(
          FROM_HERE, base::BindOnce(&TabSwitchKeyState::ClearCurrent, base::Unretained(&keys_)));
#endif
    } else if (event->type() == ui::EventType::kKeyReleased) {
      keys_.OnKeyReleased(*event);
    }
    if (IsAltGr(*event)) {
      CancelKeyboardSwitch(*event);
      return;
    }
    const ui::KeyboardCode code = event->key_code();
    if (event->type() == ui::EventType::kKeyReleased) {
      if (watching_ && !keys_.control_down()) {
        Stop();
        Run("release");
      }
      return;
    }
    if (event->type() != ui::EventType::kKeyPressed) return;
    // Tab and Shift+Tab go on to Chromium's command, which steps; Control's
    // own repeats and Shift are part of the gesture.
    if ((code == ui::VKEY_TAB && event->IsControlDown()) || IsControlKey(code) || code == ui::VKEY_SHIFT ||
        code == ui::VKEY_LSHIFT || code == ui::VKEY_RSHIFT) {
      return;
    }
    // Windows gives Ctrl+Esc to the Start menu, so a real Esc rarely arrives;
    // the window losing activation cancels instead (shipping's rule).
    if (watching_ && IsClosePick(*event)) {
#if BUILDFLAG(IS_LINUX)
      if (!event->is_repeat()) Run("closePick");
#else
      Run("closePick");
#endif
      event->StopPropagation();
      return;
    }
    const bool swallow_escape = watching_ && code == ui::VKEY_ESCAPE;
    CancelKeyboardSwitch(*event);
    if (swallow_escape) event->StopPropagation();
  }
  void OnMouseEvent(ui::MouseEvent* event) override {
    if (event->type() != ui::EventType::kMousePressed) return;
#if BUILDFLAG(IS_LINUX)
    cancelled_through_ = event->time_stamp();
#endif
    if (!watching_) return;
#if BUILDFLAG(IS_LINUX)
    // A tile can still claim this press. Ignore Control-up immediately,
    // and deliver any remaining cancellation to this gesture's own host.
    Stop();
    click_cancel_.Start(FROM_HERE, base::Milliseconds(250),
                        base::BindOnce(Sender(), std::string("cancel")));
#else
    Run("cancelSoon");
#endif
  }

  // views::WidgetObserver:
  void OnWidgetActivationChanged(views::Widget*, bool active) override {
    if (active || !watching_) return;
#if BUILDFLAG(IS_LINUX)
    keys_.OnDeactivated();
    cancelled_through_ = base::TimeTicks::Now();
#endif
    Stop();
    Run("cancel");
  }
  void OnWidgetDestroying(views::Widget*) override { widget_.Reset(); }

 private:
  bool installed_ = false;
  bool watching_ = false;
  aura::WindowTracker key_window_;
  base::ScopedObservation<views::Widget, views::WidgetObserver> widget_{this};
  TabSwitchKeyState keys_;
#if BUILDFLAG(IS_LINUX)
  base::TimeTicks cancelled_through_;
  base::OneShotTimer click_cancel_;
#endif
};

}  // namespace

void InstallTabSwitchWatcher() {
  Watcher::Get().EnsureInstalled();
}

TabSwitchKey CurrentAuraTabSwitchKey() {
  return Watcher::Get().current();
}

#if BUILDFLAG(IS_LINUX)
bool PrepareTabSwitchStep() {
  return Watcher::Get().PrepareStep();
}
#endif

void WatchTabSwitchKeys(Send send) {
  Sender() = std::move(send);
  Watcher::Get().Watch();
}

bool PostTabSwitchKeyForTesting(gfx::NativeWindow window, const std::string& key) {
  if (!window || !window->GetHost()) return false;
  ui::EventType type = ui::EventType::kKeyPressed;
  int flags = ui::EF_CONTROL_DOWN;
  ui::KeyboardCode code;
  if (key == "ctrlDown") code = ui::VKEY_CONTROL;
  else if (key == "ctrlUp") { type = ui::EventType::kKeyReleased; code = ui::VKEY_CONTROL; flags = ui::EF_NONE; }
  else if (key == "tab") code = ui::VKEY_TAB;
  else if (key == "shiftTab") { code = ui::VKEY_TAB; flags |= ui::EF_SHIFT_DOWN; }
#if BUILDFLAG(IS_LINUX)
  else if (key == "altGrTab") { code = ui::VKEY_TAB; flags |= ui::EF_ALTGR_DOWN; }
  else if (key == "repeatW") { code = ui::VKEY_W; flags |= ui::EF_IS_REPEAT; }
#endif
  else if (key == "w") code = ui::VKEY_W;
  else if (key == "escape") code = ui::VKEY_ESCAPE;
  else if (key == "a") code = ui::VKEY_A;
  else return false;
  Watcher::Get().EnsureInstalled();
  // Like the Mac's posted NSEvent: dispatched after this call returns, to the
  // window's own host, so the real key path (accelerators included) runs.
  auto tracker = std::make_unique<aura::WindowTracker>();
  tracker->Add(window);
  base::SequencedTaskRunner::GetCurrentDefault()->PostTask(
      FROM_HERE, base::BindOnce(
                     [](std::unique_ptr<aura::WindowTracker> tracker, ui::EventType type, ui::KeyboardCode code,
                        int flags) {
                       if (tracker->windows().empty()) return;
                       aura::Window* target = tracker->windows().front();
                       if (!target->GetHost()) return;
                       ui::KeyEvent event(type, code, flags);
                       std::ignore = target->GetHost()->GetEventSink()->OnEventFromSource(&event);
                     },
                     std::move(tracker), type, code, flags));
  return true;
}

}  // namespace blanc
