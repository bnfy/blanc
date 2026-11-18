// Copyright 2026 Bananify Creative. MIT; see the Blanc repository LICENSE.
// Ctrl+Tab by most recent use (F59) on Windows (W2 C1): the same contract as
// tab_switch_keys_mac.mm, through one event handler ahead of every window of
// the app (aura's Env), which sees each key before Chromium's accelerators.
#include "blanc/browser/ui/tab_switch_keys.h"

#include <windows.h>

#include <memory>
#include <tuple>

#include "base/functional/bind.h"
#include "base/location.h"
#include "base/no_destructor.h"
#include "base/task/sequenced_task_runner.h"
#include "ui/aura/env.h"
#include "ui/aura/window.h"
#include "ui/aura/window_tracker.h"
#include "ui/aura/window_tree_host.h"
#include "ui/events/event.h"
#include "ui/events/event_handler.h"
#include "ui/events/event_sink.h"
#include "ui/events/keycodes/keyboard_codes.h"
#include "ui/views/widget/widget_focus_manager.h"

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

class Watcher : public ui::EventHandler, public views::WidgetFocusChangeListener {
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
  TabSwitchKey current() const { return current_; }
  void Watch() {
    EnsureInstalled();
    if (watching_) return;
    watching_ = true;
    views::WidgetFocusManager::GetInstance()->AddFocusChangeListener(this);
  }
  void Stop() {
    if (!watching_) return;
    watching_ = false;
    views::WidgetFocusManager::GetInstance()->RemoveFocusChangeListener(this);
  }

  // ui::EventHandler:
  void OnKeyEvent(ui::KeyEvent* event) override {
    // Windows follows a key with a character event (Ctrl+W's 0x17); the key
    // itself is what counts.
    if (event->is_char()) return;
    if (event->type() == ui::EventType::kKeyPressed) {
      current_ = event->key_code() == ui::VKEY_TAB && event->IsControlDown() && !event->IsAltDown()
                     ? TabSwitchKey::kCtrlTab
                     : TabSwitchKey::kOther;
      // Chromium's command runs inside this dispatch; after it, no key is.
      base::SequencedTaskRunner::GetCurrentDefault()->PostTask(
          FROM_HERE, base::BindOnce(&Watcher::Clear, base::Unretained(this)));
    }
    if (!watching_) return;
    const ui::KeyboardCode code = event->key_code();
    if (event->type() == ui::EventType::kKeyReleased) {
      if (IsControlKey(code) || !event->IsControlDown()) {
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
    if (code == ui::VKEY_ESCAPE) {
      Run("cancel");
      event->StopPropagation();
      return;
    }
    if (code == ui::VKEY_W && event->IsControlDown() && !event->IsAltDown()) {
      Run("closePick");
      event->StopPropagation();
      return;
    }
    Run("cancel");
  }
  void OnMouseEvent(ui::MouseEvent* event) override {
    if (watching_ && event->type() == ui::EventType::kMousePressed) Run("cancelSoon");
  }

  // views::WidgetFocusChangeListener: another app came to the front.
  void OnNativeFocusChanged(gfx::NativeView focused_now) override {
    if (focused_now) return;
    Stop();
    Run("cancel");
  }

 private:
  void Clear() { current_ = TabSwitchKey::kNone; }
  bool installed_ = false;
  bool watching_ = false;
  TabSwitchKey current_ = TabSwitchKey::kNone;
};

}  // namespace

TabSwitchKey CurrentTabSwitchKey() {
  Watcher& watcher = Watcher::Get();
  watcher.EnsureInstalled();
  if (watcher.current() != TabSwitchKey::kNone) return watcher.current();
  // Before the handler was installed (the first Ctrl+Tab of a run): the key
  // state of the message being handled.
  const bool control = ::GetKeyState(VK_CONTROL) & 0x8000;
  const bool tab = ::GetKeyState(VK_TAB) & 0x8000;
  const bool alt = ::GetKeyState(VK_MENU) & 0x8000;
  if (control && tab && !alt) return TabSwitchKey::kCtrlTab;
  return control || tab ? TabSwitchKey::kOther : TabSwitchKey::kNone;
}

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
