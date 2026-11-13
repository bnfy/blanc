// Copyright 2026 Bananify Creative. MIT; see LICENSE.

// The page's top row for the status bar: TopColorBridge.java. Copies a strip a few pixels tall from
// the top of the page's own surface, as the tab grid's thumbnails are copied
// (chrome/browser/android/compositor/tab_content_manager.cc), scaled to one row. The page itself
// is untouched; nothing is kept.

#include <algorithm>
#include <vector>

#include "base/android/jni_array.h"
#include "base/functional/bind.h"
#include "base/task/bind_post_task.h"
#include "base/time/time.h"
#include "blanc/android/island_jni/TopColorBridge_jni.h"
#include "components/viz/common/frame_sinks/copy_output_result.h"
#include "content/public/browser/browser_task_traits.h"
#include "content/public/browser/browser_thread.h"
#include "content/public/browser/render_widget_host_view.h"
#include "content/public/browser/web_contents.h"
#include "third_party/skia/include/core/SkBitmap.h"
#include "ui/android/view_android.h"
#include "ui/gfx/geometry/rect.h"
#include "ui/gfx/geometry/size.h"

namespace blanc {
namespace {

// The strip's height in device pixels: enough to step over a hairline at the very top.
constexpr int kStripPx = 4;
// The row's length: plenty to find the main color, few enough to compare cheaply in Java.
constexpr int kColumns = 96;
constexpr base::TimeDelta kTimeout = base::Seconds(1);

void Deliver(const jni_zero::ScopedJavaGlobalRef<jobject>& callback,
             const content::CopyFromSurfaceResult& result) {
  std::vector<int> row;
  if (result.has_value() && !result->bitmap.drawsNothing()) {
    const SkBitmap& bitmap = result->bitmap;
    row.reserve(bitmap.width());
    for (int x = 0; x < bitmap.width(); ++x) {
      row.push_back(static_cast<int>(bitmap.getColor(x, 0)));
    }
  }
  JNIEnv* env = jni_zero::AttachCurrentThread();
  Java_TopColorBridge_onRead(env, callback, base::android::ToJavaIntArray(env, row));
}

}  // namespace

static void JNI_TopColorBridge_Read(JNIEnv* env,
                                    const jni_zero::JavaRef<jobject>& java_contents,
                                    const jni_zero::JavaRef<jobject>& java_callback) {
  jni_zero::ScopedJavaGlobalRef<jobject> callback(env, java_callback);
  content::WebContents* contents = content::WebContents::FromJavaWebContents(java_contents);
  content::RenderWidgetHostView* view = contents ? contents->GetRenderWidgetHostView() : nullptr;
  gfx::Size size = view && view->GetNativeView() ? view->GetNativeView()->GetSizeDevicePx()
                                                 : gfx::Size();
  if (!view || !view->IsSurfaceAvailableForCopy() || size.IsEmpty()) {
    Deliver(callback, content::CopyFromSurfaceResult());
    return;
  }
  gfx::Rect strip(0, 0, size.width(), std::min(kStripPx, size.height()));
  gfx::Size row(std::min(kColumns, size.width()), 1);
  // The copy may finish on another sequence; Java hears it on the UI thread.
  view->CopyFromSurface(
      strip, row, kTimeout,
      base::BindPostTask(content::GetUIThreadTaskRunner({}),
                         base::BindOnce(&Deliver, std::move(callback))));
}

}  // namespace blanc

DEFINE_JNI(TopColorBridge)
