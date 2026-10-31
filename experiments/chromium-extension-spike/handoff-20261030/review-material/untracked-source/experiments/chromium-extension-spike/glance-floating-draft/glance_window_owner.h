#ifndef BLANC_GLANCE_FLOATING_DRAFT_WINDOW_OWNER_H_
#define BLANC_GLANCE_FLOATING_DRAFT_WINDOW_OWNER_H_

#include <cstdint>
#include <memory>

#include "base/functional/callback.h"
#include "base/memory/weak_ptr.h"
#include "base/scoped_observation.h"
#include "content/public/browser/web_contents_observer.h"
#include "glance_frame_controller.h"
#include "glance_window_session.h"
#include "ui/views/view_observer.h"
#include "ui/views/view_tracker.h"

class BrowserView;
class ContentsContainerView;
namespace content { class RenderFrameHost; class WebContents; }
namespace tabs { class TabInterface; }
namespace views { class View; }
class GURL;

namespace blanc::glance::draft {
class GlanceOverlayView;
class GlanceModalDialogHost;

// Window-lifetime coordinator. The embedding BrowserView must call the handoff
// methods before reattaching a tab, route modal/blocked state through this
// object and retain it if a frame write fails. All injected callbacks must be
// weakly bound or outlive this owner. Not installed in the browser yet.
class GlanceWindowOwner final : public content::WebContentsObserver,
                                public views::ViewObserver {
 public:
  GlanceWindowOwner(BrowserView* browser, FrameController::ReadFrame read,
                    FrameController::WriteFrame write,
                    base::RepeatingCallback<bool()> is_durable,
                    GlanceCardActions::Transition transition,
                    GlanceWindowSession::Suspended suspended);
  ~GlanceWindowOwner() override;
  GlanceWindowOwner(const GlanceWindowOwner&) = delete;
  GlanceWindowOwner& operator=(const GlanceWindowOwner&) = delete;

  bool Open(tabs::TabInterface* main, tabs::TabInterface* reference);
  // Returns false without discarding the session when persistence fails.
  bool Close();
  bool HasSession() const { return !!session_; }
  void BeforeTabChange();
  void BeforeSplit();
  void Refresh();
  GlanceOverlayView* overlay();
  ContentsContainerView* ContainerFor(content::WebContents* contents);
  GlanceModalDialogHost* ModalHostFor(content::WebContents* contents);

 private:
  Rect ReadArea() const;
  void DidFinishLoad(content::RenderFrameHost* frame, const GURL& url) override;
  void DidStopLoading() override;
  void DocumentOnLoadCompletedInPrimaryMainFrame() override;
  void OnViewBoundsChanged(views::View* observed) override;
  void OnViewHierarchyWillBeDeleted(views::View* observed) override;
  void TryReveal();
  void RemoveOverlay();

  views::ViewTracker browser_;
  views::ViewTracker parent_;
  views::ViewTracker overlay_;
  base::ScopedObservation<views::View, views::ViewObserver> parent_observation_{this};
  FrameController::ReadFrame read_;
  FrameController::WriteFrame write_;
  base::RepeatingCallback<bool()> is_durable_;
  GlanceCardActions::Transition transition_;
  GlanceWindowSession::Suspended suspended_;
  std::unique_ptr<GlanceWindowSession> session_;
  uint64_t generation_ = 0;
  bool document_ready_ = false;
  bool session_closed_ = false;
  base::WeakPtrFactory<GlanceWindowOwner> weak_factory_{this};
};
}  // namespace blanc::glance::draft
#endif
