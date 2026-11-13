// Copyright 2026 Bananify Creative. MIT; see LICENSE.

// A page's pinch gestures for the Island: PagePinchBridge.java. Chromium handles page touches outside
// the browser's Android views (InputOnViz), so this listens where Chromium's own gesture listeners do:
// as an input observer on the page's widget, which hears a gesture whether the browser or Viz
// detected it. It only observes; the page's own zoom is untouched.

#include "base/memory/raw_ptr.h"
#include "blanc/android/page_pinch_jni/PagePinchBridge_jni.h"
#include "content/public/browser/render_frame_host.h"
#include "content/public/browser/render_widget_host.h"
#include "content/public/browser/render_widget_host_observer.h"
#include "content/public/browser/web_contents.h"
#include "content/public/browser/web_contents_observer.h"
#include "content/public/browser/web_contents_user_data.h"
#include "third_party/blink/public/common/input/web_gesture_event.h"
#include "third_party/blink/public/common/input/web_input_event.h"

namespace blanc {
namespace {

// PagePinchBridge.BEGAN, CHANGED and ENDED.
constexpr int kBegan = 0;
constexpr int kChanged = 1;
constexpr int kEnded = 2;

// Follows the page's main widget across navigations that swap it.
class PagePinchWatcher : public content::WebContentsUserData<PagePinchWatcher>,
                         public content::WebContentsObserver,
                         public content::RenderWidgetHost::InputEventObserver,
                         public content::RenderWidgetHostObserver {
 public:
  ~PagePinchWatcher() override { Detach(); }

  // content::WebContentsObserver:
  void RenderFrameHostChanged(content::RenderFrameHost* old_host,
                              content::RenderFrameHost* new_host) override {
    if (new_host && new_host->IsInPrimaryMainFrame()) Attach(new_host->GetRenderWidgetHost());
  }

  // content::RenderWidgetHost::InputEventObserver:
  void OnInputEvent(const content::RenderWidgetHost& host,
                    const blink::WebInputEvent& event,
                    InputEventSource source) override {
    switch (event.GetType()) {
      case blink::WebInputEvent::Type::kGesturePinchBegin:
        Report(kBegan, 1.f);
        break;
      case blink::WebInputEvent::Type::kGesturePinchUpdate:
        Report(kChanged, static_cast<const blink::WebGestureEvent&>(event).data.pinch_update.scale);
        break;
      case blink::WebInputEvent::Type::kGesturePinchEnd:
        Report(kEnded, 1.f);
        break;
      default:
        break;
    }
  }

  // content::RenderWidgetHostObserver:
  void RenderWidgetHostDestroyed(content::RenderWidgetHost* host) override {
    if (host == host_) Detach();
  }

 private:
  friend class content::WebContentsUserData<PagePinchWatcher>;

  explicit PagePinchWatcher(content::WebContents* contents)
      : content::WebContentsUserData<PagePinchWatcher>(*contents),
        content::WebContentsObserver(contents) {
    if (content::RenderFrameHost* frame = contents->GetPrimaryMainFrame()) {
      Attach(frame->GetRenderWidgetHost());
    }
  }

  void Attach(content::RenderWidgetHost* host) {
    if (host == host_) return;
    Detach();
    if (!host) return;
    host_ = host;
    host_->AddInputEventObserver(this);
    host_->AddObserver(this);
  }

  void Detach() {
    if (!host_) return;
    host_->RemoveInputEventObserver(this);
    host_->RemoveObserver(this);
    host_ = nullptr;
  }

  void Report(int phase, float scale) {
    Java_PagePinchBridge_onPinch(jni_zero::AttachCurrentThread(),
                                 web_contents()->GetJavaWebContents(), phase, scale);
  }

  raw_ptr<content::RenderWidgetHost> host_ = nullptr;

  WEB_CONTENTS_USER_DATA_KEY_DECL();
};

WEB_CONTENTS_USER_DATA_KEY_IMPL(PagePinchWatcher);

}  // namespace

static void JNI_PagePinchBridge_Watch(JNIEnv*, const jni_zero::JavaRef<jobject>& java) {
  if (auto* contents = content::WebContents::FromJavaWebContents(java)) {
    PagePinchWatcher::CreateForWebContents(contents);
  }
}

}  // namespace blanc

DEFINE_JNI(PagePinchBridge)
