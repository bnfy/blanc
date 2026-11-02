#ifndef BLANC_QUIET_MEDIA_H_
#define BLANC_QUIET_MEDIA_H_
#include <memory>
#include "base/supports_user_data.h"
#include "content/public/browser/navigation_controller.h"
#include "content/public/browser/navigation_handle.h"
#include "content/public/browser/web_contents.h"
#include "content/public/browser/web_contents_observer.h"
namespace blanc_prototype { void PreserveDiscardedTabState(content::WebContents*, content::WebContents*); }
namespace blanc::quiet {
inline constexpr char kMediaHistoryKey[] = "blanc.quiet.media-history";
class MediaHistory : public base::SupportsUserData::Data,
                     public content::WebContentsObserver {
 public:
  static MediaHistory* Get(content::WebContents* tab, bool newly_inserted = false) {
    auto* history = static_cast<MediaHistory*>(tab->GetUserData(kMediaHistoryKey));
    if (!history) {
      // Adopted/restored live contents may have played before observation.
      const bool from_birth = newly_inserted &&
          (tab->GetController().GetEntryCount() == 0 ||
           tab->GetController().IsInitialBlankNavigation());
      auto created = std::unique_ptr<MediaHistory>(new MediaHistory(tab, from_birth));
      history = created.get();
      tab->SetUserData(kMediaHistoryKey, std::move(created));
    }
    return history;
  }
  ~MediaHistory() override;
  bool known() const { return from_birth_ || used_; }
  bool used() const { return used_; }
  bool policy_known() const { return provenance_known_ || inherited_policy_; }
  bool inherited_policy() const { return inherited_policy_; }
  void MediaStartedPlaying(const MediaPlayerInfo&, const content::MediaPlayerId&) override;
  void DidFinishNavigation(content::NavigationHandle* navigation) override;
  void AboutToBeDiscarded(content::WebContents* replacement) override;
 private:
  MediaHistory(content::WebContents* tab, bool from_birth);
  bool from_birth_;
  bool provenance_known_;
  bool inherited_policy_;
  bool used_ = false;
};
inline MediaHistory::MediaHistory(content::WebContents* tab, bool from_birth)
    : content::WebContentsObserver(tab), from_birth_(from_birth),
      provenance_known_(from_birth),
      inherited_policy_(tab->HasOpener() || tab->HasLiveOriginalOpenerChain()) {}
inline MediaHistory::~MediaHistory() = default;
inline void MediaHistory::AboutToBeDiscarded(content::WebContents* replacement) {
  if (!replacement) return;
  auto* next = Get(replacement);
  next->from_birth_ = from_birth_;
  next->provenance_known_ = provenance_known_;
  next->used_ = used_;
  next->inherited_policy_ = inherited_policy_;
  blanc_prototype::PreserveDiscardedTabState(web_contents(), replacement);
}
inline void MediaHistory::MediaStartedPlaying(const MediaPlayerInfo&, const content::MediaPlayerId&) {
    used_ = true;
  }
inline void MediaHistory::DidFinishNavigation(content::NavigationHandle* navigation) {
    inherited_policy_ |= web_contents()->HasOpener() ||
        web_contents()->HasLiveOriginalOpenerChain();
    if (navigation->HasCommitted() && navigation->IsInPrimaryMainFrame() &&
        !navigation->IsSameDocument()) {
      used_ = false;
      from_birth_ = true;
    }
  }

}  // namespace blanc::quiet
#endif
