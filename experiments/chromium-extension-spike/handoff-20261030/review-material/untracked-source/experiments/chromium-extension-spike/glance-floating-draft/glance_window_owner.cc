#include "glance_window_owner.h"

#include <limits>
#include <utility>

#include "base/functional/bind.h"
#include "chrome/browser/profiles/profile.h"
#include "chrome/browser/ui/view_ids.h"
#include "chrome/browser/ui/views/frame/browser_view.h"
#include "chrome/browser/ui/views/frame/contents_container_view.h"
#include "chrome/browser/ui/views/frame/contents_web_view.h"
#include "chrome/browser/ui/views/frame/multi_contents_view.h"
#include "content/public/browser/render_frame_host.h"
#include "content/public/browser/web_contents.h"
#include "glance_modal_dialog_host.h"
#include "glance_overlay_view.h"
#include "ui/views/controls/webview/webview.h"
#include "ui/views/view_class_properties.h"
#include "url/gurl.h"

namespace blanc::glance::draft {
namespace {
constexpr char kCardUrl[] = "chrome://blanc-prototype/glance/card.html";
constexpr uint64_t kMaxSafeGeneration = 9007199254740991ULL;
}  // namespace

GlanceWindowOwner::GlanceWindowOwner(
    BrowserView* browser, FrameController::ReadFrame read,
    FrameController::WriteFrame write, base::RepeatingCallback<bool()> is_durable,
    GlanceCardActions::Transition transition, GlanceWindowSession::Suspended suspended)
    : browser_(browser), read_(std::move(read)), write_(std::move(write)),
      is_durable_(std::move(is_durable)), transition_(std::move(transition)), suspended_(std::move(suspended)) {
  browser_.SetTrackEntireViewHierarchy(true);
  parent_.SetTrackEntireViewHierarchy(true);
  overlay_.SetTrackEntireViewHierarchy(true);
}
GlanceWindowOwner::~GlanceWindowOwner() {
  Observe(nullptr);
  parent_observation_.Reset();
  session_.reset();
  RemoveOverlay();
}
Rect GlanceWindowOwner::ReadArea() const {
  auto* parent = parent_.view();
  if (!parent) return {0, 0, 0, 0};
  const auto size = parent->size();
  return {0, 0, static_cast<double>(size.width()),
          static_cast<double>(size.height())};
}
bool GlanceWindowOwner::Open(tabs::TabInterface* main,
                             tabs::TabInterface* reference) {
  auto* browser = static_cast<BrowserView*>(browser_.view());
  if (!browser || !main || !reference || session_ || overlay_.view() ||
      !read_ || !write_ || !is_durable_ || !transition_ || !suspended_ ||
      generation_ >= kMaxSafeGeneration || !browser->multi_contents_view())
    return false;
  auto* parent = browser->multi_contents_view();
  auto* lens = parent->GetViewByID(VIEW_ID_LENS_OVERLAY);
  auto index = lens && lens->parent() == parent ? parent->GetIndexOf(lens)
                                                : std::nullopt;
  // Do not silently put the card above security or Lens surfaces.
  if (!index) return false;
  parent_.SetView(parent);
  parent_observation_.Observe(parent);
  auto card = std::make_unique<views::WebView>(browser->GetProfile());
  auto* card_view = card.get();
  auto* contents = card_view->GetWebContents(GURL(kCardUrl));
  if (!contents) { parent_observation_.Reset(); parent_.SetView(nullptr); return false; }
  auto page = std::make_unique<ContentsContainerView>(browser);
  auto* page_view = page->contents_view();
  auto view = std::make_unique<GlanceOverlayView>(browser, std::move(card), std::move(page));
  view->SetProperty(views::kViewIgnoredByLayoutKey, true);
  auto weak = weak_factory_.GetWeakPtr();
  weak->overlay_.SetView(view.get());
  auto* installed = parent->AddChildViewAt(std::move(view), *index);
  if (!weak) return false;
  if (weak->parent_.view() != parent || weak->overlay_.view() != installed) {
    weak->RemoveOverlay();
    return false;
  }
  const uint64_t generation = ++weak->generation_;
  auto frame = std::make_unique<FrameController>(
      base::BindRepeating([](base::WeakPtr<GlanceWindowOwner> owner) {
        return owner ? owner->ReadArea() : Rect{0, 0, 0, 0};
      }, weak), weak->read_, weak->write_,
      base::BindRepeating([](base::WeakPtr<GlanceWindowOwner> owner) {
        if (owner) owner->Refresh();
      }, weak));
  auto session = GlanceWindowSession::Create(browser, installed, card_view,
      page_view, main, reference, generation, std::move(frame),
      weak->transition_, weak->suspended_);
  if (!weak) return false;
  if (!session || weak->parent_.view() != parent ||
      weak->overlay_.view() != installed || weak->browser_.view() != browser) {
    weak->RemoveOverlay();
    return false;
  }
  weak->session_ = std::move(session);
  weak->session_closed_ = false;
  weak->document_ready_ = false;
  weak->Observe(contents);
  card_view->LoadInitialURL(GURL(kCardUrl));
  return !!weak;
}
bool GlanceWindowOwner::Close() {
  if (!session_) return false;
  auto weak = weak_factory_.GetWeakPtr();
  if (!session_closed_) {
    const bool closed = session_->Close();
    if (!weak || !closed) return false;
    weak->session_closed_ = true;
  }
  // FrameController's writer may only enqueue a disk operation. Keep the
  // closed session until the profile store confirms the latest write.
  auto durable = weak->is_durable_;
  const bool saved = durable && durable.Run();
  if (!weak || !saved) return false;
  weak->Observe(nullptr);
  weak->session_.reset();
  weak->session_closed_ = false;
  weak->RemoveOverlay();
  return true;
}
void GlanceWindowOwner::BeforeTabChange() {
  if (session_) session_->BeforeTabChange();
}
void GlanceWindowOwner::BeforeSplit() {
  if (session_) session_->BeforeSplit();
}
void GlanceWindowOwner::Refresh() {
  if (session_ && document_ready_) session_->LayoutAndPublish(false);
}
GlanceOverlayView* GlanceWindowOwner::overlay() {
  return static_cast<GlanceOverlayView*>(overlay_.view());
}
ContentsContainerView* GlanceWindowOwner::ContainerFor(
    content::WebContents* contents) {
  auto* view = overlay();
  return view ? view->ContainerFor(contents) : nullptr;
}
GlanceModalDialogHost* GlanceWindowOwner::ModalHostFor(
    content::WebContents* contents) {
  auto* view = overlay();
  return view ? view->ModalHostFor(contents) : nullptr;
}
void GlanceWindowOwner::DidFinishLoad(content::RenderFrameHost* frame,
                                      const GURL& url) {
  if (web_contents() && frame == web_contents()->GetPrimaryMainFrame() &&
      url == GURL(kCardUrl)) TryReveal();
}
void GlanceWindowOwner::DidStopLoading() { TryReveal(); }
void GlanceWindowOwner::DocumentOnLoadCompletedInPrimaryMainFrame() { TryReveal(); }
void GlanceWindowOwner::TryReveal() {
  if (!session_ || document_ready_) return;
  auto weak = weak_factory_.GetWeakPtr();
  const bool started = session_->BeginReveal(false);
  if (weak && started) weak->document_ready_ = true;
}
void GlanceWindowOwner::OnViewBoundsChanged(views::View* observed) {
  if (observed == parent_.view()) Refresh();
}
void GlanceWindowOwner::OnViewHierarchyWillBeDeleted(views::View* observed) {
  if (observed != parent_.view()) return;
  Observe(nullptr);
  parent_observation_.Reset();
  // Detach before the parent destroys its children. Keep the suspended
  // session so a failed frame write remains available for a later retry.
  auto weak = weak_factory_.GetWeakPtr();
  if (session_) session_->BeforeTabChange();
  if (!weak) return;
  weak->overlay_.SetView(nullptr);
  weak->parent_.SetView(nullptr);
}
void GlanceWindowOwner::RemoveOverlay() {
  parent_observation_.Reset();
  auto* view = overlay_.view();
  overlay_.SetView(nullptr);
  parent_.SetView(nullptr);
  if (view && view->parent()) view->parent()->RemoveChildViewT(view);
}
}  // namespace blanc::glance::draft
